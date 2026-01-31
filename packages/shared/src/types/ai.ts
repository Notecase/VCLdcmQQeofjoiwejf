/**
 * AI-related type definitions for the Inkdown application
 *
 * These types are shared between frontend and backend.
 */

// =============================================================================
// AI Usage Types
// =============================================================================

/**
 * AI usage record for tracking API calls
 */
export interface AIUsageRecord {
  id: string
  user_id: string
  provider: AIProvider
  model: string
  action_type: AIActionType
  agent_name?: string
  input_tokens: number
  output_tokens: number
  total_tokens: number
  cost_cents: number
  note_id?: string
  project_id?: string
  session_id?: string
  latency_ms?: number
  success: boolean
  error_code?: string
  error_message?: string
  metadata: Record<string, unknown>
  created_at: string
}

/**
 * Supported AI providers
 */
export type AIProvider = 'openai' | 'anthropic' | 'google' | 'ollama'

/**
 * Types of AI actions
 */
export type AIActionType = 'chat' | 'complete' | 'embed' | 'agent'

/**
 * Monthly usage statistics
 */
export interface AIMonthlyUsage {
  total_requests: number
  total_tokens: number
  total_cost_cents: number
  requests_by_provider: Record<
    AIProvider,
    {
      requests: number
      tokens: number
      cost: number
    }
  >
  requests_by_action: Record<
    AIActionType,
    {
      requests: number
      tokens: number
      cost: number
    }
  >
}

// =============================================================================
// Chat Types
// =============================================================================

/**
 * Chat session
 */
export interface ChatSession {
  id: string
  user_id: string
  title: string
  context_note_ids: string[]
  context_project_id?: string
  agent_type?: AgentType
  is_archived: boolean
  is_pinned: boolean
  message_count: number
  created_at: string
  updated_at: string
}

/**
 * Create chat session DTO
 */
export interface CreateChatSessionDTO {
  title?: string
  context_note_ids?: string[]
  context_project_id?: string
  agent_type?: AgentType
}

/**
 * Update chat session DTO
 */
export interface UpdateChatSessionDTO {
  title?: string
  context_note_ids?: string[]
  context_project_id?: string
  is_archived?: boolean
  is_pinned?: boolean
}

/**
 * Chat message
 */
export interface ChatMessage {
  id: string
  session_id: string
  user_id: string
  role: ChatRole
  content: string
  model?: string
  provider?: string
  input_tokens?: number
  output_tokens?: number
  retrieved_chunks: RetrievedChunk[]
  tool_calls: ToolCall[]
  tool_call_id?: string
  created_at: string
}

/**
 * Chat message role
 */
export type ChatRole = 'user' | 'assistant' | 'system' | 'tool'

/**
 * Retrieved chunk from RAG
 */
export interface RetrievedChunk {
  note_id: string
  title: string
  chunk_text: string
  similarity: number
}

/**
 * Tool call made by the AI
 */
export interface ToolCall {
  id: string
  tool_name: string
  arguments: Record<string, unknown>
  result?: unknown
}

/**
 * Create chat message DTO
 */
