/**
 * Explain API Route
 *
 * POST /api/explain/chat — Streaming SSE chat with the ExplainAgent (course AI tutor)
 */

import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { authMiddleware, requireAuth } from '../middleware/auth'
import { creditGuard, requestContextMiddleware } from '../middleware/credits'

const explain = new Hono()

explain.use('*', authMiddleware)
explain.use('*', creditGuard)
explain.use('*', requestContextMiddleware)

const ExplainChatSchema = z.object({
  message: z.string().min(1).max(10000),
  lessonContext: z.object({
    courseTitle: z.string(),
    moduleTitle: z.string(),
    lessonTitle: z.string(),
    lessonType: z.enum(['lecture', 'video', 'slides', 'practice', 'quiz']),
    markdown: z.string(),
    keyTerms: z.array(z.object({ term: z.string(), definition: z.string() })).optional(),
    keyPoints: z.array(z.string()).optional(),
    transcript: z.string().optional(),
  }),
  highlightedText: z.string().optional(),
  highlightSurroundingContext: z.string().optional(),
  highlightSection: z.string().optional(),
  conversationHistory: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      })
    )
    .optional(),
})

/**
 * POST /api/explain/chat
 * Streaming chat with the ExplainAgent via SSE
 */
explain.post('/chat', zValidator('json', ExplainChatSchema), async (c) => {
  const auth = requireAuth(c)
  const body = c.req.valid('json')

  const { ExplainAgent } = await import('@inkdown/ai/agents')

  const agent = new ExplainAgent({})

  return streamSSE(c, async (stream) => {
    try {
      for await (const event of agent.stream(body)) {
        await stream.writeSSE({
          event: event.event,
          data: JSON.stringify(event),
        })
      }
    } catch (error) {
      console.error('explain.chat.error', {
        userId: auth.userId,
        error: error instanceof Error ? error.message : String(error),
      })
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ event: 'error', data: 'Internal server error' }),
      })
    }
  })
})

export default explain
