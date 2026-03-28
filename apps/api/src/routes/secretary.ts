/**
 * Secretary API Routes
 *
 * Hono routes for the AI Secretary feature:
 * - POST /chat — Streaming chat via SSE (with message persistence)
 * - GET /threads — List user's chat threads
 * - GET /threads/:threadId/messages — Get messages for a thread
 * - DELETE /threads/:threadId — Delete a thread
 * - PATCH /threads/:threadId — Update thread title
 * - GET /memory — Get all memory files
 * - GET /memory/:filename — Get specific memory file
 * - PUT /memory/:filename — Update memory file
 * - POST /initialize — Create default memory files
 * - POST /prepare-tomorrow — Trigger AI to generate tomorrow's plan
 * - POST /approve-tomorrow — Move Tomorrow.md → Today.md
 * - POST /day-transition — Trigger day transition manually
 * - GET /history — List archived daily plans
 */

import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { handleError, ErrorCode } from '@inkdown/shared'
import { getTodayDate } from '@inkdown/shared/secretary'
import { authMiddleware, requireAuth } from '../middleware/auth'
import { creditGuard, requestContextMiddleware } from '../middleware/credits'
import { rateLimitMiddleware } from '../middleware/rate-limit'

const secretary = new Hono()

function getTimezone(c: {
  req: { header: (name: string) => string | undefined }
}): string | undefined {
  return c.req.header('X-Timezone') || undefined
}

function isHardeningEnabled(): boolean {
  const raw = process.env.SECRETARY_PHASE5_HARDENING
  if (!raw) return true
  return !['0', 'false', 'off', 'no'].includes(raw.trim().toLowerCase())
}

function inferUpdatedFiles(toolName: string, args?: Record<string, unknown>): string[] {
  switch (toolName) {
    case 'write_memory_file':
      return typeof args?.filename === 'string' ? [args.filename] : []
    case 'save_roadmap': {
      const files = ['Plan.md']
      if (typeof args?.planId === 'string' && args.planId.trim()) {
        files.push(`Plans/${args.planId.toLowerCase()}-roadmap.md`)
      }
      return files
    }
    case 'generate_daily_plan':
      return [args?.isForTomorrow ? 'Tomorrow.md' : 'Today.md'].filter(Boolean) as string[]
    case 'modify_plan':
      return [args?.target === 'tomorrow' ? 'Tomorrow.md' : 'Today.md']
    case 'save_reflection':
      return ['Today.md']
    case 'activate_roadmap':
      return ['Plan.md']
    case 'create_plan_schedule':
      return ['plan_schedule']
    default:
      return []
  }
}

// Apply auth middleware (skip cron routes — those use CRON_SECRET instead)
secretary.use('*', async (c, next) => {
  if (c.req.path.includes('/cron/')) return next()
  return authMiddleware(c, next)
})

// creditGuard only on AI routes that consume credits.
// Non-AI routes (threads, memory reads, history) must NOT be gated —
// otherwise a single in-flight SSE stream blocks the entire Secretary UI.
const AI_ROUTE_PATTERNS = ['/chat', '/prepare-tomorrow', '/run']
secretary.use('*', async (c, next) => {
  if (c.req.path.includes('/cron/')) return next()
  const isAIRoute = AI_ROUTE_PATTERNS.some((p) => c.req.path.endsWith(p))
  if (!isAIRoute) return next()
  return creditGuard(c, next)
})

secretary.use('*', async (c, next) => {
  if (c.req.path.includes('/cron/')) return next()
  return requestContextMiddleware(c, next)
})
secretary.use('*', async (c, next) => {
  if (c.req.path.includes('/cron/')) return next()
  return rateLimitMiddleware()(c, next)
})

// ============================================================================
// Chat (Streaming SSE)
// ============================================================================

const ChatSchema = z.object({
  message: z.string().min(1).max(10000),
  threadId: z.string().optional(),
})

/**
 * POST /api/secretary/chat
 * Streaming chat with the secretary agent via SSE (with message persistence)
 */
