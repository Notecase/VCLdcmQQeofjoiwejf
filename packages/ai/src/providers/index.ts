/**
 * AI Provider exports
 *
 * Provider infrastructure for the AI system:
 * - Model Registry: Central catalog of all models + selectModel()
 * - AI SDK Factory: Creates AI SDK v6 LanguageModel instances
 * - AI SDK Usage: Bridges AI SDK callbacks to token tracker
 * - Token Tracker: Captures real token usage from LLM calls
 * - Gemini Provider: Slides (image gen) via native SDK
 */

// Model Registry (central source of truth)
export { MODEL_REGISTRY, selectModel, selectFallbackModel, getModel } from './model-registry'
export type { AITaskType, ModelEntry, ModelProvider, ModelCapability } from './model-registry'

// Token Tracker (usage tracking)
export { tokenTracker, trackGeminiResponse, trackGeminiStream, computeCost } from './token-tracker'
export type { TokenUsageEvent, SessionUsage } from './token-tracker'

// Gemini Provider (slides — native SDK)
export {
  GeminiProvider,
  createGeminiProvider,
  getDefaultGeminiProvider,
  SLIDES_MODEL,
  RESEARCH_MODEL,
  IMAGE_MODEL,
} from './gemini'
export type { GeminiProviderConfig, SlideOutline, GeneratedSlide } from './gemini'

// Request Context (AsyncLocalStorage userId propagation)
export { requestContext, getCurrentUserId } from './request-context'

// Usage Persister (TokenTracker → DB bridge)
export { initUsagePersister } from './usage-persister'

// AI SDK v6 Factory
export {
  createAIModel,
  createAIEmbeddingModel,
  getModelForTask,
  getModelsForTask,
  getEmbeddingModel,
  resolveModel,
  resolveModelsForTask,
  isTransientError,
  resetAIProviders,
} from './ai-sdk-factory'

// AI SDK v6 Usage Tracking
export { trackAISDKUsage, recordAISDKUsage } from './ai-sdk-usage'
export type { AISDKTrackingMeta, AISDKUsage } from './ai-sdk-usage'
