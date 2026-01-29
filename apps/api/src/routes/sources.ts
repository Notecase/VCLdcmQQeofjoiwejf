/**
 * Sources API Routes
 *
 * Hono routes for source management.
 * Handles PDF uploads, link fetching, text pasting, and source CRUD.
 *
 * IMPORTANT: Route order matters! Specific paths must come before wildcard params.
 */

import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { authMiddleware, requireAuth } from '../middleware/auth'

const sources = new Hono()

// Apply auth middleware
sources.use('*', authMiddleware)

// ============================================================================
// Request Schemas
// ============================================================================

const AddLinkSchema = z.object({
  noteId: z.string().uuid(),
  url: z.string().url(),
})

const AddTextSchema = z.object({
  noteId: z.string().uuid(),
  text: z.string().min(1),
  title: z.string().optional(),
})

const SearchSourcesSchema = z.object({
  noteId: z.string().uuid(),
  query: z.string().min(1),
  limit: z.number().int().min(1).max(50).optional().default(10),
})

const ExecuteActionSchema = z.object({
  noteId: z.string().uuid(),
  actionType: z.enum([
    'generate_study_note',
    'create_summary',
    'extract_key_terms',
    'compare_sources',
    'generate_qa',
    'find_conflicts',
    'extract_citations',
    'build_timeline',
  ]),
  options: z.record(z.unknown()).optional(),
})

// ============================================================================
// SPECIFIC PATHS FIRST (before wildcard params)
// ============================================================================

// ============================================================================
// Get Available Actions
// ============================================================================

/**
 * Get list of available workflow actions
 * GET /api/sources/actions
 */
sources.get('/actions', async (c) => {
  const { WORKFLOW_ACTIONS } = await import('@inkdown/ai/workflows')

  return c.json({
    success: true,
    actions: WORKFLOW_ACTIONS,
  })
})

// ============================================================================
// Source Upload (PDF/File)
// ============================================================================

/**
 * Upload a file (PDF, txt, md, etc.)
 * POST /api/sources/upload
 */
sources.post('/upload', async (c) => {
  const auth = requireAuth(c)

  try {
    const formData = await c.req.formData()
    const file = formData.get('file') as File | null
    const noteId = formData.get('noteId') as string | null

    if (!file || !noteId) {
      return c.json({ error: 'File and noteId are required' }, 400)
    }

    // Validate noteId format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(noteId)) {
      return c.json({ error: 'Invalid noteId format' }, 400)
    }

    // Verify note ownership
    const { data: note, error: noteError } = await auth.supabase
      .from('notes')
      .select('id')
      .eq('id', noteId)
      .eq('user_id', auth.userId)
      .single()

    if (noteError || !note) {
      return c.json({ error: 'Note not found' }, 404)
    }

    // Get file buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Determine file type
    const filename = file.name
    const ext = filename.split('.').pop()?.toLowerCase()

    // Check Accept header for SSE
    const acceptSSE = c.req.header('Accept')?.includes('text/event-stream')

    // Import processor
    const { createSourceProcessor } = await import('@inkdown/ai/sources')

    const processor = createSourceProcessor(auth.supabase, auth.userId)

    if (acceptSSE) {
      return streamSSE(c, async (stream) => {
        try {
          let source

          if (ext === 'pdf') {
            source = await processor.processPDF(noteId, buffer, filename, {}, async (progress) => {
              await stream.writeSSE({
                data: JSON.stringify({ type: 'progress', ...progress }),
              })
            })
          } else {
            source = await processor.processFile(noteId, buffer, filename, file.type, {}, async (progress) => {
              await stream.writeSSE({
                data: JSON.stringify({ type: 'progress', ...progress }),
              })
            })
          }

          if (source) {
            await stream.writeSSE({
              data: JSON.stringify({ type: 'complete', source }),
            })
          } else {
            await stream.writeSSE({
              data: JSON.stringify({ type: 'error', error: 'Failed to process file' }),
            })
          }
        } catch (error) {
          await stream.writeSSE({
            data: JSON.stringify({ type: 'error', error: String(error) }),
          })
        }
      })
    }

    // Non-streaming upload
    let source
    if (ext === 'pdf') {
      source = await processor.processPDF(noteId, buffer, filename)
    } else {
      source = await processor.processFile(noteId, buffer, filename, file.type)
    }

    if (!source) {
      return c.json({ success: false, error: 'Failed to process file' }, 500)
    }

    return c.json({ success: true, source })
  } catch (error) {
    console.error('File upload error:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// ============================================================================
// Add Link
// ============================================================================

/**
 * Add a URL as a source
 * POST /api/sources/link
 */
sources.post(
  '/link',
  zValidator('json', AddLinkSchema),
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
      return c.json({ error: 'Note not found' }, 404)
    }

    // Check Accept header for SSE
    const acceptSSE = c.req.header('Accept')?.includes('text/event-stream')

    const { createSourceProcessor } = await import('@inkdown/ai/sources')
    const processor = createSourceProcessor(auth.supabase, auth.userId)

    if (acceptSSE) {
      return streamSSE(c, async (stream) => {
        try {
          const source = await processor.processLink(body.noteId, body.url, {}, async (progress) => {
            await stream.writeSSE({
              data: JSON.stringify({ type: 'progress', ...progress }),
            })
          })

          if (source) {
            await stream.writeSSE({
              data: JSON.stringify({ type: 'complete', source }),
            })
          } else {
            await stream.writeSSE({
              data: JSON.stringify({ type: 'error', error: 'Failed to fetch link' }),
            })
          }
        } catch (error) {
          await stream.writeSSE({
            data: JSON.stringify({ type: 'error', error: String(error) }),
          })
        }
      })
    }

    try {
      const source = await processor.processLink(body.noteId, body.url)

      if (!source) {
        return c.json({ success: false, error: 'Failed to fetch link' }, 500)
      }

      return c.json({ success: true, source })
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500)
    }
  }
)

