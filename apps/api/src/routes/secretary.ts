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
    default:
      return []
  }
}

// Apply auth middleware
secretary.use('*', authMiddleware)
secretary.use('*', creditGuard)
secretary.use('*', requestContextMiddleware)

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

  console.info('secretary.chat.start', {
    requestId,
    userId: auth.userId,
    threadId: body.threadId || null,
    hardeningEnabled,
  })

  if (!openaiApiKey) {
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
              toolName.includes('modify'))
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
              toolName.includes('modify'))
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

  // Read roadmap and instructions files in parallel
  const [roadmapFile, instructionsFile, planMd] = await Promise.all([
    memService.readFile(`Plans/${planId.toLowerCase()}-roadmap.md`),
    memService.readFile(`Plans/${planId.toLowerCase()}-instructions.md`),
    memService.readFile('Plan.md'),
  ])

  // Parse plan data from Plan.md to find matching plan
  const { parsePlanMarkdown } = await import('@inkdown/shared/secretary')
  const parsed = parsePlanMarkdown(planMd?.content || '')
  const plan = parsed.plans.find((p) => p.id === planId) || null

  if (!plan) {
    return c.json({ error: 'Plan not found' }, 404)
  }

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
  const projectId = linkResult.data?.project_id || undefined

  // If linked, load notes from the project folder
  let projectNotes: Array<{ id: string; title: string; updatedAt: string }> = []
  if (projectId) {
    const { data: notes } = await auth.supabase
      .from('notes')
      .select('id, title, updated_at')
      .eq('project_id', projectId)
      .order('updated_at', { ascending: false })
      .limit(50)
    if (notes) {
      projectNotes = notes.map((n: { id: string; title: string; updated_at: string }) => ({
        id: n.id,
        title: n.title,
        updatedAt: n.updated_at,
      }))
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
 * POST /api/secretary/plan/:planId/run
 * Trigger immediate content generation for the plan's current topic
 */
secretary.post(
  '/plan/:planId/run',
  zValidator(
    'json',
    z
      .object({
        workflow: z
          .enum(['make_note_from_task', 'research_topic_from_task', 'make_course_from_plan'])
          .optional(),
      })
      .optional()
  ),
  async (c) => {
    const auth = requireAuth(c)
    const planId = c.req.param('planId')
    const body = c.req.valid('json') || {}
    const workflow = body.workflow || 'make_note_from_task'

    // Read plan data to build goal
    const { MemoryService } = await import('@inkdown/ai/agents')
    const memService = new MemoryService(auth.supabase, auth.userId, getTimezone(c))
    const planMd = await memService.readFile('Plan.md')

    const { parsePlanMarkdown } = await import('@inkdown/shared/secretary')
    const parsed = parsePlanMarkdown(planMd?.content || '')
    const plan = parsed.plans.find((p) => p.id === planId)

    if (!plan) {
      return c.json({ error: 'Plan not found' }, 404)
    }

    // Read plan instructions for context
    const instructionsFile = await memService.readFile(
      `Plans/${planId.toLowerCase()}-instructions.md`
    )
    const instructions = instructionsFile?.content || ''

    // Build goal with instructions context
    let goal: string
    switch (workflow) {
      case 'make_course_from_plan':
        goal = `Turn the active plan "${plan.name}"${plan.currentTopic ? ` on ${plan.currentTopic}` : ''} into a structured course outline.`
        break
      case 'research_topic_from_task':
        goal = `Research the active plan "${plan.name}"${plan.currentTopic ? ` focused on ${plan.currentTopic}` : ''} and capture the highest-value insights.`
        break
      default:
        goal = `Create a note for the active plan "${plan.name}"${plan.currentTopic ? ` focused on ${plan.currentTopic}` : ''}.`
    }

    if (instructions) {
      goal += `\n\nPlan instructions:\n${instructions}`
    }

    return c.json({
      goal,
      workflow,
      planId: plan.id,
      planName: plan.name,
      currentTopic: plan.currentTopic,
    })
  }
)

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