export interface CreateChatMessageDTO {
  session_id: string
  role: ChatRole
  content: string
  model?: string
  provider?: string
  input_tokens?: number
  output_tokens?: number
  retrieved_chunks?: RetrievedChunk[]
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

// =============================================================================
// Embedding Types
// =============================================================================

/**
 * Embedding queue item
 */
export interface EmbeddingQueueItem {
  id: string
  user_id: string
  note_id?: string
  attachment_id?: string
  status: EmbeddingStatus
  priority: number
  attempts: number
  max_attempts: number
  last_error?: string
  created_at: string
  started_at?: string
  completed_at?: string
}

/**
 * Embedding queue status
 */
export type EmbeddingStatus = 'pending' | 'processing' | 'completed' | 'failed'

/**
 * Embedding queue summary
 */
export interface EmbeddingQueueSummary {
  total: number
  pending: number
  processing: number
  completed: number
  failed: number
}

// =============================================================================
// Agent Types
// =============================================================================

/**
 * Available agent types
 */
export type AgentType = 'chat' | 'note' | 'planner' | 'course'

/**
 * Agent capability
 */
export interface AgentCapability {
  type: AgentType
  name: string
  description: string
  status: 'available' | 'placeholder' | 'disabled'
  capabilities: string[]
}

/**
 * Agent request
 */
export interface AgentRequest {
  input: string
  context?: {
    noteIds?: string[]
    projectId?: string
    currentNoteId?: string
  }
  sessionId?: string
  stream?: boolean
}

/**
 * Agent response
 */
export interface AgentResponse {
  agentType: AgentType
  input: string
  output: string
  toolCalls?: ToolCall[]
  metadata?: Record<string, unknown>
}

// =============================================================================
// Search Types (Extended from document.ts)
// =============================================================================

// Note: Basic SearchResult and HybridSearchResult are defined in document.ts
// These are AI-specific extensions

/**
 * Extended hybrid search result with separate scores
 */
export interface ExtendedHybridSearchResult {
  note_id: string
  title: string
  snippet: string
  keyword_score: number
  semantic_score: number
  combined_score: number
}

/**
 * Search options for AI-powered search
 */
export interface AISearchOptions {
  query: string
  projectId?: string
  noteIds?: string[]
  limit?: number
  threshold?: number
}

// =============================================================================
// Model Configuration
// =============================================================================

/**
 * Chat model configuration
 */
export interface ChatModelConfig {
  provider: AIProvider
  model: string
  displayName: string
  contextWindow: number
  supportsStreaming: boolean
  supportsTools: boolean
  costPer1kInput: number // in cents
  costPer1kOutput: number // in cents
}

/**
 * Embedding model configuration
 */
export interface EmbeddingModelConfig {
  provider: AIProvider
  model: string
  displayName: string
  dimensions: number
  maxInput: number
  costPer1kTokens: number // in cents
}

/**
 * Available chat models
 */
export const CHAT_MODELS: ChatModelConfig[] = [
  {
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    displayName: 'Claude Sonnet 4',
    contextWindow: 200000,
    supportsStreaming: true,
    supportsTools: true,
    costPer1kInput: 0.3,
    costPer1kOutput: 1.5,
  },
  {
    provider: 'openai',
    model: 'gpt-4o',
    displayName: 'GPT-4o',
    contextWindow: 128000,
    supportsStreaming: true,
    supportsTools: true,
    costPer1kInput: 0.5,
    costPer1kOutput: 1.5,
  },
  {
    provider: 'openai',
    model: 'gpt-4o-mini',
    displayName: 'GPT-4o Mini',
    contextWindow: 128000,
    supportsStreaming: true,
    supportsTools: true,
    costPer1kInput: 0.015,
    costPer1kOutput: 0.06,
  },
  {
    provider: 'google',
    model: 'gemini-2.0-flash',
    displayName: 'Gemini 2.0 Flash',
    contextWindow: 1000000,
    supportsStreaming: true,
    supportsTools: true,
    costPer1kInput: 0.01,
    costPer1kOutput: 0.04,
  },
]

/**
 * Available embedding models
 */
export const EMBEDDING_MODELS: EmbeddingModelConfig[] = [
  {
    provider: 'openai',
    model: 'text-embedding-3-large',
    displayName: 'OpenAI Embedding Large',
    dimensions: 3072, // Can be reduced to 1536
    maxInput: 8191,
    costPer1kTokens: 0.013,
  },
  {
    provider: 'openai',
    model: 'text-embedding-3-small',
    displayName: 'OpenAI Embedding Small',
    dimensions: 1536,
    maxInput: 8191,
    costPer1kTokens: 0.002,
  },
]

/**
 * Default models
 */
export const DEFAULT_CHAT_MODEL = 'claude-sonnet-4-20250514'
export const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-large'
export const DEFAULT_EMBEDDING_DIMENSIONS = 1536
