/**
 * Token Tracker
 *
 * Captures real token usage from every LLM call.
 * In-memory accumulator — database persistence comes in a later phase.
 */

import type { ChatCompletionChunk } from 'openai/resources/chat/completions'
import type { ModelProvider, AITaskType } from './model-registry'
import { MODEL_REGISTRY } from './model-registry'
import { getCurrentUserId } from './request-context'

// ============================================================================
// Types
// ============================================================================

export interface TokenUsageEvent {
  model: string
  provider: ModelProvider
  taskType: AITaskType
  inputTokens: number
  outputTokens: number
  costCents: number
  durationMs: number
  userId?: string
  sessionId?: string
  timestamp: number
}

export interface SessionUsage {
  totalInput: number
  totalOutput: number
  totalCostCents: number
}

// ============================================================================
// Cost Computation
// ============================================================================

/**
 * Compute cost in cents from token counts and model pricing.
 */
export function computeCost(
  modelId: string,
  usage: { inputTokens: number; outputTokens: number }
): number {
  const entry = MODEL_REGISTRY[modelId]
  if (!entry) return 0

  const inputCost = (usage.inputTokens / 1000) * entry.costPer1kInput
  const outputCost = (usage.outputTokens / 1000) * entry.costPer1kOutput
  return Math.round((inputCost + outputCost) * 1000) / 1000 // 3 decimal places
}

// ============================================================================
// Token Tracker
// ============================================================================

class TokenTracker {
  private events: TokenUsageEvent[] = []

  /** Hook called after every record(). Set by initUsagePersister(). */
  onRecord?: (event: TokenUsageEvent) => void

  record(event: TokenUsageEvent): void {
    // Fill userId from request context if not already set
    if (!event.userId) {
      event.userId = getCurrentUserId()
    }

    this.events.push(event)

    // Log for visibility
    if (event.inputTokens > 0 || event.outputTokens > 0) {
      console.log(
        `[TokenTracker] ${event.taskType} (${event.model}): ` +
        `${event.inputTokens} in / ${event.outputTokens} out ` +
        `($${event.costCents.toFixed(3)}c, ${event.durationMs}ms)`
      )
    }

    // Fire persistence hook
    this.onRecord?.(event)
  }

  getSessionUsage(sessionId: string): SessionUsage {
    const sessionEvents = this.events.filter((e) => e.sessionId === sessionId)
    return {
      totalInput: sessionEvents.reduce((sum, e) => sum + e.inputTokens, 0),
      totalOutput: sessionEvents.reduce((sum, e) => sum + e.outputTokens, 0),
      totalCostCents: sessionEvents.reduce((sum, e) => sum + e.costCents, 0),
    }
  }

  getRecentEvents(limit = 50): TokenUsageEvent[] {
    return this.events.slice(-limit)
  }

  getTotalUsage(): SessionUsage {
    return {
      totalInput: this.events.reduce((sum, e) => sum + e.inputTokens, 0),
      totalOutput: this.events.reduce((sum, e) => sum + e.outputTokens, 0),
      totalCostCents: this.events.reduce((sum, e) => sum + e.costCents, 0),
    }
  }

  clear(): void {
    this.events = []
  }
}

// Singleton instance
export const tokenTracker = new TokenTracker()

// ============================================================================
// Stream Wrapper Utilities
// ============================================================================

/**
 * Wraps an OpenAI streaming response to capture token usage from the final chunk.
 * Usage info is on the last chunk when `stream_options: { include_usage: true }`.
 */
export async function* trackOpenAIStream(
  stream: AsyncIterable<ChatCompletionChunk>,
  meta: {
    model: string
    taskType: AITaskType
    userId?: string
    sessionId?: string
  }
): AsyncGenerator<ChatCompletionChunk> {
  let inputTokens = 0
  let outputTokens = 0
  const start = Date.now()

  for await (const chunk of stream) {
    if (chunk.usage) {
      inputTokens = chunk.usage.prompt_tokens ?? 0
      outputTokens = chunk.usage.completion_tokens ?? 0
    }
    yield chunk
  }

  tokenTracker.record({
    ...meta,
    inputTokens,
    outputTokens,
    costCents: computeCost(meta.model, { inputTokens, outputTokens }),
    durationMs: Date.now() - start,
    timestamp: Date.now(),
    provider: MODEL_REGISTRY[meta.model]?.provider ?? 'gemini',
  })
}

/**
 * Records token usage from a non-streaming OpenAI response.
 */
export function trackOpenAIResponse(
  response: { usage?: { prompt_tokens?: number; completion_tokens?: number } },
  meta: {
    model: string
    taskType: AITaskType
    userId?: string
    sessionId?: string
    startTime: number
  }
): void {
  const inputTokens = response.usage?.prompt_tokens ?? 0
  const outputTokens = response.usage?.completion_tokens ?? 0

  tokenTracker.record({
    ...meta,
    inputTokens,
    outputTokens,
    costCents: computeCost(meta.model, { inputTokens, outputTokens }),
    durationMs: Date.now() - meta.startTime,
    timestamp: Date.now(),
    provider: MODEL_REGISTRY[meta.model]?.provider ?? 'gemini',
  })
}

// ============================================================================
// Gemini Native SDK Helpers
// ============================================================================

/**
 * Records token usage from a non-streaming Gemini native SDK response.
 * Usage is on `result.response.usageMetadata`.
 */
export function trackGeminiResponse(
  result: { response: { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } } },
  meta: {
    model: string
    taskType: AITaskType
    userId?: string
    sessionId?: string
    startTime: number
  }
): void {
  const usage = result.response.usageMetadata
  const inputTokens = usage?.promptTokenCount ?? 0
  const outputTokens = usage?.candidatesTokenCount ?? 0

  tokenTracker.record({
    ...meta,
    inputTokens,
    outputTokens,
    costCents: computeCost(meta.model, { inputTokens, outputTokens }),
    durationMs: Date.now() - meta.startTime,
    timestamp: Date.now(),
    provider: MODEL_REGISTRY[meta.model]?.provider ?? 'gemini',
  })
}

/**
 * Wraps a Gemini streaming response to capture token usage after stream ends.
 * The Gemini SDK's `generateContentStream()` returns `{ stream, response }` where
 * `response` is a Promise that resolves after streaming finishes with `usageMetadata`.
 */
export async function* trackGeminiStream(
  streamResult: {
    stream: AsyncIterable<{ text: () => string }>
    response: Promise<{ usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } }>
  },
  meta: {
    model: string
    taskType: AITaskType
    userId?: string
    sessionId?: string
  }
): AsyncGenerator<{ text: () => string }> {
  const start = Date.now()

  for await (const chunk of streamResult.stream) {
    yield chunk
  }

  // After stream completes, read usage from the resolved response
  try {
    const resolvedResponse = await streamResult.response
    const usage = resolvedResponse.usageMetadata
    const inputTokens = usage?.promptTokenCount ?? 0
    const outputTokens = usage?.candidatesTokenCount ?? 0

    tokenTracker.record({
      ...meta,
      inputTokens,
      outputTokens,
      costCents: computeCost(meta.model, { inputTokens, outputTokens }),
      durationMs: Date.now() - start,
      timestamp: Date.now(),
      provider: MODEL_REGISTRY[meta.model]?.provider ?? 'gemini',
    })
  } catch {
    // Best-effort — don't break the caller if usage extraction fails
  }
}
