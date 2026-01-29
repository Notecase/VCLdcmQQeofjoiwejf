/**
 * Sources Module
 *
 * External source management for the knowledge base system.
 * Supports PDFs, links, files, and pasted text.
 */

// Types
export type {
  Source,
  SourceType,
  SourceStatus,
  SourceChunk,
  ProcessingOptions,
  ProcessingResult,
  PDFProcessingResult,
  PDFPage,
  LinkProcessingResult,
  SourceSearchOptions,
  SourceSearchResult,
  AddSourceRequest,
  AddSourceResponse,
  ListSourcesRequest,
  ListSourcesResponse,
  DeleteSourceRequest,
  DeleteSourceResponse,
  GetSourceContentRequest,
  GetSourceContentResponse,
  SearchSourcesRequest,
  SearchSourcesResponse,
  SourceProcessingProgress,
  SourceRow,
  SourceChunkRow,
} from './types'

export { sourceRowToSource, chunkRowToChunk } from './types'

// PDF Processing
export { extractPDFContent, isPDFBuffer, getPDFInfo } from './pdf'

// Link Processing
export { fetchLinkContent, isValidURL, isYouTubeURL, extractYouTubeVideoId } from './link'

// Storage
export { SourceStorage, createSourceStorage } from './storage'

// Processor
export { SourceProcessor, createSourceProcessor } from './processor'
