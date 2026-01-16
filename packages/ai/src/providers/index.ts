/**
 * AI Provider exports
 *
 * Provider implementations for the AI system:
 * - OpenAI (GPT-5.2): Chat, agents, embeddings
 * - Ollama Cloud (GLM-4.6): Artifacts, code generation
 * - Gemini: Slides, deep research, courses
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

// OpenAI Provider
export {
  OpenAIProvider,
  createOpenAIProvider,
  getDefaultOpenAIProvider,
  DEFAULT_CHAT_MODEL,
  DEFAULT_EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
} from './openai'
export type { OpenAIProviderConfig } from './openai'

// Ollama Cloud Provider (GLM-4.6)
export {
  OllamaCloudProvider,
  createOllamaCloudProvider,
  getDefaultOllamaCloudProvider,
  OLLAMA_CLOUD_URL,
} from './ollama'
export type { OllamaCloudConfig } from './ollama'

// Gemini Provider
export {
  GeminiProvider,
  createGeminiProvider,
  getDefaultGeminiProvider,
  SLIDES_MODEL,
  RESEARCH_MODEL,
  IMAGE_MODEL,
} from './gemini'
export type { GeminiProviderConfig, SlideOutline, GeneratedSlide } from './gemini'

// Provider Factory
export {
  createProvider,
  getOpenAI,
  getOllamaCloud,
  getGemini,
  clearProviderCache,
  getProviderNameForTask,
  getModelNameForTask,
} from './factory'
export type { AITaskType, ProviderFactoryConfig } from './factory'
