import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { authMiddleware, requireAuth } from '../middleware/auth'

const chat = new Hono()

// Apply auth middleware to all routes
chat.use('*', authMiddleware)

/**
 * Chat message schema
 */
const ChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1),
})

/**
 * Chat request schema
 */
const ChatRequestSchema = z.object({
  messages: z.array(ChatMessageSchema).min(1),
  sessionId: z.string().uuid().optional(),
  noteId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  model: z.string().optional(),
  stream: z.boolean().default(true),
})

/**
 * Send a chat message
 * POST /api/chat
 *
 * Supports streaming (SSE) and non-streaming responses
 */
chat.post('/', zValidator('json', ChatRequestSchema), async (c) => {
  requireAuth(c) // Validate auth

  // Placeholder - not yet implemented
  return c.json(
    {
      error: 'Not Implemented',
      message: 'Chat endpoint not yet implemented. Full AI integration coming in Phase 1.',
    },
    501
  )
})

/**
 * List chat sessions
 * GET /api/chat/sessions
 */
chat.get('/sessions', async (c) => {
  const auth = requireAuth(c)

  const { data: sessions, error } = await auth.supabase
    .from('chat_sessions')
    .select('*')
    .eq('is_archived', false)
    .order('updated_at', { ascending: false })
    .limit(50)

  if (error) {
    throw new Error(error.message)
  }

  return c.json({ sessions })
})

/**
 * Get chat session with messages
 * GET /api/chat/sessions/:sessionId
 */
chat.get('/sessions/:sessionId', async (c) => {
  const auth = requireAuth(c)
  const sessionId = c.req.param('sessionId')

  // Get session
  const { data: session, error: sessionError } = await auth.supabase
    .from('chat_sessions')
    .select('*')
    .eq('id', sessionId)
    .single()

  if (sessionError || !session) {
    return c.json({ error: 'Session not found' }, 404)
  }

  // Get messages
  const { data: messages, error: messagesError } = await auth.supabase
    .from('chat_messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })

  if (messagesError) {
    throw new Error(messagesError.message)
  }

  return c.json({ session, messages })
})

/**
 * Create new chat session
 * POST /api/chat/sessions
 */
chat.post(
  '/sessions',
  zValidator(
    'json',
    z.object({
      title: z.string().optional(),
      contextNoteIds: z.array(z.string().uuid()).optional(),
      contextProjectId: z.string().uuid().optional(),
      agentType: z.string().optional(),
    })
  ),
  async (c) => {
    const auth = requireAuth(c)
    const body = c.req.valid('json')

    const { data: session, error } = await auth.supabase
      .from('chat_sessions')
      .insert({
        user_id: auth.userId,
        title: body.title || 'New Chat',
        context_note_ids: body.contextNoteIds || [],
        context_project_id: body.contextProjectId,
        agent_type: body.agentType,
      })
      .select()
      .single()

    if (error) {
      throw new Error(error.message)
    }

    return c.json({ session }, 201)
  }
)

/**
 * Delete chat session
 * DELETE /api/chat/sessions/:sessionId
 */
chat.delete('/sessions/:sessionId', async (c) => {
  const auth = requireAuth(c)
  const sessionId = c.req.param('sessionId')

  const { error } = await auth.supabase.from('chat_sessions').delete().eq('id', sessionId)

  if (error) {
    throw new Error(error.message)
  }

  return c.json({ success: true })
})

export default chat