// ============================================================================
// Add Text
// ============================================================================

/**
 * Add pasted text as a source
 * POST /api/sources/text
 */
sources.post(
  '/text',
  zValidator('json', AddTextSchema),
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
      return c.json({ error: 'Note not found' }, 404)
    }

    const { createSourceProcessor } = await import('@inkdown/ai/sources')
    const processor = createSourceProcessor(auth.supabase, auth.userId)

    try {
      const source = await processor.processText(
        body.noteId,
        body.text,
        body.title || 'Pasted Text'
      )

      if (!source) {
        return c.json({ success: false, error: 'Failed to process text' }, 500)
      }

      return c.json({ success: true, source })
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500)
    }
  }
)

// ============================================================================
// Search Sources
// ============================================================================

/**
 * Search across sources for a note
 * POST /api/sources/search
 */
sources.post(
  '/search',
  zValidator('json', SearchSourcesSchema),
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
      return c.json({ error: 'Note not found' }, 404)
    }

    const { createSourceStorage } = await import('@inkdown/ai/sources')
    const storage = createSourceStorage(auth.supabase, auth.userId)

    try {
      const results = await storage.searchSources({
        noteId: body.noteId,
        query: body.query,
        limit: body.limit,
      })

      return c.json({
        success: true,
        results,
        query: body.query,
      })
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500)
    }
  }
)

// ============================================================================
// Execute Workflow Action
// ============================================================================

/**
 * Execute a quick action on sources
 * POST /api/sources/action
 */
