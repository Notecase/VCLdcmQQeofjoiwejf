/**
 * Course API Routes
 *
 * Hono routes for AI-powered course generation lifecycle:
 * - POST /generate                     — Start course generation (returns courseId/threadId)
 * - GET  /generate/:threadId/stream    — SSE stream from orchestrator
 * - GET  /generate/:threadId/status    — Poll generation status
 * - POST /generate/:threadId/approve   — Approve outline (resolve interrupt)
 * - POST /generate/:threadId/reject    — Reject outline with feedback (resolve interrupt)
 * - POST /generate/:threadId/cancel    — Cancel generation
 * - GET  /                             — List user's courses
 * - GET  /list                         — Alias for GET /
 * - GET  /:id                          — Get full course with modules/lessons
 * - PUT  /:courseId/lesson/:lessonId/complete   — Mark lesson complete (original)
 * - POST /:courseId/lessons/:lessonId/complete  — Mark lesson complete (frontend alias)
 * - POST /:courseId/quiz/:lessonId/submit       — Submit quiz attempt (original)
 * - POST /:courseId/lessons/:lessonId/quiz      — Submit quiz attempt (frontend alias)
 * - DELETE /:id                        — Delete a course
 */

import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { handleError, ErrorCode } from '@inkdown/shared'
import type { CourseOrchestrator } from '@inkdown/ai/agents'
import { authMiddleware, requireAuth } from '../middleware/auth'
import { creditGuard, requestContextMiddleware } from '../middleware/credits'
import { rateLimitMiddleware } from '../middleware/rate-limit'
import { getServiceClient } from '../lib/supabase'
import type { CourseOutline, CourseSettings } from '@inkdown/shared/types'
import {
  buildMissingTerminalEventErrorMessage,
  shouldMarkThreadAsErrorAfterStreamEnd,
} from './course.stream-terminal'

const course = new Hono()

// Apply auth middleware
course.use('*', authMiddleware)
course.use('*', creditGuard)
course.use('*', requestContextMiddleware)
course.use('*', rateLimitMiddleware())

// ============================================================================
// Orchestrator Registry (like research.ts agentRegistry)
// ============================================================================

interface OrchestratorEntry {
  orchestrator: CourseOrchestrator
  expiresAt: number
  streaming: boolean
}

const orchestratorRegistry = new Map<string, OrchestratorEntry>()

function cleanupRegistry() {
  const now = Date.now()
  for (const [key, entry] of orchestratorRegistry) {
    if (entry.expiresAt < now) orchestratorRegistry.delete(key)
  }
}

// Cleanup on each request (lightweight — only iterates expired entries)
let lastCleanup = 0
function maybeCleanup() {
  const now = Date.now()
  if (now - lastCleanup > 300_000) {
    lastCleanup = now
    cleanupRegistry()
  }
}
course.use('*', async (_c, next) => {
  maybeCleanup()
  await next()
})

// ============================================================================
// Default Settings
// ============================================================================

const DEFAULT_SETTINGS: CourseSettings = {
  includeVideos: true,
  includeSlides: true,
  includePractice: true,
  includeQuizzes: true,
  estimatedWeeks: 4,
  hoursPerWeek: 5,
  focusAreas: [],
  maxSlidesPerLesson: 10,
}

// ============================================================================
// Generation Lifecycle
// ============================================================================

const GenerateSchema = z.object({
  topic: z.string().min(1).max(500),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']).default('intermediate'),
  settings: z
    .object({
      includeVideos: z.boolean().optional(),
      includeSlides: z.boolean().optional(),
      includePractice: z.boolean().optional(),
      includeQuizzes: z.boolean().optional(),
      estimatedWeeks: z.number().int().min(1).max(52).optional(),
      hoursPerWeek: z.number().min(1).max(40).optional(),
      focusAreas: z.array(z.string()).optional(),
      maxSlidesPerLesson: z.number().int().min(1).max(50).optional(),
      quickTest: z.boolean().optional(),
    })
    .optional(),
  focusAreas: z.array(z.string()).optional(),
})

/**
 * POST /api/course/generate
 * Start course generation — creates DB records and returns courseId/threadId.
 * Client should immediately connect to GET /generate/:threadId/stream for SSE events.
 */
