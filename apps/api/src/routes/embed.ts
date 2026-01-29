import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { authMiddleware, requireAuth } from '../middleware/auth'

const embed = new Hono()

// Apply auth middleware
embed.use('*', authMiddleware)

/**
 * Embed text request schema
 */
const EmbedTextSchema = z.object({
  text: z.string().min(1).max(50000),
})

/**
 * Embed note request schema
 */
const EmbedNoteSchema = z.object({
  noteId: z.string().uuid(),
  priority: z.number().int().min(0).max(10).default(0),
})

/**
 * Generate embedding for text
 * POST /api/embed/text
 *
 * Returns the embedding vector for the provided text
 * Useful for custom search or similarity calculations
 */
embed.post('/text', zValidator('json', EmbedTextSchema), async (c) => {
  requireAuth(c) // Validate auth

  // Placeholder - not yet implemented
  return c.json(
    {
      error: 'Not Implemented',
      message: 'Embedding generation not yet implemented. Full AI integration coming in Phase 1.',
    },
    501
  )
})

/**
 * Queue note for embedding generation
 * POST /api/embed/note
 *
 * Adds a note to the embedding queue for background processing
 */
embed.post('/note', zValidator('json', EmbedNoteSchema), async (c) => {
  const auth = requireAuth(c)
  const body = c.req.valid('json')

  // Verify note exists and belongs to user
  const { data: note, error: noteError } = await auth.supabase
    .from('notes')
    .select('id, title')
    .eq('id', body.noteId)
    .eq('is_deleted', false)
    .single()

  if (noteError || !note) {
    return c.json({ error: 'Note not found' }, 404)
  }

  // Add to embedding queue
  const { data: queueItem, error: queueError } = await auth.supabase
    .from('embedding_queue')
    .upsert(
      {
        user_id: auth.userId,
        note_id: body.noteId,
        priority: body.priority,
        status: 'pending',
        attempts: 0,
        last_error: null,
      },
      {
        onConflict: 'note_id',
      }
    )
    .select()
    .single()

  if (queueError) {
    throw new Error(queueError.message)
  }

  return c.json(
    {
      queued: true,
      noteId: body.noteId,
      noteTitle: note.title,
      queueId: queueItem?.id,
      priority: body.priority,
    },
    201
  )
})

/**
 * Get embedding status for a note
 * GET /api/embed/note/:noteId/status
 */
embed.get('/note/:noteId/status', async (c) => {
  const auth = requireAuth(c)
  const noteId = c.req.param('noteId')

  // Check queue status
  const { data: queueItem } = await auth.supabase
    .from('embedding_queue')
    .select('*')
    .eq('note_id', noteId)
    .single()

  // Check if embeddings exist
  const { data: embeddings, error: embeddingsError } = await auth.supabase
    .from('note_embeddings')
    .select('id, chunk_index, created_at')
    .eq('note_id', noteId)

  if (embeddingsError) {
    throw new Error(embeddingsError.message)
  }

  const hasEmbeddings = embeddings && embeddings.length > 0

  return c.json({
    noteId,
    hasEmbeddings,
    chunkCount: embeddings?.length || 0,
    queueStatus: queueItem?.status || (hasEmbeddings ? 'completed' : 'not_queued'),
    lastProcessed: embeddings?.[0]?.created_at,
    queueAttempts: queueItem?.attempts,
    lastError: queueItem?.last_error,
  })
})

/**
 * Get embedding queue status for current user
 * GET /api/embed/queue
 */
embed.get('/queue', async (c) => {
  const auth = requireAuth(c)

  const { data: queueItems, error } = await auth.supabase
    .from('embedding_queue')
    .select(
      `
      id,
      note_id,
      status,
      priority,
      attempts,
      last_error,
      created_at,
      started_at,
      completed_at
    `
    )
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    throw new Error(error.message)
  }

  // Count by status
  const statusCounts = (queueItems || []).reduce(
    (acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1
      return acc
    },
    {} as Record<string, number>
  )

  return c.json({
    items: queueItems,
    summary: {
      total: queueItems?.length || 0,
      ...statusCounts,
    },
  })
})

/**
 * Retry failed embedding jobs
 * POST /api/embed/queue/retry
 */
embed.post('/queue/retry', async (c) => {
  const auth = requireAuth(c)

  // Reset failed jobs back to pending
  const { data, error } = await auth.supabase
    .from('embedding_queue')
    .update({
      status: 'pending',
      attempts: 0,
      last_error: null,
      started_at: null,
    })
    .eq('status', 'failed')
    .select()

  if (error) {
    throw new Error(error.message)
  }

  return c.json({
    retriedCount: data?.length || 0,
    message: `${data?.length || 0} failed jobs queued for retry`,
  })
})

export default embed