secretary.post('/chat', zValidator('json', ChatSchema), async (c) => {
  const requestId = crypto.randomUUID()
  const auth = requireAuth(c)
  const body = c.req.valid('json')
  const openaiApiKey = process.env.OPENAI_API_KEY
  const hardeningEnabled = isHardeningEnabled()

  // Safety: detect potential prompt injection
  const { detectInjection } = await import('@inkdown/ai/safety')
  const { aiSafetyLog } = await import('@inkdown/ai/observability')
  const injectionCheck = detectInjection(body.message)
  if (injectionCheck.detected) {
    aiSafetyLog(injectionCheck.shouldBlock ? 'injection_blocked' : 'injection_detected', {
      userId: auth.userId,
      patterns: injectionCheck.patterns,
      route: 'secretary-chat',
      inputLength: body.message.length,
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

  console.info('secretary.chat.start', {
    requestId,
    userId: auth.userId,
    threadId: body.threadId || null,
    hardeningEnabled,
  })

  if (!openaiApiKey) {
    c.get('creditDecrement')?.()
    return c.json({ error: 'OpenAI API key not configured' }, 500)
  }

  const { SecretaryAgent, ChatPersistenceService } = await import('@inkdown/ai/agents')
  const { SharedContextService } = await import('@inkdown/ai/services')
  const sharedContextService = new SharedContextService(auth.supabase, auth.userId)
  const persistence = new ChatPersistenceService(auth.supabase)

  // Resolve or create thread
  let threadId = body.threadId || crypto.randomUUID()
  let persistenceEnabled = true
  if (!body.threadId) {
    try {
      const thread = await persistence.createThread(auth.userId)
      threadId = thread.threadId
    } catch (error) {
      persistenceEnabled = false
      console.warn('secretary.chat.persistence_unavailable.create_thread', {
        requestId,
        userId: auth.userId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  // Persist user message (recover automatically if thread reference is stale).
  if (persistenceEnabled) {
    try {
      await persistence.saveMessage(threadId, auth.userId, {
        role: 'user',
        content: body.message,
      })
    } catch {
      try {
        const thread = await persistence.createThread(auth.userId)
        threadId = thread.threadId
        await persistence.saveMessage(threadId, auth.userId, {
          role: 'user',
          content: body.message,
        })
      } catch (error) {
        persistenceEnabled = false
        console.warn('secretary.chat.persistence_unavailable.save_user', {
          requestId,
          userId: auth.userId,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  const timezone = c.req.header('X-Timezone') || undefined
  const agent = new SecretaryAgent({
    supabase: auth.supabase,
    userId: auth.userId,
    timezone,
    sharedContextService,
  })

  return streamSSE(c, async (stream) => {
    let assistantContent = ''
    let assistantToolCalls: unknown = null
    let assistantThinkingSteps: unknown = null
    let assistantModel: string | undefined
    const toolCallTargets = new Map<string, string[]>()

    try {
      for await (const event of agent.stream({
        message: body.message,
        threadId,
      })) {
        if (c.req.raw.signal.aborted) break

        // Accumulate assistant response data for persistence
        if (event.event === 'text') {
          assistantContent += event.data
        }
        if (event.event === 'tool_call') {
          if (!Array.isArray(assistantToolCalls)) assistantToolCalls = []
          try {
            const parsed = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
            ;(assistantToolCalls as unknown[]).push(parsed)
            if (
              hardeningEnabled &&
              parsed &&
              typeof parsed === 'object' &&
              typeof (parsed as { id?: unknown }).id === 'string' &&
              typeof (parsed as { toolName?: unknown }).toolName === 'string'
            ) {
              const toolArgs = ((parsed as { arguments?: unknown }).arguments || {}) as Record<
                string,
                unknown
              >
              toolCallTargets.set(
                (parsed as { id: string }).id,
                inferUpdatedFiles((parsed as { toolName: string }).toolName, toolArgs)
              )
            }
          } catch {
            ;(assistantToolCalls as unknown[]).push(event.data)
          }
        }
        if (event.event === 'thinking') {
          if (!Array.isArray(assistantThinkingSteps)) assistantThinkingSteps = []
          ;(assistantThinkingSteps as unknown[]).push(event.data)
        }

        await stream.writeSSE({
          event: event.event,
          data: JSON.stringify(event),
        })

        // Emit memory_updated when a write/save/generate/activate tool completes
        if (event.event === 'tool_result') {
          const toolName = event.metadata?.toolName || ''
          if (
            typeof toolName === 'string' &&
            (toolName.includes('write') ||
              toolName.includes('save') ||
              toolName.includes('generate') ||
              toolName.includes('activate') ||
              toolName.includes('modify') ||
              toolName.includes('create_plan'))
          ) {
            let updatedFiles: string[] = []
            if (hardeningEnabled) {
              try {
                const resultData =
                  typeof event.data === 'string' ? JSON.parse(event.data) : event.data
                const toolCallId = (resultData as { id?: string })?.id
                if (toolCallId && toolCallTargets.has(toolCallId)) {
                  updatedFiles = toolCallTargets.get(toolCallId) || []
                }
              } catch {
                // no-op: fallback below
              }
              if (updatedFiles.length === 0) {
                updatedFiles = inferUpdatedFiles(toolName)
              }
            }

            console.info('secretary.chat.tool_result', {
              requestId,
              threadId,
              toolName,
              updatedFiles,
            })

            await stream.writeSSE({
              event: 'memory_updated',
              data: JSON.stringify({
                event: 'memory_updated',
                data: JSON.stringify({ updatedFiles }),
                metadata: { updatedFiles },
              }),
            })
          }
        }
      }

      if (persistenceEnabled) {
        try {
          await persistence.saveMessage(threadId, auth.userId, {
            role: 'assistant',
            content: assistantContent,
            toolCalls: assistantToolCalls,
            thinkingSteps: assistantThinkingSteps,
            model: assistantModel,
          })
        } catch (error) {
          console.warn('secretary.chat.persistence_unavailable.save_assistant', {
            requestId,
            threadId,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }

      console.info('secretary.chat.done', {
        requestId,
        threadId,
        assistantChars: assistantContent.length,
        hasToolCalls: !!assistantToolCalls,
        hasThinking: !!assistantThinkingSteps,
        model: assistantModel || 'none',
      })

      // Send threadId in the done event so the frontend can track it
      await stream.writeSSE({
        event: 'thread-id',
        data: JSON.stringify({
          event: 'thread-id',
          data: { threadId },
          metadata: { threadId },
        }),
      })
    } catch (err) {
      const appError = handleError(err, ErrorCode.AI_PROVIDER_ERROR)
      console.error('secretary.chat.error', {
        requestId,
        threadId,
        error: appError.userMessage,
      })
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ event: 'error', data: appError.userMessage }),
      })
    } finally {
      // Explicitly release the concurrent request slot.
      // The abort signal alone is unreliable — Node.js doesn't fire it
      // on normal server-side stream completion, only on client disconnect.
      const creditDecrement = c.get('creditDecrement') as (() => void) | undefined
      if (creditDecrement) creditDecrement()
    }
  })
})

// ============================================================================
// Thread Management
// ============================================================================

/**
 * GET /api/secretary/threads
 * List user's chat threads
 */
secretary.get('/threads', async (c) => {
  const auth = requireAuth(c)
  const { ChatPersistenceService } = await import('@inkdown/ai/agents')
  const service = new ChatPersistenceService(auth.supabase)
  try {
    const threads = await service.getThreads(auth.userId)
    return c.json({ threads })
  } catch (error) {
    console.warn('secretary.threads.unavailable', {
      userId: auth.userId,
      error: error instanceof Error ? error.message : String(error),
    })
    return c.json({ threads: [], warning: 'Thread persistence is unavailable.' })
  }
})

/**
 * GET /api/secretary/threads/:threadId/messages
 * Get messages for a thread
 */
secretary.get('/threads/:threadId/messages', async (c) => {
  const auth = requireAuth(c)
  const threadId = c.req.param('threadId')
  const { ChatPersistenceService } = await import('@inkdown/ai/agents')
  const service = new ChatPersistenceService(auth.supabase)
  try {
    const messages = await service.getMessages(threadId)
    return c.json({ messages })
  } catch (error) {
    console.warn('secretary.messages.unavailable', {
      userId: auth.userId,
      threadId,
      error: error instanceof Error ? error.message : String(error),
    })
    return c.json({ messages: [], warning: 'Message persistence is unavailable.' })
  }
})

/**
 * DELETE /api/secretary/threads/:threadId
 * Delete a thread and its messages (cascade)
 */
secretary.delete('/threads/:threadId', async (c) => {
  const auth = requireAuth(c)
  const threadId = c.req.param('threadId')

  // Ownership pre-check (defense-in-depth beyond RLS)
  const { data: thread, error: checkError } = await auth.supabase
    .from('secretary_threads')
    .select('id')
    .or(`thread_id.eq.${threadId},id.eq.${threadId}`)
    .eq('user_id', auth.userId)
    .maybeSingle()

  if (checkError || !thread) {
    return c.json({ error: 'Thread not found' }, 404)
  }

  const { ChatPersistenceService } = await import('@inkdown/ai/agents')
  const service = new ChatPersistenceService(auth.supabase)
  try {
    await service.deleteThread(threadId)
    return c.json({ success: true })
  } catch (error) {
    console.warn('secretary.thread_delete.unavailable', {
      userId: auth.userId,
      threadId,
      error: error instanceof Error ? error.message : String(error),
    })
    return c.json({ success: false, warning: 'Thread deletion is unavailable.' })
  }
})

const UpdateThreadSchema = z.object({
  title: z.string().min(1).max(200),
})

/**
 * PATCH /api/secretary/threads/:threadId
 * Update thread title
 */
secretary.patch('/threads/:threadId', zValidator('json', UpdateThreadSchema), async (c) => {
  const auth = requireAuth(c)
  const threadId = c.req.param('threadId')
  const { title } = c.req.valid('json')

  // Ownership pre-check (defense-in-depth beyond RLS)
  const { data: thread, error: checkError } = await auth.supabase
    .from('secretary_threads')
    .select('id')
    .or(`thread_id.eq.${threadId},id.eq.${threadId}`)
    .eq('user_id', auth.userId)
    .maybeSingle()

  if (checkError || !thread) {
    return c.json({ error: 'Thread not found' }, 404)
  }

  const { ChatPersistenceService } = await import('@inkdown/ai/agents')
  const service = new ChatPersistenceService(auth.supabase)
  try {
    await service.updateThreadTitle(threadId, title)
    return c.json({ success: true })
  } catch (error) {
    console.warn('secretary.thread_patch.unavailable', {
      userId: auth.userId,
      threadId,
      error: error instanceof Error ? error.message : String(error),
    })
    return c.json({ success: false, warning: 'Thread title update is unavailable.' })
  }
})

// ============================================================================
// Memory CRUD
// ============================================================================

/**
 * GET /api/secretary/memory
 * Get all memory files for the current user
 */
secretary.get('/memory', async (c) => {
  const auth = requireAuth(c)

  const { MemoryService } = await import('@inkdown/ai/agents')
  const memService = new MemoryService(auth.supabase, auth.userId, getTimezone(c))

  const files = await memService.listFiles()
  return c.json({ files })
})

/**
 * GET /api/secretary/memory/:filename
 * Get a specific memory file
 */
secretary.get('/memory/:filename{.+}', async (c) => {
  const auth = requireAuth(c)
  const filename = c.req.param('filename')

  const { MemoryService } = await import('@inkdown/ai/agents')
  const memService = new MemoryService(auth.supabase, auth.userId, getTimezone(c))

  const file = await memService.readFile(filename)
  if (!file) {
    return c.json({ error: 'File not found' }, 404)
  }

  return c.json({ file })
})

/**
 * PUT /api/secretary/memory/:filename
 * Update a memory file's content
 */
secretary.put(
  '/memory/:filename{.+}',
  zValidator('json', z.object({ content: z.string() })),
  async (c) => {
    const auth = requireAuth(c)
    const filename = c.req.param('filename')
    const { content } = c.req.valid('json')

    const { MemoryService } = await import('@inkdown/ai/agents')
    const memService = new MemoryService(auth.supabase, auth.userId, getTimezone(c))

    const file = await memService.writeFile(filename, content)
    return c.json({ file })
  }
)

// ============================================================================
// Lifecycle Operations
// ============================================================================

/**
 * POST /api/secretary/initialize
 * Create default memory files for a new user
 */
secretary.post('/initialize', async (c) => {
  const auth = requireAuth(c)

  const { MemoryService } = await import('@inkdown/ai/agents')
  const memService = new MemoryService(auth.supabase, auth.userId, getTimezone(c))

  const files = await memService.initializeDefaults()
  return c.json({ files })
})

/**
 * POST /api/secretary/prepare-tomorrow
 * Trigger AI to generate tomorrow's plan
 */
secretary.post('/prepare-tomorrow', async (c) => {
  const requestId = crypto.randomUUID()
  const auth = requireAuth(c)
  const openaiApiKey = process.env.OPENAI_API_KEY
  const hardeningEnabled = isHardeningEnabled()

  if (!openaiApiKey) {
    c.get('creditDecrement')?.()
    return c.json({ error: 'OpenAI API key not configured' }, 500)
  }

  const { SecretaryAgent } = await import('@inkdown/ai/agents')
  const { SharedContextService } = await import('@inkdown/ai/services')

  const tzHeader = c.req.header('X-Timezone') || undefined
  const agent = new SecretaryAgent({
    supabase: auth.supabase,
    userId: auth.userId,
    timezone: tzHeader,
    sharedContextService: new SharedContextService(auth.supabase, auth.userId),
  })

  // Use SSE streaming for the generation
  return streamSSE(c, async (stream) => {
    const toolCallTargets = new Map<string, string[]>()
    try {
      for await (const event of agent.stream({
        message:
          'Generate my plan for tomorrow. Read my active plans and preferences, then write a time-blocked schedule to Tomorrow.md.',
      })) {
        await stream.writeSSE({
          event: event.event,
          data: JSON.stringify(event),
        })

        if (event.event === 'tool_call' && hardeningEnabled) {
          try {
            const parsed = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
            if (
              parsed &&
              typeof parsed === 'object' &&
              typeof (parsed as { id?: unknown }).id === 'string' &&
              typeof (parsed as { toolName?: unknown }).toolName === 'string'
            ) {
              const toolArgs = ((parsed as { arguments?: unknown }).arguments || {}) as Record<
                string,
                unknown
              >
              toolCallTargets.set(
                (parsed as { id: string }).id,
                inferUpdatedFiles((parsed as { toolName: string }).toolName, toolArgs)
              )
            }
          } catch {
            // ignore malformed tool call payload
          }
        }

        // Emit memory_updated when a write/save/generate/activate tool completes
        if (event.event === 'tool_result') {
          const toolName = event.metadata?.toolName || ''
          if (
            typeof toolName === 'string' &&
            (toolName.includes('write') ||
              toolName.includes('save') ||
              toolName.includes('generate') ||
              toolName.includes('activate') ||
              toolName.includes('modify') ||
              toolName.includes('create_plan'))
          ) {
            let updatedFiles: string[] = []
            if (hardeningEnabled) {
              try {
                const resultData =
                  typeof event.data === 'string' ? JSON.parse(event.data) : event.data
                const toolCallId = (resultData as { id?: string })?.id
                if (toolCallId && toolCallTargets.has(toolCallId)) {
                  updatedFiles = toolCallTargets.get(toolCallId) || []
                }
              } catch {
                // no-op
              }
              if (updatedFiles.length === 0) {
                updatedFiles = inferUpdatedFiles(toolName)
              }
            }

            console.info('secretary.prepare_tomorrow.tool_result', {
              requestId,
              userId: auth.userId,
              toolName,
              updatedFiles,
            })

            await stream.writeSSE({
              event: 'memory_updated',
              data: JSON.stringify({
                event: 'memory_updated',
                data: JSON.stringify({ updatedFiles }),
                metadata: { updatedFiles },
              }),
            })
          }
        }
      }
    } catch (err) {
      const appError = handleError(err, ErrorCode.AI_PROVIDER_ERROR)
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ event: 'error', data: appError.userMessage }),
      })
    } finally {
      const creditDecrement = c.get('creditDecrement')
      if (creditDecrement) creditDecrement()
    }
  })
})

/**
 * GET /api/secretary/debug/context
 * Returns parser/activation diagnostics to troubleshoot secretary memory state.
 */
secretary.get('/debug/context', async (c) => {
  const auth = requireAuth(c)
  const hardeningEnabled = isHardeningEnabled()
  if (!hardeningEnabled) {
    return c.json({ error: 'Secretary hardening debug endpoint is disabled.' }, 404)
  }

  const { MemoryService } = await import('@inkdown/ai/agents')
  const memService = new MemoryService(auth.supabase, auth.userId, getTimezone(c))
  const diagnostics = await memService.getContextDiagnostics()

  return c.json(diagnostics)
})

/**
 * POST /api/secretary/approve-tomorrow
 * Move Tomorrow.md content → Today.md, clear Tomorrow.md
 */
secretary.post('/approve-tomorrow', async (c) => {
  const auth = requireAuth(c)

  const { MemoryService } = await import('@inkdown/ai/agents')
  const memService = new MemoryService(auth.supabase, auth.userId, getTimezone(c))

  const tomorrowFile = await memService.readFile('Tomorrow.md')
  if (!tomorrowFile || !tomorrowFile.content.trim()) {
    return c.json({ error: 'No tomorrow plan to approve' }, 400)
  }

  // Extract date from Tomorrow.md
  const dateMatch = tomorrowFile.content.match(/(\d{4}-\d{2}-\d{2})/)
  const tz = c.req.header('X-Timezone') || undefined
  const todayDate = getTodayDate(tz)

  if (dateMatch && dateMatch[1] !== todayDate) {
    // Plan is for a future date — mark as approved but keep in Tomorrow.md
    let content = tomorrowFile.content
    if (!content.includes('**Status:** Approved')) {
      content = content.replace(/^(#.*)$/m, '$1\n\n**Status:** Approved')
    }
    await memService.writeFile('Tomorrow.md', content)
    return c.json({ success: true, message: 'Tomorrow plan approved (will activate on its date)' })
  }

  // Plan is for today — move immediately
  await memService.writeFile('Today.md', tomorrowFile.content)
  await memService.writeFile('Tomorrow.md', '')
  return c.json({ success: true, message: 'Tomorrow plan approved and moved to Today' })
})

/**
 * POST /api/secretary/day-transition
 * Trigger day transition manually (archive stale Today.md, promote Tomorrow.md)
 */
secretary.post('/day-transition', async (c) => {
  const auth = requireAuth(c)

  const { MemoryService } = await import('@inkdown/ai/agents')
  const memService = new MemoryService(auth.supabase, auth.userId, getTimezone(c))

  const result = await memService.performDayTransition()
  return c.json({ result })
})

/**
 * GET /api/secretary/history
 * List archived daily plans from History/ directory
 */
secretary.get('/history', async (c) => {
  const auth = requireAuth(c)

  const { MemoryService } = await import('@inkdown/ai/agents')
  const memService = new MemoryService(auth.supabase, auth.userId, getTimezone(c))

  const files = await memService.listFiles('History/')
  return c.json({ files })
})

// ============================================================================
// Plan Workspace
// ============================================================================

/**
 * GET /api/secretary/plan/:planId
 * Aggregated workspace data: plan + instructions + roadmap + schedules + artifacts
 */
secretary.get('/plan/:planId', async (c) => {
  const auth = requireAuth(c)
  const planId = c.req.param('planId')

  const { MemoryService } = await import('@inkdown/ai/agents')
  const memService = new MemoryService(auth.supabase, auth.userId, getTimezone(c))

  // Parse Plan.md first to find the plan and its archiveFilename
  const planMd = await memService.readFile('Plan.md')
  const { parsePlanMarkdown } = await import('@inkdown/shared/secretary')
  const parsed = parsePlanMarkdown(planMd?.content || '')
  const plan = parsed.plans.find((p) => p.id === planId) || null

  if (!plan) {
    return c.json({ error: 'Plan not found' }, 404)
  }

  // Try the canonical archive path first, then search Plans/ for a matching file.
  // When a user renames a plan codename in Plan.md (e.g. [A-L] → [MATH]),
  // the roadmap file is still at the old path (Plans/a-l-roadmap.md).
  // The fallback search handles this by checking all roadmap files.
  const canonicalPath = plan.archiveFilename || `Plans/${planId.toLowerCase()}-roadmap.md`
  let roadmapFile = await memService.readFile(canonicalPath)
  let resolvedRoadmapPath = canonicalPath

  if (!roadmapFile?.content) {
    const planFiles = await memService.listFiles('Plans/')
    const roadmapFiles = planFiles.filter((f) => f.filename.endsWith('-roadmap.md'))

    // 1. Match by plan ID substring in filename
    let match = roadmapFiles.find((f) => f.filename.toLowerCase().includes(planId.toLowerCase()))

    // 2. Match by plan name in file content (handles codename renames)
    if (!match && plan.name) {
      const nameLower = plan.name.toLowerCase()
      match = roadmapFiles.find((f) => (f.content || '').toLowerCase().includes(nameLower))
    }

    if (match) {
      roadmapFile = { content: match.content } as typeof roadmapFile
      resolvedRoadmapPath = match.filename

      // Auto-migrate: rename files + update DB records so future lookups are instant
      if (match.filename !== canonicalPath) {
        // Extract old plan ID from the filename (e.g. "Plans/a-l-roadmap.md" → "A-L")
        const oldIdMatch = match.filename.match(/Plans\/(.+)-roadmap\.md$/i)
        const oldPlanId = oldIdMatch?.[1]?.toUpperCase()

        try {
          await memService.writeFile(canonicalPath, match.content)
          await memService.deleteFile(match.filename)
          resolvedRoadmapPath = canonicalPath

          // Also migrate instructions file if it exists
          const oldInstructionsPath = match.filename.replace('-roadmap.md', '-instructions.md')
          const newInstructionsPath = canonicalPath.replace('-roadmap.md', '-instructions.md')
          const oldInstructions = await memService.readFile(oldInstructionsPath)
          if (oldInstructions?.content) {
            await memService.writeFile(newInstructionsPath, oldInstructions.content)
            await memService.deleteFile(oldInstructionsPath)
          }

          // Update DB records that reference the old plan ID
          if (oldPlanId && oldPlanId !== planId) {
            await Promise.allSettled([
              auth.supabase
                .from('plan_project_links')
                .update({ plan_id: planId })
                .eq('user_id', auth.userId)
                .eq('plan_id', oldPlanId),
              auth.supabase
                .from('plan_schedules')
                .update({ plan_id: planId })
                .eq('user_id', auth.userId)
                .eq('plan_id', oldPlanId),
            ])
          }
        } catch {
          // Migration failed silently — the fallback still served the content
        }
      }
    }
  }

  const instructionsPath = resolvedRoadmapPath.replace('-roadmap.md', '-instructions.md')
  const instructionsFile = await memService.readFile(instructionsPath)

  // Load schedules and plan-project link in parallel
  const [schedulesResult, linkResult] = await Promise.all([
    auth.supabase
      .from('plan_schedules')
      .select('*')
      .eq('user_id', auth.userId)
      .eq('plan_id', planId)
      .order('created_at', { ascending: true }),
    auth.supabase
      .from('plan_project_links')
      .select('project_id')
      .eq('user_id', auth.userId)
      .eq('plan_id', planId)
      .maybeSingle(),
  ])

  const schedules = schedulesResult.data || []
  let projectId: string | undefined = linkResult.data?.project_id || undefined

  // Fallback: Plan.md may have a projectId from a previous codename
  // (DB link lost after a codename rename + partial migration).
  if (!projectId && plan.projectId) {
    const { data: existingProject } = await auth.supabase
      .from('projects')
      .select('id')
      .eq('id', plan.projectId)
      .eq('user_id', auth.userId)
      .maybeSingle()

    if (existingProject) {
      projectId = plan.projectId
      // Re-create the missing DB link for the current codename
      await auth.supabase
        .from('plan_project_links')
        .upsert(
          { user_id: auth.userId, plan_id: planId, project_id: projectId },
          { onConflict: 'user_id,plan_id' }
        )
    }
  }

  // If linked, load notes from the project folder
  let projectNotes: Array<{ id: string; title: string; updatedAt: string; sourceTask?: string }> =
    []
  if (projectId) {
    const { data: notes } = await auth.supabase
      .from('notes')
      .select('id, title, updated_at, tags')
      .eq('project_id', projectId)
      .order('updated_at', { ascending: false })
      .limit(50)
    if (notes) {
      projectNotes = notes.map(
        (n: { id: string; title: string; updated_at: string; tags: string[] | null }) => {
          const planTaskTag = (n.tags || []).find((t: string) => t.startsWith('plan-task:'))
          return {
            id: n.id,
            title: n.title,
            updatedAt: n.updated_at,
            sourceTask: planTaskTag ? planTaskTag.slice('plan-task:'.length) : undefined,
          }
        }
      )
    }
  }

  return c.json({
    plan,
    instructions: instructionsFile?.content || '',
    roadmapContent: roadmapFile?.content || '',
    projectId,
    projectNotes,
    schedules: schedules.map((s: Record<string, unknown>) => ({
      id: s.id,
      planId: s.plan_id,
      title: s.title,
      instructions: s.instructions,
      workflow: s.workflow,
      frequency: s.frequency,
      time: s.time,
      days: s.days,
      enabled: s.enabled,
      lastRunAt: s.last_run_at,
      nextRunAt: s.next_run_at,
      runCount: s.run_count,
      lastRunStatus: s.last_run_status,
      lastRunError: s.last_run_error,
      createdAt: s.created_at,
    })),
  })
})

/**
 * PUT /api/secretary/plan/:planId/instructions
 * Save plan instructions file
 */
secretary.put(
  '/plan/:planId/instructions',
  zValidator('json', z.object({ content: z.string() })),
  async (c) => {
    const auth = requireAuth(c)
    const planId = c.req.param('planId')
    const { content } = c.req.valid('json')

    const { MemoryService } = await import('@inkdown/ai/agents')
    const memService = new MemoryService(auth.supabase, auth.userId, getTimezone(c))

    const filename = `Plans/${planId.toLowerCase()}-instructions.md`
    const file = await memService.writeFile(filename, content)
    return c.json({ file })
  }
)

const CreateScheduleSchema = z.object({
  title: z.string().min(1).max(200),
  instructions: z.string().optional(),
  workflow: z.enum(['make_note_from_task', 'research_topic_from_task', 'make_course_from_plan']),
  frequency: z.enum(['daily', 'weekly', 'custom']),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  days: z.array(z.string()).optional(),
  enabled: z.boolean().optional(),
})

/**
 * POST /api/secretary/plan/:planId/schedules
 * Create a new schedule automation
 */
secretary.post('/plan/:planId/schedules', zValidator('json', CreateScheduleSchema), async (c) => {
  const auth = requireAuth(c)
  const planId = c.req.param('planId')
  const body = c.req.valid('json')

  const { data, error: dbError } = await auth.supabase
    .from('plan_schedules')
    .insert({
      user_id: auth.userId,
      plan_id: planId,
      title: body.title,
      instructions: body.instructions || null,
      workflow: body.workflow,
      frequency: body.frequency,
      time: body.time,
      days: body.days || null,
      enabled: body.enabled ?? true,
    })
    .select()
    .single()

  if (dbError) {
    return c.json({ error: dbError.message }, 500)
  }

  return c.json({
    schedule: {
      id: data.id,
      planId: data.plan_id,
      title: data.title,
      instructions: data.instructions,
      workflow: data.workflow,
      frequency: data.frequency,
      time: data.time,
      days: data.days,
      enabled: data.enabled,
      lastRunAt: data.last_run_at,
      nextRunAt: data.next_run_at,
      runCount: data.run_count,
      lastRunStatus: data.last_run_status,
      lastRunError: data.last_run_error,
      createdAt: data.created_at,
    },
  })
})

const UpdateScheduleSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  instructions: z.string().optional(),
  workflow: z
    .enum(['make_note_from_task', 'research_topic_from_task', 'make_course_from_plan'])
    .optional(),
  frequency: z.enum(['daily', 'weekly', 'custom']).optional(),
  time: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  days: z.array(z.string()).optional(),
  enabled: z.boolean().optional(),
})

/**
 * PUT /api/secretary/plan/:planId/schedules/:id
 * Update a schedule automation
 */
secretary.put(
  '/plan/:planId/schedules/:id',
  zValidator('json', UpdateScheduleSchema),
  async (c) => {
    const auth = requireAuth(c)
    const planId = c.req.param('planId')
    const scheduleId = c.req.param('id')
    const body = c.req.valid('json')

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.title !== undefined) updates.title = body.title
    if (body.instructions !== undefined) updates.instructions = body.instructions
    if (body.workflow !== undefined) updates.workflow = body.workflow
    if (body.frequency !== undefined) updates.frequency = body.frequency
    if (body.time !== undefined) updates.time = body.time
    if (body.days !== undefined) updates.days = body.days
    if (body.enabled !== undefined) updates.enabled = body.enabled

    const { error: dbError } = await auth.supabase
      .from('plan_schedules')
      .update(updates)
      .eq('id', scheduleId)
      .eq('user_id', auth.userId)
      .eq('plan_id', planId)

    if (dbError) {
      return c.json({ error: dbError.message }, 500)
    }

    return c.json({ success: true })
  }
)

/**
 * DELETE /api/secretary/plan/:planId/schedules/:id
 * Delete a schedule automation
 */
secretary.delete('/plan/:planId/schedules/:id', async (c) => {
  const auth = requireAuth(c)
  const planId = c.req.param('planId')
  const scheduleId = c.req.param('id')

  const { error: dbError } = await auth.supabase
    .from('plan_schedules')
    .delete()
    .eq('id', scheduleId)
    .eq('user_id', auth.userId)
    .eq('plan_id', planId)

  if (dbError) {
    return c.json({ error: dbError.message }, 500)
  }

  return c.json({ success: true })
})

/**
 * POST /api/secretary/plan/:planId/schedules/:id/run
 * Execute a specific schedule automation now (Run Now button).
 * Streams progress events via SSE as the agent works.
 */
secretary.post('/plan/:planId/schedules/:id/run', async (c) => {
  const auth = requireAuth(c)
  const planId = c.req.param('planId')
  const scheduleId = c.req.param('id')

  // 1. Load schedule
  const { data: schedule, error: schedErr } = await auth.supabase
    .from('plan_schedules')
    .select('*')
    .eq('id', scheduleId)
    .eq('user_id', auth.userId)
    .eq('plan_id', planId)
    .single()

  if (schedErr || !schedule) {
    return c.json({ error: 'Schedule not found' }, 404)
  }

  // 2. Load plan + instructions + roadmap
  const { MemoryService } = await import('@inkdown/ai/agents')
  const memService = new MemoryService(auth.supabase, auth.userId, getTimezone(c))
  const planMd = await memService.readFile('Plan.md')

  const { parsePlanMarkdown } = await import('@inkdown/shared/secretary')
  const parsed = parsePlanMarkdown(planMd?.content || '')
  const plan = parsed.plans.find((p) => p.id === planId)

  if (!plan) {
    return c.json({ error: 'Plan not found' }, 404)
  }

  const instructionsFile = await memService.readFile(
    `Plans/${planId.toLowerCase()}-instructions.md`
  )
  const instructions = instructionsFile?.content || ''

  const roadmapFile = await memService.readFile(`Plans/${planId.toLowerCase()}-roadmap.md`)
  const roadmapContent = roadmapFile?.content || ''

  // 3. Load project ID and recent notes for continuity
  const { data: linkRow } = await auth.supabase
    .from('plan_project_links')
    .select('project_id')
    .eq('user_id', auth.userId)
    .eq('plan_id', planId)
    .single()

  const projectId = linkRow?.project_id || undefined

  let previousNotes: Array<{ title: string; updatedAt: string }> = []
  if (projectId) {
    const { data: recentNotes } = await auth.supabase
      .from('notes')
      .select('title, updated_at')
      .eq('user_id', auth.userId)
      .eq('project_id', projectId)
      .order('updated_at', { ascending: false })
      .limit(3)
    if (recentNotes) {
      previousNotes = recentNotes.map((n) => ({
        title: n.title,
        updatedAt: n.updated_at,
      }))
    }
  }

  // 4. Stream AutomationAgent events via SSE
  return streamSSE(c, async (stream) => {
    const { streamAutomation } = await import('@inkdown/ai/agents')
    const { computeNextRunAt } = await import('@inkdown/shared/secretary')

    let lastError: string | undefined

    try {
      for await (const event of streamAutomation({
        plan,
        instructions,
        roadmapContent,
        previousNotes,
        scheduleTitle: schedule.title,
        scheduleInstructions: schedule.instructions || undefined,
        projectId,
        supabase: auth.supabase,
        userId: auth.userId,
      })) {
        await stream.writeSSE({
          event: event.type,
          data: JSON.stringify(event.data),
        })
        if (event.type === 'error') lastError = event.data.message
      }

      // 5. Update schedule state after stream completes
      const now = new Date().toISOString()
      const nextRunAt = computeNextRunAt(schedule.frequency, schedule.time, schedule.days)

      await auth.supabase
        .from('plan_schedules')
        .update({
          last_run_at: now,
          next_run_at: nextRunAt,
          run_count: (schedule.run_count || 0) + 1,
          last_run_status: lastError ? 'error' : 'success',
          last_run_error: lastError || null,
          updated_at: now,
        })
        .eq('id', scheduleId)
    } finally {
      const creditDecrement = c.get('creditDecrement')
      if (creditDecrement) creditDecrement()
    }
  })
})

/**
 * POST /api/secretary/plan/:planId/run
 * Trigger immediate content generation for the plan (no specific schedule).
 * Used by PlanHeader ▶ button.
 */
secretary.post('/plan/:planId/run', async (c) => {
  const auth = requireAuth(c)
  const planId = c.req.param('planId')

  const { MemoryService } = await import('@inkdown/ai/agents')
  const memService = new MemoryService(auth.supabase, auth.userId, getTimezone(c))
  const planMd = await memService.readFile('Plan.md')

  const { parsePlanMarkdown } = await import('@inkdown/shared/secretary')
  const parsed = parsePlanMarkdown(planMd?.content || '')
  const plan = parsed.plans.find((p) => p.id === planId)

  if (!plan) {
    return c.json({ error: 'Plan not found' }, 404)
  }

  const instructionsFile = await memService.readFile(
    `Plans/${planId.toLowerCase()}-instructions.md`
  )
  const instructions = instructionsFile?.content || ''

  const roadmapFile = await memService.readFile(`Plans/${planId.toLowerCase()}-roadmap.md`)
  const roadmapContent = roadmapFile?.content || ''

  const { data: linkRow } = await auth.supabase
    .from('plan_project_links')
    .select('project_id')
    .eq('user_id', auth.userId)
    .eq('plan_id', planId)
    .single()

  const projectId = linkRow?.project_id || undefined

  let previousNotes: Array<{ title: string; updatedAt: string }> = []
  if (projectId) {
    const { data: recentNotes } = await auth.supabase
      .from('notes')
      .select('title, updated_at')
      .eq('user_id', auth.userId)
      .eq('project_id', projectId)
      .order('updated_at', { ascending: false })
      .limit(3)
    if (recentNotes) {
      previousNotes = recentNotes.map((n) => ({
        title: n.title,
        updatedAt: n.updated_at,
      }))
    }
  }

  const { runAutomation } = await import('@inkdown/ai/agents')
  const result = await runAutomation({
    plan,
    instructions,
    roadmapContent,
    previousNotes,
    scheduleTitle: `Generate lesson for ${plan.name}`,
    projectId,
    supabase: auth.supabase,
    userId: auth.userId,
  })

  if (result.error) {
    return c.json({ error: result.error }, 500)
  }

  return c.json({
    noteId: result.noteId,
    title: result.noteTitle,
    advancedProgress: result.advancedProgress,
    status: 'success',
  })
})

// ============================================================================
// Cron: Automated Schedule Execution
// ============================================================================

/**
 * GET /api/secretary/cron/automations
 * Called by Railway cron every 5 minutes. Processes due plan schedules across all users.
 * Auth: CRON_SECRET header (not user auth).
 */
secretary.get('/cron/automations', async (c) => {
  const secret = c.req.header('x-cron-secret') || c.req.query('secret')
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const { createClient } = await import('@supabase/supabase-js')
  const adminSupabase = createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_KEY || ''
  )

  const now = new Date().toISOString()
  const { data: dueSchedules } = await adminSupabase
    .from('plan_schedules')
    .select('*')
    .eq('enabled', true)
    .lte('next_run_at', now)
    .order('next_run_at', { ascending: true })
    .limit(3)

  if (!dueSchedules?.length) {
    return c.json({ processed: 0 })
  }

  const { runAutomation, MemoryService } = await import('@inkdown/ai/agents')
  const { parsePlanMarkdown } = await import('@inkdown/shared/secretary')
  const { computeNextRunAt } = await import('@inkdown/shared/secretary')

  const results: Array<{ scheduleId: string; status: string; noteTitle?: string; error?: string }> =
    []

  for (const schedule of dueSchedules) {
    try {
      // Immediately advance next_run_at to prevent re-pick by concurrent cron
      const nextRunAt = computeNextRunAt(schedule.frequency, schedule.time, schedule.days)
      await adminSupabase
        .from('plan_schedules')
        .update({ next_run_at: nextRunAt, updated_at: now })
        .eq('id', schedule.id)

      const userId = schedule.user_id
      const planId = schedule.plan_id

      const memService = new MemoryService(adminSupabase, userId)
      const planMd = await memService.readFile('Plan.md')
      const parsed = parsePlanMarkdown(planMd?.content || '')
      const plan = parsed.plans.find((p: { id: string }) => p.id === planId)

      if (!plan) {
        results.push({ scheduleId: schedule.id, status: 'error', error: 'Plan not found' })
        continue
      }

      const instrFile = await memService.readFile(`Plans/${planId.toLowerCase()}-instructions.md`)
      const roadmapFile = await memService.readFile(`Plans/${planId.toLowerCase()}-roadmap.md`)

      const { data: linkRow } = await adminSupabase
        .from('plan_project_links')
        .select('project_id')
        .eq('user_id', userId)
        .eq('plan_id', planId)
        .single()

      let previousNotes: Array<{ title: string; updatedAt: string }> = []
      if (linkRow?.project_id) {
        const { data: recentNotes } = await adminSupabase
          .from('notes')
          .select('title, updated_at')
          .eq('user_id', userId)
          .eq('project_id', linkRow.project_id)
          .order('updated_at', { ascending: false })
          .limit(3)
        if (recentNotes) {
          previousNotes = recentNotes.map((n: { title: string; updated_at: string }) => ({
            title: n.title,
            updatedAt: n.updated_at,
          }))
        }
      }

      const result = await runAutomation({
        plan,
        instructions: instrFile?.content || '',
        roadmapContent: roadmapFile?.content || '',
        previousNotes,
        scheduleTitle: schedule.title,
        scheduleInstructions: schedule.instructions || undefined,
        projectId: linkRow?.project_id || undefined,
        supabase: adminSupabase,
        userId,
      })

      await adminSupabase
        .from('plan_schedules')
        .update({
          last_run_at: now,
          run_count: (schedule.run_count || 0) + 1,
          last_run_status: result.error ? 'error' : 'success',
          last_run_error: result.error || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', schedule.id)

      results.push({
        scheduleId: schedule.id,
        status: result.error ? 'error' : 'success',
        noteTitle: result.noteTitle,
        error: result.error,
      })
    } catch (err) {
      await adminSupabase
        .from('plan_schedules')
        .update({
          last_run_status: 'error',
          last_run_error: (err as Error).message,
          updated_at: new Date().toISOString(),
        })
        .eq('id', schedule.id)

      results.push({
        scheduleId: schedule.id,
        status: 'error',
        error: (err as Error).message,
      })
    }
  }

  return c.json({ processed: results.length, results })
})

// ============================================================================
// Plan-Project Links
// ============================================================================

/**
 * GET /api/secretary/plan-links
 * All plan-project links for the current user (bulk, called on init)
 */
secretary.get('/plan-links', async (c) => {
  const auth = requireAuth(c)
  const { data, error: dbError } = await auth.supabase
    .from('plan_project_links')
    .select('plan_id, project_id')
    .eq('user_id', auth.userId)

  if (dbError) {
    return c.json({ error: dbError.message }, 500)
  }

  const links: Record<string, string> = {}
  for (const row of data || []) {
    links[row.plan_id] = row.project_id
  }
  return c.json({ links })
})

/**
 * POST /api/secretary/plan/:planId/link-project
 * Create a project folder and link it to the plan
 */
secretary.post('/plan/:planId/link-project', async (c) => {
  const auth = requireAuth(c)
  const planId = c.req.param('planId')

  // Check if already linked
  const { data: existing } = await auth.supabase
    .from('plan_project_links')
    .select('project_id')
    .eq('user_id', auth.userId)
    .eq('plan_id', planId)
    .maybeSingle()

  if (existing) {
    return c.json({ projectId: existing.project_id, alreadyLinked: true })
  }

  // Read plan name for the folder
  const { MemoryService } = await import('@inkdown/ai/agents')
  const memService = new MemoryService(auth.supabase, auth.userId, getTimezone(c))
  const planMd = await memService.readFile('Plan.md')
  const { parsePlanMarkdown } = await import('@inkdown/shared/secretary')
  const parsed = parsePlanMarkdown(planMd?.content || '')
  const plan = parsed.plans.find((p) => p.id === planId)
  const folderName = plan?.name || `Plan: ${planId}`

  // Reuse existing project if Plan.md already has a projectId
  // (handles codename renames where the DB link was lost)
  if (plan?.projectId) {
    const { data: existingProject } = await auth.supabase
      .from('projects')
      .select('id')
      .eq('id', plan.projectId)
      .eq('user_id', auth.userId)
      .maybeSingle()

    if (existingProject) {
      await auth.supabase
        .from('plan_project_links')
        .upsert(
          { user_id: auth.userId, plan_id: planId, project_id: plan.projectId },
          { onConflict: 'user_id,plan_id' }
        )
      return c.json({ projectId: plan.projectId })
    }
  }

  // Create project folder
  const { data: project, error: projError } = await auth.supabase
    .from('projects')
    .insert({ name: folderName, icon: '📋', color: '#10b981', user_id: auth.userId })
    .select('id')
    .single()

  if (projError || !project) {
    return c.json({ error: projError?.message || 'Failed to create project' }, 500)
  }

  // Create link
  const { error: linkError } = await auth.supabase
    .from('plan_project_links')
    .insert({ user_id: auth.userId, plan_id: planId, project_id: project.id })

  if (linkError) {
    return c.json({ error: linkError.message }, 500)
  }

  return c.json({ projectId: project.id })
})

/**
 * DELETE /api/secretary/plan/:planId/unlink-project
 * Remove the plan-project link (does NOT delete the project folder)
 */
secretary.delete('/plan/:planId/unlink-project', async (c) => {
  const auth = requireAuth(c)
  const planId = c.req.param('planId')

  const { error: dbError } = await auth.supabase
    .from('plan_project_links')
    .delete()
    .eq('user_id', auth.userId)
    .eq('plan_id', planId)

  if (dbError) {
    return c.json({ error: dbError.message }, 500)
  }

  return c.json({ success: true })
})

export default secretary
