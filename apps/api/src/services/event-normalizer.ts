/**
 * Event Normalizer
 *
 * Transforms Claude Code's NDJSON stream-json output into NoteshellEvent objects.
 * Claude Code emits lines with types: system, stream_event, assistant, user, result.
 * This normalizer maps those to our domain event protocol.
 */

import type {
  NoteshellEvent,
  ContentDeltaEvent,
  ContentDoneEvent,
  ThinkingDeltaEvent,
  ToolStartedEvent,
  ToolCompletedEvent,
  NoteEditedEvent,
  NoteCreatedEvent,
  ArtifactCreatedEvent,
  TurnCompletedEvent,
  ClaudeCodeErrorEvent,
  SessionStartedEvent,
} from '@inkdown/shared/types'

interface StreamEventLine {
  type: 'stream_event'
  event: {
    type: string
    index?: number
    content_block?: {
      type: string
      id?: string
      name?: string
      text?: string
    }
    delta?: {
      type: string
      text?: string
      partial_json?: string
    }
  }
}

interface SystemLine {
  type: 'system'
  subtype: string
  session_id?: string
  tools?: Array<{ name: string }>
  mcp_servers?: Array<{ name: string }>
  model?: string
}

interface ResultLine {
  type: 'result'
  subtype: string
  result?: string
  cost_usd?: number
  duration_ms?: number
  num_turns?: number
  usage?: {
    input_tokens?: number
    output_tokens?: number
    cache_read_input_tokens?: number
    cache_creation_input_tokens?: number
  }
}

interface UserLine {
  type: 'user'
  message: {
    content?: Array<{
      type: string
      tool_use_id?: string
      content?: string | Array<{ type: string; text?: string }>
    }>
  }
}

type NdjsonLine = StreamEventLine | SystemLine | ResultLine | UserLine | { type: string }

/**
 * Normalizes Claude Code NDJSON stream events into NoteshellEvent objects.
 */
export class EventNormalizer {
  private accumulatedText = ''
  private accumulatedThinking = ''
  private activeToolInputs = new Map<number, { id: string; name: string; json: string }>()

  /**
   * Parse one NDJSON line and return 0+ NoteshellEvents.
   */
  normalize(line: string): NoteshellEvent[] {
    const trimmed = line.trim()
    if (!trimmed) return []

    let parsed: NdjsonLine
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      return []
    }

