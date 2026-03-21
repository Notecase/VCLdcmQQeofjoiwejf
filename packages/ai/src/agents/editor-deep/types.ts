import type { SupabaseClient } from '@supabase/supabase-js'

export interface EditorContextSnapshot {
  workspaceId?: string
  currentNoteId?: string
  currentBlockId?: string
  selectedBlockIds?: string[]
  selectedText?: string
  projectId?: string
  noteIds?: string[]
  selectedLineNumbers?: number[]
}

export interface EditorDeepAgentRequest {
  message: string
  threadId?: string
  context?: EditorContextSnapshot
  historyWindowTurns?: number
}

export type EditorDeepAgentEventType =
  | 'assistant-start'
  | 'assistant-delta'
  | 'assistant-final'
  | 'tool-call'
  | 'tool-result'
  | 'thinking'
  | 'clarification-requested'
  | 'pre-action-question'
  | 'edit-proposal'
  | 'note-navigate'
  | 'artifact'
  | 'error'
  | 'done'
  | 'subagent-start'
  | 'subagent-delta'
  | 'subagent-complete'
  | 'custom-progress'
  | 'synthesis-start'

export interface SubagentEventData {
  id: string
  name: string
  description: string
  status: 'pending' | 'running' | 'complete' | 'error'
  startedAt?: number
  completedAt?: number
  elapsedMs?: number
  lastMessage?: string
  result?: string
}

export interface EditorDeepAgentEvent {
  type: EditorDeepAgentEventType
  data: unknown
  seq?: number
  messageId?: string
  sourceNode?: string
  isDelta?: boolean
  metadata?: Record<string, unknown>
}

export interface EditorToolContext {
  userId: string
  supabase: SupabaseClient
  editorContext: EditorContextSnapshot
  emitEvent: (event: EditorDeepAgentEvent) => void
}

export interface EditorRunState {
  threadId: string
  assistantText: string
  toolCalls: Array<{
    id: string
    toolName: string
    arguments: Record<string, unknown>
  }>
  toolResults: Array<{
    id: string
    toolName: string
    result: unknown
  }>
  updatedAt: string
  historyTurnsLoaded?: number
  longTermMemoriesLoaded?: number
}
