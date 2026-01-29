/**
 * Provider Factory
 *
 * Creates AI providers based on task type.
 * Routes to the optimal model for each task.
 *
 * From Note3 model strategy:
 * - Chat/Agents: GPT-5.2 (OpenAI)
 * - Artifacts/Code: GLM-4.6 (Ollama Cloud)
 * - Slides: Gemini 3 Pro
 * - Research: Gemini Deep Research
 */

import { AIProvider } from './interface'
import { OpenAIProvider, OpenAIProviderConfig, DEFAULT_CHAT_MODEL } from './openai'
import { OllamaCloudProvider, OllamaCloudConfig, DEFAULT_MODEL as OLLAMA_DEFAULT } from './ollama'
import {
  GeminiProvider,
  GeminiProviderConfig,
  DEFAULT_MODEL as GEMINI_DEFAULT,
  SLIDES_MODEL,
  RESEARCH_MODEL,
} from './gemini'

// ============================================================================
// Task Types
// ============================================================================

export type AITaskType =
  // OpenAI GPT-5.2 tasks
  | 'chat'
  | 'note-agent'
  | 'planner'
  | 'secretary'
  | 'completion'
  | 'rewrite'
  | 'summarize'
  | 'embedding'
  // Ollama Cloud GLM-4.6 tasks
  | 'artifact'
  | 'code'
  | 'html'
  | 'css'
  | 'javascript'
  // Gemini tasks
  | 'slides'
  | 'research'
  | 'course'
  | 'deep-research'

// ============================================================================
// Provider Configuration
// ============================================================================

export interface ProviderFactoryConfig {
  openai?: Partial<OpenAIProviderConfig>
  ollamaCloud?: Partial<OllamaCloudConfig>
  gemini?: Partial<GeminiProviderConfig>
}

// ============================================================================
// Provider Cache
// ============================================================================

const providerCache: {
  openai?: OpenAIProvider
  ollamaCloud?: OllamaCloudProvider
  gemini?: GeminiProvider
} = {}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Get or create OpenAI provider
 */
function getOpenAIProvider(config?: Partial<OpenAIProviderConfig>): OpenAIProvider {
  if (!providerCache.openai) {
    const apiKey = config?.apiKey || process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error('OpenAI API key is required. Set OPENAI_API_KEY environment variable.')
    }
    providerCache.openai = new OpenAIProvider({
      apiKey,
      model: config?.model || DEFAULT_CHAT_MODEL,
      ...config,
    })
  }
  return providerCache.openai
}

/**
 * Get or create Ollama Cloud provider
 */
function getOllamaCloudProvider(config?: Partial<OllamaCloudConfig>): OllamaCloudProvider {
  if (!providerCache.ollamaCloud) {
    const baseURL = config?.baseURL || process.env.OLLAMA_CLOUD_URL || 'https://api.ollama.ai/v1'
    const apiKey = config?.apiKey || process.env.OLLAMA_CLOUD_API_KEY
    providerCache.ollamaCloud = new OllamaCloudProvider({
      baseURL,
      apiKey,
      model: config?.model || OLLAMA_DEFAULT,
      ...config,
    })
  }
  return providerCache.ollamaCloud
}

/**
 * Get or create Gemini provider
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
 * Create a provider for a specific task type
 * Automatically routes to the optimal model
 */
export function createProvider(taskType: AITaskType, config?: ProviderFactoryConfig): AIProvider {
  switch (taskType) {
    // OpenAI GPT-5.2 for chat and agents
    case 'chat':
    case 'note-agent':
    case 'planner':
    case 'secretary':
    case 'completion':
    case 'rewrite':
    case 'summarize':
    case 'embedding':
      return getOpenAIProvider(config?.openai)

    // Ollama Cloud GLM-4.6 for artifacts and code
    case 'artifact':
    case 'code':
    case 'html':
    case 'css':
    case 'javascript':
      return getOllamaCloudProvider(config?.ollamaCloud)

    // Gemini for slides, research, and courses
    case 'slides':
    case 'research':
    case 'course':
    case 'deep-research':
      return getGeminiProvider(config?.gemini)

    default:
      // Default to OpenAI for unknown tasks
      console.warn(`Unknown task type: ${taskType}, defaulting to OpenAI`)
      return getOpenAIProvider(config?.openai)
  }
}

/**
 * Get specific provider types for advanced use
 */
export function getOpenAI(config?: Partial<OpenAIProviderConfig>): OpenAIProvider {
  return getOpenAIProvider(config)
}

export function getOllamaCloud(config?: Partial<OllamaCloudConfig>): OllamaCloudProvider {
  return getOllamaCloudProvider(config)
}

export function getGemini(config?: Partial<GeminiProviderConfig>): GeminiProvider {
  return getGeminiProvider(config)
}

/**
 * Clear provider cache (for testing or reconfiguration)
 */
export function clearProviderCache(): void {
  delete providerCache.openai
  delete providerCache.ollamaCloud
  delete providerCache.gemini
}

// ============================================================================
// Task Type Helpers
// ============================================================================

/**
 * Get the provider name for a task type
 */
export function getProviderNameForTask(taskType: AITaskType): 'openai' | 'ollama' | 'gemini' {
  switch (taskType) {
    case 'chat':
    case 'note-agent':
    case 'planner':
    case 'secretary':
    case 'completion':
    case 'rewrite':
    case 'summarize':
    case 'embedding':
      return 'openai'

    case 'artifact':
    case 'code':
    case 'html':
    case 'css':
    case 'javascript':
      return 'ollama'

    case 'slides':
    case 'research':
    case 'course':
    case 'deep-research':
      return 'gemini'

    default:
      return 'openai'
  }
}

/**
 * Get the model name for a task type
 */
export function getModelNameForTask(taskType: AITaskType): string {
  switch (taskType) {
    case 'chat':
    case 'note-agent':
    case 'planner':
    case 'secretary':
    case 'completion':
    case 'rewrite':
    case 'summarize':
      return 'gpt-5.2'

    case 'embedding':
      return 'text-embedding-3-large'

    case 'artifact':
    case 'code':
    case 'html':
    case 'css':
    case 'javascript':
      return 'glm-4.6'

    case 'slides':
      return 'gemini-3-pro-preview'

    case 'research':
    case 'deep-research':
      return 'deep-research-pro-preview-12-2025'

    case 'course':
      return 'gemini-2.0-flash-exp'

    default:
      return 'gpt-5.2'
  }
}
