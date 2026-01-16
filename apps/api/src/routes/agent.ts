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
const AgentTypes = ['chat', 'note', 'planner', 'course'] as const
type AgentType = typeof AgentTypes[number]

/**
 * Agent request schema
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
 * Run an agent
 * POST /api/agent/:agentType
 */
agent.post(
  '/:agentType',
  zValidator('json', AgentRequestSchema),
  async (c) => {
    const auth = requireAuth(c)
    const agentType = c.req.param('agentType') as AgentType
    const body = c.req.valid('json')

    // Validate agent type
    if (!AgentTypes.includes(agentType)) {
      return c.json({ error: `Unknown agent type: ${agentType}` }, 400)
    }

    // TODO: Phase 3 - Implement LangGraph agents
    // For now, return placeholder responses

    if (body.stream) {
      return streamSSE(c, async (stream) => {
        const messages = getAgentPlaceholderMessages(agentType, body.input)

        for (const msg of messages) {
          await stream.writeSSE({
            data: JSON.stringify({
              type: 'text-delta',
              textDelta: msg,
            }),
          })
          await new Promise(resolve => setTimeout(resolve, 100))
        }

        await stream.writeSSE({
          data: JSON.stringify({
            type: 'finish',
            finishReason: 'stop',
            agentType,
          }),
        })
      })
    }

    return c.json({
      agentType,
      input: body.input,
      output: getAgentPlaceholderResponse(agentType, body.input),
      metadata: {
        status: 'placeholder',
        message: 'Full agent implementation coming in Phase 3',
      },
    })
  }
)

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

    // TODO: Phase 3 - Implement note agent with tools
    // For now, return placeholder

    return c.json({
      action: body.action,
      status: 'placeholder',
      result: {
        message: `Note agent "${body.action}" action will be implemented in Phase 3`,
        noteId: body.noteId,
      },
    })
  }
)

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

    // TODO: Phase 3 - Implement course generation agent
    // For now, return placeholder outline

    const outline = {
      title: 'Generated Course',
      description: 'A course generated from your notes',
      modules: notes.map((note, i) => ({
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
      status: 'placeholder',
      sourceNotesCount: notes.length,
      outline,
      metadata: {
        message: 'Course generation agent will be fully implemented in Phase 3',
        options: body.options,
      },
    })
  }
)

/**
 * Planner agent - decompose tasks
 * POST /api/agent/planner/plan
 */
agent.post(
  '/planner/plan',
  zValidator('json', z.object({
    goal: z.string().min(1).max(2000),
    context: z.string().optional(),
    constraints: z.array(z.string()).optional(),
  })),
  async (c) => {
    const auth = requireAuth(c)
    const body = c.req.valid('json')

    // TODO: Phase 3 - Implement planner agent
    // For now, return placeholder plan

    return c.json({
      goal: body.goal,
      status: 'placeholder',
      plan: {
        summary: 'This is a placeholder plan',
        steps: [
          { id: 1, description: 'Step 1: Analyze the goal', status: 'pending' },
          { id: 2, description: 'Step 2: Break down into subtasks', status: 'pending' },
          { id: 3, description: 'Step 3: Execute and verify', status: 'pending' },
        ],
      },
      metadata: {
        message: 'Planner agent will be fully implemented in Phase 3',
      },
    })
  }
)

/**
 * Get available agents and their capabilities
 * GET /api/agent/capabilities
 */
agent.get('/capabilities', (c) => {
  return c.json({
    agents: [
      {
        type: 'chat',
        name: 'Chat Agent',
        description: 'General-purpose chat with document context and RAG',
        status: 'placeholder',
        capabilities: ['chat', 'rag', 'citations'],
      },
      {
        type: 'note',
        name: 'Note Agent',
        description: 'Create, update, and organize notes using AI',
        status: 'placeholder',
        capabilities: ['create', 'update', 'organize', 'summarize', 'expand'],
      },
      {
        type: 'planner',
        name: 'Planner Agent',
        description: 'Decompose goals into actionable steps',
        status: 'placeholder',
        capabilities: ['plan', 'decompose', 'track'],
      },
      {
        type: 'course',
        name: 'Course Agent',
        description: 'Generate courses from note collections',
        status: 'placeholder',
        capabilities: ['analyze', 'outline', 'generate'],
      },
    ],
  })
})

/**
 * Helper: Get placeholder messages for streaming
 */
function getAgentPlaceholderMessages(agentType: string, input: string): string[] {
  const baseMessages = [
    `[${agentType.toUpperCase()} AGENT] `,
    'Processing your request... ',
    `Input received: "${input.substring(0, 50)}${input.length > 50 ? '...' : ''}" `,
    '\n\nThis is a placeholder response. ',
    'Full agent implementation coming in Phase 3. ',
    `\n\nThe ${agentType} agent will be able to: `,
  ]

  const agentSpecificMessages: Record<string, string[]> = {
    chat: ['\n- Answer questions using your notes', '\n- Provide citations', '\n- Maintain conversation context'],
    note: ['\n- Create new notes', '\n- Update existing content', '\n- Organize and restructure'],
    planner: ['\n- Break down complex goals', '\n- Create actionable steps', '\n- Track progress'],
    course: ['\n- Analyze source notes', '\n- Generate curriculum', '\n- Create module content'],
  }

  return [...baseMessages, ...(agentSpecificMessages[agentType] || [])]
}

/**
 * Helper: Get placeholder response
 */
function getAgentPlaceholderResponse(agentType: string, input: string): string {
  return `[${agentType.toUpperCase()} AGENT] This is a placeholder response for: "${input.substring(0, 100)}". Full implementation coming in Phase 3.`
}

export default agent