course.post('/generate', zValidator('json', GenerateSchema), async (c) => {
  const auth = requireAuth(c)
  const body = c.req.valid('json')

  // Safety: detect potential prompt injection
  const { detectInjection } = await import('@inkdown/ai/safety')
  const { aiSafetyLog } = await import('@inkdown/ai/observability')
  const injectionCheck = detectInjection(body.topic)
  if (injectionCheck.detected) {
    aiSafetyLog(injectionCheck.shouldBlock ? 'injection_blocked' : 'injection_detected', {
      userId: auth.userId,
      patterns: injectionCheck.patterns,
      route: 'course-generate',
      inputLength: body.topic.length,
    })
    if (injectionCheck.shouldBlock) {
      return c.json(
        {
          error: {
            message:
              'Your message was flagged by our safety system. Please rephrase and try again.',
            code: 'INJECTION_BLOCKED',
          },
        },
        400
      )
    }
  }

  const openaiApiKey = process.env.OPENAI_API_KEY
  const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY

  if (!openaiApiKey || !geminiApiKey) {
    return c.json({ error: 'AI API keys not configured' }, 500)
  }

  const courseId = crypto.randomUUID()
  const threadId = crypto.randomUUID()
  const mergedSettings: CourseSettings = {
    ...DEFAULT_SETTINGS,
    ...body.settings,
    focusAreas: body.focusAreas ?? body.settings?.focusAreas ?? DEFAULT_SETTINGS.focusAreas,
  }

  // Create course record
  const { error: courseError } = await auth.supabase.from('courses').insert({
    id: courseId,
    user_id: auth.userId,
    title: `Course: ${body.topic}`,
    topic: body.topic,
    description: '',
    difficulty: body.difficulty,
    estimated_hours: 0,
    prerequisites: [],
    learning_objectives: [],
    status: 'generating',
    progress: 0,
    settings: mergedSettings,
    research_report: null,
    thinking_trace: null,
    generated_at: null,
  })

  if (courseError) {
    return c.json({ error: `Failed to create course: ${courseError.message}` }, 500)
  }

  // Create generation thread record
  const { error: threadError } = await auth.supabase.from('course_generation_threads').insert({
    id: threadId,
    course_id: courseId,
    user_id: auth.userId,
    status: 'running',
    stage: 'research',
    topic: body.topic,
    difficulty: body.difficulty,
    settings: mergedSettings,
    focus_areas: body.focusAreas ?? [],
    outline: null,
    error: null,
    progress: 0,
    thinking_output: '',
    research_report: null,
    rag_index: null,
  })

  if (threadError) {
    return c.json({ error: `Failed to create generation thread: ${threadError.message}` }, 500)
  }

  // Create orchestrator and register for interrupt resolution (10 min TTL)
  const { CourseOrchestrator: OrchestratorClass } = await import('@inkdown/ai/agents')
  const { SharedContextService } = await import('@inkdown/ai/services')
  const orchestrator = new OrchestratorClass({
    supabase: getServiceClient(),
    userId: auth.userId,
    youtubeApiKey: process.env.YOUTUBE_API_KEY,
    sharedContextService: new SharedContextService(auth.supabase, auth.userId),
  })

  orchestratorRegistry.set(threadId, {
    orchestrator,
    expiresAt: Date.now() + 3_600_000,
    streaming: false,
  })

  return c.json({ courseId, threadId, status: 'running' })
})

/**
 * GET /api/course/generate/:threadId/stream
 * SSE stream — streams events directly from the CourseOrchestrator.
 * If no orchestrator is registered yet (e.g. reconnect), creates one and starts generation.
 */
