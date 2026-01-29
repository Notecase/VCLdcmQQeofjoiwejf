/**
 * Slides API Routes
 *
 * Hono routes for Gemini-powered slide generation.
 * Generates text outlines and visual slides from note content.
 */

import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { authMiddleware, requireAuth } from '../middleware/auth'

const slides = new Hono()

// Apply auth middleware
slides.use('*', authMiddleware)

// ============================================================================
// Request Schemas
// ============================================================================

const GenerateOutlineSchema = z.object({
  noteId: z.string().uuid(),
  noteContent: z.string().min(10).optional(),
  maxSlides: z.number().int().min(1).max(14).optional().default(8),
})

const GenerateSlidesSchema = z.object({
  noteId: z.string().uuid(),
  noteContent: z.string().min(10).optional(),
  maxSlides: z.number().int().min(1).max(14).optional().default(8),
  theme: z
    .enum(['Technical/Engineering', 'Organic/Biological', 'History/Paper', 'Modern/Abstract'])
    .optional(),
})

// ============================================================================
// Themes
// ============================================================================

/**
 * Get available slide themes
 * GET /api/slides/themes
 */
slides.get('/themes', async (c) => {
  const { THEME_LIST } = await import('@inkdown/ai')

  return c.json({
    themes: THEME_LIST.map((t) => ({
      name: t.name,
      displayName: t.displayName,
      description: t.description,
      colors: {
        primary: t.primaryColor,
        accent: t.accentColor,
      },
    })),
  })
})

// ============================================================================
// Outline Generation
// ============================================================================

/**
 * Generate text outline from note content
 * POST /api/slides/outline
 */
slides.post('/outline', zValidator('json', GenerateOutlineSchema), async (c) => {
  const auth = requireAuth(c)
  const body = c.req.valid('json')
  const geminiApiKey = process.env.GOOGLE_AI_API_KEY

  if (!geminiApiKey) {
    return c.json({ error: 'Google AI API key not configured' }, 500)
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

  if (!noteContent || noteContent.length < 10) {
    return c.json({ error: 'Note content is too short' }, 400)
  }

  const { createGeminiProvider } = await import('@inkdown/ai')
  const provider = createGeminiProvider({ apiKey: geminiApiKey })

  try {
    const outlines = await provider.generateSlideOutline(noteContent, {
      maxSlides: body.maxSlides,
    })

    return c.json({
      success: true,
      outlines,
      count: outlines.length,
    })
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// ============================================================================
// Full Slide Generation (with SSE progress)
// ============================================================================

/**
 * Generate slide images with progress streaming
 * POST /api/slides/generate
 */
slides.post('/generate', zValidator('json', GenerateSlidesSchema), async (c) => {
  const auth = requireAuth(c)
  const body = c.req.valid('json')
  const geminiApiKey = process.env.GOOGLE_AI_API_KEY

  if (!geminiApiKey) {
    return c.json({ error: 'Google AI API key not configured' }, 500)
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

  if (!noteContent || noteContent.length < 10) {
    return c.json({ error: 'Note content is too short' }, 400)
  }

  // Check Accept header for SSE
  const acceptSSE = c.req.header('Accept')?.includes('text/event-stream')

  const { createGeminiProvider } = await import('@inkdown/ai')
  const provider = createGeminiProvider({ apiKey: geminiApiKey })

  if (acceptSSE) {
    return streamSSE(c, async (stream) => {
      try {
        const slides = await provider.generateSlideImages(
          noteContent!,
          {
            maxSlides: body.maxSlides,
            theme: body.theme,
          },
          async (progress) => {
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
    const slides = await provider.generateSlideImages(noteContent, {
      maxSlides: body.maxSlides,
      theme: body.theme,
    })

    return c.json({
      success: true,
      slides,
      count: slides.length,
    })
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// ============================================================================
// Single Slide Generation
// ============================================================================

/**
 * Generate a single slide for a specific topic
 * POST /api/slides/single
 */
slides.post(
  '/single',
  zValidator(
    'json',
    z.object({
      topic: z.string().min(1).max(500),
      type: z
        .enum(['architecture', 'concept', 'process', 'graph', 'comparison', 'overview'])
        .optional()
        .default('concept'),
      theme: z
        .enum(['Technical/Engineering', 'Organic/Biological', 'History/Paper', 'Modern/Abstract'])
        .optional(),
    })
  ),
  async (c) => {
    const body = c.req.valid('json')
    const geminiApiKey = process.env.GOOGLE_AI_API_KEY

    if (!geminiApiKey) {
      return c.json({ error: 'Google AI API key not configured' }, 500)
    }

    // Gemini provider will be used for image generation in the future
    // const { createGeminiProvider } = await import('@inkdown/ai')
    // const provider = createGeminiProvider({ apiKey: geminiApiKey })
    void geminiApiKey // Marked as used for future implementation

    try {
      // For now, return text-based slide (image generation requires Gemini Image API)
      return c.json({
        success: true,
        slide: {
          index: 1,
          title: body.topic,
          type: body.type,
          imageData: '', // Image generation requires Gemini Image API
          caption: `Figure 1: ${body.topic}`,
        },
      })
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500)
    }
  }
)

export default slides
