/**
 * Model Registry
 *
 * Central catalog of every model the system can use.
 * Single source of truth for model names, endpoints, pricing, and capabilities.
 */

export type ModelProvider = 'gemini' | 'ollama-cloud' | 'ollama-local' | 'openai'
export type ModelCapability =
  | 'chat'
  | 'tool-calling'
  | 'vision'
  | 'embedding'
  | 'research'
  | 'image-gen'

export interface ModelEntry {
  id: string
  provider: ModelProvider
  displayName: string
  contextWindow: number
  capabilities: ModelCapability[]
  costPer1kInput: number // USD cents
  costPer1kOutput: number // USD cents
  maxOutputTokens: number
  supportsToolChoice: boolean
}

// ============================================================================
// Model Catalog
// ============================================================================

export const MODEL_REGISTRY: Record<string, ModelEntry> = {
  'gemini-2.5-pro': {
    id: 'gemini-2.5-pro',
    provider: 'gemini',
    displayName: 'Gemini 2.5 Pro',
    contextWindow: 1_048_576,
    capabilities: ['chat', 'tool-calling', 'vision'],
    costPer1kInput: 0.125,
    costPer1kOutput: 1.0,
    maxOutputTokens: 65536,
    supportsToolChoice: true,
  },
  'gemini-3.1-pro-preview': {
    id: 'gemini-3.1-pro-preview',
    provider: 'gemini',
    displayName: 'Gemini 3.1 Pro',
    contextWindow: 2_000_000,
    capabilities: ['chat', 'tool-calling', 'vision'],
    costPer1kInput: 0.125,
    costPer1kOutput: 1.0,
    maxOutputTokens: 65536,
    supportsToolChoice: true,
  },
  'gemini-3-flash-preview': {
    id: 'gemini-3-flash-preview',
    provider: 'gemini',
    displayName: 'Gemini 3 Flash',
    contextWindow: 1_000_000,
    capabilities: ['chat', 'tool-calling', 'vision'],
    costPer1kInput: 0.03,
    costPer1kOutput: 0.25,
    maxOutputTokens: 65536,
    supportsToolChoice: true,
  },
  'deep-research-pro-preview-12-2025': {
    id: 'deep-research-pro-preview-12-2025',
    provider: 'gemini',
    displayName: 'Gemini Deep Research',
    contextWindow: 0, // Not applicable
    capabilities: ['research'],
    costPer1kInput: 0,
    costPer1kOutput: 0,
    maxOutputTokens: 0,
    supportsToolChoice: false,
  },
  'text-embedding-3-large': {
    id: 'text-embedding-3-large',
    provider: 'openai',
    displayName: 'OpenAI Embedding Large',
    contextWindow: 8191,
    capabilities: ['embedding'],
    costPer1kInput: 0.013,
    costPer1kOutput: 0,
    maxOutputTokens: 0,
    supportsToolChoice: false,
  },
  'kimi-k2.5': {
    id: 'kimi-k2.5',
    provider: 'ollama-cloud',
    displayName: 'Kimi K2.5 (Ollama)',
    contextWindow: 131072,
    capabilities: ['chat', 'tool-calling'],
    costPer1kInput: 0,
    costPer1kOutput: 0,
    maxOutputTokens: 32768,
    supportsToolChoice: false,
  },
}

// ============================================================================
// Task Types & Model Selection
// ============================================================================

export type AITaskType =
  | 'chat'
  | 'note-agent'
  | 'planner'
  | 'secretary'
  | 'editor'
  | 'editor-deep'
  | 'completion'
  | 'rewrite'
  | 'summarize'
  | 'explain'
  | 'artifact'
  | 'code'
  | 'slides'
  | 'research'
  | 'deep-research'
  | 'course'
  | 'embedding'
  | 'table'

// Task → model mapping (primary model, with optional fallback)
const TASK_MODEL_MAP: Record<AITaskType, string> = {
  chat: 'gemini-2.5-pro',
  'note-agent': 'gemini-2.5-pro',
  planner: 'gemini-2.5-pro',
  secretary: 'gemini-2.5-pro',
  editor: 'gemini-2.5-pro',
  'editor-deep': 'gemini-2.5-pro',
  completion: 'gemini-2.5-pro',
  rewrite: 'gemini-2.5-pro',
  summarize: 'gemini-2.5-pro',
  explain: 'gemini-2.5-pro',
  table: 'gemini-2.5-pro',
  research: 'gemini-2.5-pro',
  artifact: 'kimi-k2.5',
  code: 'kimi-k2.5',
  slides: 'gemini-3.1-pro-preview',
  course: 'gemini-2.5-pro',
  'deep-research': 'deep-research-pro-preview-12-2025',
  embedding: 'text-embedding-3-large',
}

// Fallback model when primary is unavailable (rate limit, high demand, etc.)
const TASK_FALLBACK_MAP: Partial<Record<AITaskType, string>> = {
  chat: 'gemini-3-flash-preview',
  'note-agent': 'gemini-3-flash-preview',
  planner: 'gemini-3-flash-preview',
  secretary: 'gemini-3-flash-preview',
  editor: 'gemini-3-flash-preview',
  'editor-deep': 'gemini-3-flash-preview',
  completion: 'gemini-3-flash-preview',
  rewrite: 'gemini-3-flash-preview',
  summarize: 'gemini-3-flash-preview',
  explain: 'gemini-3-flash-preview',
  table: 'gemini-3-flash-preview',
  research: 'gemini-3-flash-preview',
  course: 'gemini-3-flash-preview',
  slides: 'gemini-2.5-pro',
}

/**
 * Select the best model for a given task type.
 * Returns a ModelEntry from the registry.
 */
export function selectModel(taskType: AITaskType): ModelEntry {
  const modelId = TASK_MODEL_MAP[taskType]
  const entry = MODEL_REGISTRY[modelId]
  if (!entry) {
    console.warn(
      `[ModelRegistry] Unknown model "${modelId}" for task "${taskType}", falling back to gemini-2.5-pro`
    )
    return MODEL_REGISTRY['gemini-2.5-pro']
  }
  return entry
}

/**
 * Select a fallback model for a task type.
 * Returns undefined if no fallback is configured.
 */
export function selectFallbackModel(taskType: AITaskType): ModelEntry | undefined {
  const modelId = TASK_FALLBACK_MAP[taskType]
  if (!modelId) return undefined
  return MODEL_REGISTRY[modelId]
}

/**
 * Get a model entry by its ID.
 */
export function getModel(modelId: string): ModelEntry | undefined {
  return MODEL_REGISTRY[modelId]
}
