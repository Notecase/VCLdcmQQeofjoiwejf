/**
 * Source Processor
 *
 * Orchestrates the processing of different source types.
 * Handles file uploads, link fetching, and text processing.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Source,
  SourceType,
  SourceChunk,
  ProcessingOptions,
  SourceProcessingProgress,
} from './types'
import { extractPDFContent, isPDFBuffer } from './pdf'
import { fetchLinkContent, isValidURL, isYouTubeURL } from './link'
import { SourceStorage, createSourceStorage } from './storage'

// Default processing options
const DEFAULT_OPTIONS: ProcessingOptions = {
  chunkSize: 1000,
  chunkOverlap: 200,
  generateEmbeddings: true,
}

/**
 * Source Processor Service
 */
export class SourceProcessor {
  private storage: SourceStorage
  private embedFn?: (text: string) => Promise<number[]>

  constructor(
    private supabase: SupabaseClient,
    private userId: string,
    embedFunction?: (text: string) => Promise<number[]>
  ) {
    this.storage = createSourceStorage(supabase, userId)
    this.embedFn = embedFunction
  }

  // ============================================================================
  // Main Processing Methods
  // ============================================================================

  /**
   * Process a PDF file
   */
  async processPDF(
    noteId: string,
    buffer: Buffer,
    filename: string,
    options: ProcessingOptions = {},
    onProgress?: (progress: SourceProcessingProgress) => void
  ): Promise<Source | null> {
    const opts = { ...DEFAULT_OPTIONS, ...options }

    // Validate PDF
    if (!isPDFBuffer(buffer)) {
      onProgress?.({
        sourceId: '',
        status: 'error',
        progress: 0,
        message: 'Invalid PDF file',
        error: 'Invalid PDF file format',
      })
      return null
    }

    try {
      // Create initial source record
      onProgress?.({
        sourceId: '',
        status: 'uploading',
        progress: 10,
        message: 'Creating source record...',
      })

      const source = await this.storage.createSource({
        noteId,
        type: 'pdf',
        title: filename.replace(/\.pdf$/i, ''),
        content: '',
        originalFilename: filename,
        wordCount: 0,
        status: 'processing',
      })

      if (!source) {
        throw new Error('Failed to create source record')
      }

      // Extract content
      onProgress?.({
        sourceId: source.id,
        status: 'extracting',
        progress: 30,
        message: 'Extracting text from PDF...',
      })

      const result = await extractPDFContent(buffer, opts)

      if (!result.success || !result.content) {
        await this.storage.updateSourceStatus(source.id, 'error', result.error)
        onProgress?.({
          sourceId: source.id,
          status: 'error',
          progress: 0,
          message: result.error || 'Failed to extract PDF content',
          error: result.error,
        })
        return null
      }

      // Update source with content
      await this.supabase
        .from('sources')
        .update({
          content: result.content,
          title: result.metadata?.title || filename.replace(/\.pdf$/i, ''),
          word_count: result.metadata?.wordCount || 0,
          page_count: result.metadata?.pageCount,
          updated_at: new Date().toISOString(),
        })
        .eq('id', source.id)

      // Save chunks
      onProgress?.({
        sourceId: source.id,
        status: 'chunking',
        progress: 60,
        message: 'Processing content chunks...',
      })

      if (result.chunks && result.chunks.length > 0) {
        // Set source ID on chunks
        const chunks = result.chunks.map((c) => ({ ...c, sourceId: source.id }))

        // Generate embeddings if enabled
        if (opts.generateEmbeddings && this.embedFn) {
          onProgress?.({
            sourceId: source.id,
            status: 'embedding',
            progress: 80,
            message: 'Generating embeddings...',
          })

          await this.generateEmbeddings(chunks)
        }

        await this.storage.saveChunks(source.id, chunks)
      }

      // Mark as ready
      await this.storage.updateSourceStatus(source.id, 'ready')

      onProgress?.({
        sourceId: source.id,
        status: 'complete',
        progress: 100,
        message: 'PDF processed successfully',
      })

      return this.storage.getSource(source.id)
    } catch (error) {
      onProgress?.({
        sourceId: '',
        status: 'error',
        progress: 0,
        message: error instanceof Error ? error.message : 'Processing failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      return null
    }
  }

  /**
   * Process a URL link
   */
  async processLink(
    noteId: string,
    url: string,
    options: ProcessingOptions = {},
    onProgress?: (progress: SourceProcessingProgress) => void
  ): Promise<Source | null> {
    const opts = { ...DEFAULT_OPTIONS, ...options }

    // Validate URL
    if (!isValidURL(url)) {
      onProgress?.({
        sourceId: '',
        status: 'error',
        progress: 0,
        message: 'Invalid URL',
        error: 'Invalid URL format',
      })
      return null
    }

    // Check if already added
    const exists = await this.storage.sourceExistsForUrl(noteId, url)
    if (exists) {
      onProgress?.({
        sourceId: '',
        status: 'error',
        progress: 0,
        message: 'This URL has already been added',
        error: 'Duplicate URL',
      })
      return null
    }

    try {
      // Create initial source record
      onProgress?.({
        sourceId: '',
        status: 'uploading',
        progress: 10,
        message: 'Creating source record...',
      })

      const type: SourceType = isYouTubeURL(url) ? 'youtube' : 'link'

      const source = await this.storage.createSource({
        noteId,
        type,
        title: new URL(url).hostname,
        content: '',
        originalUrl: url,
        wordCount: 0,
        status: 'processing',
      })

      if (!source) {
        throw new Error('Failed to create source record')
      }

      // Fetch content
      onProgress?.({
        sourceId: source.id,
        status: 'extracting',
        progress: 30,
        message: 'Fetching content from URL...',
      })

      const result = await fetchLinkContent(url, opts)

      if (!result.success || !result.content) {
        await this.storage.updateSourceStatus(source.id, 'error', result.error)
        onProgress?.({
          sourceId: source.id,
          status: 'error',
          progress: 0,
          message: result.error || 'Failed to fetch content',
          error: result.error,
        })
        return null
      }

      // Update source with content
      await this.supabase
        .from('sources')
        .update({
          content: result.content,
          title: result.metadata?.title || new URL(url).hostname,
          word_count: result.metadata?.wordCount || 0,
          original_url: result.canonicalUrl || url,
          updated_at: new Date().toISOString(),
        })
        .eq('id', source.id)

      // Save chunks
      onProgress?.({
        sourceId: source.id,
        status: 'chunking',
        progress: 60,
        message: 'Processing content chunks...',
      })

      if (result.chunks && result.chunks.length > 0) {
        const chunks = result.chunks.map((c) => ({ ...c, sourceId: source.id }))

        if (opts.generateEmbeddings && this.embedFn) {
          onProgress?.({
            sourceId: source.id,
            status: 'embedding',
            progress: 80,
            message: 'Generating embeddings...',
          })

          await this.generateEmbeddings(chunks)
        }

        await this.storage.saveChunks(source.id, chunks)
      }

      // Mark as ready
      await this.storage.updateSourceStatus(source.id, 'ready')

      onProgress?.({
        sourceId: source.id,
        status: 'complete',
        progress: 100,
        message: 'Link processed successfully',
      })

      return this.storage.getSource(source.id)
    } catch (error) {
      onProgress?.({
        sourceId: '',
        status: 'error',
        progress: 0,
        message: error instanceof Error ? error.message : 'Processing failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      return null
    }
  }

  /**
   * Process pasted text
   */
  async processText(
    noteId: string,
    text: string,
    title: string = 'Pasted Text',
    options: ProcessingOptions = {},
    onProgress?: (progress: SourceProcessingProgress) => void
  ): Promise<Source | null> {
    const opts = { ...DEFAULT_OPTIONS, ...options }

    if (!text || text.trim().length === 0) {
      onProgress?.({
        sourceId: '',
        status: 'error',
        progress: 0,
        message: 'No text provided',
        error: 'Empty text',
      })
      return null
    }

    try {
      onProgress?.({
        sourceId: '',
        status: 'uploading',
        progress: 20,
        message: 'Creating source record...',
      })

      const content = text.trim()
      const wordCount = content.split(/\s+/).filter((w) => w.length > 0).length

      const source = await this.storage.createSource({
        noteId,
        type: 'text',
        title,
        content,
        wordCount,
        status: 'processing',
      })

      if (!source) {
        throw new Error('Failed to create source record')
      }

      // Generate chunks
      onProgress?.({
        sourceId: source.id,
        status: 'chunking',
        progress: 50,
        message: 'Processing content chunks...',
      })

      const chunks = this.chunkText(content, source.id, opts.chunkSize!, opts.chunkOverlap!)

      if (chunks.length > 0) {
        if (opts.generateEmbeddings && this.embedFn) {
          onProgress?.({
            sourceId: source.id,
            status: 'embedding',
            progress: 80,
            message: 'Generating embeddings...',
          })

          await this.generateEmbeddings(chunks)
        }

        await this.storage.saveChunks(source.id, chunks)
      }

      // Mark as ready
      await this.storage.updateSourceStatus(source.id, 'ready')

      onProgress?.({
        sourceId: source.id,
        status: 'complete',
        progress: 100,
        message: 'Text processed successfully',
      })

      return this.storage.getSource(source.id)
    } catch (error) {
      onProgress?.({
        sourceId: '',
        status: 'error',
        progress: 0,
        message: error instanceof Error ? error.message : 'Processing failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      return null
    }
  }

  /**
   * Process a generic file (docx, txt, md, csv)
   */
  async processFile(
    noteId: string,
    buffer: Buffer,
    filename: string,
    mimeType: string,
    options: ProcessingOptions = {},
    onProgress?: (progress: SourceProcessingProgress) => void
  ): Promise<Source | null> {
    const opts = { ...DEFAULT_OPTIONS, ...options }

    try {
      onProgress?.({
        sourceId: '',
        status: 'uploading',
        progress: 10,
        message: 'Creating source record...',
      })

      // Determine file type and extract content
      let content: string
      let title = filename.replace(/\.[^.]+$/, '')

      const ext = filename.split('.').pop()?.toLowerCase()

      switch (ext) {
        case 'txt':
        case 'md':
        case 'markdown':
          content = buffer.toString('utf-8')
          break

        case 'csv':
          content = this.parseCSV(buffer.toString('utf-8'))
          break

        case 'json':
          content = JSON.stringify(JSON.parse(buffer.toString('utf-8')), null, 2)
          break

        default:
          onProgress?.({
            sourceId: '',
            status: 'error',
            progress: 0,
            message: `Unsupported file type: ${ext}`,
            error: `Unsupported file type: ${ext}`,
          })
          return null
      }

      const wordCount = content.split(/\s+/).filter((w) => w.length > 0).length

      const source = await this.storage.createSource({
        noteId,
        type: 'file',
        title,
        content,
        originalFilename: filename,
        wordCount,
        status: 'processing',
      })

      if (!source) {
        throw new Error('Failed to create source record')
      }

      // Generate chunks
      onProgress?.({
        sourceId: source.id,
        status: 'chunking',
        progress: 50,
        message: 'Processing content chunks...',
      })

      const chunks = this.chunkText(content, source.id, opts.chunkSize!, opts.chunkOverlap!)

      if (chunks.length > 0) {
        if (opts.generateEmbeddings && this.embedFn) {
          onProgress?.({
            sourceId: source.id,
            status: 'embedding',
            progress: 80,
            message: 'Generating embeddings...',
          })

          await this.generateEmbeddings(chunks)
        }

        await this.storage.saveChunks(source.id, chunks)
      }

      // Mark as ready
      await this.storage.updateSourceStatus(source.id, 'ready')

      onProgress?.({
        sourceId: source.id,
        status: 'complete',
        progress: 100,
        message: 'File processed successfully',
      })

      return this.storage.getSource(source.id)
    } catch (error) {
      onProgress?.({
        sourceId: '',
        status: 'error',
        progress: 0,
        message: error instanceof Error ? error.message : 'Processing failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      return null
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Chunk text content
   */
  private chunkText(
    content: string,
    sourceId: string,
    chunkSize: number,
    chunkOverlap: number
  ): SourceChunk[] {
    const chunks: SourceChunk[] = []
    let position = 0
    let offset = 0

    while (offset < content.length) {
      let endIndex = Math.min(offset + chunkSize, content.length)

      // Try to break at paragraph or sentence boundary
      if (endIndex < content.length) {
        const searchStart = Math.max(offset + chunkSize - 200, offset)
        const searchText = content.slice(searchStart, endIndex + 100)

        const paragraphBreak = searchText.lastIndexOf('\n\n')
        if (paragraphBreak > 50) {
          endIndex = searchStart + paragraphBreak + 2
        } else {
          const sentenceEnd = this.findSentenceEnd(searchText)
          if (sentenceEnd > 50) {
            endIndex = searchStart + sentenceEnd + 1
          }
        }
      }

      const chunkContent = content.slice(offset, endIndex).trim()

      if (chunkContent.length > 0) {
        chunks.push({
          id: `chunk_${position}`,
          sourceId,
          content: chunkContent,
          position,
        })
        position++
      }

      offset = endIndex - chunkOverlap
      if (offset <= 0 || endIndex >= content.length) {
        offset = endIndex
      }
    }

    return chunks
  }

  /**
   * Find sentence ending position
   */
  private findSentenceEnd(text: string): number {
    const endings = ['. ', '.\n', '! ', '!\n', '? ', '?\n']
    let lastEnd = -1

    for (const ending of endings) {
      const index = text.lastIndexOf(ending)
      if (index > lastEnd) lastEnd = index
    }

    return lastEnd
  }

  /**
   * Parse CSV to readable text
   */
  private parseCSV(csv: string): string {
    const lines = csv.split('\n')
    if (lines.length === 0) return csv

    // Try to parse as proper CSV
    const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''))

    const rows = lines.slice(1).map((line) => {
      const values = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''))
      return headers.map((h, i) => `${h}: ${values[i] || ''}`).join('\n')
    })

    return `Headers: ${headers.join(', ')}\n\n${rows.join('\n\n---\n\n')}`
  }

  /**
   * Generate embeddings for chunks
   */
  private async generateEmbeddings(chunks: SourceChunk[]): Promise<void> {
    if (!this.embedFn) return

    // Process in batches to avoid rate limits
    const batchSize = 10
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize)

      await Promise.all(
        batch.map(async (chunk) => {
          try {
            chunk.embedding = await this.embedFn!(chunk.content)
          } catch (error) {
            console.error(`Failed to generate embedding for chunk ${chunk.id}:`, error)
          }
        })
      )
    }
  }

  // ============================================================================
  // Storage Access
  // ============================================================================

  /**
   * Get the storage instance for direct operations
   */
  getStorage(): SourceStorage {
    return this.storage
  }
}

/**
 * Create a source processor instance
 */
export function createSourceProcessor(
  supabase: SupabaseClient,
  userId: string,
  embedFunction?: (text: string) => Promise<number[]>
): SourceProcessor {
  return new SourceProcessor(supabase, userId, embedFunction)
}
