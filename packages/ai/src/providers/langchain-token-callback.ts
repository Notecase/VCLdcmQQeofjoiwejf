/**
 * LangChain Token Tracking Callback
 *
 * Custom BaseCallbackHandler that records token usage from LangChain LLM calls
 * to the centralized tokenTracker.
 */

import { BaseCallbackHandler } from '@langchain/core/callbacks/base'
import { tokenTracker, computeCost } from './token-tracker'
import { MODEL_REGISTRY } from './model-registry'
import type { AITaskType } from './model-registry'

export class TokenTrackingCallback extends BaseCallbackHandler {
  name = 'TokenTrackingCallback'
  private model: string
  private taskType: AITaskType
  private startTime: number

  constructor(meta: { model: string; taskType: AITaskType }) {
    super()
    this.model = meta.model
    this.taskType = meta.taskType
    this.startTime = Date.now()
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async handleLLMEnd(output: any) {
    const usage = output?.llmOutput?.tokenUsage || output?.llmOutput?.usage
    if (usage) {
      const inputTokens = usage.promptTokens ?? usage.prompt_tokens ?? 0
      const outputTokens = usage.completionTokens ?? usage.completion_tokens ?? 0

      tokenTracker.record({
        model: this.model,
        provider: MODEL_REGISTRY[this.model]?.provider ?? 'gemini',
        taskType: this.taskType,
        inputTokens,
        outputTokens,
        costCents: computeCost(this.model, { inputTokens, outputTokens }),
        durationMs: Date.now() - this.startTime,
        timestamp: Date.now(),
      })
      this.startTime = Date.now() // Reset for next call in same agent run
    }
  }
}
