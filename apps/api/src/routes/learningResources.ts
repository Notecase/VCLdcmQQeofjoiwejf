/**
 * Learning Resources API Routes
 *
 * Hono routes for managing note-attached learning resources.
 * Handles CRUD operations for flashcards, mindmaps, Q&A, etc.
 */

import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { authMiddleware, requireAuth } from '../middleware/auth'

const learningResources = new Hono()

// Apply auth middleware
learningResources.use('*', authMiddleware)

// ============================================================================
// Request Schemas
// ============================================================================

const ResourceTypeSchema = z.enum([
  'flashcards',
  'mindmap',
  'key_terms',
  'qa',
  'summary',
  'exercises',
  'resources',
  'study_note',
  'timeline',
  'comparison',
])

const SaveResourceSchema = z.object({
  noteId: z.string().uuid(),
  type: ResourceTypeSchema,
  data: z.record(z.unknown()),
  itemCount: z.number().int().min(0).optional(),
})

// ============================================================================
// SPECIFIC PATHS FIRST (before wildcard params)
// ============================================================================

// ============================================================================
// Save Resource
// ============================================================================

/**
 * Save a learning resource (upsert)
 * POST /api/learning-resources/save
 */
learningResources.post(
  '/save',
  zValidator('json', SaveResourceSchema),
  async (c) => {
    const auth = requireAuth(c)
    const body = c.req.valid('json')

    // Verify note ownership
    const { data: note, error: noteError } = await auth.supabase
      .from('notes')
      .select('id')
      .eq('id', body.noteId)
      .eq('user_id', auth.userId)
      .single()

    if (noteError || !note) {
      return c.json({ success: false, error: 'Note not found' }, 404)
    }

    try {
      // Upsert the resource
      const { data: resource, error } = await auth.supabase
        .from('note_learning_resources')
        .upsert(
          {
            note_id: body.noteId,
            user_id: auth.userId,
            type: body.type,
            data: body.data,
            item_count: body.itemCount ?? 0,
          },
          {
            onConflict: 'note_id,type',
          }
        )
        .select()
        .single()

      if (error) {
        console.error('[LearningResources] Save error:', error)
        return c.json({ success: false, error: error.message }, 500)
      }

      return c.json({ success: true, data: resource })
    } catch (error) {
      console.error('[LearningResources] Save exception:', error)
      return c.json({ success: false, error: String(error) }, 500)
    }
  }
)

// ============================================================================
// Get Resources for Note
// ============================================================================

/**
 * Get all resources for a note
 * GET /api/learning-resources/note/:noteId
 */
