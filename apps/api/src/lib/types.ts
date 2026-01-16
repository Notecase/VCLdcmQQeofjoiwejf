/**
 * API-specific type definitions
 */

// =============================================================================
// Request Types
// =============================================================================

/**
 * Chat message in a request
 */
export interface ChatMessageRequest {
  role: 'user' | 'assistant' | 'system'
  content: string
}

/**
 * Chat request body
 */
export interface ChatRequest {
  messages: ChatMessageRequest[]
  sessionId?: string
  noteId?: string
  projectId?: string
  model?: string
  stream?: boolean
}

/**
 * Search request body
 */
export interface SearchRequest {
  query: string
  projectId?: string
  noteIds?: string[]
  limit?: number
  threshold?: number
}

/**
 * Embed request body
 */
export interface EmbedRequest {
  text: string
}

// =============================================================================
// Response Types
// =============================================================================

/**
 * Standard API response wrapper
 */
export interface ApiResponse<T> {
  data?: T
  error?: {
    message: string
    code?: string
    details?: unknown
  }
}

/**
 * Chat response
 */
export interface ChatResponse {
  id: string
  role: 'assistant'
  content: string
  model: string
  usage: {
    inputTokens: number
    outputTokens: number
  }
  sources?: Array<{
    noteId: string
    title: string
    chunk: string
    similarity: number
  }>
}

/**
 * Search result
 */
export interface SearchResult {
  noteId: string
  title: string
  chunkText: string
  similarity: number
}

/**
 * Search response
 */
export interface SearchResponse {
  query: string
  results: SearchResult[]
  metadata: {
    totalResults: number
    searchType: 'semantic' | 'hybrid' | 'text-fallback'
    threshold?: number
  }
}

/**
 * Embed response
 */
export interface EmbedResponse {
  text: string
  embedding: number[] | null
  dimensions: number
  model: string
  tokenCount: number
}

// =============================================================================
// Streaming Types
// =============================================================================

/**
 * SSE event types for streaming responses
 */
export type StreamEventType =
  | 'text-delta'
  | 'tool-call-start'
  | 'tool-call-delta'
  | 'tool-result'
  | 'finish'
  | 'error'

/**
 * Text delta event
 */
export interface TextDeltaEvent {
  type: 'text-delta'
  textDelta: string
}

/**
 * Tool call event
 */
export interface ToolCallEvent {
  type: 'tool-call-start' | 'tool-call-delta'
  toolCallId: string
  toolName: string
  args?: Record<string, unknown>
}

/**
 * Tool result event
 */
export interface ToolResultEvent {
  type: 'tool-result'
  toolCallId: string
  result: unknown
}

/**
 * Finish event
 */
export interface FinishEvent {
  type: 'finish'
  finishReason: 'stop' | 'length' | 'tool-calls' | 'error'
  usage?: {
    inputTokens: number
    outputTokens: number
  }
}

/**
 * Error event
 */
export interface ErrorEvent {
  type: 'error'
  error: {
    message: string
    code?: string
  }
}

/**
 * Union of all stream events
 */
export type StreamEvent =
  | TextDeltaEvent
  | ToolCallEvent
  | ToolResultEvent
  | FinishEvent
  | ErrorEvent

// =============================================================================
// Agent Types
// =============================================================================

/**
 * Available agent types
 */
export type AgentType = 'chat' | 'note' | 'planner' | 'course'

/**
 * Agent state (for LangGraph)
 */
export interface AgentState {
  messages: ChatMessageRequest[]
  context?: {
    noteIds?: string[]
    projectId?: string
    currentNoteId?: string
  }
  tools?: ToolDefinition[]
  output?: string
}

/**
 * Tool definition for agents
 */
export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
}

/**
 * Agent response
 */
export interface AgentResponse {
  agentType: AgentType
  input: string
  output: string
  toolCalls?: Array<{
    name: string
    arguments: Record<string, unknown>
    result: unknown
  }>
  metadata?: Record<string, unknown>
}

// =============================================================================
// Database Types (matching Supabase schema)
// =============================================================================

/**
 * AI usage record
 */
export interface AIUsageRecord {
  id: string
  user_id: string
  provider: string
  model: string
  action_type: string
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
 * Chat session
 */
export interface ChatSession {
  id: string
  user_id: string
  title: string
  context_note_ids: string[]
  context_project_id?: string
  agent_type?: string
  is_archived: boolean
  is_pinned: boolean
  message_count: number
  created_at: string
  updated_at: string
}

/**
 * Chat message
 */
export interface ChatMessage {
  id: string
  session_id: string
  user_id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  model?: string
  provider?: string
  input_tokens?: number
  output_tokens?: number
  retrieved_chunks: Array<{
    note_id: string
    chunk_text: string
    similarity: number
    title: string
  }>
  tool_calls: Array<{
    id: string
    tool_name: string
    arguments: Record<string, unknown>
    result?: unknown
  }>
  tool_call_id?: string
  created_at: string
}

/**
 * Embedding queue item
 */
export interface EmbeddingQueueItem {
  id: string
  user_id: string
  note_id?: string
  attachment_id?: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  priority: number
  attempts: number
  max_attempts: number
  last_error?: string
  created_at: string
  started_at?: string
  completed_at?: string
}
