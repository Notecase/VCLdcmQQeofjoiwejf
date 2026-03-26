/**
 * AI SDK v6 Provider Factory
 *
 * Creates AI SDK LanguageModel instances from the model registry.
 * Coexists with client-factory.ts (OpenAI SDK / LangChain) until Phase 7 migration.
 *
 * Usage:
 *   import { createAIModel, getModelForTask } from '../providers/ai-sdk-factory'
 *   const model = getModelForTask('chat')
 *   const result = streamText({ model, messages: [...] })
 */

import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import type { LanguageModel, EmbeddingModel } from 'ai'
import type { ModelEntry, AITaskType } from './model-registry'
import { selectModel, selectFallbackModel, getModel } from './model-registry'

// ============================================================================
// Provider Singletons (lazy-initialized)
// ============================================================================

let _openai: ReturnType<typeof createOpenAI> | null = null
let _google: ReturnType<typeof createGoogleGenerativeAI> | null = null
let _ollamaCloud: ReturnType<typeof createOpenAI> | null = null
let _ollamaLocal: ReturnType<typeof createOpenAI> | null = null

function getOpenAIProvider(): ReturnType<typeof createOpenAI> {
  if (!_openai) {
    _openai = createOpenAI({
      apiKey: process.env.OPENAI_API_KEY || '',
    })
  }
  return _openai
}

function getGoogleProvider(): ReturnType<typeof createGoogleGenerativeAI> {
  if (!_google) {
    _google = createGoogleGenerativeAI({
      apiKey: process.env.GOOGLE_AI_API_KEY || '',
    })
  }
  return _google
}

function getOllamaCloudProvider(): ReturnType<typeof createOpenAI> {
  if (!_ollamaCloud) {
    const baseURL = process.env.OLLAMA_CLOUD_URL
      ? `${process.env.OLLAMA_CLOUD_URL}/v1/`
      : 'https://ollama.com/v1/'
    _ollamaCloud = createOpenAI({
      apiKey: process.env.OLLAMA_API_KEY || 'ollama',
      baseURL,
    })
  }
  return _ollamaCloud
}

function getOllamaLocalProvider(): ReturnType<typeof createOpenAI> {
  if (!_ollamaLocal) {
    const baseURL = process.env.OLLAMA_LOCAL_URL
      ? `${process.env.OLLAMA_LOCAL_URL}/v1/`
      : 'http://localhost:11434/v1/'
    _ollamaLocal = createOpenAI({
      apiKey: 'ollama',
      baseURL,
    })
  }
  return _ollamaLocal
}

// ============================================================================
// Model Creation
// ============================================================================

/**
 * Create an AI SDK LanguageModel from a ModelEntry.
 *
 * Maps the model registry's provider field to the correct AI SDK provider.
 * Uses the same env vars as client-factory.ts:
 *   OPENAI_API_KEY, GOOGLE_AI_API_KEY, OLLAMA_API_KEY,
 *   OLLAMA_CLOUD_URL, OLLAMA_LOCAL_URL
 */
export function createAIModel(model: ModelEntry): LanguageModel {
  switch (model.provider) {
    case 'openai':
      return getOpenAIProvider()(model.id)

    case 'gemini':
      return getGoogleProvider()(model.id)

    case 'ollama-cloud':
      return getOllamaCloudProvider()(model.id)

    case 'ollama-local':
      return getOllamaLocalProvider()(model.id)

    case 'external':
      throw new Error(`Provider "external" does not support AI SDK language models`)

    default: {
      const _exhaustive: never = model.provider
      throw new Error(`Unknown provider: ${_exhaustive}`)
    }
  }
}

/**
 * Create an AI SDK EmbeddingModel for a model entry with 'embedding' capability.
 */
