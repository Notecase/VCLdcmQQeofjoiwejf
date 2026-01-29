/**
 * Orchestration API Routes
 *
 * Hono routes for workflow orchestration.
 * Supports pre-built templates and AI-planned custom workflows.
 */

import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { authMiddleware, requireAuth } from '../middleware/auth'

const orchestration = new Hono()

// Apply auth middleware
orchestration.use('*', authMiddleware)

// ============================================================================
// Request Schemas
// ============================================================================

const ExecuteWorkflowSchema = z.object({
  prompt: z.string().optional(),
  templateId: z.string().optional(),
  parameters: z.record(z.unknown()).optional(),
  noteId: z.string().uuid().optional(),
})

// ============================================================================
// Workflow Templates
// ============================================================================

/**
 * List all available workflow templates
 * GET /api/orchestration/workflows
 */
orchestration.get('/workflows', async (c) => {
  const { createOrchestrationService } = await import('@inkdown/ai')
  const openaiApiKey = process.env.OPENAI_API_KEY

  if (!openaiApiKey) {
    return c.json({ error: 'OpenAI API key not configured' }, 500)
  }

  const service = createOrchestrationService(openaiApiKey)
  const templates = service.getTemplates()

  return c.json({
    templates: templates.map(
      (t: {
        id: string
        name: string
        description: string
        tags: string[]
        icon: string
        steps: unknown[]
        parameters: unknown[]
      }) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        tags: t.tags,
        icon: t.icon,
        stepCount: t.steps.length,
        parameters: t.parameters,
      })
    ),
  })
})

/**
 * Get a specific workflow template
 * GET /api/orchestration/workflows/:id
 */
orchestration.get('/workflows/:id', async (c) => {
  const { createOrchestrationService } = await import('@inkdown/ai')
  const openaiApiKey = process.env.OPENAI_API_KEY

  if (!openaiApiKey) {
    return c.json({ error: 'OpenAI API key not configured' }, 500)
  }

  const templateId = c.req.param('id')
  const service = createOrchestrationService(openaiApiKey)
  const template = service.getTemplate(templateId)

  if (!template) {
    return c.json({ error: 'Template not found' }, 404)
  }

  return c.json({ template })
})

/**
 * Get template suggestions based on prompt
 * GET /api/orchestration/workflows/suggest?q=...
 */
orchestration.get('/suggest', async (c) => {
  const { createOrchestrationService } = await import('@inkdown/ai')
  const openaiApiKey = process.env.OPENAI_API_KEY

  if (!openaiApiKey) {
    return c.json({ error: 'OpenAI API key not configured' }, 500)
  }

  const query = c.req.query('q') || ''
  const service = createOrchestrationService(openaiApiKey)
  const suggestions = service.suggestTemplates(query)

  return c.json({
    suggestions: suggestions.map(
      (t: { id: string; name: string; description: string; icon: string }) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        icon: t.icon,
      })
    ),
  })
})

// ============================================================================
// Workflow Execution
// ============================================================================

/**
 * Execute a workflow
 * POST /api/orchestration/execute
 */
orchestration.post('/execute', zValidator('json', ExecuteWorkflowSchema), async (c) => {
  requireAuth(c)
  const body = c.req.valid('json')
  const openaiApiKey = process.env.OPENAI_API_KEY

  if (!openaiApiKey) {
    return c.json({ error: 'OpenAI API key not configured' }, 500)
  }

  if (!body.prompt && !body.templateId) {
    return c.json({ error: 'Either prompt or templateId is required' }, 400)
  }

  const { createOrchestrationService } = await import('@inkdown/ai')
  const service = createOrchestrationService(openaiApiKey)

  // Check Accept header for SSE
  const acceptSSE = c.req.header('Accept')?.includes('text/event-stream')

  if (acceptSSE) {
    return streamSSE(c, async (stream) => {
      try {
        const result = await service.orchestrateWorkflow(
          {
            prompt: body.prompt,
            templateId: body.templateId,
            parameters: body.parameters,
            noteId: body.noteId,
          },
          async (progress: {
            workflowId: string
            state: unknown
            currentStep?: string
            currentStepIndex: number
            totalSteps: number
            message: string
          }) => {
            await stream.writeSSE({
              data: JSON.stringify({ type: 'progress', ...progress }),
            })
          }
        )

        await stream.writeSSE({
          data: JSON.stringify({ type: 'complete', result }),
        })
      } catch (error) {
        await stream.writeSSE({
          data: JSON.stringify({ type: 'error', error: String(error) }),
        })
      }
    })
  }

  try {
    const result = await service.orchestrateWorkflow({
      prompt: body.prompt,
      templateId: body.templateId,
      parameters: body.parameters,
      noteId: body.noteId,
    })

    return c.json(result)
  } catch (error) {
    return c.json({ error: String(error) }, 500)
  }
})