course.get('/generate/:threadId/stream', async (c) => {
  const auth = requireAuth(c)
  const threadId = c.req.param('threadId')

  // Verify thread ownership
  const { data: thread, error } = await auth.supabase
    .from('course_generation_threads')
    .select('*')
    .eq('id', threadId)
    .eq('user_id', auth.userId)
    .single()

  if (error || !thread) {
    return c.json({ error: 'Thread not found' }, 404)
  }

  // If no orchestrator registered, create one (handles reconnects)
  if (!orchestratorRegistry.has(threadId)) {
    const { CourseOrchestrator: OrchestratorClass } = await import('@inkdown/ai/agents')
    const { SharedContextService } = await import('@inkdown/ai/services')
    const orchestrator = new OrchestratorClass({
      supabase: getServiceClient(),
      userId: auth.userId,
      youtubeApiKey: process.env.YOUTUBE_API_KEY,
      sharedContextService: new SharedContextService(auth.supabase, auth.userId),
    })

    orchestratorRegistry.set(threadId, {
      orchestrator,
      expiresAt: Date.now() + 3_600_000,
      streaming: false,
    })
  }

  const entry = orchestratorRegistry.get(threadId)
  if (!entry) {
    return c.json({ error: 'Orchestrator not found' }, 500)
  }

  if (entry.streaming) {
    return c.json({ error: 'Generation already streaming on another connection' }, 409)
  }
  entry.streaming = true

  const orchestrator = entry.orchestrator

  const serviceDb = getServiceClient()

  return streamSSE(c, async (stream) => {
    let clientConnected = true

    // Heartbeat: send keepalive every 15s to prevent proxy/browser from killing idle SSE
    const heartbeatInterval = setInterval(async () => {
      if (!clientConnected) return
      try {
        await stream.writeSSE({ event: 'heartbeat', data: '' })
      } catch {
        // Client disconnected; continue backend generation and DB status updates.
        clientConnected = false
      }
    }, 15_000)

    let lastKnownStage = 'research'
    let observedTerminalEvent = false

    try {
      for await (const event of orchestrator.stream({
        topic: thread.topic as string,
        difficulty: thread.difficulty as string,
        settings: thread.settings as CourseSettings,
        focusAreas: (thread.focus_areas as string[]) ?? [],
        courseId: thread.course_id as string,
      })) {
        // Proactively detect client disconnect via abort signal.
        // Unlike other routes, course generation must continue for DB consistency,
        // so we set clientConnected=false instead of breaking.
        if (c.req.raw.signal.aborted && clientConnected) {
          clientConnected = false
          console.warn(
            `[Course SSE] Client abort signal detected for thread ${threadId}; continuing generation in background.`
          )
        }

        if (clientConnected) {
          try {
            await stream.writeSSE({
              event: event.event,
              data: JSON.stringify(event),
            })
          } catch {
            // Client disconnected — keep processing generation so DB state still reaches complete/error.
            clientConnected = false
            console.warn(
              `[Course SSE] Client disconnected for thread ${threadId}; continuing generation in background.`
            )
          }
        }

        // Update thread in DB for status tracking / polling fallback
        if (event.event === 'progress') {
          const progressData = event.data as unknown as Record<string, unknown>
          if (typeof progressData.stage === 'string') {
            lastKnownStage = progressData.stage
          }
          await serviceDb
            .from('course_generation_threads')
            .update({
              stage: progressData.stage,
              progress: progressData.overallProgress,
              thinking_output: progressData.thinkingOutput ?? '',
            })
            .eq('id', threadId)
        }

        if (event.event === 'interrupt') {
          const interruptData = event.data as unknown as {
            type: string
            outline?: CourseOutline
            thinking?: string
          }
          if (interruptData.type === 'outline_approval' && interruptData.outline) {
            lastKnownStage = 'approval'
            const { error: interruptUpdateError } = await serviceDb
              .from('course_generation_threads')
              .update({
                status: 'awaiting_approval',
                stage: 'approval',
                outline: interruptData.outline,
                thinking_output: interruptData.thinking ?? '',
              })
              .eq('id', threadId)

            if (interruptUpdateError) {
              console.error(
                `[Course SSE] Failed to update thread ${threadId} to awaiting_approval:`,
                interruptUpdateError.message
              )
            }
          }
        }

        if (event.event === 'complete') {
          observedTerminalEvent = true
          await serviceDb
            .from('course_generation_threads')
            .update({ status: 'complete', stage: 'complete', progress: 100 })
            .eq('id', threadId)

          await serviceDb
            .from('courses')
            .update({ status: 'ready', updated_at: new Date().toISOString() })
            .eq('id', thread.course_id)

          // Clean up registry
          orchestratorRegistry.delete(threadId)
        }

        if (event.event === 'error') {
          observedTerminalEvent = true
          const errorData = event.data as { message: string; stage?: string }
          const errorStage = typeof errorData.stage === 'string' ? errorData.stage : lastKnownStage
          lastKnownStage = errorStage
          await serviceDb
            .from('course_generation_threads')
            .update({ status: 'error', stage: errorStage, error: errorData.message })
            .eq('id', threadId)

          orchestratorRegistry.delete(threadId)
        }
      }

      if (!observedTerminalEvent) {
        try {
          const { data: latestThread } = await serviceDb
            .from('course_generation_threads')
            .select('status')
            .eq('id', threadId)
            .single()

          if (
            shouldMarkThreadAsErrorAfterStreamEnd(
              latestThread?.status as string | null | undefined,
              observedTerminalEvent
            )
          ) {
            const diagnosticError = buildMissingTerminalEventErrorMessage(lastKnownStage)
            await serviceDb
              .from('course_generation_threads')
              .update({ status: 'error', stage: lastKnownStage, error: diagnosticError })
              .eq('id', threadId)

            if (clientConnected) {
              try {
                await stream.writeSSE({
                  event: 'error',
                  data: JSON.stringify({
                    event: 'error',
                    data: { message: diagnosticError, stage: lastKnownStage },
                  }),
                })
              } catch {
                clientConnected = false
              }
            }

            observedTerminalEvent = true
            orchestratorRegistry.delete(threadId)
          }
        } catch (streamEndError) {
          console.error(
            `[Course SSE] Failed to enforce terminal status for thread ${threadId}:`,
            streamEndError
          )
        }
      }

      // Stream ended normally — send explicit done as defense-in-depth
      if (clientConnected) {
        try {
          await stream.writeSSE({ event: 'done', data: JSON.stringify({ event: 'done' }) })
        } catch {
          // Stream may already be closed
        }
      }
    } catch (err) {
      const appError = handleError(err, ErrorCode.AI_PROVIDER_ERROR)
      if (clientConnected) {
        try {
          await stream.writeSSE({
            event: 'error',
            data: JSON.stringify({
              event: 'error',
              data: { message: appError.userMessage, stage: lastKnownStage },
            }),
          })
        } catch {
          // Ignore stream write errors; DB status update below is authoritative.
          clientConnected = false
        }
      }

      // Update thread status to error
      try {
        await serviceDb
          .from('course_generation_threads')
          .update({ status: 'error', stage: lastKnownStage, error: appError.userMessage })
          .eq('id', threadId)
      } catch {
        // Best-effort error status update
      }

      orchestratorRegistry.delete(threadId)
    } finally {
      clearInterval(heartbeatInterval)
      // Reset streaming flag so reconnects work
      const e = orchestratorRegistry.get(threadId)
      if (e) e.streaming = false
    }
  })
})

