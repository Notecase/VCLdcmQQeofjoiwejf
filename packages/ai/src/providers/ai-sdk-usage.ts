/**
 * AI SDK v6 Usage Tracking
 *
 * Bridges AI SDK's onFinish/usage callbacks to the existing tokenTracker.
 * Drop-in helpers for streamText() and generateText() calls.
 */

import type { LanguageModelUsage } from 'ai'
import { tokenTracker, computeCost } from './token-tracker'
import { MODEL_REGISTRY } from './model-registry'
import type { AITaskType } from './model-registry'

// ============================================================================
// Types
// ============================================================================

export interface AISDKTrackingMeta {
  model: string
  taskType: AITaskType
  userId?: string
  sessionId?: string
}

/** Re-export for convenience */
export type AISDKUsage = LanguageModelUsage

// ============================================================================
// Internal Helper
// ============================================================================

function recordToTracker(
  usage: LanguageModelUsage,
  meta: AISDKTrackingMeta,
  startTime: number
): void {
  const inputTokens = usage.inputTokens ?? 0
  const outputTokens = usage.outputTokens ?? 0

  tokenTracker.record({
    model: meta.model,
    provider: MODEL_REGISTRY[meta.model]?.provider ?? 'gemini',
    taskType: meta.taskType,
    inputTokens,
    outputTokens,
    costCents: computeCost(meta.model, { inputTokens, outputTokens }),
    durationMs: Date.now() - startTime,
    userId: meta.userId,
    sessionId: meta.sessionId,
    timestamp: Date.now(),
  })
}

// ============================================================================
// Tracking Helpers
// ============================================================================

/**
 * Create an `onFinish` callback for streamText() / generateText()
 * that records usage to the existing tokenTracker singleton.
 *
 * Usage: pass as a separate onFinish param, NOT spread.
 *
 * @example
 *   const result = streamText({
 *     model: getModelForTask('chat'),
 *     messages,
 *     onFinish: trackAISDKUsage({ model: 'gemini-3.1-pro-preview', taskType: 'chat' }),
 *   })
 */
export function trackAISDKUsage(
  meta: AISDKTrackingMeta
): (event: { usage: LanguageModelUsage }) => void {
  const startTime = Date.now()
  return (event: { usage: LanguageModelUsage }) => {
    recordToTracker(event.usage, meta, startTime)
  }
}

/**
 * Record usage from a completed (non-streaming) generateText() result.
 *
 * @example
 *   const startTime = Date.now()
 *   const result = await generateText({ model, prompt })
 *   recordAISDKUsage(result.usage, { model: 'gemini-3.1-pro-preview', taskType: 'chat' }, startTime)
 */
export function recordAISDKUsage(
  usage: LanguageModelUsage,
  meta: AISDKTrackingMeta,
  startTime: number
): void {
  recordToTracker(usage, meta, startTime)
}
