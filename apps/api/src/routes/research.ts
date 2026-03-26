/**
 * Research API Routes
 *
 * Hono routes for the Deep Research Agent:
 * - POST /chat — Streaming research chat via SSE
 * - GET /threads — List user's research threads
 * - GET /threads/:threadId/messages — Get messages for a thread
 * - DELETE /threads/:threadId — Delete a thread
 * - PATCH /threads/:threadId — Update thread title
 * - POST /threads/:threadId/interrupt-response — Respond to an interrupt
 * - POST /interrupt-response — Backward-compatible interrupt response endpoint
 */

import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { handleError, ErrorCode } from '@inkdown/shared'
import type { ResearchAgent } from '@inkdown/ai/agents'
import { authMiddleware, requireAuth } from '../middleware/auth'
import { creditGuard, requestContextMiddleware } from '../middleware/credits'
import { rateLimitMiddleware } from '../middleware/rate-limit'

const research = new Hono()

// Apply auth middleware
research.use('*', authMiddleware)
research.use('*', creditGuard)
research.use('*', requestContextMiddleware)
research.use('*', rateLimitMiddleware())

// =============================================================================
// In-Memory Agent Registry (for interrupt resolution)
// =============================================================================

interface AgentEntry {
  agent: ResearchAgent
  expiresAt: number
}

const agentRegistry = new Map<string, AgentEntry>()