    switch (parsed.type) {
      case 'system':
        return this.handleSystem(parsed as SystemLine)
      case 'stream_event':
        return this.handleStreamEvent(parsed as StreamEventLine)
      case 'user':
        return this.handleUser(parsed as UserLine)
      case 'result':
        return this.handleResult(parsed as ResultLine)
      default:
        return []
    }
  }

  /** Reset state between turns */
  reset(): void {
    this.accumulatedText = ''
    this.accumulatedThinking = ''
    this.activeToolInputs.clear()
  }

  private handleSystem(line: SystemLine): NoteshellEvent[] {
    if (line.subtype === 'init') {
      const event: SessionStartedEvent = {
        type: 'session.started',
        sessionId: line.session_id ?? '',
        model: line.model ?? 'unknown',
        tools: (line.tools ?? []).map((t) => t.name),
        mcpServers: (line.mcp_servers ?? []).map((s) => s.name),
      }
      return [event]
    }
    return []
  }

  private handleStreamEvent(line: StreamEventLine): NoteshellEvent[] {
    const evt = line.event
    if (!evt) return []
    const events: NoteshellEvent[] = []

    switch (evt.type) {
      case 'content_block_start': {
        const block = evt.content_block
        if (block?.type === 'tool_use' && block.id && block.name) {
          const index = evt.index ?? 0
          this.activeToolInputs.set(index, { id: block.id, name: block.name, json: '' })
          const toolEvent: ToolStartedEvent = {
            type: 'tool.started',
            toolUseId: block.id,
            name: block.name,
            input: {},
          }
          events.push(toolEvent)
        }
        break
      }

      case 'content_block_delta': {
        const delta = evt.delta
        if (!delta) break

        if (delta.type === 'text_delta' && delta.text) {
          this.accumulatedText += delta.text
          const textEvent: ContentDeltaEvent = {
            type: 'content.delta',
            text: delta.text,
          }
          events.push(textEvent)
        }

        if (delta.type === 'thinking_delta' && delta.text) {
          this.accumulatedThinking += delta.text
          const thinkingEvent: ThinkingDeltaEvent = {
            type: 'thinking.delta',
            text: delta.text,
          }
          events.push(thinkingEvent)
        }

        if (delta.type === 'input_json_delta' && delta.partial_json) {
          const index = evt.index ?? 0
          const active = this.activeToolInputs.get(index)
          if (active) {
            active.json += delta.partial_json
          }
        }
        break
      }

      case 'content_block_stop': {
        const index = evt.index ?? 0
        const active = this.activeToolInputs.get(index)
        if (active) {
          // Parse accumulated JSON input
          try {
            const input = JSON.parse(active.json || '{}')
            // Re-emit tool.started with complete input
            const completeToolEvent: ToolStartedEvent = {
              type: 'tool.started',
              toolUseId: active.id,
              name: active.name,
              input,
            }
            events.push(completeToolEvent)
          } catch {
            // Input parsing failed — leave as-is
          }
        }
        break
      }

      case 'message_stop': {
        if (this.accumulatedText) {
          const doneEvent: ContentDoneEvent = {
            type: 'content.done',
            text: this.accumulatedText,
          }
          events.push(doneEvent)
        }
        break
      }
    }

    return events
  }

  private handleUser(line: UserLine): NoteshellEvent[] {
    const events: NoteshellEvent[] = []
    const content = line.message?.content
    if (!Array.isArray(content)) return events

    for (const block of content) {
      if (block.type === 'tool_result' && block.tool_use_id) {
        const outputText =
          typeof block.content === 'string'
            ? block.content
            : Array.isArray(block.content)
              ? block.content
                  .filter((c) => c.type === 'text')
                  .map((c) => c.text ?? '')
                  .join('')
              : ''

        // Find the tool name from active tools
        let toolName = 'unknown'
        for (const [, active] of this.activeToolInputs) {
          if (active.id === block.tool_use_id) {
            toolName = active.name
            break
          }
        }

        const toolCompletedEvent: ToolCompletedEvent = {
          type: 'tool.completed',
          toolUseId: block.tool_use_id,
          name: toolName,
          output: outputText,
          isError: false,
        }
        events.push(toolCompletedEvent)

        // Detect domain events from tool output
        const domainEvents = this.detectDomainEvents(toolName, outputText)
        events.push(...domainEvents)
      }
    }

    return events
  }

  private handleResult(line: ResultLine): NoteshellEvent[] {
    const events: NoteshellEvent[] = []

    if (line.subtype === 'success') {
      if (this.accumulatedText) {
        const doneEvent: ContentDoneEvent = {
          type: 'content.done',
          text: this.accumulatedText,
        }
        events.push(doneEvent)
      }

      const turnEvent: TurnCompletedEvent = {
        type: 'turn.completed',
        usage: {
          inputTokens: line.usage?.input_tokens ?? 0,
          outputTokens: line.usage?.output_tokens ?? 0,
          cacheReadTokens: line.usage?.cache_read_input_tokens ?? 0,
          cacheWriteTokens: line.usage?.cache_creation_input_tokens ?? 0,
        },
        costUsd: line.cost_usd ?? 0,
        numTurns: line.num_turns ?? 1,
        durationMs: line.duration_ms ?? 0,
      }
      events.push(turnEvent)

      this.reset()
    } else if (line.subtype?.startsWith('error')) {
      const errorEvent: ClaudeCodeErrorEvent = {
        type: 'error',
        message: line.result ?? 'Unknown error',
        code: line.subtype,
      }
      events.push(errorEvent)
      this.reset()
    }

    return events
  }

  /**
   * Detect domain-specific events from tool completion output.
   * Parses JSON output from MCP tools to extract note/artifact events.
   */
  private detectDomainEvents(toolName: string, output: string): NoteshellEvent[] {
    const events: NoteshellEvent[] = []

    try {
      const data = JSON.parse(output)
      if (!data.success) return events

      // edit_note, append_to_note, remove_from_note → note.edited
      if (
        (toolName === 'edit_note' ||
          toolName === 'append_to_note' ||
          toolName === 'remove_from_note') &&
        data.noteId &&
        data.original !== undefined &&
        data.proposed !== undefined
      ) {
        const editEvent: NoteEditedEvent = {
          type: 'note.edited',
          noteId: data.noteId,
          original: data.original,
          proposed: data.proposed,
          editId: data.editId ?? crypto.randomUUID(),
        }
        events.push(editEvent)
      }

      // notes_create → note.created
      if (toolName === 'notes_create' && data.noteId && data.title) {
        const createEvent: NoteCreatedEvent = {
          type: 'note.created',
          noteId: data.noteId,
          title: data.title,
        }
        events.push(createEvent)
      }

      // artifacts_create → artifact.created
      if (toolName === 'artifacts_create' && data.artifactId) {
        const artifactEvent: ArtifactCreatedEvent = {
          type: 'artifact.created',
          artifactId: data.artifactId,
          noteId: data.noteId ?? '',
          title: data.title ?? 'Untitled',
          html: data.html ?? '',
          css: data.css,
          javascript: data.javascript,
        }
        events.push(artifactEvent)
      }
    } catch {
      // Output not JSON — no domain events to extract
    }

    return events
  }
}