/**
 * GET /api/course/generate/:threadId/status
 * Poll generation status (non-SSE fallback)
 */
course.get('/generate/:threadId/status', async (c) => {
  const auth = requireAuth(c)
  const threadId = c.req.param('threadId')

  const { data: thread, error } = await auth.supabase
    .from('course_generation_threads')
    .select('*')
    .eq('id', threadId)
    .eq('user_id', auth.userId)
    .single()

  if (error || !thread) {
    return c.json({ error: 'Thread not found' }, 404)
  }

  return c.json({
    threadId: thread.id,
    courseId: thread.course_id,
    status: thread.status,
    stage: thread.stage,
    progress: thread.progress,
    outline: thread.outline,
    error: thread.error,
    thinkingOutput: thread.thinking_output,
  })
})

const ApproveSchema = z.object({
  modifiedOutline: z.any().optional(),
})

/**
 * POST /api/course/generate/:threadId/approve
 * Approve outline — resolves orchestrator interrupt and resumes generation.
 */
course.post('/generate/:threadId/approve', zValidator('json', ApproveSchema), async (c) => {
  const auth = requireAuth(c)
  const threadId = c.req.param('threadId')
  const body = c.req.valid('json')

  // Verify thread ownership and status
  const { data: thread, error } = await auth.supabase
    .from('course_generation_threads')
    .select('*')
    .eq('id', threadId)
    .eq('user_id', auth.userId)
    .single()

  if (error || !thread) {
    return c.json({ error: 'Thread not found' }, 404)
  }

  if (thread.status !== 'awaiting_approval') {
    // Idempotency: duplicate approvals after a successful first approval should be harmless.
    if (thread.status === 'generating_content' || thread.status === 'complete') {
      return c.json({ status: thread.status, threadId, alreadyProcessed: true })
    }
    console.warn(
      `[Course Approve] Thread ${threadId} status is "${thread.status}", expected "awaiting_approval"`
    )
    return c.json({ error: `Cannot approve: thread status is "${thread.status}"` }, 400)
  }

  // Try to resolve via orchestrator interrupt
  cleanupRegistry()
  const entry = orchestratorRegistry.get(threadId)

  if (entry) {
    const resolved = entry.orchestrator.resolveInterrupt({
      decision: 'approve',
      message: 'Outline approved',
      editedArgs: body.modifiedOutline ? { outline: body.modifiedOutline } : undefined,
    })

    if (!resolved) {
      // Resolve may already have been processed by a concurrent request.
      // Re-check thread status and return idempotent success if already moved on.
      const { data: latestThread } = await auth.supabase
        .from('course_generation_threads')
        .select('status')
        .eq('id', threadId)
        .eq('user_id', auth.userId)
        .single()

      if (latestThread?.status === 'generating_content' || latestThread?.status === 'complete') {
        return c.json({ status: latestThread.status, threadId, alreadyProcessed: true })
      }

      console.warn(
        `[Course Approve] Thread ${threadId}: resolveInterrupt() returned false (no pending interrupt)`
      )
      return c.json({ error: 'No pending interrupt to resolve' }, 400)
    }

    // Extend TTL since orchestrator is still active
    entry.expiresAt = Date.now() + 3_600_000
  } else {
    // Orchestrator lost (server restart, TTL expiry, etc.) — fail honestly
    console.warn(
      `[Course Approve] Orchestrator not found for thread ${threadId}. Cannot resume generation.`
    )
    return c.json(
      {
        error:
          'Generation process was lost (server may have restarted). Please start a new generation.',
      },
      400
    )
  }

  // Update thread status to generating_content
  await auth.supabase
    .from('course_generation_threads')
    .update({ status: 'generating_content', stage: 'content' })
    .eq('id', threadId)

  return c.json({ status: 'generating_content', threadId })
})

