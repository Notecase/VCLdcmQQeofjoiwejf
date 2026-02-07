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

const secretary = new Hono()

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
    openaiApiKey,
    timezone,
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
              hardeningEnabled
              && parsed
              && typeof parsed === 'object'
              && typeof (parsed as { id?: unknown }).id === 'string'
              && typeof (parsed as { toolName?: unknown }).toolName === 'string'
            ) {
              const toolArgs = ((parsed as { arguments?: unknown }).arguments || {}) as Record<string, unknown>
              toolCallTargets.set(
                (parsed as { id: string }).id,
                inferUpdatedFiles((parsed as { toolName: string }).toolName, toolArgs),
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
            typeof toolName === 'string'
            && (toolName.includes('write') || toolName.includes('save') || toolName.includes('generate') || toolName.includes('activate') || toolName.includes('modify'))
          ) {
            let updatedFiles: string[] = []
            if (hardeningEnabled) {
              try {
                const resultData = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
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
secretary.patch(
  '/threads/:threadId',
  zValidator('json', UpdateThreadSchema),
  async (c) => {
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
  },
)

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
  const memService = new MemoryService(auth.supabase, auth.userId)

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
  const memService = new MemoryService(auth.supabase, auth.userId)

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
    const memService = new MemoryService(auth.supabase, auth.userId)

    const file = await memService.writeFile(filename, content)
    return c.json({ file })
  },
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
  const memService = new MemoryService(auth.supabase, auth.userId)

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

  const tzHeader = c.req.header('X-Timezone') || undefined
  const agent = new SecretaryAgent({
    supabase: auth.supabase,
    userId: auth.userId,
    openaiApiKey,
    timezone: tzHeader,
  })

  // Use SSE streaming for the generation
  return streamSSE(c, async (stream) => {
    const toolCallTargets = new Map<string, string[]>()
    try {
      for await (const event of agent.stream({
        message: 'Generate my plan for tomorrow. Read my active plans and preferences, then write a time-blocked schedule to Tomorrow.md.',
      })) {
        await stream.writeSSE({
          event: event.event,
          data: JSON.stringify(event),
        })

        if (event.event === 'tool_call' && hardeningEnabled) {
          try {
            const parsed = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
            if (
              parsed
              && typeof parsed === 'object'
              && typeof (parsed as { id?: unknown }).id === 'string'
              && typeof (parsed as { toolName?: unknown }).toolName === 'string'
            ) {
              const toolArgs = ((parsed as { arguments?: unknown }).arguments || {}) as Record<string, unknown>
              toolCallTargets.set(
                (parsed as { id: string }).id,
                inferUpdatedFiles((parsed as { toolName: string }).toolName, toolArgs),
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
            typeof toolName === 'string'
            && (toolName.includes('write') || toolName.includes('save') || toolName.includes('generate') || toolName.includes('activate') || toolName.includes('modify'))
          ) {
            let updatedFiles: string[] = []
            if (hardeningEnabled) {
              try {
                const resultData = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
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
  const memService = new MemoryService(auth.supabase, auth.userId)
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
  const memService = new MemoryService(auth.supabase, auth.userId)

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
  const memService = new MemoryService(auth.supabase, auth.userId)

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
  const memService = new MemoryService(auth.supabase, auth.userId)

  const files = await memService.listFiles('History/')
  return c.json({ files })
})

export default secretary
