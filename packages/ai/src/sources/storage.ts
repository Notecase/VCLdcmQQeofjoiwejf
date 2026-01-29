/**
 * Source Storage
 *
 * CRUD operations for sources using Supabase.
 * Handles source and chunk persistence, including embeddings.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Source,
  SourceChunk,
  SourceRow,
  SourceChunkRow,
  SourceStatus,
  SourceType,
  SourceSearchOptions,
  SourceSearchResult,
} from './types'
import { sourceRowToSource, chunkRowToChunk } from './types'

/**
 * Source Storage Service
 */
export class SourceStorage {
  constructor(
    private supabase: SupabaseClient,
    private userId: string
  ) {}

  // ============================================================================
  // Source CRUD
  // ============================================================================

  /**
   * Create a new source
   */
  async createSource(params: {
    noteId: string
    type: SourceType
    title: string
    content: string
    originalUrl?: string
    originalFilename?: string
    wordCount: number
    pageCount?: number
    status?: SourceStatus
  }): Promise<Source | null> {
    const { data, error } = await this.supabase
      .from('sources')
      .insert({
        note_id: params.noteId,
        user_id: this.userId,
        type: params.type,
        title: params.title,
        content: params.content,
        original_url: params.originalUrl,
        original_filename: params.originalFilename,
        word_count: params.wordCount,
        page_count: params.pageCount,
        status: params.status || 'processing',
        extracted_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      console.error('Failed to create source:', error)
      return null
    }

    return sourceRowToSource(data as SourceRow, [])
  }

  /**
   * Get a source by ID
   */
  async getSource(sourceId: string): Promise<Source | null> {
    const { data: sourceData, error: sourceError } = await this.supabase
      .from('sources')
      .select('*')
      .eq('id', sourceId)
      .eq('user_id', this.userId)
      .single()

    if (sourceError || !sourceData) {
      return null
    }

    // Fetch chunks
    const { data: chunkData } = await this.supabase
      .from('source_chunks')
      .select('*')
      .eq('source_id', sourceId)
      .order('position', { ascending: true })

    const chunks = (chunkData || []).map(chunkRowToChunk)

    return sourceRowToSource(sourceData as SourceRow, chunks)
  }

  /**
   * Get all sources for a note
   */
  async getSourcesForNote(noteId: string, status?: SourceStatus): Promise<Source[]> {
    let query = this.supabase
      .from('sources')
      .select('*')
      .eq('note_id', noteId)
      .eq('user_id', this.userId)
      .order('created_at', { ascending: false })

    if (status) {
      query = query.eq('status', status)
    }

    const { data, error } = await query

    if (error || !data) {
      console.error('Failed to get sources:', error)
      return []
    }

    return data.map((row) => sourceRowToSource(row as SourceRow, []))
  }

  /**
   * Update source status
   */
  async updateSourceStatus(
    sourceId: string,
    status: SourceStatus,
    error?: string
  ): Promise<boolean> {
    const { error: updateError } = await this.supabase
      .from('sources')
      .update({
        status,
        error: error || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sourceId)
      .eq('user_id', this.userId)

    if (updateError) {
      console.error('Failed to update source status:', updateError)
      return false
    }

    return true
  }

  /**
   * Delete a source and its chunks
   */
  async deleteSource(sourceId: string): Promise<boolean> {
    // Delete chunks first (cascade should handle this, but be explicit)
    await this.supabase
      .from('source_chunks')
      .delete()
      .eq('source_id', sourceId)

    const { error } = await this.supabase
      .from('sources')
      .delete()
      .eq('id', sourceId)
      .eq('user_id', this.userId)

    if (error) {
      console.error('Failed to delete source:', error)
      return false
    }

    return true
  }

  /**
   * Delete all sources for a note
   */
  async deleteSourcesForNote(noteId: string): Promise<boolean> {
    // Get all source IDs first
    const { data: sources } = await this.supabase
      .from('sources')
      .select('id')
      .eq('note_id', noteId)
      .eq('user_id', this.userId)

    if (sources && sources.length > 0) {
      const sourceIds = sources.map((s) => s.id)

      // Delete chunks
      await this.supabase
        .from('source_chunks')
        .delete()
        .in('source_id', sourceIds)
    }

    // Delete sources
    const { error } = await this.supabase
      .from('sources')
      .delete()
      .eq('note_id', noteId)
      .eq('user_id', this.userId)

    if (error) {
      console.error('Failed to delete sources for note:', error)
      return false
    }

    return true
  }

  // ============================================================================
  // Chunk Operations
  // ============================================================================

  /**
   * Save chunks for a source
   */
  async saveChunks(sourceId: string, chunks: SourceChunk[]): Promise<boolean> {
    if (chunks.length === 0) return true

    const chunkRows = chunks.map((chunk) => ({
      source_id: sourceId,
      content: chunk.content,
      embedding: chunk.embedding,
      page_number: chunk.pageNumber,
      position: chunk.position,
      metadata: chunk.metadata,
    }))

    const { error } = await this.supabase
      .from('source_chunks')
      .insert(chunkRows)

    if (error) {
      console.error('Failed to save chunks:', error)
      return false
    }

    return true
  }

  /**
   * Get chunks for a source
   */
  async getChunks(sourceId: string): Promise<SourceChunk[]> {
    const { data, error } = await this.supabase
      .from('source_chunks')
      .select('*')
      .eq('source_id', sourceId)
      .order('position', { ascending: true })

    if (error) {
      console.error('Failed to get chunks:', error)
      return []
    }

    return (data || []).map(chunkRowToChunk)
  }

  /**
   * Update chunk embedding
   */
  async updateChunkEmbedding(chunkId: string, embedding: number[]): Promise<boolean> {
    const { error } = await this.supabase
      .from('source_chunks')
      .update({ embedding })
      .eq('id', chunkId)

    if (error) {
      console.error('Failed to update chunk embedding:', error)
      return false
    }

    return true
  }

  // ============================================================================
  // Search Operations
  // ============================================================================

  /**
   * Search sources using semantic similarity
   * Requires the pgvector extension and a match_source_chunks function
   */
  async searchSources(options: SourceSearchOptions): Promise<SourceSearchResult[]> {
    const { noteId, query, limit = 10, threshold = 0.7 } = options

    // First, we need to get the embedding for the query
    // This should be done by the caller and passed in, but for now
    // we'll return an empty array if no embedding function is available
    // The actual implementation will use the embedding from the AI provider

    // For now, do a simple text search
    return this.textSearchSources(noteId, query, limit)
  }

  /**
   * Simple text search fallback
   */
  async textSearchSources(
    noteId: string | undefined,
    query: string,
    limit: number
  ): Promise<SourceSearchResult[]> {
    // Get sources for the note
    let sourcesQuery = this.supabase
      .from('sources')
      .select('*')
      .eq('user_id', this.userId)
      .eq('status', 'ready')

    if (noteId) {
      sourcesQuery = sourcesQuery.eq('note_id', noteId)
    }

    const { data: sources } = await sourcesQuery

    if (!sources || sources.length === 0) {
      return []
    }

    // Search within each source's chunks
    const results: SourceSearchResult[] = []
    const queryLower = query.toLowerCase()
    const queryWords = queryLower.split(/\s+/)

    for (const sourceRow of sources) {
      const { data: chunks } = await this.supabase
        .from('source_chunks')
        .select('*')
        .eq('source_id', sourceRow.id)
        .order('position', { ascending: true })

      if (!chunks) continue

      for (const chunkRow of chunks) {
        const contentLower = chunkRow.content.toLowerCase()

        // Simple scoring: count how many query words appear in chunk
        let matchCount = 0
        const highlights: string[] = []

        for (const word of queryWords) {
          if (contentLower.includes(word)) {
            matchCount++

            // Extract highlight snippet
            const index = contentLower.indexOf(word)
            const start = Math.max(0, index - 50)
            const end = Math.min(chunkRow.content.length, index + word.length + 50)
            const snippet = chunkRow.content.slice(start, end)
            if (!highlights.includes(snippet)) {
              highlights.push(snippet)
            }
          }
        }

        if (matchCount > 0) {
          const score = matchCount / queryWords.length
          results.push({
            chunk: chunkRowToChunk(chunkRow as SourceChunkRow),
            source: sourceRowToSource(sourceRow as SourceRow, []),
            score,
            highlights: highlights.slice(0, 3),
          })
        }
      }
    }

    // Sort by score and limit
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
  }

  /**
   * Semantic search using embeddings
   * Requires embeddings to be generated and stored
   */
  async semanticSearch(
    queryEmbedding: number[],
    noteId?: string,
    limit: number = 10,
    threshold: number = 0.7
  ): Promise<SourceSearchResult[]> {
    // Call the match_source_chunks function in Supabase
    // This requires the pgvector extension and a custom function
    const { data, error } = await this.supabase.rpc('match_source_chunks', {
      query_embedding: queryEmbedding,
      match_threshold: threshold,
      match_count: limit,
      filter_note_id: noteId || null,
      filter_user_id: this.userId,
    })

    if (error) {
      console.error('Semantic search failed:', error)
      // Fall back to text search
      return []
    }

    if (!data || data.length === 0) {
      return []
    }

    // Fetch full source data for each result
    const results: SourceSearchResult[] = []

    for (const match of data) {
      const source = await this.getSource(match.source_id)
      if (source) {
        results.push({
          chunk: {
            id: match.id,
            sourceId: match.source_id,
            content: match.content,
            position: match.position,
            pageNumber: match.page_number,
          },
          source,
          score: match.similarity,
        })
      }
    }

    return results
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Get total word count across all sources for a note
   */
  async getTotalWordCount(noteId: string): Promise<number> {
    const { data } = await this.supabase
      .from('sources')
      .select('word_count')
      .eq('note_id', noteId)
      .eq('user_id', this.userId)
      .eq('status', 'ready')

    if (!data) return 0

    return data.reduce((sum, row) => sum + (row.word_count || 0), 0)
  }

  /**
   * Get source count for a note
   */
  async getSourceCount(noteId: string): Promise<number> {
    const { count } = await this.supabase
      .from('sources')
      .select('id', { count: 'exact', head: true })
      .eq('note_id', noteId)
      .eq('user_id', this.userId)

    return count || 0
  }

  /**
   * Check if a URL is already added as a source
   */
  async sourceExistsForUrl(noteId: string, url: string): Promise<boolean> {
    const { count } = await this.supabase
      .from('sources')
      .select('id', { count: 'exact', head: true })
      .eq('note_id', noteId)
      .eq('user_id', this.userId)
      .eq('original_url', url)

    return (count || 0) > 0
  }

  /**
   * Get all content from sources for a note (for AI context)
   */
  async getAllContent(noteId: string): Promise<string> {
    const sources = await this.getSourcesForNote(noteId, 'ready')

    return sources
      .map((s) => `## Source: ${s.title}\n\n${s.content}`)
      .join('\n\n---\n\n')
  }

  /**
   * Get content with source references (for citations)
   */
  async getContentWithRefs(noteId: string): Promise<Array<{
    sourceId: string
    title: string
    content: string
    type: SourceType
  }>> {
    const sources = await this.getSourcesForNote(noteId, 'ready')

    return sources.map((s) => ({
      sourceId: s.id,
      title: s.title,
      content: s.content,
      type: s.type,
    }))
  }
}

/**
 * Create a source storage instance
 */
export function createSourceStorage(
  supabase: SupabaseClient,
  userId: string
): SourceStorage {
  return new SourceStorage(supabase, userId)
}