/**
 * Get workflow execution status
 * GET /api/orchestration/execution/:id
 */
orchestration.get('/execution/:id', async (c) => {
  const { createOrchestrationService } = await import('@inkdown/ai')
  const openaiApiKey = process.env.OPENAI_API_KEY

  if (!openaiApiKey) {
    return c.json({ error: 'OpenAI API key not configured' }, 500)
  }

  const workflowId = c.req.param('id')
  const service = createOrchestrationService(openaiApiKey)
  const status = service.getWorkflowStatus(workflowId)

  if (!status) {
    return c.json({ error: 'Workflow not found' }, 404)
  }

  return c.json({ workflowId, status })
})

/**
 * Cancel a running workflow
 * POST /api/orchestration/execution/:id/cancel
 */
orchestration.post('/execution/:id/cancel', async (c) => {
  const { createOrchestrationService } = await import('@inkdown/ai')
  const openaiApiKey = process.env.OPENAI_API_KEY

  if (!openaiApiKey) {
    return c.json({ error: 'OpenAI API key not configured' }, 500)
  }

  const workflowId = c.req.param('id')
  const service = createOrchestrationService(openaiApiKey)
  const cancelled = service.cancelWorkflow(workflowId)

  if (!cancelled) {
    return c.json({ error: 'Workflow not found or already completed' }, 400)
  }

  return c.json({ success: true, message: 'Workflow cancelled' })
})

// ============================================================================
// Convenience Endpoints
// ============================================================================

/**
 * Quick create expense tracker
 * POST /api/orchestration/quick/expense-tracker
 */
orchestration.post('/quick/expense-tracker', async (c) => {
  requireAuth(c)
  const openaiApiKey = process.env.OPENAI_API_KEY

  if (!openaiApiKey) {
    return c.json({ error: 'OpenAI API key not configured' }, 500)
  }

  const body = await c.req.json().catch(() => ({}))

  const { createOrchestrationService } = await import('@inkdown/ai')
  const service = createOrchestrationService(openaiApiKey)

  const result = await service.createExpenseTracker(body.title, body.noteId)
  return c.json(result)
})

/**
 * Quick create todo list
 * POST /api/orchestration/quick/todo-list
 */
orchestration.post('/quick/todo-list', async (c) => {
  requireAuth(c)
  const openaiApiKey = process.env.OPENAI_API_KEY

  if (!openaiApiKey) {
    return c.json({ error: 'OpenAI API key not configured' }, 500)
  }

  const body = await c.req.json().catch(() => ({}))

  const { createOrchestrationService } = await import('@inkdown/ai')
  const service = createOrchestrationService(openaiApiKey)

  const result = await service.createTodoList(body.title, body.noteId)
  return c.json(result)
})

/**
 * Quick create project dashboard
 * POST /api/orchestration/quick/project-dashboard
 */
orchestration.post('/quick/project-dashboard', async (c) => {
  requireAuth(c)
  const openaiApiKey = process.env.OPENAI_API_KEY

  if (!openaiApiKey) {
    return c.json({ error: 'OpenAI API key not configured' }, 500)
  }

  const body = await c.req.json().catch(() => ({}))

  const { createOrchestrationService } = await import('@inkdown/ai')
  const service = createOrchestrationService(openaiApiKey)

  const result = await service.createProjectDashboard(body.title, body.noteId)
  return c.json(result)
})

/**
 * Quick create meeting notes
 * POST /api/orchestration/quick/meeting-notes
 */
orchestration.post('/quick/meeting-notes', async (c) => {
  requireAuth(c)
  const openaiApiKey = process.env.OPENAI_API_KEY

  if (!openaiApiKey) {
    return c.json({ error: 'OpenAI API key not configured' }, 500)
  }

  const body = await c.req.json().catch(() => ({}))

  const { createOrchestrationService } = await import('@inkdown/ai')
  const service = createOrchestrationService(openaiApiKey)

  const result = await service.createMeetingNotes(body.meetingTitle, body.noteId)
  return c.json(result)
})

/**
 * Quick create habit tracker
 * POST /api/orchestration/quick/habit-tracker
 */
orchestration.post('/quick/habit-tracker', async (c) => {
  requireAuth(c)
  const openaiApiKey = process.env.OPENAI_API_KEY

  if (!openaiApiKey) {
    return c.json({ error: 'OpenAI API key not configured' }, 500)
  }

  const body = await c.req.json().catch(() => ({}))

  const { createOrchestrationService } = await import('@inkdown/ai')
  const service = createOrchestrationService(openaiApiKey)

  const result = await service.createHabitTracker(body.title, body.noteId)
  return c.json(result)
})

export default orchestration