function cleanupRegistry() {
  const now = Date.now()
  for (const [key, entry] of agentRegistry) {
    if (entry.expiresAt < now) agentRegistry.delete(key)
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
research.use('*', async (_c, next) => {
  maybeCleanup()
  await next()
})

// =============================================================================
// Chat (Streaming SSE)
// =============================================================================

const ChatSchema = z.object({
  message: z.string().min(1).max(10000),
  threadId: z.string().optional(),
  outputPreference: z.enum(['chat', 'md_file', 'note']).optional(),
})

/**
 * POST /api/research/chat
 * Streaming research chat via SSE
 */
research.post('/chat', zValidator('json', ChatSchema), async (c) => {
  const auth = requireAuth(c)
  const body = c.req.valid('json')

  // Safety: detect potential prompt injection
  const { detectInjection } = await import('@inkdown/ai/safety')
  const { aiSafetyLog } = await import('@inkdown/ai/observability')
  const injectionCheck = detectInjection(body.message)
  if (injectionCheck.detected) {
    aiSafetyLog(injectionCheck.shouldBlock ? 'injection_blocked' : 'injection_detected', {
      userId: auth.userId,
      patterns: injectionCheck.patterns,
      route: 'research-chat',
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

  const openaiApiKey = process.env.OPENAI_API_KEY
  const researchModel = process.env.RESEARCH_MODEL

  if (!openaiApiKey) {
    return c.json({ error: 'OpenAI API key not configured' }, 500)
  }

  const { ResearchAgent: ResearchAgentClass } = await import('@inkdown/ai/agents')
  const { SharedContextService } = await import('@inkdown/ai/services')

  const agent = new ResearchAgentClass({
    supabase: auth.supabase,
    userId: auth.userId,
    model: researchModel,
    sharedContextService: new SharedContextService(auth.supabase, auth.userId),
  })

  const threadId = body.threadId || crypto.randomUUID()

  // Hydrate persisted thread state for follow-up turns.
  const { data: persistedState } = await auth.supabase
    .from('research_thread_state')
    .select('files, todos, note_draft')
    .eq('thread_id', threadId)
    .maybeSingle()

  if (persistedState) {
    agent.hydrateState({
      files: Array.isArray(persistedState.files) ? persistedState.files : [],
      todos: Array.isArray(persistedState.todos) ? persistedState.todos : [],
      noteDraft:
        persistedState.note_draft && typeof persistedState.note_draft === 'object'
          ? persistedState.note_draft
          : null,
    })
  }

  // Register agent for interrupt resolution (10 minute TTL)
  agentRegistry.set(threadId, { agent, expiresAt: Date.now() + 600_000 })

  return streamSSE(c, async (stream) => {
    // Buffers for persistence
    let assistantContent = ''
    const collectedToolCalls: unknown[] = []
    const collectedSubagents: unknown[] = []

    try {
      // Upsert thread before streaming
      const { error: threadUpsertError } = await auth.supabase.from('research_threads').upsert(
        {
          id: threadId,
          user_id: auth.userId,
          title: body.message.slice(0, 100),
          status: 'busy',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      )
      if (threadUpsertError) {
        throw threadUpsertError
      }

      // Persist user message
      await auth.supabase.from('research_messages').insert({
        thread_id: threadId,
        role: 'user',
        content: body.message,
      })

      for await (const event of agent.stream({
        message: body.message,
        threadId,
        outputPreference: body.outputPreference,
      })) {
        if (c.req.raw.signal.aborted) break

        // Collect data for persistence
        if (event.event === 'text' && typeof event.data === 'string') {
          assistantContent += event.data
        } else if (event.event === 'tool_call') {
          collectedToolCalls.push(
            typeof event.data === 'string' ? JSON.parse(event.data) : event.data
          )
        } else if (event.event === 'subagent-start' || event.event === 'subagent-result') {
          collectedSubagents.push(
            typeof event.data === 'string' ? JSON.parse(event.data) : event.data
          )
        }

        await stream.writeSSE({
          event: event.event,
          data: JSON.stringify(event),
        })
      }

      // --- Post-stream persistence ---

      // Persist assistant message
      await auth.supabase.from('research_messages').insert({
        thread_id: threadId,
        role: 'assistant',
        content: assistantContent,
        tool_calls: collectedToolCalls.length > 0 ? collectedToolCalls : null,
        subagents: collectedSubagents.length > 0 ? collectedSubagents : null,
      })

      // Persist thread state (files + todos)
      const agentState = agent.getState()
      const filesJson = agentState.files.map((f) => ({
        name: f.name,
        content: f.content,
        createdAt: f.createdAt,
        updatedAt: f.updatedAt,
      }))

      await auth.supabase.from('research_thread_state').upsert(
        {
          thread_id: threadId,
          files: filesJson,
          todos: agentState.todos,
          note_draft: agentState.noteDraft,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'thread_id' }
      )

      // Update thread status back to idle
      await auth.supabase
        .from('research_threads')
        .update({ status: 'idle', updated_at: new Date().toISOString() })
        .eq('id', threadId)
    } catch (err) {
      // Update thread status to error (best-effort, ignore failures)
      try {
        await auth.supabase
          .from('research_threads')
          .update({ status: 'error', updated_at: new Date().toISOString() })
          .eq('id', threadId)
      } catch {
        // Ignore — this is best-effort error status update
      }

      const appError = handleError(err, ErrorCode.AI_PROVIDER_ERROR)
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ event: 'error', data: appError.userMessage }),
      })
    }
  })
})

// =============================================================================
// Interrupt Response
// =============================================================================

const InterruptResponseSchema = z.object({
  decision: z.enum(['approve', 'reject', 'edit']),
  message: z.string().optional(),
  editedArgs: z.record(z.unknown()).optional(),
})

const InterruptResponseWithThreadSchema = InterruptResponseSchema.extend({
  threadId: z.string().min(1),
})

function resolveInterruptForThread(
  threadId: string,
  body: z.infer<typeof InterruptResponseSchema>
) {
  // Clean up expired entries before lookup
  cleanupRegistry()

  const entry = agentRegistry.get(threadId)
  if (!entry) {
    return {
      ok: false as const,
      status: 404 as const,
      payload: { error: 'No active agent found for this thread' },
    }
  }

  const resolved = entry.agent.resolveInterrupt({
    decision: body.decision,
    message: body.message,
    editedArgs: body.editedArgs,
  })

  if (!resolved) {
    return {
      ok: false as const,
      status: 400 as const,
      payload: { error: 'No pending interrupt to resolve' },
    }
  }

  // Extend the TTL since the agent is still active
  entry.expiresAt = Date.now() + 600_000
  return { ok: true as const, status: 200 as const, payload: { success: true, threadId } }
}

/**
 * POST /api/research/threads/:threadId/interrupt-response
 * Respond to a pending interrupt and stream the resumed agent output
 */
research.post(
  '/threads/:threadId/interrupt-response',
  zValidator('json', InterruptResponseSchema),
  async (c) => {
    requireAuth(c)
    const threadId = c.req.param('threadId')
    const body = c.req.valid('json')
    const result = resolveInterruptForThread(threadId, body)
    return c.json(result.payload, result.status)
  }
)

/**
 * Backward-compat endpoint for clients still posting threadId in body.
 * Returns JSON (the /chat SSE stream continues on the original connection).
 */
research.post(
  '/interrupt-response',
  zValidator('json', InterruptResponseWithThreadSchema),
  async (c) => {
    requireAuth(c)
    const body = c.req.valid('json')
    const result = resolveInterruptForThread(body.threadId, body)
    return c.json(result.payload, result.status)
  }
)

// =============================================================================
// Thread Management
// =============================================================================

/**
 * GET /api/research/threads
 * List user's research threads
 */
research.get('/threads', async (c) => {
  const auth = requireAuth(c)

  const { data, error } = await auth.supabase
    .from('research_threads')
    .select('*')
    .eq('user_id', auth.userId)
    .order('updated_at', { ascending: false })

  if (error) {
    throw handleError(error, ErrorCode.INTERNAL)
  }

  return c.json({
    threads: (data || []).map((t) => ({
      id: t.id,
      userId: t.user_id,
      title: t.title || '',
      status: t.status || 'idle',
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    })),
  })
})

/**
 * GET /api/research/threads/:threadId/messages
 * Get messages and state for a thread
 */
research.get('/threads/:threadId/messages', async (c) => {
  const auth = requireAuth(c)
  const threadId = c.req.param('threadId')

  // Verify ownership by fetching the thread
  const { data: thread, error: threadError } = await auth.supabase
    .from('research_threads')
    .select('id, status')
    .eq('id', threadId)
    .eq('user_id', auth.userId)
    .single()

  if (threadError || !thread) {
    return c.json({ error: 'Thread not found' }, 404)
  }

  // Fetch messages
  const { data: messages, error: msgError } = await auth.supabase
    .from('research_messages')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })

  if (msgError) {
    throw handleError(msgError, ErrorCode.INTERNAL)
  }

  // Fetch thread state (files + todos)
  const { data: stateRow } = await auth.supabase
    .from('research_thread_state')
    .select('files, todos, note_draft')
    .eq('thread_id', threadId)
    .single()

  return c.json({
    messages: (messages || []).map((m) => ({
      id: m.id,
      threadId: m.thread_id,
      role: m.role,
      content: m.content,
      toolCalls: m.tool_calls || null,
      subagents: m.subagents || null,
      createdAt: m.created_at,
    })),
    files: stateRow?.files || [],
    todos: stateRow?.todos || [],
    noteDraft: stateRow?.note_draft || null,
    status: thread.status || 'idle',
  })
})