export function createAIEmbeddingModel(model: ModelEntry): EmbeddingModel {
  switch (model.provider) {
    case 'openai':
      return getOpenAIProvider().embedding(model.id)

    case 'gemini':
      return getGoogleProvider().textEmbeddingModel(model.id)

    default:
      throw new Error(
        `Embedding not supported for provider "${model.provider}" (model: ${model.id})`
      )
  }
}

/**
 * Convenience: get an AI SDK model for a task type.
 * Combines selectModel() + createAIModel() in one call.
 *
 * @example
 *   const model = getModelForTask('chat')
 *   const result = streamText({ model, messages })
 */
export function getModelForTask(taskType: AITaskType): LanguageModel {
  return createAIModel(selectModel(taskType))
}

/**
 * Get an AI SDK model, respecting an optional model ID override.
 * Used by agents that accept config.model for BYOK or per-user model selection.
 *
 * If overrideModelId is provided and exists in MODEL_REGISTRY, uses that model.
 * Otherwise falls back to the default model for the task type.
 *
 * Also returns the resolved ModelEntry for usage tracking.
 *
 * @example
 *   const { model, entry } = resolveModel('chat', this.model)
 *   const result = streamText({ model, onFinish: trackAISDKUsage({ model: entry.id, taskType }) })
 */
export function resolveModel(
  taskType: AITaskType,
  overrideModelId?: string
): { model: LanguageModel; entry: ModelEntry } {
  const entry = overrideModelId
    ? (getModel(overrideModelId) ?? selectModel(taskType))
    : selectModel(taskType)
  return { model: createAIModel(entry), entry }
}

/**
 * Get primary + fallback models for a task type.
 * Used by agents that want to retry with a different model on failure.
 *
 * @example
 *   const { primary, fallback } = getModelsForTask('secretary')
 *   try { await streamWith(primary) }
 *   catch { if (fallback) await streamWith(fallback) }
 */
export function getModelsForTask(taskType: AITaskType): {
  primary: { model: LanguageModel; entry: ModelEntry }
  fallback: { model: LanguageModel; entry: ModelEntry } | null
} {
  const primaryEntry = selectModel(taskType)
  const fallbackEntry = selectFallbackModel(taskType)
  return {
    primary: { model: createAIModel(primaryEntry), entry: primaryEntry },
    fallback: fallbackEntry ? { model: createAIModel(fallbackEntry), entry: fallbackEntry } : null,
  }
}

/**
 * Convenience: get an AI SDK embedding model for the 'embedding' task.
 */
export function getEmbeddingModel(): EmbeddingModel {
  return createAIEmbeddingModel(selectModel('embedding'))
}

// ============================================================================
// Fallback Utilities
// ============================================================================

/** Check if an error is transient (rate limit, capacity, etc.) */
export function isTransientError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error)
  return /high demand|rate limit|overloaded|Resource exhausted|\b503\b|\b429\b/i.test(msg)
}

/**
 * Get primary + fallback models, respecting an optional user model override.
 * Combines resolveModel() semantics with getModelsForTask() fallback support.
 */
export function resolveModelsForTask(
  taskType: AITaskType,
  overrideModelId?: string
): {
  primary: { model: LanguageModel; entry: ModelEntry }
  fallback: { model: LanguageModel; entry: ModelEntry } | null
} {
  if (overrideModelId) {
    const overrideEntry = getModel(overrideModelId)
    if (overrideEntry) {
      const fallbackEntry = selectFallbackModel(taskType)
      return {
        primary: { model: createAIModel(overrideEntry), entry: overrideEntry },
        fallback: fallbackEntry
          ? { model: createAIModel(fallbackEntry), entry: fallbackEntry }
          : null,
      }
    }
  }
  return getModelsForTask(taskType)
}

// ============================================================================
// Testing / Reset
// ============================================================================

/**
 * Reset all cached provider instances.
 * For tests or when env vars change at runtime.
 */
export function resetAIProviders(): void {
  _openai = null
  _google = null
  _ollamaCloud = null
  _ollamaLocal = null
}