const RejectSchema = z.object({
  feedback: z.string().min(1).max(5000),
})

/**
 * POST /api/course/generate/:threadId/reject
 * Reject outline with feedback — resolves orchestrator interrupt with rejection.
 */
course.post('/generate/:threadId/reject', zValidator('json', RejectSchema), async (c) => {
  const auth = requireAuth(c)
  const threadId = c.req.param('threadId')
  const { feedback } = c.req.valid('json')

  const { data: thread, error } = await auth.supabase
    .from('course_generation_threads')
    .select('*')
    .eq('id', threadId)
    .eq('user_id', auth.userId)
    .single()

  if (error || !thread) {
    return c.json({ error: 'Thread not found' }, 404)
  }

  if (thread.status !== 'awaiting_approval') {
    return c.json({ error: `Cannot reject: thread status is "${thread.status}"` }, 400)
  }

  // Try to resolve via orchestrator interrupt
  cleanupRegistry()
  const entry = orchestratorRegistry.get(threadId)

  if (entry) {
    const resolved = entry.orchestrator.resolveInterrupt({
      decision: 'reject',
      message: feedback,
    })

    if (!resolved) {
      return c.json({ error: 'No pending interrupt to resolve' }, 400)
    }

    entry.expiresAt = Date.now() + 3_600_000
  }

  // Update thread back to running/planning
  await auth.supabase
    .from('course_generation_threads')
    .update({ status: 'running', stage: 'planning', outline: null })
    .eq('id', threadId)

  return c.json({ status: 'running', threadId })
})

/**
 * POST /api/course/generate/:threadId/cancel
 * Cancel generation
 */
