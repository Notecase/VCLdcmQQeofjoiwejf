import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { authMiddleware, requireAuth } from '../middleware/auth'

const search = new Hono()

// Apply auth middleware
search.use('*', authMiddleware)

/**
 * Semantic search request schema
 */
const SemanticSearchSchema = z.object({
  query: z.string().min(1).max(1000),
  projectId: z.string().uuid().optional(),
  noteIds: z.array(z.string().uuid()).optional(),
  limit: z.number().int().min(1).max(50).default(10),
  threshold: z.number().min(0).max(1).default(0.7),
})

/**
 * Hybrid search request schema
 */
const HybridSearchSchema = z.object({
  query: z.string().min(1).max(1000),
  projectId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(50).default(10),
})

/**
 * Semantic search
 * POST /api/search/semantic
 *
 * Search notes using vector embeddings
 * Requires embedding generation to be implemented in Phase 1
 */
search.post(
  '/semantic',
  zValidator('json', SemanticSearchSchema),
  async (c) => {
    const auth = requireAuth(c)
    const body = c.req.valid('json')

    // TODO: Phase 1 - Generate query embedding and search
    // For now, return placeholder explaining the feature

    // Placeholder: Use text search as fallback
    const { data: notes, error } = await auth.supabase
      .from('notes')
      .select('id, title, content')
      .eq('is_deleted', false)
      .ilike('content', `%${body.query}%`)
      .limit(body.limit)

    if (error) {
      throw new Error(error.message)
    }

    // Format as search results
    const results = (notes || []).map(note => ({
      noteId: note.id,
      title: note.title,
      chunkText: note.content.substring(0, 200),
      similarity: 0.8, // Placeholder
    }))

    return c.json({
      query: body.query,
      results,
      metadata: {
        totalResults: results.length,
        searchType: 'text-fallback', // Will be 'semantic' in Phase 1
        threshold: body.threshold,
      },
    })
  }
)

/**
 * Hybrid search (keyword + semantic)
 * POST /api/search/hybrid
 *
 * Combines full-text search with semantic similarity
 */
search.post(
  '/hybrid',
  zValidator('json', HybridSearchSchema),
  async (c) => {
    const auth = requireAuth(c)
    const body = c.req.valid('json')

    // TODO: Phase 2 - Use search_notes_hybrid RPC function
    // For now, use text search as fallback

    let query = auth.supabase
      .from('notes')
      .select('id, title, content')
      .eq('is_deleted', false)
      .or(`title.ilike.%${body.query}%,content.ilike.%${body.query}%`)

    if (body.projectId) {
      query = query.eq('project_id', body.projectId)
    }

    const { data: notes, error } = await query.limit(body.limit)

    if (error) {
      throw new Error(error.message)
    }

    // Format as hybrid search results
    const results = (notes || []).map(note => ({
      noteId: note.id,
      title: note.title,
      snippet: note.content.substring(0, 200),
      keywordScore: 0.5, // Placeholder
      semanticScore: 0.5, // Placeholder
      combinedScore: 0.5, // Placeholder
    }))

    return c.json({
      query: body.query,
      results,
      metadata: {
        totalResults: results.length,
        searchType: 'text-fallback', // Will be 'hybrid' in Phase 2
      },
    })
  }
)

/**
 * Search within a specific note
 * POST /api/search/note/:noteId
 */
search.post(
  '/note/:noteId',
  zValidator('json', z.object({
    query: z.string().min(1).max(500),
  })),
  async (c) => {
    const auth = requireAuth(c)
    const noteId = c.req.param('noteId')
    const body = c.req.valid('json')

    // Get the note
    const { data: note, error } = await auth.supabase
      .from('notes')
      .select('id, title, content')
      .eq('id', noteId)
      .eq('is_deleted', false)
      .single()

    if (error || !note) {
      return c.json({ error: 'Note not found' }, 404)
    }

    // Simple text search within note content
    const content = note.content.toLowerCase()
    const query = body.query.toLowerCase()
    const matches: Array<{ position: number; context: string }> = []

    let pos = content.indexOf(query)
    while (pos !== -1) {
      // Get surrounding context
      const start = Math.max(0, pos - 50)
      const end = Math.min(content.length, pos + query.length + 50)
      const context = note.content.substring(start, end)

      matches.push({
        position: pos,
        context: (start > 0 ? '...' : '') + context + (end < content.length ? '...' : ''),
      })

      pos = content.indexOf(query, pos + 1)
    }

    return c.json({
      noteId,
      query: body.query,
      matches,
      totalMatches: matches.length,
    })
  }
)

export default search
