/**
 * @inkdown/ai - AI Provider and Agent Abstraction
 *
 * This package provides:
 * - AI provider abstraction (OpenAI, Anthropic, Gemini)
 * - LangGraph-based agents for various tasks
 * - Services for embedding, RAG, and text processing
 * - Tool definitions for agent actions
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

// =============================================================================
// Agent Types
// =============================================================================

export type {
  BaseAgentState,
  ChatAgentState,
  NoteAgentState,
  PlannerAgentState,
  CourseAgentState,
} from './agents'

// =============================================================================
// Service Types
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

// =============================================================================
// Tool Types
// =============================================================================

export type {
  ToolDefinition,
  ToolContext,
  ToolResult,
  SearchToolInput,
  NoteCreateToolInput,
  NoteUpdateToolInput,
  NoteReadToolInput,
  WebSearchToolInput,
  ToolName,
} from './tools'

export {
  SearchToolSchema,
  NoteCreateToolSchema,
  NoteUpdateToolSchema,
  NoteReadToolSchema,
  WebSearchToolSchema,
  TOOL_NAMES,
  TOOL_METADATA,
} from './tools'

// =============================================================================
// Re-exports for convenience
// =============================================================================

// Providers (to be implemented in Phase 1)
// export { OpenAIProvider } from './providers/openai'
// export { AnthropicProvider } from './providers/anthropic'
// export { GeminiProvider } from './providers/gemini'
// export { createProvider } from './providers/factory'

// Agents (to be implemented in Phase 3)
// export { createChatAgent } from './agents/chat.agent'
// export { createNoteAgent } from './agents/note.agent'
// export { createPlannerAgent } from './agents/planner.agent'
// export { createCourseAgent } from './agents/course.agent'

// Services (to be implemented in Phase 1-2)
// export { EmbeddingService } from './services/embedding'
// export { RAGService } from './services/rag'
// export { ChunkingService } from './services/chunking'
