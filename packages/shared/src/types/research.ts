/**
 * Research Agent Types — Deep agent system for research workflows.
 *
 * Shared between frontend and backend.
 */

// =============================================================================
// Thread Types
// =============================================================================

export type ResearchThreadStatus = 'idle' | 'busy' | 'interrupted' | 'error' | 'completed'

export interface ResearchThread {
  id: string
  userId: string
  title: string
  status: ResearchThreadStatus
  createdAt: string
  updatedAt: string
}

// =============================================================================
// Virtual File Types
// =============================================================================

export interface VirtualFile {
  name: string
  content: string
  createdAt: string
  updatedAt: string
}

export interface ResearchNoteDraft {
  draftId: string
  title: string
  originalContent: string
  proposedContent: string
  currentContent: string
  noteId?: string
  savedAt?: string
  updatedAt: string
}

// =============================================================================
// Todo Types
// =============================================================================

export type TodoStatus = 'pending' | 'in_progress' | 'completed'

export interface TodoItem {
  id: string
  content: string
  status: TodoStatus
}

// =============================================================================
// Interrupt Types
// =============================================================================

export type InterruptDecision = 'approve' | 'reject' | 'edit'

export interface InterruptOption {
  label: string
  value: string
  description?: string
}

export interface InterruptData {
  id: string
  toolName: string
  toolArgs: Record<string, unknown>
  description: string
  options: InterruptOption[]
  allowedDecisions: InterruptDecision[]
}

export interface InterruptResponse {
  decision: InterruptDecision
  message?: string
  editedArgs?: Record<string, unknown>
}

// =============================================================================
// Sub-agent Types
// =============================================================================

export interface SubagentInfo {
  id: string
  name: string
  description: string
  status: 'running' | 'completed' | 'error'
  input?: string
  output?: string
  startedAt: string
  completedAt?: string
}

// =============================================================================
// Chat Message Types
// =============================================================================

export interface ResearchChatMessage {
  id: string
  threadId: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  toolCalls?: ResearchToolCall[]
  subagents?: SubagentInfo[]
}

export interface ResearchToolCall {
  id: string
  toolName: string
  arguments: Record<string, unknown>
  result?: string
  status: 'pending' | 'running' | 'complete' | 'error'
}

// =============================================================================
// SSE Stream Events
// =============================================================================

export type ResearchStreamEventType =
  | 'text'
  | 'thinking'
  | 'tool_call'
  | 'tool_result'
  | 'note-draft-delta'
  | 'note-draft'
  | 'todo-update'
  | 'file-write'
  | 'file-delete'
  | 'interrupt'
  | 'subagent-start'
  | 'subagent-result'
  | 'note-navigate'
  | 'thread-status'
  | 'thread-id'
  | 'done'
  | 'error'

export interface ResearchStreamEvent {
  event: ResearchStreamEventType
  data: string | Record<string, unknown>
  seq?: number
  messageId?: string
  sourceNode?: string
  isDelta?: boolean
  metadata?: Record<string, unknown>
}
