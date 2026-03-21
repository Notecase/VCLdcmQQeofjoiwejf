/**
 * Provider Factory
 *
 * Creates AI providers based on task type.
 * Delegates to model-registry for model selection and client-factory for instantiation.
 *
 * Model strategy:
 * - Chat/Agents: Gemini 3.1 Pro (via OpenAI-compat endpoint)
 * - Artifacts/Code: Kimi K2.5 (Ollama Cloud)
 * - Slides: Gemini 3 Pro (native SDK for image gen)
 * - Research: Gemini Deep Research
 * - Embeddings: OpenAI text-embedding-3-large
 */

import { AIProvider } from './interface'
import { OpenAIProvider, OpenAIProviderConfig } from './openai'
import {
  GeminiProvider,
  GeminiProviderConfig,
  DEFAULT_MODEL as GEMINI_DEFAULT,
  SLIDES_MODEL,
  RESEARCH_MODEL,
} from './gemini'
import { selectModel, type AITaskType, type ModelProvider } from './model-registry'

// Re-export AITaskType from model-registry (was previously defined here)
export type { AITaskType } from './model-registry'

// ============================================================================
// Provider Configuration
// ============================================================================

export interface ProviderFactoryConfig {
  openai?: Partial<OpenAIProviderConfig>
  gemini?: Partial<GeminiProviderConfig>
}

// ============================================================================
// Provider Cache
// ============================================================================

const providerCache: {
  openai?: OpenAIProvider
  gemini?: GeminiProvider
} = {}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Get or create OpenAI provider (used for embeddings)
 */
function getOpenAIProvider(config?: Partial<OpenAIProviderConfig>): OpenAIProvider {
  if (!providerCache.openai) {
    const apiKey = config?.apiKey || process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error('OpenAI API key is required. Set OPENAI_API_KEY environment variable.')
    }
    providerCache.openai = new OpenAIProvider({
      apiKey,
      model: config?.model || selectModel('chat').id,
      ...config,
    })
  }
  return providerCache.openai
}

/**
 * Get or create Gemini provider (used for slides, research, courses via native SDK)
 */
function getGeminiProvider(config?: Partial<GeminiProviderConfig>): GeminiProvider {
  if (!providerCache.gemini) {
    const apiKey = config?.apiKey || process.env.GOOGLE_AI_API_KEY
    if (!apiKey) {
      throw new Error('Google AI API key is required. Set GOOGLE_AI_API_KEY environment variable.')
    }
    providerCache.gemini = new GeminiProvider({
      apiKey,
      model: config?.model || GEMINI_DEFAULT,
      slidesModel: config?.slidesModel || SLIDES_MODEL,
      researchModel: config?.researchModel || RESEARCH_MODEL,
      ...config,
    })
  }
  return providerCache.gemini
}

// ============================================================================
// Main Factory
// ============================================================================

/**
 * Create a provider for a specific task type.
 * Uses the model registry to determine the right provider.
 *
 * Note: Most agents now use createOpenAIClient/createLangChainModel from client-factory
 * directly. This factory is primarily used by the AIProvider interface consumers
 * (slides, research, embeddings, and legacy code paths).
 */
export function createProvider(taskType: AITaskType, config?: ProviderFactoryConfig): AIProvider {
  const model = selectModel(taskType)

  switch (model.provider) {
    case 'openai':
      return getOpenAIProvider(config?.openai)

    case 'gemini':
      return getGeminiProvider(config?.gemini)

    // Ollama models via AIProvider interface fall back to Gemini
    // (agents that need Ollama use createOpenAIClient directly)
    case 'ollama-cloud':
    case 'ollama-local':
      return getGeminiProvider(config?.gemini)

    default:
      return getGeminiProvider(config?.gemini)
  }
}

/**
 * Get specific provider types for advanced use
 */
export function getOpenAI(config?: Partial<OpenAIProviderConfig>): OpenAIProvider {
  return getOpenAIProvider(config)
}

export function getGemini(config?: Partial<GeminiProviderConfig>): GeminiProvider {
  return getGeminiProvider(config)
}

/**
 * Clear provider cache (for testing or reconfiguration)
 */
export function clearProviderCache(): void {
  delete providerCache.openai
  delete providerCache.gemini
}

// ============================================================================
// BYOK Key Resolution
// ============================================================================

/**
 * User API key configuration for BYOK (Bring Your Own Key).
 * Used by heartbeat and other autonomous features.
 */
export interface BYOKConfig {
  provider: 'google' | 'openai' | 'anthropic'
  model: string
  apiKey: string
}

/**
 * Create a provider using a user's BYOK API key.
 * Falls back to the default provider if the BYOK provider is not available.
 */
export function createBYOKProvider(byok: BYOKConfig): AIProvider {
  switch (byok.provider) {
    case 'google':
      return getGeminiProvider({ apiKey: byok.apiKey, model: byok.model })
    case 'openai':
      return getOpenAIProvider({ apiKey: byok.apiKey, model: byok.model })
    default:
      console.warn(`BYOK provider "${byok.provider}" not fully supported, falling back to default`)
      return getGeminiProvider()
  }
}

// ============================================================================
// Task Type Helpers (delegate to model-registry)
// ============================================================================

const PROVIDER_MAP: Record<ModelProvider, 'openai' | 'ollama' | 'gemini'> = {
  openai: 'openai',
  gemini: 'gemini',
  'ollama-cloud': 'ollama',
  'ollama-local': 'ollama',
}

/**
 * Get the provider name for a task type
 */
export function getProviderNameForTask(taskType: AITaskType): 'openai' | 'ollama' | 'gemini' {
  const model = selectModel(taskType)
  return PROVIDER_MAP[model.provider] ?? 'gemini'
}

/**
 * Get the model name for a task type
 */
export function getModelNameForTask(taskType: AITaskType): string {
  return selectModel(taskType).id
}
