// Core document types
export interface Document {
  id: string
  user_id: string
  title: string
  content: string
  cursor?: CursorPosition
  word_count: number
  is_pinned: boolean
  folder_id?: string
  created_at: string
  updated_at: string
}

export interface CursorPosition {
  anchor: { line: number; ch: number }
  focus: { line: number; ch: number }
}

export interface Folder {
  id: string
  user_id: string
  name: string
  parent_id?: string
  created_at: string
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

// Create/Update payloads
export type CreateDocument = Omit<Document, 'id' | 'created_at' | 'updated_at'>
export type UpdateDocument = Partial<Omit<Document, 'id' | 'user_id' | 'created_at'>>