const SaveDraftSchema = z.object({
  title: z.string().min(1).max(300),
  content: z.string().max(200000),
})

/**
 * POST /api/research/threads/:threadId/save-draft
 * Save current note draft into real notes table.
 */
research.post('/threads/:threadId/save-draft', zValidator('json', SaveDraftSchema), async (c) => {
  const auth = requireAuth(c)
  const threadId = c.req.param('threadId')
  const body = c.req.valid('json')
  const now = new Date().toISOString()

  const { data: thread, error: threadError } = await auth.supabase
    .from('research_threads')
    .select('id')
    .eq('id', threadId)
    .eq('user_id', auth.userId)
    .single()

  if (threadError || !thread) {
    return c.json({ error: 'Thread not found' }, 404)
  }

  const { data: stateRow } = await auth.supabase
    .from('research_thread_state')
    .select('note_draft')
    .eq('thread_id', threadId)
    .maybeSingle()

  const existingDraft =
    stateRow?.note_draft && typeof stateRow.note_draft === 'object'
      ? (stateRow.note_draft as Record<string, unknown>)
      : null

  let noteId = typeof existingDraft?.noteId === 'string' ? existingDraft.noteId : ''
  const wordCount = body.content.split(/\s+/).filter(Boolean).length
  const characterCount = body.content.replace(/\s/g, '').length

  if (noteId) {
    const { error: updateError } = await auth.supabase
      .from('notes')
      .update({
        title: body.title,
        content: body.content,
        word_count: wordCount,
        character_count: characterCount,
        updated_at: now,
      })
      .eq('id', noteId)
      .eq('user_id', auth.userId)

    if (updateError) {
      throw handleError(updateError, ErrorCode.INTERNAL)
    }
  } else {
    const { data: createdNote, error: createError } = await auth.supabase
      .from('notes')
      .insert({
        user_id: auth.userId,
        title: body.title,
        content: body.content,
        word_count: wordCount,
        character_count: characterCount,
      })
      .select('id')
      .single()

    if (createError || !createdNote) {
      throw handleError(createError, ErrorCode.INTERNAL)
    }
    noteId = (createdNote as { id: string }).id
  }

  const nextDraft = {
    draftId:
      typeof existingDraft?.draftId === 'string' ? existingDraft.draftId : `draft-${threadId}`,
    title: body.title,
    originalContent: body.content,
    proposedContent: body.content,
    currentContent: body.content,
    noteId,
    savedAt: now,
    updatedAt: now,
  }

  const { error: upsertError } = await auth.supabase.from('research_thread_state').upsert(
    {
      thread_id: threadId,
      note_draft: nextDraft,
      updated_at: now,
    },
    { onConflict: 'thread_id' }
  )

  if (upsertError) {
    throw handleError(upsertError, ErrorCode.INTERNAL)
  }

  return c.json({ noteId, title: body.title, savedAt: now })
})