course.post('/generate/:threadId/cancel', async (c) => {
  const auth = requireAuth(c)
  const threadId = c.req.param('threadId')

  const { error } = await auth.supabase
    .from('course_generation_threads')
    .update({ status: 'cancelled' })
    .eq('id', threadId)
    .eq('user_id', auth.userId)

  if (error) {
    return c.json({ error: 'Failed to cancel generation' }, 500)
  }

  // Clean up orchestrator
  orchestratorRegistry.delete(threadId)

  return c.json({ status: 'cancelled', threadId })
})

// ============================================================================
// Course CRUD
// ============================================================================

/**
 * GET /api/course/
 * List user's courses
 */
course.get('/', async (c) => {
  const auth = requireAuth(c)

  const { data: courses, error } = await auth.supabase
    .from('courses')
    .select(
      'id, title, topic, description, difficulty, estimated_hours, learning_objectives, prerequisites, status, progress, created_at, updated_at, generated_at'
    )
    .eq('user_id', auth.userId)
    .order('created_at', { ascending: false })

  if (error) {
    return c.json({ error: `Failed to list courses: ${error.message}` }, 500)
  }

  return c.json({ courses: courses ?? [] })
})

/**
 * GET /api/course/list
 * Alias for GET / — matches frontend `fetchCourses()` call to `/api/course/list`
 */
course.get('/list', async (c) => {
  const auth = requireAuth(c)

  const { data: courses, error } = await auth.supabase
    .from('courses')
    .select(
      'id, title, topic, description, difficulty, estimated_hours, learning_objectives, prerequisites, status, progress, created_at, updated_at, generated_at'
    )
    .eq('user_id', auth.userId)
    .order('created_at', { ascending: false })

  if (error) {
    return c.json({ error: `Failed to list courses: ${error.message}` }, 500)
  }

  return c.json({ courses: courses ?? [] })
})

/**
 * GET /api/course/:id
 * Get full course with modules and lessons
 */
course.get('/:id', async (c) => {
  const auth = requireAuth(c)
  const courseId = c.req.param('id')

  // Get the course
  const { data: courseData, error: courseError } = await auth.supabase
    .from('courses')
    .select('*')
    .eq('id', courseId)
    .eq('user_id', auth.userId)
    .single()

  if (courseError || !courseData) {
    return c.json({ error: 'Course not found' }, 404)
  }

  // Get modules ordered by order
  const { data: modules, error: modulesError } = await auth.supabase
    .from('course_modules')
    .select('*')
    .eq('course_id', courseId)
    .order('order', { ascending: true })

  if (modulesError) {
    return c.json({ error: `Failed to load modules: ${modulesError.message}` }, 500)
  }

  // Get all lessons for all modules, ordered by order
  const moduleIds = (modules ?? []).map((m: { id: string }) => m.id)

  let lessons: Array<Record<string, unknown>> = []
  if (moduleIds.length > 0) {
    const { data: lessonData, error: lessonsError } = await auth.supabase
      .from('course_lessons')
      .select('*')
      .in('module_id', moduleIds)
      .order('order', { ascending: true })

    if (lessonsError) {
      return c.json({ error: `Failed to load lessons: ${lessonsError.message}` }, 500)
    }

    lessons = lessonData ?? []
  }

  // Group lessons into their modules
  const modulesWithLessons = (modules ?? []).map((mod: Record<string, unknown>) => ({
    ...mod,
    lessons: lessons.filter((l: Record<string, unknown>) => l.module_id === mod.id),
  }))

  // Get progress record
  const { data: progressData } = await auth.supabase
    .from('course_progress')
    .select('*')
    .eq('course_id', courseId)
    .eq('user_id', auth.userId)
    .single()

  return c.json({
    course: courseData,
    modules: modulesWithLessons,
    progress: progressData ?? null,
  })
})

// ============================================================================
// Lesson Completion
// ============================================================================

/**
 * Shared handler for marking a lesson as complete.
 * Used by both PUT and POST route variants.
 */
