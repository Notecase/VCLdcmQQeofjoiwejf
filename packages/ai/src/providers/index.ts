/**
 * AI Provider exports
 *
 * Provider implementations for the AI system:
 * - Model Registry: Central catalog of all models + selectModel()
 * - Client Factory: Creates OpenAI SDK / LangChain clients per provider
 * - Token Tracker: Captures real token usage from LLM calls
 * - OpenAI Provider: Embeddings (text-embedding-3-large)
 * - Gemini Provider: Slides (image gen), deep research, courses (native SDK)
 */

// Types
export type {
  AIContext,
  ChatMessage,
  AICompletionOptions,
  AIActionType,
  AIUsage,
  AIProvider,
} from './interface'

// Model Registry (new — central source of truth)
export { MODEL_REGISTRY, selectModel, getModel } from './model-registry'
export type { AITaskType, ModelEntry, ModelProvider, ModelCapability } from './model-registry'

// Client Factory (new — creates configured LLM clients)
export { createOpenAIClient, createLangChainModel } from './client-factory'

// Token Tracker (new — usage tracking)
export {
  tokenTracker,
  trackOpenAIStream,
  trackOpenAIResponse,
  trackGeminiResponse,
  trackGeminiStream,
  computeCost,
} from './token-tracker'
export type { TokenUsageEvent, SessionUsage } from './token-tracker'

// LangChain Token Callback
export { TokenTrackingCallback } from './langchain-token-callback'

// OpenAI Provider (embeddings)
export {
  OpenAIProvider,
  createOpenAIProvider,
  getDefaultOpenAIProvider,
  DEFAULT_CHAT_MODEL,
  DEFAULT_EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
} from './openai'
export type { OpenAIProviderConfig } from './openai'

// Gemini Provider (slides, research, courses — native SDK)
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

// AI SDK v6 Factory (new — coexists with client-factory)
export {
  createAIModel,
  createAIEmbeddingModel,
  getModelForTask,
  getEmbeddingModel,
  resolveModel,
  resetAIProviders,
} from './ai-sdk-factory'

// AI SDK v6 Usage Tracking
export { trackAISDKUsage, recordAISDKUsage } from './ai-sdk-usage'
export type { AISDKTrackingMeta, AISDKUsage } from './ai-sdk-usage'

// Provider Factory (legacy — delegates to model-registry)
export {
  createProvider,
  getOpenAI,
  getGemini,
  clearProviderCache,
  getProviderNameForTask,
  getModelNameForTask,
  createBYOKProvider,
} from './factory'
export type { ProviderFactoryConfig, BYOKConfig } from './factory'
