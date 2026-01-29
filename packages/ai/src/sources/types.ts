/**
 * Source Types
 *
 * TypeScript interfaces for the source management system.
 * Sources are external materials (PDFs, links, files, text) that can be
 * processed and made available to the AI agent for context-aware responses.
 */

// ============================================================================
// Source Types
// ============================================================================

export type SourceType = 'pdf' | 'link' | 'file' | 'text' | 'youtube'

export type SourceStatus = 'processing' | 'ready' | 'error'

export interface Source {
  id: string
  noteId: string  // Which note this source belongs to
  userId: string
  type: SourceType

  // Original reference
  originalUrl?: string
  originalFilename?: string

  // Extracted content
  content: string  // Full text content
  chunks: SourceChunk[]  // Chunked for semantic search

  // Metadata
  title: string
  wordCount: number
  pageCount?: number  // For PDFs
  extractedAt: Date

  // Status
  status: SourceStatus
  error?: string

  // Timestamps
  createdAt: Date
  updatedAt: Date
}

export interface SourceChunk {
  id: string
  sourceId: string
  content: string
  embedding?: number[]  // For semantic search
  pageNumber?: number  // For PDFs
  position: number  // Order in document
  metadata?: Record<string, unknown>
}

// ============================================================================
// Processing Types
// ============================================================================

export interface ProcessingOptions {
  chunkSize?: number  // Target chunk size in characters (default: 1000)
  chunkOverlap?: number  // Overlap between chunks (default: 200)
  generateEmbeddings?: boolean  // Whether to generate embeddings
}

export interface ProcessingResult {
  success: boolean
  content?: string
  chunks?: SourceChunk[]
  metadata?: {
    title: string
    wordCount: number
    pageCount?: number
  }
  error?: string
}

export interface PDFProcessingResult extends ProcessingResult {
  pages?: PDFPage[]
}

export interface PDFPage {
  pageNumber: number
  content: string
  wordCount: number
}

export interface LinkProcessingResult extends ProcessingResult {
  url: string
  canonicalUrl?: string
  description?: string
  author?: string
  publishedAt?: Date
}

// ============================================================================
// Search Types
// ============================================================================

export interface SourceSearchOptions {
  noteId?: string  // Filter to specific note
  query: string
  limit?: number  // Max results (default: 10)
  threshold?: number  // Similarity threshold (default: 0.7)
  includeContent?: boolean  // Include full chunk content
}

export interface SourceSearchResult {
  chunk: SourceChunk
  source: Source
  score: number  // Similarity score
  highlights?: string[]  // Matched text snippets
}

// ============================================================================
// API Types
// ============================================================================

export interface AddSourceRequest {
  noteId: string
  type: SourceType
  // For file uploads
  file?: File | Buffer
  filename?: string
  // For links
  url?: string
  // For text
  text?: string
  title?: string
}

export interface AddSourceResponse {
  success: boolean
  source?: Source
  error?: string
}

export interface ListSourcesRequest {
  noteId: string
  status?: SourceStatus
}

export interface ListSourcesResponse {
  success: boolean
  sources: Source[]
  error?: string
}

export interface DeleteSourceRequest {
  sourceId: string
}

export interface DeleteSourceResponse {
  success: boolean
  error?: string
}

export interface GetSourceContentRequest {
  sourceId: string
}

export interface GetSourceContentResponse {
  success: boolean
  content?: string
  chunks?: SourceChunk[]
  error?: string
}

export interface SearchSourcesRequest {
  noteId: string
  query: string
  limit?: number
}

export interface SearchSourcesResponse {
  success: boolean
  results: SourceSearchResult[]
  error?: string
}

// ============================================================================
// Progress Types (for SSE streaming)
// ============================================================================

export interface SourceProcessingProgress {
  sourceId: string
  status: 'uploading' | 'extracting' | 'chunking' | 'embedding' | 'complete' | 'error'
  progress: number  // 0-100
  message: string
  error?: string
}

// ============================================================================
// Storage Types (for database operations)
// ============================================================================

export interface SourceRow {
  id: string
  note_id: string
  user_id: string
  type: SourceType
  original_url?: string
  original_filename?: string
  content: string
  title: string
  word_count: number
  page_count?: number
  status: SourceStatus
  error?: string
  extracted_at: string
  created_at: string
  updated_at: string
}

export interface SourceChunkRow {
  id: string
  source_id: string
  content: string
  embedding?: number[]
  page_number?: number
  position: number
  metadata?: Record<string, unknown>
}

// ============================================================================
// Utility Types
// ============================================================================

export function sourceRowToSource(row: SourceRow, chunks: SourceChunk[] = []): Source {
  return {
    id: row.id,
    noteId: row.note_id,
    userId: row.user_id,
    type: row.type,
    originalUrl: row.original_url,
    originalFilename: row.original_filename,
    content: row.content,
    chunks,
    title: row.title,
    wordCount: row.word_count,
    pageCount: row.page_count,
    status: row.status,
    error: row.error,
    extractedAt: new Date(row.extracted_at),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}

export function chunkRowToChunk(row: SourceChunkRow): SourceChunk {
  return {
    id: row.id,
    sourceId: row.source_id,
    content: row.content,
    embedding: row.embedding,
    pageNumber: row.page_number,
    position: row.position,
    metadata: row.metadata,
  }
}
