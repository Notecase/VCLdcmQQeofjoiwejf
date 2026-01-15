// Core document types with UUID v7 support

export interface Document {
  id: string                    // UUID v7 (time-ordered)
  user_id: string
  folder_id?: string | null

  // Content
  title: string
  content: string
  content_hash?: string         // For change detection

  // Metadata
  word_count: number
  character_count?: number

  // Editor state (cursor, scroll position)
  editor_state?: EditorState

  // Flags
  is_pinned: boolean
  is_archived?: boolean
  is_deleted?: boolean          // Soft delete

  // Timestamps
  created_at: string
  updated_at: string
  deleted_at?: string | null

  // Optimistic locking
  version?: number
}

export interface EditorState {
  cursor?: CursorPosition
  scroll?: { top: number; left: number }
  selection?: { start: number; end: number }
}

export interface CursorPosition {
  anchor: { line: number; ch: number }
  focus: { line: number; ch: number }
}

export interface Folder {
  id: string
  user_id: string
  parent_id?: string | null

  name: string
  color?: string
  icon?: string
  sort_order?: number

  is_deleted?: boolean
  created_at: string
  updated_at: string
}

export interface WordCount {
  words: number
  characters: number
  paragraphs: number
}

// Tab representation for the editor
export interface Tab {
  id: string
  document: Document
  isSaved: boolean
  isActive: boolean
}

// API payloads
export interface CreateDocumentDTO {
  title?: string
  content?: string
  folder_id?: string
}

export interface UpdateDocumentDTO {
  title?: string
  content?: string
  folder_id?: string | null
  word_count?: number
  character_count?: number
  editor_state?: EditorState
  is_pinned?: boolean
  is_archived?: boolean
}

export interface CreateFolderDTO {
  name: string
  parent_id?: string
  color?: string
  icon?: string
}

export interface UpdateFolderDTO {
  name?: string
  parent_id?: string | null
  color?: string
  icon?: string
  sort_order?: number
}

// Real-time change events
export type DocumentChangeType = 'INSERT' | 'UPDATE' | 'DELETE'

export interface DocumentChange {
  type: DocumentChangeType
  document: Document
  old?: Document
}
