/**
 * AI SDK Stream Adapter — Secretary Agent
 *
 * Maps AI SDK v6 ToolLoopAgent fullStream events to SecretaryStreamEvent.
 * Follows the same pattern as editor-deep/ai-sdk-stream-adapter.ts.
 */

import type { TextStreamPart, ToolSet } from 'ai'
import type { SecretaryStreamEvent } from '@inkdown/shared/types'
import { sanitizeOutput } from '../../safety/output-guard'
import { aiSafetyLog } from '../../observability/logger'

/**
 * Adapt an AI SDK fullStream to SecretaryStreamEvent async generator.
 */
export async function* adaptSecretaryStream(
  fullStream: AsyncIterable<TextStreamPart<ToolSet>>,
  pendingEvents: SecretaryStreamEvent[]
): AsyncGenerator<SecretaryStreamEvent> {
  let seq = 0
  let fullText = ''

  for await (const part of fullStream) {
    switch (part.type) {
      case 'text-delta': {
        fullText += part.text
        yield {
          event: 'text',
          data: part.text,
          seq: seq++,
          isDelta: true,
        }
        break
      }

      case 'tool-call': {
        yield {
          event: 'tool_call',
          data: JSON.stringify({
            id: part.toolCallId,
            toolName: part.toolName,
            arguments: part.input,
          }),
          seq: seq++,
        }
        break
      }

      case 'tool-result': {
        yield {
          event: 'tool_result',
          data: JSON.stringify({
            id: part.toolCallId,
            toolName: part.toolName,
            result: part.output,
          }),
          seq: seq++,
          messageId: `tool-result:${part.toolCallId}`,
          sourceNode: part.toolName,
        }

        // Drain side-channel events from tool execution
        while (pendingEvents.length > 0) {
          const event = pendingEvents.shift()!
          yield { ...event, seq: seq++ }
        }
        break
      }

      case 'tool-error': {
        yield {
          event: 'error',
          data: `Tool "${part.toolName}" failed: ${part.error}`,
          seq: seq++,
        }
        break
      }

      case 'reasoning-delta': {
        yield {
          event: 'thinking',
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
      case 'start-step':
        break

      default:
        break
    }
  }

  // Drain any remaining pending events
  while (pendingEvents.length > 0) {
    const event = pendingEvents.shift()!
    yield { ...event, seq: seq++ }
  }

  // Sanitize final output — strip XSS, secrets, prompt leakage
  if (fullText) {
    const { text: sanitizedText, stripped } = sanitizeOutput(fullText)
    if (stripped.length > 0) {
      aiSafetyLog('output_sanitized', { stripped, textLength: fullText.length, agent: 'secretary' })
      // Emit sanitized replacement — frontend uses last complete text
      yield { event: 'text', data: sanitizedText, seq: seq++, isDelta: false }
    }
  }

  yield { event: 'done', data: '', seq: seq++ }
}
