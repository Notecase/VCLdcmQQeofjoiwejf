import type { SecretaryStreamEvent } from '@inkdown/shared/types'

interface StreamMessage {
  id?: string
  name?: string
  type?: string
  role?: string
  content?: string | unknown[]
  tool_calls?: Array<{ id?: string; name: string; args: Record<string, unknown> }>
}

export class SecretaryStreamNormalizer {
  private seq = 0
  private textSnapshots = new Map<string, string>()
  private emittedToolCallSignatures = new Set<string>()
  private emittedToolResultSignatures = new Set<string>()
  private pendingToolCallIdsByName = new Map<string, string[]>()

  private stableStringify(value: unknown): string {
    if (value === null || typeof value !== 'object') {
      return JSON.stringify(value)
    }
    if (Array.isArray(value)) {
      return `[${value.map(item => this.stableStringify(item)).join(',')}]`
    }
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => `${JSON.stringify(key)}:${this.stableStringify(val)}`)
    return `{${entries.join(',')}}`
  }

  private nextSeq(): number {
    this.seq += 1
    return this.seq
  }

  private extractTextContent(content: StreamMessage['content']): string {
    if (typeof content === 'string') return content
    if (!Array.isArray(content)) return ''

    return content
      .map((part) => {
        if (typeof part === 'string') return part
        if (!part || typeof part !== 'object') return ''
        const text = (part as { text?: unknown }).text
        return typeof text === 'string' ? text : ''
      })
      .join('')
  }

  private getRole(message: StreamMessage): string {
    const raw = message.role || message.type || ''
    return raw.toLowerCase()
  }

  private getTextSourceKey(nodeKey: string, message: StreamMessage): string {
    // message.id can change across replayed snapshots, so do not use it for delta tracking.
    const role = this.getRole(message) || 'assistant'
    const name = message.name ? `:${message.name}` : ''
    return `${nodeKey}:${role}${name}`
  }

  normalizeText(nodeKey: string, message: StreamMessage): SecretaryStreamEvent[] {
    const content = this.extractTextContent(message.content)
    if (!content) return []

    const role = this.getRole(message)
    if (role === 'human' || role === 'user' || role === 'system' || role === 'tool') return []

    const sourceKey = this.getTextSourceKey(nodeKey, message)
    const previous = this.textSnapshots.get(sourceKey) || ''
    let delta = content
    let isDelta = false

    if (content === previous) return []
    if (previous && content.startsWith(previous)) {
      delta = content.slice(previous.length)
      isDelta = true
    } else if (previous && previous.startsWith(content)) {
      // Older snapshot replayed by the stream — ignore it.
      return []
    }

    this.textSnapshots.set(sourceKey, content)
    if (!delta) return []

    return [{
      event: 'text',
      data: delta,
      seq: this.nextSeq(),
      messageId: sourceKey,
      sourceNode: nodeKey,
      isDelta,
    }]
  }

  normalizeToolCalls(nodeKey: string, message: StreamMessage): SecretaryStreamEvent[] {
    const calls = Array.isArray(message.tool_calls) ? message.tool_calls : []
    const events: SecretaryStreamEvent[] = []

    for (const call of calls) {
      const callId = call.id || ''
      const argsSignature = this.stableStringify(call.args || {})
      const semanticSignature = `${nodeKey}:semantic:${call.name}:${argsSignature}`
      const idSignature = callId ? `${nodeKey}:id:${callId}` : ''

      if (
        this.emittedToolCallSignatures.has(semanticSignature)
        || (idSignature && this.emittedToolCallSignatures.has(idSignature))
      ) {
        continue
      }
      this.emittedToolCallSignatures.add(semanticSignature)
      if (idSignature) this.emittedToolCallSignatures.add(idSignature)

      const toolCallId = callId || crypto.randomUUID()
      const queue = this.pendingToolCallIdsByName.get(call.name) || []
      queue.push(toolCallId)
      this.pendingToolCallIdsByName.set(call.name, queue)

      events.push({
        event: 'tool_call',
        data: JSON.stringify({
          id: toolCallId,
          toolName: call.name,
          arguments: call.args,
        }),
        seq: this.nextSeq(),
        messageId: `tool-call:${toolCallId}`,
        sourceNode: nodeKey,
        isDelta: false,
      })
    }

    return events
  }

  normalizeToolResult(nodeKey: string, message: StreamMessage): SecretaryStreamEvent[] {
    const content = typeof message.content === 'string' ? message.content : ''
    const toolName = message.name || 'unknown_tool'
    if (!content) return []

    const signature = `${nodeKey}:${toolName}:${content}`
    if (this.emittedToolResultSignatures.has(signature)) return []
    this.emittedToolResultSignatures.add(signature)

    const queue = this.pendingToolCallIdsByName.get(toolName) || []
    const toolCallId = queue.shift() || crypto.randomUUID()
    this.pendingToolCallIdsByName.set(toolName, queue)

    return [{
      event: 'tool_result',
      data: JSON.stringify({
        id: toolCallId,
        toolName,
        result: content,
      }),
      metadata: { toolName },
      seq: this.nextSeq(),
      messageId: `tool-result:${toolCallId}`,
      sourceNode: nodeKey,
      isDelta: false,
    }]
  }

  done(): SecretaryStreamEvent {
    return {
      event: 'done',
      data: '',
      seq: this.nextSeq(),
      messageId: 'done',
      isDelta: false,
    }
  }
}