sources.post(
  '/action',
  zValidator('json', ExecuteActionSchema),
  async (c) => {
    const auth = requireAuth(c)
    const body = c.req.valid('json')
    const openaiApiKey = process.env.OPENAI_API_KEY

    if (!openaiApiKey) {
      return c.json({ error: 'OpenAI API key not configured' }, 500)
    }

    // Verify note ownership
    const { data: note, error: noteError } = await auth.supabase
      .from('notes')
      .select('id')
      .eq('id', body.noteId)
      .eq('user_id', auth.userId)
      .single()

    if (noteError || !note) {
      return c.json({ error: 'Note not found' }, 404)
    }

    // Check Accept header for SSE
    const acceptSSE = c.req.header('Accept')?.includes('text/event-stream')

    const { createWorkflowActions } = await import('@inkdown/ai/workflows')
    const actions = createWorkflowActions(auth.supabase, auth.userId, openaiApiKey)

    if (acceptSSE) {
      return streamSSE(c, async (stream) => {
        try {
          const result = await actions.execute(
            body.noteId,
            body.actionType,
            body.options || {},
            async (progress) => {
              await stream.writeSSE({
                data: JSON.stringify({ type: 'progress', ...progress }),
              })
            }
          )

          if (result) {
            await stream.writeSSE({
              data: JSON.stringify({ type: 'complete', result }),
            })
          } else {
            await stream.writeSSE({
              data: JSON.stringify({ type: 'error', error: 'Action failed' }),
            })
          }
        } catch (error) {
          await stream.writeSSE({
            data: JSON.stringify({ type: 'error', error: String(error) }),
          })
        }
      })
    }

    try {
      const result = await actions.execute(body.noteId, body.actionType, body.options || {})

      if (!result) {
        return c.json({ success: false, error: 'Action failed' }, 500)
      }

      return c.json({ success: true, result })
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500)
    }
  }
)

// ============================================================================
// Get Source Content
// ============================================================================

/**
 * Get full content of a source
 * GET /api/sources/content/:sourceId
 */
sources.get('/content/:sourceId', async (c) => {
  const auth = requireAuth(c)
  const sourceId = c.req.param('sourceId')

  const { createSourceStorage } = await import('@inkdown/ai/sources')
  const storage = createSourceStorage(auth.supabase, auth.userId)

  try {
    const source = await storage.getSource(sourceId)

    if (!source) {
      return c.json({ error: 'Source not found' }, 404)
    }

    return c.json({
      success: true,
      content: source.content,
      chunks: source.chunks,
      metadata: {
        title: source.title,
        wordCount: source.wordCount,
        pageCount: source.pageCount,
        type: source.type,
      },
    })
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// ============================================================================
// WILDCARD PATHS LAST
// ============================================================================

// ============================================================================
// Get Combined Content (for AI Agent)
// ============================================================================

/**
 * Get all source content combined for AI context
 * GET /api/sources/:noteId/combined
 */
sources.get('/:noteId/combined', async (c) => {
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
    return c.json({ error: 'Note not found' }, 404)
  }

  const { createSourceStorage } = await import('@inkdown/ai/sources')
  const storage = createSourceStorage(auth.supabase, auth.userId)

  try {
    const content = await storage.getAllContent(noteId)
    const sourcesWithRefs = await storage.getContentWithRefs(noteId)

    return c.json({
      success: true,
      content,
      sources: sourcesWithRefs,
    })
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// ============================================================================
// List Sources
// ============================================================================

/**
 * Get all sources for a note
 * GET /api/sources/:noteId
 */
sources.get('/:noteId', async (c) => {
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
    return c.json({ error: 'Note not found' }, 404)
  }

  const { createSourceStorage } = await import('@inkdown/ai/sources')
  const storage = createSourceStorage(auth.supabase, auth.userId)

  try {
    const sourcesData = await storage.getSourcesForNote(noteId)
    const wordCount = await storage.getTotalWordCount(noteId)

    return c.json({
      success: true,
      sources: sourcesData,
      totalWordCount: wordCount,
    })
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// ============================================================================
// Delete Source
// ============================================================================

/**
 * Delete a source
 * DELETE /api/sources/:sourceId
 */
sources.delete('/:sourceId', async (c) => {
  const auth = requireAuth(c)
  const sourceId = c.req.param('sourceId')

  const { createSourceStorage } = await import('@inkdown/ai/sources')
  const storage = createSourceStorage(auth.supabase, auth.userId)

  try {
    const success = await storage.deleteSource(sourceId)

    if (!success) {
      return c.json({ error: 'Failed to delete source' }, 500)
    }

    return c.json({ success: true })
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500)
  }
})

export default sources
