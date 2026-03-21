import type { EditorDeepAgentEvent, SubagentEventData } from './types'

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
  private historyAssistantTexts = new Set<string>()

  // Multi-mode subagent tracking
  private activeSubagents = new Map<string, { name: string; startedAt: number; lastOutput: string }>()
  private completedSubagentIds = new Set<string>()

  /**
   * Seed the normalizer with known history assistant texts so that
   * replayed messages from LangGraph are skipped instead of re-emitted.
   */
  seedHistoryTexts(texts: string[]): void {
    for (const text of texts) {
      const trimmed = text.trim()
      if (trimmed) this.historyAssistantTexts.add(trimmed)
    }
  }

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

  // ---------------------------------------------------------------------------
  // Namespace parsing for multi-mode streams
  // ---------------------------------------------------------------------------

  /**
   * Parse a namespace array to determine if it's a subagent and extract the name.
   * LangGraph subgraph namespace format: ['tools:subagent_name', ...] or ['subagent_name:uuid', ...]
   */
  parseNamespace(namespace: string[]): { isSubagent: boolean; subagentId: string | null; subagentName: string | null } {
    if (!namespace || namespace.length === 0) {
      return { isSubagent: false, subagentId: null, subagentName: null }
    }

    // Look for a namespace segment that indicates a subagent (tools:name or name:uuid pattern)
    for (const segment of namespace) {
      if (segment.startsWith('tools:')) {
        const name = segment.split(':')[1]
        return { isSubagent: true, subagentId: name, subagentName: name }
      }
    }

    // Check for subgraph namespace patterns (non-root namespace = subagent)
    if (namespace.length > 0 && namespace[0] !== '') {
      const name = namespace[0].split(':')[0]
      if (name && name !== 'agent' && name !== 'tools') {
        return { isSubagent: true, subagentId: name, subagentName: name }
      }
    }

    return { isSubagent: false, subagentId: null, subagentName: null }
  }

  // ---------------------------------------------------------------------------
  // Multi-mode: updates (node completion events)
  // ---------------------------------------------------------------------------

  /**
   * Handle 'updates' mode data from a [namespace, 'updates', data] tuple.
   * This is the same structure as the legacy format — each key is a node with messages.
   */
  normalizeUpdates(namespace: string[], nodeKey: string, message: StreamMessage): EditorDeepAgentEvent[] {
    const events: EditorDeepAgentEvent[] = []
    const { isSubagent, subagentId, subagentName } = this.parseNamespace(namespace)

    // Emit subagent lifecycle events
    if (isSubagent && subagentId && !this.activeSubagents.has(subagentId) && !this.completedSubagentIds.has(subagentId)) {
      this.activeSubagents.set(subagentId, {
        name: subagentName || subagentId,
        startedAt: Date.now(),
        lastOutput: '',
      })
      const subagentData: SubagentEventData = {
        id: subagentId,
        name: subagentName || subagentId,
        description: `Subagent ${subagentName || subagentId} started`,
        status: 'running',
        startedAt: Date.now(),
      }
      events.push({
        type: 'subagent-start',
        data: subagentData,
        seq: this.nextSeq(),
        sourceNode: nodeKey,
      })
    }

    // Process the message normally based on type
    if (nodeKey === 'tools' || message.type === 'tool') {
      events.push(...this.normalizeToolResult(nodeKey, message))
    } else {
      events.push(...this.normalizeText(nodeKey, message))
      events.push(...this.normalizeToolCalls(nodeKey, message))
    }

    return events
  }

  // ---------------------------------------------------------------------------
  // Multi-mode: messages (token-level LLM streaming)
  // ---------------------------------------------------------------------------

  /**
   * Handle 'messages' mode chunk from a [namespace, 'messages', [message, metadata]] tuple.
   * These are token-level deltas — bypass snapshot dedup as they're always new content.
   */
  normalizeMessageChunk(namespace: string[], chunk: { text?: string; tool_call_chunks?: unknown[] }): EditorDeepAgentEvent[] {
    if (!chunk?.text) return []

    const events: EditorDeepAgentEvent[] = []
    const { isSubagent, subagentId } = this.parseNamespace(namespace)

    if (isSubagent && subagentId) {
      // Update subagent's lastOutput
      const sub = this.activeSubagents.get(subagentId)
      if (sub) {
        sub.lastOutput += chunk.text
      }

      events.push({
        type: 'subagent-delta',
        data: { id: subagentId, text: chunk.text },
        seq: this.nextSeq(),
        isDelta: true,
      })
    } else {
      // Main agent token — emit as assistant-delta, skip dedup
      if (!this.assistantStarted) {
        this.assistantStarted = true
        events.push({
          type: 'assistant-start',
          data: { sourceNode: 'agent' },
          seq: this.nextSeq(),
          sourceNode: 'agent',
        })
      }

      this.assistantText += chunk.text
      events.push({
        type: 'assistant-delta',
        data: chunk.text,
        seq: this.nextSeq(),
        sourceNode: 'agent',
        isDelta: true,
      })
    }

    return events
  }

  // ---------------------------------------------------------------------------
  // Multi-mode: custom (config.writer events from tools)
  // ---------------------------------------------------------------------------

  /**
   * Handle 'custom' mode data from a [namespace, 'custom', data] tuple.
   * These are progress events emitted by tools via config.writer?.()
   */
  normalizeCustomEvent(_namespace: string[], data: unknown): EditorDeepAgentEvent[] {
    return [
      {
        type: 'custom-progress',
        data,
        seq: this.nextSeq(),
      },
    ]
  }

  // ---------------------------------------------------------------------------
  // Subagent lifecycle completion
  // ---------------------------------------------------------------------------

  /**
   * Complete a subagent and emit the completion event.
   * Called when no more events arrive from a subagent namespace.
   */
  completeSubagent(subagentId: string): EditorDeepAgentEvent[] {
    const sub = this.activeSubagents.get(subagentId)
    if (!sub) return []

    const now = Date.now()
    const subagentData: SubagentEventData = {
      id: subagentId,
      name: sub.name,
      description: `Subagent ${sub.name} completed`,
      status: 'complete',
      startedAt: sub.startedAt,
      completedAt: now,
      elapsedMs: now - sub.startedAt,
      result: sub.lastOutput.slice(0, 500),
    }

    this.activeSubagents.delete(subagentId)
    this.completedSubagentIds.add(subagentId)

    return [
      {
        type: 'subagent-complete',
        data: subagentData,
        seq: this.nextSeq(),
      },
    ]
  }

  /**
   * Complete all active subagents. Called before finalization.
   */
  completeAllSubagents(): EditorDeepAgentEvent[] {
    const events: EditorDeepAgentEvent[] = []
    for (const id of this.activeSubagents.keys()) {
      events.push(...this.completeSubagent(id))
    }
    return events
  }

  /**
   * Get active subagent IDs for lifecycle tracking.
   */
  getActiveSubagentIds(): string[] {
    return Array.from(this.activeSubagents.keys())
  }

  // ---------------------------------------------------------------------------
  // Legacy normalizers (unchanged — used for both legacy and updates mode)
  // ---------------------------------------------------------------------------

  normalizeText(nodeKey: string, message: StreamMessage): EditorDeepAgentEvent[] {
    const content = this.extractTextContent(message.content)
    if (!content) return []

    const role = this.getRole(message)
    if (role === 'human' || role === 'user' || role === 'system' || role === 'tool') return []

    // Skip replayed history messages that LangGraph re-emits through the stream
    const trimmedContent = content.trim()
    if (this.historyAssistantTexts.has(trimmedContent)) {
      return []
    }

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
      // Global dedup (no nodeKey) — catches duplicates across subgraph namespace levels
      const semanticSignature = `semantic:${call.name}:${argsSignature}`
      const idSignature = callId ? `id:${callId}` : ''

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

    // Global dedup (no nodeKey) — catches duplicates across subgraph namespace levels
    const signature = `${toolName}:${content}`
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

    // Complete any remaining active subagents
    events.push(...this.completeAllSubagents())

    // Emit synthesis-start if there were subagents and we have assistant text pending
    if (this.completedSubagentIds.size > 0 && !this.assistantFinalized) {
      events.push({
        type: 'synthesis-start',
        data: { subagentCount: this.completedSubagentIds.size },
        seq: this.nextSeq(),
      })
    }

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