learningResources.get('/note/:noteId', async (c) => {
  const auth = requireAuth(c)
  const noteId = c.req.param('noteId')

  // Verify note ownership
  const { data: note, error: noteError } = await auth.supabase
    .from('notes')
    .select('id')
    .eq('id', noteId)
    .eq('user_id', auth.userId)
    .single()

  if (noteError || !note) {
    return c.json({ success: false, error: 'Note not found' }, 404)
  }

  try {
    const { data: resources, error } = await auth.supabase
      .from('note_learning_resources')
      .select('*')
      .eq('note_id', noteId)
      .eq('user_id', auth.userId)
      .order('updated_at', { ascending: false })

    if (error) {
      console.error('[LearningResources] Fetch error:', error)
      return c.json({ success: false, error: error.message }, 500)
    }

    return c.json({ success: true, data: resources || [] })
  } catch (error) {
    console.error('[LearningResources] Fetch exception:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// ============================================================================
// Get Resource Count for Note
// ============================================================================

/**
 * Get resource count for a note
 * GET /api/learning-resources/note/:noteId/count
 */
learningResources.get('/note/:noteId/count', async (c) => {
  const auth = requireAuth(c)
  const noteId = c.req.param('noteId')

  // Verify note ownership
  const { data: note, error: noteError } = await auth.supabase
    .from('notes')
    .select('id')
    .eq('id', noteId)
    .eq('user_id', auth.userId)
    .single()

  if (noteError || !note) {
    return c.json({ success: false, error: 'Note not found' }, 404)
  }

  try {
    const { count, error } = await auth.supabase
      .from('note_learning_resources')
      .select('*', { count: 'exact', head: true })
      .eq('note_id', noteId)
      .eq('user_id', auth.userId)

    if (error) {
      console.error('[LearningResources] Count error:', error)
      return c.json({ success: false, error: error.message }, 500)
    }

    return c.json({ success: true, data: { count: count ?? 0 } })
  } catch (error) {
    console.error('[LearningResources] Count exception:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// ============================================================================
// Get Resource by Type
// ============================================================================

/**
 * Get a specific resource by note and type
 * GET /api/learning-resources/note/:noteId/type/:type
 */
learningResources.get('/note/:noteId/type/:type', async (c) => {
  const auth = requireAuth(c)
  const noteId = c.req.param('noteId')
  const type = c.req.param('type')

  // Validate type
  const typeResult = ResourceTypeSchema.safeParse(type)
  if (!typeResult.success) {
    return c.json({ success: false, error: 'Invalid resource type' }, 400)
  }

  // Verify note ownership
  const { data: note, error: noteError } = await auth.supabase
    .from('notes')
    .select('id')
    .eq('id', noteId)
    .eq('user_id', auth.userId)
    .single()

  if (noteError || !note) {
    return c.json({ success: false, error: 'Note not found' }, 404)
  }

  try {
    const { data: resource, error } = await auth.supabase
      .from('note_learning_resources')
      .select('*')
      .eq('note_id', noteId)
      .eq('user_id', auth.userId)
      .eq('type', type)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned
        return c.json({ success: false, error: 'Resource not found' }, 404)
      }
      console.error('[LearningResources] Get by type error:', error)
      return c.json({ success: false, error: error.message }, 500)
    }

    return c.json({ success: true, data: resource })
  } catch (error) {
    console.error('[LearningResources] Get by type exception:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// ============================================================================
// Delete Resource by Type
// ============================================================================

/**
 * Delete a resource by note and type
 * DELETE /api/learning-resources/note/:noteId/type/:type
 */
learningResources.delete('/note/:noteId/type/:type', async (c) => {
  const auth = requireAuth(c)
  const noteId = c.req.param('noteId')
  const type = c.req.param('type')

  // Validate type
  const typeResult = ResourceTypeSchema.safeParse(type)
  if (!typeResult.success) {
    return c.json({ success: false, error: 'Invalid resource type' }, 400)
  }

  // Verify note ownership
  const { data: note, error: noteError } = await auth.supabase
    .from('notes')
    .select('id')
    .eq('id', noteId)
    .eq('user_id', auth.userId)
    .single()

  if (noteError || !note) {
    return c.json({ success: false, error: 'Note not found' }, 404)
  }

  try {
    const { error } = await auth.supabase
      .from('note_learning_resources')
      .delete()
      .eq('note_id', noteId)
      .eq('user_id', auth.userId)
      .eq('type', type)

    if (error) {
      console.error('[LearningResources] Delete by type error:', error)
      return c.json({ success: false, error: error.message }, 500)
    }

    return c.json({ success: true, data: { deleted: true } })
  } catch (error) {
    console.error('[LearningResources] Delete by type exception:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// ============================================================================
// WILDCARD PATHS LAST
// ============================================================================

// ============================================================================
// Delete Resource by ID
// ============================================================================

/**
 * Delete a resource by ID
 * DELETE /api/learning-resources/:resourceId
 */
learningResources.delete('/:resourceId', async (c) => {
  const auth = requireAuth(c)
  const resourceId = c.req.param('resourceId')

  // Validate UUID format
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(resourceId)) {
    return c.json({ success: false, error: 'Invalid resource ID format' }, 400)
  }

  try {
    // Verify ownership and delete
    const { error } = await auth.supabase
      .from('note_learning_resources')
      .delete()
      .eq('id', resourceId)
      .eq('user_id', auth.userId)

    if (error) {
      console.error('[LearningResources] Delete error:', error)
      return c.json({ success: false, error: error.message }, 500)
    }

    return c.json({ success: true, data: { deleted: true } })
  } catch (error) {
    console.error('[LearningResources] Delete exception:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// ============================================================================
// Get Resource by ID
// ============================================================================

/**
 * Get a resource by ID
 * GET /api/learning-resources/:resourceId
 */
learningResources.get('/:resourceId', async (c) => {
  const auth = requireAuth(c)
  const resourceId = c.req.param('resourceId')

  // Validate UUID format
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(resourceId)) {
    return c.json({ success: false, error: 'Invalid resource ID format' }, 400)
  }

  try {
    const { data: resource, error } = await auth.supabase
      .from('note_learning_resources')
      .select('*')
      .eq('id', resourceId)
      .eq('user_id', auth.userId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return c.json({ success: false, error: 'Resource not found' }, 404)
      }
      console.error('[LearningResources] Get by ID error:', error)
      return c.json({ success: false, error: error.message }, 500)
    }

    return c.json({ success: true, data: resource })
  } catch (error) {
    console.error('[LearningResources] Get by ID exception:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

export default learningResources
