/**
 * @inkdown/ai - AI Provider and Agent Abstraction
 *
 * This package provides:
 * - AI provider abstraction (OpenAI, Ollama Cloud, Gemini)
 * - LangGraph-based agents for various tasks
 * - Tool definitions for agent actions (26 tools)
 */

// =============================================================================
// Provider Types and Interfaces
// =============================================================================

export type {
  AIContext,
  ChatMessage,
  AICompletionOptions,
  AIActionType,
  AIUsage,
  AIProvider,
} from './providers/interface'

// Provider implementations
export {
  OpenAIProvider,
  createOpenAIProvider,
  getDefaultOpenAIProvider,
} from './providers/openai'

export {
  OllamaCloudProvider,
  createOllamaCloudProvider,
} from './providers/ollama'

export {
  GeminiProvider,
  createGeminiProvider,
} from './providers/gemini'

export {
  createProvider,
  getOpenAI,
  getOllamaCloud,
  getGemini,
  getProviderNameForTask,
  getModelNameForTask,
} from './providers/factory'

export type { AITaskType, ProviderFactoryConfig } from './providers/factory'

// =============================================================================
// Tool Types and Exports
// =============================================================================

export type { ToolContext, ToolResult } from './tools/core.tools'

// Tool registry
export {
  allTools,
  toolNames,
  getToolByName,
  getToolsByCategory,
  executeTool,
  TOOL_METADATA,
} from './tools'

// Core tool exports
export {
  coreEditingTools,
  databaseTools,
  artifactTools,
  secretaryTools,
} from './tools'

// =============================================================================
// Agent Types (to be implemented in Phase D)
// =============================================================================

export type {
  BaseAgentState,
  ChatAgentState,
  NoteAgentState,
  PlannerAgentState,
  CourseAgentState,
} from './agents'

// =============================================================================
// Service Types (to be implemented)
// =============================================================================

export type {
  EmbeddingResult,
  TextChunk,
  ChunkingOptions,
  RAGResult,
  RAGOptions,
  EmbeddingModel,
} from './services'

export {
  DEFAULT_CHUNKING_OPTIONS,
  DEFAULT_RAG_OPTIONS,
  EMBEDDING_MODELS,
} from './services'
