/**
 * Agent API Routes
 * 
 * Hono routes for AI agents with Vercel AI SDK compatible streaming.
 * Integrates Chat, Note, Secretary, and Planner agents.
 */

import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { authMiddleware, requireAuth } from '../middleware/auth'

const agent = new Hono()

// Apply auth middleware
agent.use('*', authMiddleware)

/**
 * Available agent types
 */
const AgentTypes = ['chat', 'note', 'secretary', 'planner', 'course'] as const
type AgentType = typeof AgentTypes[number]

/**
 * Generic agent request schema
 */
const AgentRequestSchema = z.object({
  input: z.string().min(1).max(10000),
  context: z.object({
    noteIds: z.array(z.string().uuid()).optional(),
    projectId: z.string().uuid().optional(),
    currentNoteId: z.string().uuid().optional(),
  }).optional(),
  sessionId: z.string().uuid().optional(),
  stream: z.boolean().default(true),
})

/**
 * Note agent action schema
 */
const NoteAgentSchema = z.object({
  action: z.enum(['create', 'update', 'organize', 'summarize', 'expand']),
  noteId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  input: z.string().min(1),
  stream: z.boolean().default(true),
})

/**
 * Course agent schema
 */
const CourseAgentSchema = z.object({
  sourceNoteIds: z.array(z.string().uuid()).min(1),
  targetProjectId: z.string().uuid().optional(),
  options: z.object({
    moduleCount: z.number().int().min(1).max(20).optional(),
    difficulty: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
    format: z.enum(['lessons', 'modules', 'chapters']).optional(),
  }).optional(),
})

/**
 * Planner schema
 */
const PlannerSchema = z.object({
  goal: z.string().min(1).max(2000),
  context: z.string().optional(),
  constraints: z.array(z.string()).optional(),
  maxSteps: z.number().int().min(1).max(20).optional(),
  stream: z.boolean().default(true),
})

// ============================================================================
// Secretary Agent (Main Entry Point)
// ============================================================================

/**
 * Secretary agent - intelligent routing
 * POST /api/agent/secretary
 */
agent.post(
  '/secretary',
  zValidator('json', AgentRequestSchema),
  async (c) => {
    const auth = requireAuth(c)
    const body = c.req.valid('json')
    const openaiApiKey = process.env.OPENAI_API_KEY

    if (!openaiApiKey) {
      return c.json({ error: 'OpenAI API key not configured' }, 500)
    }

    // Dynamically import to avoid bundling issues
    const { SecretaryAgent } = await import('@inkdown/ai/agents')

    const agent = new SecretaryAgent({
      supabase: auth.supabase,
      userId: auth.user.id,
      openaiApiKey,
    })

    // Load session if provided
    if (body.sessionId) {
      await agent.loadSession(body.sessionId)
    }

    if (body.stream) {
      return streamSSE(c, async (stream) => {
        try {
          const generator = agent.stream({
            message: body.input,
            context: body.context,
            sessionId: body.sessionId,
          })

          for await (const chunk of generator) {
            await stream.writeSSE({
              data: JSON.stringify(chunk),
            })
          }
        } catch (err) {
          await stream.writeSSE({
            data: JSON.stringify({ type: 'error', data: String(err) }),
          })
        }
      })
    }

    const result = await agent.run({
      message: body.input,
      context: body.context,
      sessionId: body.sessionId,
    })

    return c.json(result)
  }
)

// ============================================================================
// Chat Agent
// ============================================================================

/**
 * Chat agent with RAG
 * POST /api/agent/chat
 */
agent.post(
  '/chat',
  zValidator('json', AgentRequestSchema),
  async (c) => {
    const auth = requireAuth(c)
    const body = c.req.valid('json')
    const openaiApiKey = process.env.OPENAI_API_KEY

    if (!openaiApiKey) {
      return c.json({ error: 'OpenAI API key not configured' }, 500)
    }

    const { ChatAgent } = await import('@inkdown/ai/agents')

    const chatAgent = new ChatAgent({
      supabase: auth.supabase,
      userId: auth.user.id,
      openaiApiKey,
    })

    // Load session if provided
    if (body.sessionId) {
      await chatAgent.loadSession(body.sessionId)
    }

    if (body.stream) {
      return streamSSE(c, async (stream) => {
        try {
          const generator = chatAgent.stream({
            message: body.input,
            context: body.context,
            includeRag: true,
          })

          for await (const chunk of generator) {
            await stream.writeSSE({
              data: JSON.stringify(chunk),
            })
          }
        } catch (err) {
          await stream.writeSSE({
            data: JSON.stringify({ type: 'error', data: String(err) }),
          })
        }
      })
    }

    const result = await chatAgent.run({
      message: body.input,
      context: body.context,
      includeRag: true,
    })

    return c.json(result)
  }
)

// ============================================================================
// Note Agent
// ============================================================================

/**
 * Note manipulation agent
 * POST /api/agent/note/action
 */
