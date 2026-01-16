/**
 * Core Types for Inkdown
 * Updated for flexible note hierarchy and file attachments
 */

// =============================================
// Projects
// =============================================

export interface Project {
  id: string
  user_id: string
  parent_id: string | null
  path: string
  depth: number
  name: string
  description: string | null
  icon: string
  color: string
  note_count: number
  subproject_count: number
  sort_order: number
  is_favorite: boolean
  is_archived: boolean
  is_deleted: boolean
  created_at: string
  updated_at: string
}

export interface CreateProjectDTO {
  name: string
  parent_id?: string
  description?: string
  icon?: string
  color?: string
}

export interface UpdateProjectDTO {
  name?: string
  parent_id?: string | null
  description?: string | null
  icon?: string
  color?: string
  sort_order?: number
  is_archived?: boolean
}

// =============================================
// Notes
// =============================================

export interface Note {
  id: string
  user_id: string
  project_id: string | null
  parent_note_id: string | null
  path: string
  depth: number
  title: string
  content: string
  content_hash: string | null
  word_count: number
  character_count: number
  reading_time_minutes: number
  link_count: number
  attachment_count: number
  editor_state: EditorState
  sort_order: number
  tags: string[]
  last_viewed_at: string | null
  is_pinned: boolean
  is_favorite: boolean
  is_archived: boolean
  is_deleted: boolean
  created_at: string
  updated_at: string
  deleted_at: string | null
  version: number
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

export interface CreateNoteDTO {
  title?: string
  content?: string
  project_id?: string
  parent_note_id?: string
}

export interface UpdateNoteDTO {
  title?: string
  content?: string
  project_id?: string | null
  parent_note_id?: string | null
  word_count?: number
  character_count?: number
  editor_state?: EditorState
  sort_order?: number
  is_pinned?: boolean
  is_archived?: boolean
}

export interface MoveNoteDTO {
  project_id?: string | null
  parent_note_id?: string | null
}

export interface MoveNoteResult {
  success: boolean
  note?: Note
  error?: string
}

export interface MoveProjectResult {
  success: boolean
  project?: Project
  error?: string
}

// =============================================
// Attachments
// =============================================

export type ProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed'

export interface Attachment {
  id: string
  user_id: string
  note_id: string | null
  bucket: string
  storage_path: string
  filename: string
  original_filename: string
  content_type: string
  size_bytes: number
  width: number | null
  height: number | null
  page_count: number | null
  duration_seconds: number | null
  processing_status: ProcessingStatus
  extracted_text: string | null
  extracted_metadata: Record<string, unknown> | null
  processing_error: string | null
  file_hash: string | null
  is_deleted: boolean
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface CreateAttachmentDTO {
  note_id?: string
  filename: string
  content_type: string
  size_bytes: number
  storage_path: string
}

// =============================================
// Embeddings
// =============================================

export interface NoteEmbedding {
  id: string
  note_id: string | null
  attachment_id: string | null
  user_id: string
  chunk_index: number
  chunk_text: string
  chunk_start: number
  chunk_end: number
  embedding: number[]
  model: string
  token_count: number | null
  content_hash: string
  created_at: string
}

// =============================================
// Search
// =============================================

export interface SearchResult {
  note_id: string | null
  attachment_id: string | null
  title: string
  chunk_text: string
  similarity: number
}

export interface HybridSearchResult {
  note_id: string
  title: string
  snippet: string
  score: number
}

// =============================================
// Real-time Events
// =============================================

export type ChangeEventType = 'INSERT' | 'UPDATE' | 'DELETE'

export interface NoteChangeEvent {
  type: ChangeEventType
  new: Note | null
  old: Note | null
}

export interface ProjectChangeEvent {
  type: ChangeEventType
  new: Project | null
  old: Project | null
}

// =============================================
// Tree View Helpers
// =============================================

export interface ProjectTreeNode extends Project {
  children: ProjectTreeNode[]
  notes: NoteTreeNode[]
}

export interface NoteTreeNode extends Note {
  children: NoteTreeNode[]
  attachments: Attachment[]
}
