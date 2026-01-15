export * from './document'
export * from './preferences'

// Auth types
export interface User {
  id: string
  email: string
  name?: string
  avatar_url?: string
  created_at: string
}

// Editor event types
export interface EditorChange {
  markdown: string
  wordCount: {
    words: number
    characters: number
    paragraphs: number
  }
  cursor?: import('./document').CursorPosition
}

export interface SelectionChange {
  start: { line: number; ch: number }
  end: { line: number; ch: number }
  selectedText: string
}

// Image types
export interface ImageInfo {
  src: string
  alt?: string
  title?: string
  isLocal?: boolean
}

// Search types
export interface SearchResult {
  index: number
  total: number
  matches: SearchMatch[]
}

export interface SearchMatch {
  line: number
  start: number
  end: number
  text: string
}

// TOC types
export interface TocItem {
  content: string
  slug: string
  level: number
  children?: TocItem[]
}