agent.post(
  '/note/action',
  zValidator('json', NoteAgentSchema),
  async (c) => {
    const auth = requireAuth(c)
    const body = c.req.valid('json')
    const openaiApiKey = process.env.OPENAI_API_KEY

    if (!openaiApiKey) {
      return c.json({ error: 'OpenAI API key not configured' }, 500)
    }

    const { NoteAgent } = await import('@inkdown/ai/agents')

    const noteAgent = new NoteAgent({
      supabase: auth.supabase,
      userId: auth.user.id,
      openaiApiKey,
    })

    if (body.stream) {
      return streamSSE(c, async (stream) => {
        try {
          const generator = noteAgent.stream({
            action: body.action,
            input: body.input,
            noteId: body.noteId,
            projectId: body.projectId,
          })

          for await (const chunk of generator) {
            await stream.writeSSE({
              data: JSON.stringify(chunk),
            })
          }
        } catch (err) {
          await stream.writeSSE({
            data: JSON.stringify({ type: 'error', data: String(err) }),
          })
        }
      })
    }

    const result = await noteAgent.run({
      action: body.action,
      input: body.input,
      noteId: body.noteId,
      projectId: body.projectId,
    })

    return c.json(result)
  }
)

// ============================================================================
// Planner Agent
// ============================================================================

/**
 * Planner agent - create plan
 * POST /api/agent/planner/plan
 */
agent.post(
  '/planner/plan',
  zValidator('json', PlannerSchema),
  async (c) => {
    const auth = requireAuth(c)
    const body = c.req.valid('json')
    const openaiApiKey = process.env.OPENAI_API_KEY

    if (!openaiApiKey) {
      return c.json({ error: 'OpenAI API key not configured' }, 500)
    }

    const { PlannerAgent } = await import('@inkdown/ai/agents')

    const plannerAgent = new PlannerAgent({
      supabase: auth.supabase,
      userId: auth.user.id,
      openaiApiKey,
    })

    if (body.stream) {
      return streamSSE(c, async (stream) => {
        try {
          const generator = plannerAgent.streamCreatePlan({
            goal: body.goal,
            context: body.context,
            constraints: body.constraints,
            maxSteps: body.maxSteps,
          })

          for await (const chunk of generator) {
            await stream.writeSSE({
              data: JSON.stringify(chunk),
            })
          }
        } catch (err) {
          await stream.writeSSE({
            data: JSON.stringify({ type: 'error', data: String(err) }),
          })
        }
      })
    }

    const result = await plannerAgent.createPlan({
      goal: body.goal,
      context: body.context,
      constraints: body.constraints,
      maxSteps: body.maxSteps,
    })

    return c.json(result)
  }
)

/**
 * Update plan step
 * POST /api/agent/planner/update
 */
agent.post(
  '/planner/update',
  zValidator('json', z.object({
    stepId: z.number().int().min(1),
    status: z.enum(['pending', 'in_progress', 'completed', 'failed']),
    result: z.string().optional(),
  })),
  async (c) => {
    const auth = requireAuth(c)
    const body = c.req.valid('json')
    const openaiApiKey = process.env.OPENAI_API_KEY

    if (!openaiApiKey) {
      return c.json({ error: 'OpenAI API key not configured' }, 500)
    }

    const { PlannerAgent } = await import('@inkdown/ai/agents')

    const plannerAgent = new PlannerAgent({
      supabase: auth.supabase,
      userId: auth.user.id,
      openaiApiKey,
    })

    const result = await plannerAgent.updatePlan(body)
    return c.json(result)
  }
)

// ============================================================================
// Course Agent (Placeholder - uses Gemini)
// ============================================================================

/**
 * Course generation agent
 * POST /api/agent/course/generate
 */
agent.post(
  '/course/generate',
  zValidator('json', CourseAgentSchema),
  async (c) => {
    const auth = requireAuth(c)
    const body = c.req.valid('json')

    // Verify source notes exist
    const { data: notes, error } = await auth.supabase
      .from('notes')
      .select('id, title, content')
      .in('id', body.sourceNoteIds)
      .eq('is_deleted', false)

    if (error) {
      throw new Error(error.message)
    }

    if (!notes || notes.length === 0) {
      return c.json({ error: 'No valid source notes found' }, 400)
    }

    // TODO: Integrate with GeminiProvider for course generation
    // For now, return placeholder using note data
    const outline = {
      title: 'Generated Course',
      description: 'A course generated from your notes',
      modules: (notes as Array<{ id: string; title: string; content: string }>).map((note, i) => ({
        index: i + 1,
        title: `Module ${i + 1}: ${note.title}`,
        sourceNoteId: note.id,
        lessons: [
          { title: 'Introduction', type: 'lesson' },
          { title: 'Key Concepts', type: 'lesson' },
          { title: 'Practice', type: 'exercise' },
        ],
      })),
    }

    return c.json({
      status: 'success',
      sourceNotesCount: notes.length,
      outline,
      metadata: {
        message: 'Course outline generated. Full content generation uses Gemini provider.',
        options: body.options,
      },
    })
  }
)

// ============================================================================
// Capabilities Endpoint
// ============================================================================

/**
 * Get available agents and their capabilities
 * GET /api/agent/capabilities
 */
agent.get('/capabilities', async (c) => {
  // Dynamically import metadata
  const { AGENT_METADATA } = await import('@inkdown/ai/agents')

  return c.json({
    agents: Object.entries(AGENT_METADATA).map(([type, meta]) => ({
      type,
      ...meta,
      status: 'active',
    })),
  })
})

export default agent
