/**
 * Recommendation API Routes
 *
 * Hono routes for AI-powered recommendation generation.
 * Generates mindmaps, flashcards, concepts, exercises, resources, and slides.
 */

import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { authMiddleware, requireAuth } from '../middleware/auth'
import { creditGuard, requestContextMiddleware } from '../middleware/credits'

const recommend = new Hono()

// Apply auth middleware
recommend.use('*', authMiddleware)
recommend.use('*', creditGuard)
recommend.use('*', requestContextMiddleware)

// ============================================================================
// Request Schemas
// ============================================================================

const GenerateAllSchema = z.object({
  noteId: z.string().uuid(),
  noteContent: z.string().min(10).optional(),
  types: z
    .array(z.enum(['mindmap', 'flashcards', 'concepts', 'exercises', 'resources']))
    .optional(),
})

const GenerateTypeSchema = z.object({
  noteId: z.string().uuid(),
  noteContent: z.string().min(10).optional(),
})

const GenerateSlidesSchema = z.object({
  noteId: z.string().uuid(),
  noteContent: z.string().min(10).optional(),
  numSlides: z.number().int().min(1).max(14).optional().default(8),
  theme: z
    .enum(['Technical/Engineering', 'Organic/Biological', 'History/Paper', 'Modern/Abstract'])
    .optional(),
})

// ============================================================================
// Generate All Recommendations
// ============================================================================

/**
 * Generate all recommendations for a note
 * POST /api/recommend/generate
 */
recommend.post('/generate', zValidator('json', GenerateAllSchema), async (c) => {
  const auth = requireAuth(c)
  const body = c.req.valid('json')
  const openaiApiKey = process.env.OPENAI_API_KEY

  if (!openaiApiKey) {
    return c.json({ error: 'OpenAI API key not configured' }, 500)
  }

  // Get note content if not provided
  let noteContent = body.noteContent
  if (!noteContent) {
    const { data: note, error } = await auth.supabase
      .from('notes')
      .select('content')
      .eq('id', body.noteId)
      .eq('user_id', auth.userId)
      .single()

    if (error || !note) {
      return c.json({ error: 'Note not found' }, 404)
    }

    noteContent = note.content
  }

  // Dynamically import recommendation service
  const { analyzeNoteForRecommendations } = await import('@inkdown/ai')

  if (!noteContent) {
    return c.json({ error: 'Note content not available' }, 400)
  }

  try {
    const recommendations = await analyzeNoteForRecommendations(
      body.noteId,
      noteContent,
      openaiApiKey,
      body.types
    )

    return c.json({
      success: true,
      data: recommendations,
      cached: false,
    })
  } catch (error) {
    return c.json(
      {
        success: false,
        error: String(error),
      },
      500
    )
  }
})

// ============================================================================
// Generate Specific Type
// ============================================================================

/**
 * Generate mindmap
 * POST /api/recommend/mindmap
 */
recommend.post('/mindmap', zValidator('json', GenerateTypeSchema), async (c) => {
  const auth = requireAuth(c)
  const body = c.req.valid('json')
  const openaiApiKey = process.env.OPENAI_API_KEY

  if (!openaiApiKey) {
    return c.json({ error: 'OpenAI API key not configured' }, 500)
  }

  let noteContent = body.noteContent
  if (!noteContent) {
    const { data: note } = await auth.supabase
      .from('notes')
      .select('content')
      .eq('id', body.noteId)
      .eq('user_id', auth.userId)
      .single()

    noteContent = note?.content
  }

  if (!noteContent) {
    return c.json({ error: 'Note content not available' }, 400)
  }

  const { generateMindmap } = await import('@inkdown/ai')

  try {
    const mindmap = await generateMindmap(body.noteId, noteContent, openaiApiKey)
    return c.json({ success: true, data: mindmap })
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500)
  }
})

/**
 * Generate flashcards
 * POST /api/recommend/flashcards
 */
