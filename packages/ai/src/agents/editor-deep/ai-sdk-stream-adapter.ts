/**
 * AI SDK Stream Adapter
 *
 * Maps AI SDK v6 ToolLoopAgent fullStream events to EditorDeepAgentEvent.
 * Replaces EditorDeepStreamNormalizer (which handled LangGraph events).
 *
 * The adapter also drains pendingEvents (side-channel events from tool execute
 * functions like edit-proposal, note-navigate, artifact, clarification-requested)
 * after each tool-result.
 */

import type { TextStreamPart, ToolSet } from 'ai'
import type { EditorDeepAgentEvent } from './types'
import { sanitizeOutput } from '../../safety/output-guard'
import { aiSafetyLog } from '../../observability/logger'

/**
 * Adapt an AI SDK fullStream to EditorDeepAgentEvent async generator.
 *
 * @param fullStream - The AI SDK ToolLoopAgent's fullStream
 * @param pendingEvents - Shared array that tool execute functions push side-channel events to
 * @param threadId - The thread ID for the done event
 */
export async function* adaptAISDKStream(
  fullStream: AsyncIterable<TextStreamPart<ToolSet>>,
  pendingEvents: EditorDeepAgentEvent[],
  threadId: string
): AsyncGenerator<EditorDeepAgentEvent> {
  let seq = 0
  let assistantStarted = false
  let fullText = ''

  for await (const part of fullStream) {
    switch (part.type) {
      case 'text-delta': {
        if (!assistantStarted) {
          yield { type: 'assistant-start', data: null, seq: seq++ }
          assistantStarted = true
        }
        fullText += part.text
        yield { type: 'assistant-delta', data: part.text, seq: seq++, isDelta: true }
        break
      }

      case 'tool-call': {
        yield {
          type: 'tool-call',
          data: {
            id: part.toolCallId,
            toolName: part.toolName,
            arguments: part.input,
          },
          seq: seq++,
        }
        break
      }

      case 'tool-result': {
        yield {
          type: 'tool-result',
          data: {
            id: part.toolCallId,
            toolName: part.toolName,
            result: part.output,
          },
          seq: seq++,
        }

        // Drain side-channel events from tool execution atomically.
        // splice(0) snapshots and clears in one step, preventing interleave
        // if a tool ever pushes events concurrently.
        const drained = pendingEvents.splice(0)
        for (const event of drained) {
          yield { ...event, seq: seq++ }
        }
        break
      }

      case 'tool-error': {
        yield {
          type: 'error',
          data: `Tool "${part.toolName}" failed: ${part.error}`,
          seq: seq++,
        }
        break
      }

      case 'start-step': {
        // Optional: could emit thinking/subagent-start for multi-step visibility
        break
      }

      case 'reasoning-delta': {
        yield {
          type: 'thinking',
          data: part.text,
          seq: seq++,
          isDelta: true,
        }
        break
      }

      // Skip non-essential events
      case 'text-start':
      case 'text-end':
      case 'reasoning-start':
      case 'reasoning-end':
      case 'tool-input-start':
      case 'tool-input-end':
      case 'tool-input-delta':
      case 'source':
      case 'file':
        break

      default:
        // Handle finish-step and other events
        break
    }
  }

  // Final events — sanitize accumulated text before emitting
  if (fullText) {
    const { text: sanitizedText, stripped } = sanitizeOutput(fullText)
    if (stripped.length > 0) {
      aiSafetyLog('output_sanitized', { stripped, textLength: fullText.length })
    }
    yield { type: 'assistant-final', data: sanitizedText, seq: seq++ }
  }

  // Drain any remaining pending events atomically
  const remaining = pendingEvents.splice(0)
  for (const event of remaining) {
    yield { ...event, seq: seq++ }
  }

  yield { type: 'done', data: { threadId }, seq: seq++ }
}
