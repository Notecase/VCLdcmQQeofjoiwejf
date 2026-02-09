import type { EditorDeepAgentEvent } from './types'

interface StreamMessage {
  id?: string
  name?: string
  type?: string
  role?: string
  content?: string | unknown[]
  tool_calls?: Array<{ id?: string; name: string; args: Record<string, unknown> }>
}

export class EditorDeepStreamNormalizer {
  private seq = 0
  private textSnapshots = new Map<string, string>()
  private emittedToolCallSignatures = new Set<string>()
  private emittedToolResultSignatures = new Set<string>()
  private pendingToolCallIdsByName = new Map<string, string[]>()
  private assistantStarted = false
  private assistantFinalized = false
  private assistantText = ''

  private stableStringify(value: unknown): string {
    if (value === null || typeof value !== 'object') {
      return JSON.stringify(value)
    }
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableStringify(item)).join(',')}]`
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

  getAssistantText(): string {
    return this.assistantText
  }

  private getRole(message: StreamMessage): string {
    const raw = message.role || message.type || ''
    return raw.toLowerCase()
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

  private getTextSourceKey(nodeKey: string, message: StreamMessage): string {
    const role = this.getRole(message) || 'assistant'
    const name = message.name ? `:${message.name}` : ''
    if (typeof message.id === 'string' && message.id.trim()) {
      return `message:${message.id.trim()}:${role}${name}`
    }
    return `node:${nodeKey}:${role}${name}`
  }

  normalizeText(nodeKey: string, message: StreamMessage): EditorDeepAgentEvent[] {
    const content = this.extractTextContent(message.content)
    if (!content) return []

    const role = this.getRole(message)
    if (role === 'human' || role === 'user' || role === 'system' || role === 'tool') return []

    const sourceKey = this.getTextSourceKey(nodeKey, message)
    const hasSnapshot = this.textSnapshots.has(sourceKey)
    const previous = hasSnapshot ? this.textSnapshots.get(sourceKey) || '' : ''
    let delta = content

    if (hasSnapshot) {
      if (content === previous) return []
      if (previous && content.startsWith(previous)) {
        delta = content.slice(previous.length)
      } else if (previous && previous.startsWith(content)) {
        return []
      }
    } else {
      // Reconcile first snapshot from a new stream source against already emitted assistant text.
      if (content === this.assistantText) {
        this.textSnapshots.set(sourceKey, content)
        return []
      }
      if (this.assistantText && content.startsWith(this.assistantText)) {
        delta = content.slice(this.assistantText.length)
      } else if (this.assistantText && this.assistantText.startsWith(content)) {
        this.textSnapshots.set(sourceKey, content)
        return []
      }
    }

    this.textSnapshots.set(sourceKey, content)
    if (!delta) return []

    const events: EditorDeepAgentEvent[] = []

    if (!this.assistantStarted) {
      this.assistantStarted = true
      events.push({
        type: 'assistant-start',
        data: { sourceNode: nodeKey },
        seq: this.nextSeq(),
        sourceNode: nodeKey,
      })
    }

    this.assistantText += delta
    events.push({
      type: 'assistant-delta',
      data: delta,
      seq: this.nextSeq(),
      sourceNode: nodeKey,
      isDelta: true,
    })
    return events
  }

  normalizeToolCalls(nodeKey: string, message: StreamMessage): EditorDeepAgentEvent[] {
    const calls = Array.isArray(message.tool_calls) ? message.tool_calls : []
    const events: EditorDeepAgentEvent[] = []

    for (const call of calls) {
      const callId = call.id || ''
      const argsSignature = this.stableStringify(call.args || {})
      const semanticSignature = `${nodeKey}:semantic:${call.name}:${argsSignature}`
      const idSignature = callId ? `${nodeKey}:id:${callId}` : ''

      if (
        this.emittedToolCallSignatures.has(semanticSignature) ||
        (idSignature && this.emittedToolCallSignatures.has(idSignature))
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
        type: 'tool-call',
        data: {
          id: toolCallId,
          toolName: call.name,
          arguments: call.args,
        },
        seq: this.nextSeq(),
        messageId: `tool-call:${toolCallId}`,
        sourceNode: nodeKey,
      })
    }

    return events
  }

  normalizeToolResult(nodeKey: string, message: StreamMessage): EditorDeepAgentEvent[] {
    const content = typeof message.content === 'string' ? message.content : ''
    const toolName = message.name || 'unknown_tool'
    if (!content) return []

    const signature = `${nodeKey}:${toolName}:${content}`
    if (this.emittedToolResultSignatures.has(signature)) return []
    this.emittedToolResultSignatures.add(signature)

    const queue = this.pendingToolCallIdsByName.get(toolName) || []
    const toolCallId = queue.shift() || crypto.randomUUID()
    this.pendingToolCallIdsByName.set(toolName, queue)

    return [
      {
        type: 'tool-result',
        data: {
          id: toolCallId,
          toolName,
          result: content,
        },
        seq: this.nextSeq(),
        messageId: `tool-result:${toolCallId}`,
        sourceNode: nodeKey,
        metadata: { toolName },
      },
    ]
  }

  finalize(fallbackText?: string): EditorDeepAgentEvent[] {
    const events: EditorDeepAgentEvent[] = []
    if (!this.assistantFinalized) {
      const finalText = this.assistantText || fallbackText || ''
      if (finalText) {
        if (!this.assistantStarted) {
          events.push({
            type: 'assistant-start',
            data: { sourceNode: 'agent' },
            seq: this.nextSeq(),
            sourceNode: 'agent',
          })
        }
        events.push({
          type: 'assistant-final',
          data: finalText,
          seq: this.nextSeq(),
          sourceNode: 'agent',
          isDelta: false,
        })
      }
      this.assistantFinalized = true
    }

    events.push({
      type: 'done',
      data: '',
      seq: this.nextSeq(),
      messageId: 'done',
    })
    return events
  }
}