recommend.post('/flashcards', zValidator('json', GenerateTypeSchema), async (c) => {
  const auth = requireAuth(c)
  const body = c.req.valid('json')
  const openaiApiKey = process.env.OPENAI_API_KEY

  if (!openaiApiKey) {
    return c.json({ error: 'OpenAI API key not configured' }, 500)
  }

  let noteContent = body.noteContent
  if (!noteContent) {
    const { data: note } = await auth.supabase
      .from('notes')
      .select('content')
      .eq('id', body.noteId)
      .eq('user_id', auth.userId)
      .single()

    noteContent = note?.content
  }

  if (!noteContent) {
    return c.json({ error: 'Note content not available' }, 400)
  }

  const { generateFlashcards } = await import('@inkdown/ai')

  try {
    console.log('[API] generateFlashcards - noteId:', body.noteId)
    console.log('[API] generateFlashcards - noteContent length:', noteContent.length)
    const flashcards = await generateFlashcards(body.noteId, noteContent, openaiApiKey)
    console.log('[API] generateFlashcards - result:', flashcards?.length || 0, 'items')
    return c.json({ success: true, data: flashcards })
  } catch (error) {
    console.error('[API] generateFlashcards - ERROR:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

/**
 * Generate concepts
 * POST /api/recommend/concepts
 */
recommend.post('/concepts', zValidator('json', GenerateTypeSchema), async (c) => {
  const auth = requireAuth(c)
  const body = c.req.valid('json')
  const openaiApiKey = process.env.OPENAI_API_KEY

  if (!openaiApiKey) {
    return c.json({ error: 'OpenAI API key not configured' }, 500)
  }

  let noteContent = body.noteContent
  if (!noteContent) {
    const { data: note } = await auth.supabase
      .from('notes')
      .select('content')
      .eq('id', body.noteId)
      .eq('user_id', auth.userId)
      .single()

    noteContent = note?.content
  }

  if (!noteContent) {
    return c.json({ error: 'Note content not available' }, 400)
  }

  const { generateConcepts } = await import('@inkdown/ai')

  try {
    console.log('[API] generateConcepts - noteId:', body.noteId)
    console.log('[API] generateConcepts - noteContent length:', noteContent.length)
    const concepts = await generateConcepts(body.noteId, noteContent, openaiApiKey)
    console.log('[API] generateConcepts - result:', concepts?.length || 0, 'items')
    return c.json({ success: true, data: concepts })
  } catch (error) {
    console.error('[API] generateConcepts - ERROR:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

/**
 * Generate exercises
 * POST /api/recommend/exercises
 */
recommend.post('/exercises', zValidator('json', GenerateTypeSchema), async (c) => {
  const auth = requireAuth(c)
  const body = c.req.valid('json')
  const openaiApiKey = process.env.OPENAI_API_KEY

  if (!openaiApiKey) {
    return c.json({ error: 'OpenAI API key not configured' }, 500)
  }

  let noteContent = body.noteContent
  if (!noteContent) {
    const { data: note } = await auth.supabase
      .from('notes')
      .select('content')
      .eq('id', body.noteId)
      .eq('user_id', auth.userId)
      .single()

    noteContent = note?.content
  }

  if (!noteContent) {
    return c.json({ error: 'Note content not available' }, 400)
  }

  const { generateExercises } = await import('@inkdown/ai')

  try {
    console.log('[API] generateExercises - noteId:', body.noteId)
    console.log('[API] generateExercises - noteContent length:', noteContent.length)
    const exercises = await generateExercises(body.noteId, noteContent, openaiApiKey)
    console.log('[API] generateExercises - result:', exercises?.length || 0, 'items')
    return c.json({ success: true, data: exercises })
  } catch (error) {
    console.error('[API] generateExercises - ERROR:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

/**
 * Generate resources
 * POST /api/recommend/resources
 */
recommend.post('/resources', zValidator('json', GenerateTypeSchema), async (c) => {
  const auth = requireAuth(c)
  const body = c.req.valid('json')
  const openaiApiKey = process.env.OPENAI_API_KEY

  if (!openaiApiKey) {
    return c.json({ error: 'OpenAI API key not configured' }, 500)
  }

  let noteContent = body.noteContent
  if (!noteContent) {
    const { data: note } = await auth.supabase
      .from('notes')
      .select('content')
      .eq('id', body.noteId)
      .eq('user_id', auth.userId)
      .single()

    noteContent = note?.content
  }

  if (!noteContent) {
    return c.json({ error: 'Note content not available' }, 400)
  }

  const { generateResources } = await import('@inkdown/ai')

  try {
    console.log('[API] generateResources - noteId:', body.noteId)
    console.log('[API] generateResources - noteContent length:', noteContent.length)
    const resources = await generateResources(body.noteId, noteContent, openaiApiKey)
    console.log('[API] generateResources - result:', resources?.length || 0, 'items')
    return c.json({ success: true, data: resources })
  } catch (error) {
    console.error('[API] generateResources - ERROR:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// ============================================================================
// Slides Generation (with SSE progress)
// ============================================================================

/**
 * Generate slides with progress streaming
 * POST /api/recommend/slides
 */
recommend.post('/slides', zValidator('json', GenerateSlidesSchema), async (c) => {
  const auth = requireAuth(c)
  const body = c.req.valid('json')
  const geminiApiKey = process.env.GOOGLE_AI_API_KEY

  if (!geminiApiKey) {
    return c.json({ error: 'Google AI API key not configured' }, 500)
  }

  let noteContent = body.noteContent
  if (!noteContent) {
    const { data: note } = await auth.supabase
      .from('notes')
      .select('content')
      .eq('id', body.noteId)
      .eq('user_id', auth.userId)
      .single()

    noteContent = note?.content
  }

  if (!noteContent) {
    return c.json({ error: 'Note content not available' }, 400)
  }

  // Capture validated content for use in async callback
  const validatedContent = noteContent

  // Check Accept header for SSE
  const acceptSSE = c.req.header('Accept')?.includes('text/event-stream')

  const { generateSlides } = await import('@inkdown/ai')

  if (acceptSSE) {
    return streamSSE(c, async (stream) => {
      try {
        const slides = await generateSlides(
          body.noteId,
          validatedContent,
          geminiApiKey,
          body.numSlides,
          async (progress: {
            currentSlide: number
            totalSlides: number
            status: string
            message: string
          }) => {
            await stream.writeSSE({
              data: JSON.stringify({ type: 'progress', ...progress }),
            })
          }
        )

        await stream.writeSSE({
          data: JSON.stringify({ type: 'complete', slides }),
        })
      } catch (error) {
        await stream.writeSSE({
          data: JSON.stringify({ type: 'error', error: String(error) }),
        })
      }
    })
  }

  try {
    const slides = await generateSlides(body.noteId, noteContent, geminiApiKey, body.numSlides)

    return c.json({ success: true, slides })
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// ============================================================================
// Cache Management
// ============================================================================

/**
 * Get cached recommendations for a note
 * GET /api/recommend/:noteId
 */
recommend.get('/:noteId', async (c) => {
  const auth = requireAuth(c)
  const noteId = c.req.param('noteId')

  // Verify note ownership
  const { data: note, error } = await auth.supabase
    .from('notes')
    .select('id')
    .eq('id', noteId)
    .eq('user_id', auth.userId)
    .single()

  if (error || !note) {
    return c.json({ error: 'Note not found' }, 404)
  }

  // Note: Cache is in-memory, so this won't persist across requests
  // In production, you'd want to use Redis or similar
  return c.json({
    noteId,
    data: null,
    message: 'Use POST /api/recommend/generate to create recommendations',
  })
})

/**
 * Clear cache for a note
 * DELETE /api/recommend/:noteId
 */
recommend.delete('/:noteId', async (c) => {
  const auth = requireAuth(c)
  const noteId = c.req.param('noteId')

  // Verify note ownership
  const { data: note, error } = await auth.supabase
    .from('notes')
    .select('id')
    .eq('id', noteId)
    .eq('user_id', auth.userId)
    .single()

  if (error || !note) {
    return c.json({ error: 'Note not found' }, 404)
  }

  const { clearRecommendationCache } = await import('@inkdown/ai')
  clearRecommendationCache(noteId)

  return c.json({ success: true, message: 'Cache cleared' })
})

export default recommend
