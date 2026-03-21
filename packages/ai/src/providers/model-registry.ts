/**
 * Model Registry
 *
 * Central catalog of every model the system can use.
 * Single source of truth for model names, endpoints, pricing, and capabilities.
 */

export type ModelProvider = 'gemini' | 'ollama-cloud' | 'ollama-local' | 'openai'
export type ModelCapability = 'chat' | 'tool-calling' | 'vision' | 'embedding' | 'research' | 'image-gen'

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
  'text-embedding-004': {
    id: 'text-embedding-004',
    provider: 'gemini',
    displayName: 'Gemini Embedding',
    contextWindow: 2048,
    capabilities: ['embedding'],
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
  'qwen3.5': {
    id: 'qwen3.5',
    provider: 'ollama-cloud',
    displayName: 'Qwen 3.5 (Ollama)',
    contextWindow: 131072,
    capabilities: ['chat', 'tool-calling', 'vision'],
    costPer1kInput: 0,
    costPer1kOutput: 0,
    maxOutputTokens: 32768,
    supportsToolChoice: false,
  },
  'deepseek-r1': {
    id: 'deepseek-r1',
    provider: 'ollama-cloud',
    displayName: 'DeepSeek R1 (Ollama)',
    contextWindow: 131072,
    capabilities: ['chat'],
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

// Task → model mapping
const TASK_MODEL_MAP: Record<AITaskType, string> = {
  'chat': 'gemini-3.1-pro-preview',
  'note-agent': 'gemini-3.1-pro-preview',
  'planner': 'gemini-3.1-pro-preview',
  'secretary': 'gemini-3.1-pro-preview',
  'editor': 'gemini-3.1-pro-preview',
  'editor-deep': 'gemini-3.1-pro-preview',
  'completion': 'gemini-3.1-pro-preview',
  'rewrite': 'gemini-3.1-pro-preview',
  'summarize': 'gemini-3.1-pro-preview',
  'explain': 'gemini-3.1-pro-preview',
  'table': 'gemini-3.1-pro-preview',
  'research': 'gemini-3.1-pro-preview',
  'artifact': 'kimi-k2.5',
  'code': 'kimi-k2.5',
  'slides': 'gemini-3.1-pro-preview',
  'course': 'gemini-3-flash-preview',
  'deep-research': 'deep-research-pro-preview-12-2025',
  'embedding': 'text-embedding-3-large',
}

/**
 * Select the best model for a given task type.
 * Returns a ModelEntry from the registry.
 */
export function selectModel(taskType: AITaskType): ModelEntry {
  const modelId = TASK_MODEL_MAP[taskType]
  const entry = MODEL_REGISTRY[modelId]
  if (!entry) {
    console.warn(`[ModelRegistry] Unknown model "${modelId}" for task "${taskType}", falling back to gemini-3.1-pro`)
    return MODEL_REGISTRY['gemini-3.1-pro-preview']
  }
  return entry
}

/**
 * Get a model entry by its ID.
 */
export function getModel(modelId: string): ModelEntry | undefined {
  return MODEL_REGISTRY[modelId]
}
