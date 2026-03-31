/**
 * Claude Code Integration Types
 *
 * Defines the event protocol between Claude Code process → API → WebSocket → browser.
 * Uses a discriminated union on `type` for type-safe event handling.
 */

// ============================================================================
// Session Events
// ============================================================================

export interface SessionStartedEvent {
  type: 'session.started'
  sessionId: string
  model: string
  tools: string[]
  mcpServers: string[]
}

export interface SessionStateEvent {
  type: 'session.state'
  state: 'starting' | 'running' | 'idle' | 'stopped' | 'error'
}

// ============================================================================
// Content Events
// ============================================================================

export interface ContentDeltaEvent {
  type: 'content.delta'
  text: string
}

export interface ContentDoneEvent {
  type: 'content.done'
  text: string
}

export interface ThinkingDeltaEvent {
  type: 'thinking.delta'
  text: string
}

// ============================================================================
// Tool Events
// ============================================================================

export interface ToolStartedEvent {
  type: 'tool.started'
  toolUseId: string
  name: string
  input: Record<string, unknown>
}

export interface ToolCompletedEvent {
  type: 'tool.completed'
  toolUseId: string
  name: string
  output: string
  isError: boolean
}

// ============================================================================
// Domain Events (derived from tool completions)
// ============================================================================

export interface NoteEditedEvent {
  type: 'note.edited'
  noteId: string
  original: string
  proposed: string
  editId: string
}

export interface NoteCreatedEvent {
  type: 'note.created'
  noteId: string
  title: string
}

export interface ArtifactCreatedEvent {
  type: 'artifact.created'
  artifactId: string
  noteId: string
  title: string
  html: string
  css?: string
  javascript?: string
}

// ============================================================================
// Turn Events
// ============================================================================

export interface TurnCompletedEvent {
  type: 'turn.completed'
  usage: {
    inputTokens: number
    outputTokens: number
    cacheReadTokens: number
    cacheWriteTokens: number
  }
  costUsd: number
  numTurns: number
  durationMs: number
}

// ============================================================================
// Error Events
// ============================================================================

export interface ClaudeCodeErrorEvent {
  type: 'error'
  message: string
  code?: string
}

// ============================================================================
// Discriminated Union
// ============================================================================

export type NoteshellEvent =
  | SessionStartedEvent
  | SessionStateEvent
  | ContentDeltaEvent
  | ContentDoneEvent
  | ThinkingDeltaEvent
  | ToolStartedEvent
  | ToolCompletedEvent
  | NoteEditedEvent
  | NoteCreatedEvent
  | ArtifactCreatedEvent
  | TurnCompletedEvent
  | ClaudeCodeErrorEvent

// ============================================================================
// WebSocket Message Types (client → server)
// ============================================================================

export interface WsMessagePayload {
  type: 'message'
  content: string
  context?: {
    noteId?: string
    selectedText?: string
    noteTitle?: string
  }
}

export interface WsInterruptPayload {
  type: 'interrupt'
}

export type WsClientPayload = WsMessagePayload | WsInterruptPayload
