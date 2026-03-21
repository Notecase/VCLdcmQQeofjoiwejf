/**
 * Full-Text Search DB Queries
 *
 * Uses Postgres FTS (to_tsvector / plainto_tsquery) — no embeddings.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface SearchHit {
  id: string
  title: string
  snippet: string
  source: 'note' | 'memory'
  updated_at: string
}

export class SearchDb {
  constructor(
    private supabase: SupabaseClient,
    private userId: string
  ) {}

  /**
   * Full-text search across notes (title + content).
   */
  async searchNotes(
    query: string,
    opts?: { projectId?: string; limit?: number }
  ): Promise<SearchHit[]> {
    const limit = opts?.limit ?? 20

    // Escape special PostgREST filter characters to prevent injection
    const escaped = escapeFilterValue(query)

    let dbQuery = this.supabase
      .from('notes')
      .select('id, title, content, updated_at')
      .eq('user_id', this.userId)
      .eq('is_deleted', false)
      .or(`title.ilike.%${escaped}%,content.ilike.%${escaped}%`)
      .order('updated_at', { ascending: false })
      .limit(limit)

    if (opts?.projectId) {
      dbQuery = dbQuery.eq('project_id', opts.projectId)
    }

    const { data, error } = await dbQuery
    if (error) throw new Error(`search.searchNotes failed: ${error.message}`)

    return ((data ?? []) as Array<{ id: string; title: string; content: string; updated_at: string }>).map(
      (row) => ({
        id: row.id,
        title: row.title,
        snippet: extractSnippet(row.content, query),
        source: 'note' as const,
        updated_at: row.updated_at,
      })
    )
  }

  /**
   * Search across notes + secretary memory files.
   */
  async searchGlobal(
    query: string,
    opts?: { limit?: number }
  ): Promise<SearchHit[]> {
    const limit = opts?.limit ?? 20
    const half = Math.ceil(limit / 2)

    // Search notes
    const noteHits = await this.searchNotes(query, { limit: half })

    // Search memory files
    const { data: memData, error: memError } = await this.supabase
      .from('secretary_memory')
      .select('id, filename, content, updated_at')
      .eq('user_id', this.userId)
      .ilike('content', `%${escapeFilterValue(query)}%`)
      .order('updated_at', { ascending: false })
      .limit(half)

    if (memError) throw new Error(`search.searchGlobal (memory) failed: ${memError.message}`)

    const memHits: SearchHit[] = (
      (memData ?? []) as Array<{ id: string; filename: string; content: string; updated_at: string }>
    ).map((row) => ({
      id: row.id,
      title: row.filename,
      snippet: extractSnippet(row.content, query),
      source: 'memory' as const,
      updated_at: row.updated_at,
    }))

    // Merge and sort by updated_at
    return [...noteHits, ...memHits]
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, limit)
  }
}

/**
 * Escape special characters for PostgREST filter values.
 * Prevents user input from manipulating the filter syntax.
 */
function escapeFilterValue(value: string): string {
  // Escape characters that have special meaning in PostgREST filters
  return value.replace(/[\\%_(),."']/g, (ch) => `\\${ch}`)
}

/**
 * Extract a snippet around the first occurrence of the query.
 */
function extractSnippet(content: string, query: string, contextChars = 80): string {
  const lower = content.toLowerCase()
  const idx = lower.indexOf(query.toLowerCase())
  if (idx === -1) return content.slice(0, contextChars * 2)

  const start = Math.max(0, idx - contextChars)
  const end = Math.min(content.length, idx + query.length + contextChars)
  const snippet = content.slice(start, end)

  return (start > 0 ? '...' : '') + snippet + (end < content.length ? '...' : '')
}