async function handleLessonComplete(
  auth: ReturnType<typeof requireAuth>,
  courseId: string,
  lessonId: string
) {
  const now = new Date().toISOString()

  // Verify course ownership
  const { data: courseData, error: courseCheckError } = await auth.supabase
    .from('courses')
    .select('id')
    .eq('id', courseId)
    .eq('user_id', auth.userId)
    .single()

  if (courseCheckError || !courseData) {
    return { error: 'Course not found', status: 404 as const }
  }

  // Update lesson status
  const { error: lessonError } = await auth.supabase
    .from('course_lessons')
    .update({ status: 'completed', completed_at: now })
    .eq('id', lessonId)

  if (lessonError) {
    return { error: `Failed to update lesson: ${lessonError.message}`, status: 500 as const }
  }

  // Recalculate progress
  const { data: allLessons } = await auth.supabase
    .from('course_lessons')
    .select('id, status, module_id')
    .in(
      'module_id',
      (await auth.supabase.from('course_modules').select('id').eq('course_id', courseId)).data?.map(
        (m: { id: string }) => m.id
      ) ?? []
    )

  const totalLessons = allLessons?.length ?? 0
  const completedLessons =
    allLessons?.filter((l: { status: string }) => l.status === 'completed').length ?? 0
  const totalProgress = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0

  // Upsert course_progress
  await auth.supabase.from('course_progress').upsert(
    {
      course_id: courseId,
      user_id: auth.userId,
      completed_lessons:
        allLessons
          ?.filter((l: { status: string }) => l.status === 'completed')
          .map((l: { id: string }) => l.id) ?? [],
      total_progress: totalProgress,
      last_accessed_at: now,
    },
    { onConflict: 'course_id,user_id' }
  )

  // Update course progress
  await auth.supabase
    .from('courses')
    .update({ progress: totalProgress, updated_at: now })
    .eq('id', courseId)

  return { data: { success: true, totalProgress, completedLessons, totalLessons } }
}

/**
 * PUT /api/course/:courseId/lesson/:lessonId/complete
 * Mark lesson complete (original route)
 */
course.put('/:courseId/lesson/:lessonId/complete', async (c) => {
  const auth = requireAuth(c)
  const result = await handleLessonComplete(auth, c.req.param('courseId'), c.req.param('lessonId'))

  if ('error' in result) {
    return c.json({ error: result.error }, result.status)
  }
  return c.json(result.data)
})

/**
 * POST /api/course/:courseId/lessons/:lessonId/complete
 * Mark lesson complete (frontend alias — uses POST + `lessons` plural)
 */
course.post('/:courseId/lessons/:lessonId/complete', async (c) => {
  const auth = requireAuth(c)
  const result = await handleLessonComplete(auth, c.req.param('courseId'), c.req.param('lessonId'))

  if ('error' in result) {
    return c.json({ error: result.error }, result.status)
  }
  return c.json(result.data)
})

// ============================================================================
// Quiz Submission
// ============================================================================

const QuizSubmitSchema = z.object({
  answers: z.record(z.union([z.number(), z.string()])),
})

/**
 * Shared handler for quiz submission.
 * Used by both original and alias routes.
 */
async function handleQuizSubmit(
  auth: ReturnType<typeof requireAuth>,
  courseId: string,
  lessonId: string,
  answers: Record<string, number | string>
) {
  // Verify course ownership
  const { data: courseData, error: courseCheckError } = await auth.supabase
    .from('courses')
    .select('id')
    .eq('id', courseId)
    .eq('user_id', auth.userId)
    .single()

  if (courseCheckError || !courseData) {
    return { error: 'Course not found', status: 404 as const }
  }

  // Get lesson content (contains practice problems with correct answers)
  const { data: lesson, error: lessonError } = await auth.supabase
    .from('course_lessons')
    .select('content')
    .eq('id', lessonId)
    .single()

  if (lessonError || !lesson) {
    return { error: 'Lesson not found', status: 404 as const }
  }

  const content = lesson.content as {
    practiceProblems?: Array<{ id: string; correctIndex?: number }>
  }
  const problems = content.practiceProblems ?? []

  if (problems.length === 0) {
    return { error: 'This lesson has no quiz questions', status: 400 as const }
  }

  // Grade answers
  let correct = 0
  for (const problem of problems) {
    const userAnswer = answers[problem.id]
    if (problem.correctIndex !== undefined && userAnswer === problem.correctIndex) {
      correct++
    }
  }

  const score = Math.round((correct / problems.length) * 100)
  const passed = score >= 70

  // Save quiz attempt
  const attemptId = crypto.randomUUID()
  await auth.supabase.from('quiz_attempts').insert({
    id: attemptId,
    lesson_id: lessonId,
    course_id: courseId,
    user_id: auth.userId,
    answers,
    score,
    passed,
    submitted_at: new Date().toISOString(),
  })

  // Update progress quiz scores
  const { data: progressData } = await auth.supabase
    .from('course_progress')
    .select('quiz_scores')
    .eq('course_id', courseId)
    .eq('user_id', auth.userId)
    .single()

  const quizScores = (progressData?.quiz_scores as Record<string, number>) ?? {}
  quizScores[lessonId] = score

  await auth.supabase.from('course_progress').upsert(
    {
      course_id: courseId,
      user_id: auth.userId,
      quiz_scores: quizScores,
      last_accessed_at: new Date().toISOString(),
    },
    { onConflict: 'course_id,user_id' }
  )

  return {
    data: { attemptId, score, passed, correct, total: problems.length },
  }
}