/**
 * DELETE /api/research/threads/:threadId
 * Delete a thread and its messages (cascade)
 */
research.delete('/threads/:threadId', async (c) => {
  const auth = requireAuth(c)
  const threadId = c.req.param('threadId')

  // Verify ownership
  const { data: thread, error: checkError } = await auth.supabase
    .from('research_threads')
    .select('id')
    .eq('id', threadId)
    .eq('user_id', auth.userId)
    .single()

  if (checkError || !thread) {
    return c.json({ error: 'Thread not found' }, 404)
  }

  const { error } = await auth.supabase
    .from('research_threads')
    .delete()
    .eq('id', threadId)
    .eq('user_id', auth.userId)

  if (error) {
    throw handleError(error, ErrorCode.INTERNAL)
  }

  // Clean up agent registry entry if exists
  agentRegistry.delete(threadId)

  return c.json({ success: true })
})

/**
 * PATCH /api/research/threads/:threadId
 * Update thread title
 */
const UpdateThreadSchema = z.object({
  title: z.string().min(1).max(200),
})

research.patch('/threads/:threadId', zValidator('json', UpdateThreadSchema), async (c) => {
  const auth = requireAuth(c)
  const threadId = c.req.param('threadId')
  const body = c.req.valid('json')

  // Verify ownership
  const { data: thread, error: checkError } = await auth.supabase
    .from('research_threads')
    .select('id')
    .eq('id', threadId)
    .eq('user_id', auth.userId)
    .single()

  if (checkError || !thread) {
    return c.json({ error: 'Thread not found' }, 404)
  }

  const { error } = await auth.supabase
    .from('research_threads')
    .update({
      title: body.title,
      updated_at: new Date().toISOString(),
    })
    .eq('id', threadId)
    .eq('user_id', auth.userId)

  if (error) {
    throw handleError(error, ErrorCode.INTERNAL)
  }

  return c.json({ success: true })
})

export default research
