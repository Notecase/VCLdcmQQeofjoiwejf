/**
 * BaseStreamNormalizer — shared deduplication and tracking logic for all agent stream normalizers.
 *
 * Provides:
 * - Text snapshot deduplication (prevents re-emitting replayed LangGraph messages)
 * - Tool call/result signature tracking
 * - Stable JSON stringification for argument comparison
 * - Sequence number generation
 * - History text seeding
 *
 * Each agent's normalizer extends this base and adds agent-specific event formatting.
 */

export interface StreamMessage {
  id?: string
  name?: string
  type?: string
  role?: string
  content?: string | unknown[]
  tool_calls?: Array<{ id?: string; name: string; args: Record<string, unknown> }>
}

export class BaseStreamNormalizer {
  protected seq = 0
  protected textSnapshots = new Map<string, string>()
  protected emittedToolCallSignatures = new Set<string>()
  protected emittedToolResultSignatures = new Set<string>()
  protected pendingToolCallIdsByName = new Map<string, string[]>()
  protected historyAssistantTexts = new Set<string>()

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

  protected stableStringify(value: unknown): string {
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

  protected nextSeq(): number {
    this.seq += 1
    return this.seq
  }

  getSeq(): number {
    return this.nextSeq()
  }

  protected getRole(message: StreamMessage): string {
    const raw = message.role || message.type || ''
    return raw.toLowerCase()
  }

  protected extractTextContent(content: StreamMessage['content']): string {
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

  protected getTextSourceKey(nodeKey: string, message: StreamMessage): string {
    const role = this.getRole(message) || 'assistant'
    const name = message.name ? `:${message.name}` : ''
    if (typeof message.id === 'string' && message.id.trim()) {
      return `message:${message.id.trim()}:${role}${name}`
    }
    return `node:${nodeKey}:${role}${name}`
  }

  /**
   * Check if a message should be skipped (non-assistant role, or replayed history).
   * Returns the extracted text content if valid, or null if should be skipped.
   */
  protected extractValidAssistantText(message: StreamMessage): string | null {
    const content = this.extractTextContent(message.content)
    if (!content) return null

    const role = this.getRole(message)
    if (role === 'human' || role === 'user' || role === 'system' || role === 'tool') return null

    // Skip replayed history messages
    const trimmedContent = content.trim()
    if (this.historyAssistantTexts.has(trimmedContent)) return null

    return content
  }

  /**
   * Compute the delta text from a snapshot, returning null if no new text.
   * Also handles reconciliation against accumulated assistant text.
   */
  protected computeTextDelta(
    sourceKey: string,
    content: string,
    accumulatedText: string
  ): string | null {
    const hasSnapshot = this.textSnapshots.has(sourceKey)
    const previous = hasSnapshot ? this.textSnapshots.get(sourceKey) || '' : ''
    let delta = content

    if (hasSnapshot) {
      if (content === previous) return null
      if (previous && content.startsWith(previous)) {
        delta = content.slice(previous.length)
      } else if (previous && previous.startsWith(content)) {
        return null
      }
    } else {
      // Reconcile first snapshot from a new stream source against already emitted text.
      if (content === accumulatedText) {
        this.textSnapshots.set(sourceKey, content)
        return null
      }
      if (accumulatedText && content.startsWith(accumulatedText)) {
        delta = content.slice(accumulatedText.length)
      } else if (accumulatedText && accumulatedText.startsWith(content)) {
        this.textSnapshots.set(sourceKey, content)
        return null
      }
    }

    this.textSnapshots.set(sourceKey, content)
    return delta || null
  }

  /**
   * Check and deduplicate a tool call. Returns the tool call ID if new, null if duplicate.
   */
  protected deduplicateToolCall(
    nodeKey: string,
    call: { id?: string; name: string; args: Record<string, unknown> }
  ): string | null {
    const callId = call.id || ''
    const argsSignature = this.stableStringify(call.args || {})
    // Global dedup (no nodeKey) — catches duplicates across subgraph namespace levels
    const semanticSignature = `semantic:${call.name}:${argsSignature}`
    const idSignature = callId ? `id:${callId}` : ''

    if (
      this.emittedToolCallSignatures.has(semanticSignature) ||
      (idSignature && this.emittedToolCallSignatures.has(idSignature))
    ) {
      return null
    }

    this.emittedToolCallSignatures.add(semanticSignature)
    if (idSignature) this.emittedToolCallSignatures.add(idSignature)

    const toolCallId = callId || crypto.randomUUID()
    const queue = this.pendingToolCallIdsByName.get(call.name) || []
    queue.push(toolCallId)
    this.pendingToolCallIdsByName.set(call.name, queue)

    return toolCallId
  }

  /**
   * Check and deduplicate a tool result. Returns the matched tool call ID if new, null if duplicate.
   */
  protected deduplicateToolResult(
    nodeKey: string,
    toolName: string,
    content: string
  ): string | null {
    if (!content) return null

    // Global dedup (no nodeKey) — catches duplicates across subgraph namespace levels
    const signature = `${toolName}:${content}`
    if (this.emittedToolResultSignatures.has(signature)) return null
    this.emittedToolResultSignatures.add(signature)

    const queue = this.pendingToolCallIdsByName.get(toolName) || []
    const toolCallId = queue.shift() || crypto.randomUUID()
    this.pendingToolCallIdsByName.set(toolName, queue)

    return toolCallId
  }
}