/**
 * POST /api/course/:courseId/quiz/:lessonId/submit
 * Submit quiz attempt (original route)
 */
course.post('/:courseId/quiz/:lessonId/submit', zValidator('json', QuizSubmitSchema), async (c) => {
  const auth = requireAuth(c)
  const { answers } = c.req.valid('json')
  const result = await handleQuizSubmit(
    auth,
    c.req.param('courseId'),
    c.req.param('lessonId'),
    answers
  )

  if ('error' in result) {
    return c.json({ error: result.error }, result.status)
  }
  return c.json(result.data)
})

/**
 * POST /api/course/:courseId/lessons/:lessonId/quiz
 * Submit quiz attempt (frontend alias — uses `lessons` plural + `/quiz` suffix)
 */
course.post(
  '/:courseId/lessons/:lessonId/quiz',
  zValidator('json', QuizSubmitSchema),
  async (c) => {
    const auth = requireAuth(c)
    const { answers } = c.req.valid('json')
    const result = await handleQuizSubmit(
      auth,
      c.req.param('courseId'),
      c.req.param('lessonId'),
      answers
    )

    if ('error' in result) {
      return c.json({ error: result.error }, result.status)
    }
    return c.json(result.data)
  }
)

// ============================================================================
// Delete Course
// ============================================================================

/**
 * DELETE /api/course/:id
 * Delete a course and cascade modules/lessons
 */
course.delete('/:id', async (c) => {
  const auth = requireAuth(c)
  const courseId = c.req.param('id')

  // Verify ownership
  const { data: courseData, error: courseCheckError } = await auth.supabase
    .from('courses')
    .select('id')
    .eq('id', courseId)
    .eq('user_id', auth.userId)
    .single()

  if (courseCheckError || !courseData) {
    return c.json({ error: 'Course not found' }, 404)
  }

  // Get module IDs for cascading
  const { data: modules } = await auth.supabase
    .from('course_modules')
    .select('id')
    .eq('course_id', courseId)

  const moduleIds = (modules ?? []).map((m: { id: string }) => m.id)

  // Delete lessons
  if (moduleIds.length > 0) {
    await auth.supabase.from('course_lessons').delete().in('module_id', moduleIds)
  }

  // Delete modules
  await auth.supabase.from('course_modules').delete().eq('course_id', courseId)

  // Delete progress records
  await auth.supabase.from('course_progress').delete().eq('course_id', courseId)

  // Delete quiz attempts
  await auth.supabase.from('quiz_attempts').delete().eq('course_id', courseId)

  // Delete generation threads
  await auth.supabase.from('course_generation_threads').delete().eq('course_id', courseId)

  // Delete the course (user_id filter for defense-in-depth beyond RLS)
  const { error: deleteError } = await auth.supabase
    .from('courses')
    .delete()
    .eq('id', courseId)
    .eq('user_id', auth.userId)

  if (deleteError) {
    return c.json({ error: `Failed to delete course: ${deleteError.message}` }, 500)
  }

  return c.json({ success: true })
})

export default course
