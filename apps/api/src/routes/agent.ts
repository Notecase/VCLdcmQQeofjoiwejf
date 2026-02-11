/**
 * Agent API Routes
 *
 * Hono routes for AI agents with Vercel AI SDK compatible streaming.
 * Integrates Chat, Note, Editor, and Planner agents.
 */

import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { authMiddleware, requireAuth } from '../middleware/auth'

const agent = new Hono()

// Apply auth middleware
agent.use('*', authMiddleware)

// ============================================================================
// Editor-Deep Runtime Controls
// ============================================================================

const editorAgentMetrics = {
  emptyResponseTotal: 0,
  noTextStreamTotal: 0,
  fallbackSummaryTotal: 0,
  runtimeErrorTotal: 0,
  noAssistantFinalTotal: 0,
  toolCallTotal: 0,
  toolErrorTotal: 0,
}

function readBooleanEnv(name: string, defaultValue = false): boolean {
  const raw = process.env[name]
  if (!raw) return defaultValue
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase())
}

function readIntegerEnv(name: string, defaultValue: number): number {
  const raw = process.env[name]
  if (!raw) return defaultValue
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue
}

function shouldUseEditorDeepRuntime(_userId: string, requestedRuntime?: 'legacy' | 'editor-deep') {
  const killSwitch = readBooleanEnv('EDITOR_DEEP_AGENT_KILL_SWITCH', false)
  if (killSwitch) return false

  // Legacy path only if EXPLICITLY requested — EditorDeep is now the default for ALL users
  if (requestedRuntime === 'legacy') {
    console.warn('[agent] Legacy EditorAgent runtime is deprecated. Use editor-deep instead.')
    return false
  }

  return true  // Always use EditorDeep
}

function mergeEditorContext(input: {
  context?: Record<string, unknown>
  editorContext?: Record<string, unknown>
}) {
  const merged = {
    ...(input.context || {}),
    ...(input.editorContext || {}),
  }

  return {
    workspaceId:
      typeof merged.workspaceId === 'string' && merged.workspaceId.trim()
        ? merged.workspaceId
        : undefined,
    currentNoteId:
      typeof merged.currentNoteId === 'string' && merged.currentNoteId.trim()
        ? merged.currentNoteId
        : undefined,
    currentBlockId:
      typeof merged.currentBlockId === 'string' && merged.currentBlockId.trim()
        ? merged.currentBlockId
        : undefined,
    selectedBlockIds: Array.isArray(merged.selectedBlockIds)
      ? merged.selectedBlockIds.filter((value): value is string => typeof value === 'string')
      : undefined,
    selectedText:
      typeof merged.selectedText === 'string' && merged.selectedText.trim()
        ? merged.selectedText
        : undefined,
    projectId:
      typeof merged.projectId === 'string' && merged.projectId.trim() ? merged.projectId : undefined,
    noteIds: Array.isArray(merged.noteIds)
      ? merged.noteIds.filter((value): value is string => typeof value === 'string')
      : undefined,
    selectedLineNumbers: Array.isArray(merged.selectedLineNumbers)
      ? merged.selectedLineNumbers.filter((value): value is number => typeof value === 'number')
      : undefined,
  }
}

/**
 * Generic agent request schema
 */
const AgentRequestSchema = z.object({
  input: z.string().min(1).max(10000),
  runtime: z.enum(['legacy', 'editor-deep']).optional(),
  threadId: z.string().uuid().optional(),
  context: z
    .object({
      noteIds: z.array(z.string().uuid()).optional(),
      projectId: z.string().uuid().optional(),
      workspaceId: z.string().optional(),
      currentNoteId: z.string().uuid().optional(),
      currentBlockId: z.string().optional(),
      selectedText: z.string().optional(),
      selectedBlockIds: z.array(z.string()).optional(), // For clarification flow - user-selected targets (deprecated)
      selectedLineNumbers: z.array(z.number()).optional(), // For clarification flow - line numbers are stable across re-parsing
    })
    .optional(),
  editorContext: z
    .object({
      workspaceId: z.string().optional(),
      currentNoteId: z.string().uuid().optional(),
      currentBlockId: z.string().optional(),
      selectedBlockIds: z.array(z.string()).optional(),
      selectedText: z.string().optional(),
      projectId: z.string().uuid().optional(),
      noteIds: z.array(z.string().uuid()).optional(),
      selectedLineNumbers: z.array(z.number()).optional(),
    })
    .optional(),
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
  options: z
    .object({
      moduleCount: z.number().int().min(1).max(20).optional(),
      difficulty: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
      format: z.enum(['lessons', 'modules', 'chapters']).optional(),
    })
    .optional(),
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
// Editor Agent (Main Entry Point)
// ============================================================================

/**
 * Editor agent - intelligent routing
 * POST /api/agent/secretary
 *
 * Routes compound requests (multiple tasks) to DeepAgent for task decomposition.
 * Simple requests continue to use EditorAgent for faster processing.
 */
agent.post('/secretary', zValidator('json', AgentRequestSchema), async (c) => {
  const auth = requireAuth(c)
  const body = c.req.valid('json')
  const openaiApiKey = process.env.OPENAI_API_KEY

  if (!openaiApiKey) {
    return c.json({ error: 'OpenAI API key not configured' }, 500)
  }

  const startTime = Date.now()
  const useEditorDeep = shouldUseEditorDeepRuntime(auth.userId, body.runtime)
  const historyWindowTurns = readIntegerEnv('EDITOR_DEEP_AGENT_HISTORY_WINDOW_TURNS', 12)
  const mergedEditorContext = mergeEditorContext({
    context: body.context as Record<string, unknown> | undefined,
    editorContext: body.editorContext as Record<string, unknown> | undefined,
  })
  const threadId = body.threadId || body.sessionId || crypto.randomUUID()

  if (useEditorDeep) {
    const { EditorDeepAgent } = await import('@inkdown/ai/agents')
    const deepAgent = new EditorDeepAgent({
      supabase: auth.supabase,
      userId: auth.userId,
      openaiApiKey,
    })

    const { data: persistedState } = await auth.supabase
      .from('editor_thread_state')
      .select('editor_context')
      .eq('thread_id', threadId)
      .maybeSingle()

    const effectiveEditorContext = mergeEditorContext({
      context:
        persistedState?.editor_context && typeof persistedState.editor_context === 'object'
          ? (persistedState.editor_context as Record<string, unknown>)
          : undefined,
      editorContext: mergedEditorContext as Record<string, unknown>,
    })

    if (body.stream) {
      return streamSSE(c, async (stream) => {
        let assistantContent = ''
        let assistantStartSeen = false
        let assistantFinalSeen = false
        let lastErrorMessage: string | null = null
        let bufferedDoneEvent: unknown = null
        const collectedToolCalls: unknown[] = []
        const collectedToolResults: unknown[] = []

        try {
          await auth.supabase.from('editor_threads').upsert(
            {
              id: threadId,
              user_id: auth.userId,
              title: body.input.slice(0, 100),
              status: 'busy',
              runtime: 'editor-deep',
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'id' }
          )

          await auth.supabase.from('editor_messages').insert({
            thread_id: threadId,
            user_id: auth.userId,
            role: 'user',
            content: body.input,
            runtime: 'editor-deep',
          })

          for await (const event of deepAgent.stream({
            message: body.input,
            threadId,
            context: effectiveEditorContext,
            historyWindowTurns,
          })) {
            if (event.type === 'assistant-start') {
              assistantStartSeen = true
            }
            if (event.type === 'assistant-delta' && typeof event.data === 'string') {
              assistantContent += event.data
            }
            if (event.type === 'assistant-final' && typeof event.data === 'string') {
              assistantFinalSeen = true
              assistantContent = event.data
            }
            if (event.type === 'error') {
              editorAgentMetrics.runtimeErrorTotal += 1
              lastErrorMessage = typeof event.data === 'string' ? event.data : String(event.data)
            }
            if (event.type === 'done') {
              bufferedDoneEvent = event
              continue
            }
            if (event.type === 'tool-call') {
              editorAgentMetrics.toolCallTotal += 1
              collectedToolCalls.push(event.data)
            }
            if (event.type === 'tool-result') {
              collectedToolResults.push(event.data)
              const toolResult =
                event.data && typeof event.data === 'object'
                  ? (event.data as { result?: unknown }).result
                  : null
              if (
                (typeof toolResult === 'string' && /error|failed/i.test(toolResult)) ||
                (toolResult &&
                  typeof toolResult === 'object' &&
                  (toolResult as { success?: boolean }).success === false)
              ) {
                editorAgentMetrics.toolErrorTotal += 1
              }
            }

            await stream.writeSSE({
              data: JSON.stringify(event),
            })
          }

          if (!assistantFinalSeen) {
            editorAgentMetrics.noAssistantFinalTotal += 1
          }

          if (!assistantContent.trim()) {
            editorAgentMetrics.emptyResponseTotal += 1
            editorAgentMetrics.noTextStreamTotal += 1
            if (effectiveEditorContext.currentNoteId) {
              editorAgentMetrics.fallbackSummaryTotal += 1
            }
            assistantContent =
              deepAgent.getState().assistantText ||
              'I need an open note to answer that. Please open a note or tell me which note to use.'
          }

          if (!assistantFinalSeen) {
            if (!assistantStartSeen) {
              await stream.writeSSE({
                data: JSON.stringify({
                  type: 'assistant-start',
                  data: { sourceNode: 'api-fallback' },
                }),
              })
            }

            await stream.writeSSE({
              data: JSON.stringify({
                type: 'assistant-final',
                data: assistantContent,
              }),
            })
            assistantFinalSeen = true
          }

          if (bufferedDoneEvent) {
            await stream.writeSSE({
              data: JSON.stringify(bufferedDoneEvent),
            })
          } else {
            await stream.writeSSE({
              data: JSON.stringify({
                type: 'done',
                data: { threadId },
              }),
            })
          }

          await auth.supabase.from('editor_messages').insert({
            thread_id: threadId,
            user_id: auth.userId,
            role: 'assistant',
            content: assistantContent,
            tool_calls: collectedToolCalls.length > 0 ? collectedToolCalls : null,
            tool_results: collectedToolResults.length > 0 ? collectedToolResults : null,
            runtime: 'editor-deep',
          })

          await auth.supabase.from('editor_thread_state').upsert(
            {
              thread_id: threadId,
              state: deepAgent.getState(),
              editor_context: effectiveEditorContext,
              last_message_at: new Date().toISOString(),
              last_note_id: effectiveEditorContext.currentNoteId || null,
              rolling_summary: assistantContent.slice(0, 1200),
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'thread_id' }
          )

          await auth.supabase
            .from('editor_threads')
            .update({
              status: 'idle',
              updated_at: new Date().toISOString(),
            })
            .eq('id', threadId)

          const deepState = deepAgent.getState()
          const latencyMs = Date.now() - startTime
          console.info('editor_agent.run', {
            userId: auth.userId,
            runtime: 'editor-deep',
            threadId,
            noteId: effectiveEditorContext.currentNoteId || null,
            historyWindowTurns,
            emittedChars: assistantContent.length,
            historyTurnsLoaded: deepState.historyTurnsLoaded ?? 0,
            longTermMemoriesLoaded: deepState.longTermMemoriesLoaded ?? 0,
            errorMessage: lastErrorMessage,
            metric_editor_agent_latency_ms: latencyMs,
            metric_editor_agent_empty_response_total: editorAgentMetrics.emptyResponseTotal,
            metric_editor_agent_no_text_stream_total: editorAgentMetrics.noTextStreamTotal,
            metric_editor_agent_fallback_summary_total: editorAgentMetrics.fallbackSummaryTotal,
            metric_editor_agent_runtime_error_total: editorAgentMetrics.runtimeErrorTotal,
            metric_editor_agent_no_assistant_final_total: editorAgentMetrics.noAssistantFinalTotal,
            metric_editor_agent_tool_call_total: editorAgentMetrics.toolCallTotal,
            metric_editor_agent_tool_error_total: editorAgentMetrics.toolErrorTotal,
          })
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err)
          editorAgentMetrics.runtimeErrorTotal += 1
          if (!assistantFinalSeen) {
            editorAgentMetrics.noAssistantFinalTotal += 1
          }
          const fallbackAssistantContent =
            assistantContent.trim() ||
            `I hit an internal error while processing your request: ${errorMessage}`

          await auth.supabase
            .from('editor_threads')
            .update({
              status: 'error',
              updated_at: new Date().toISOString(),
            })
            .eq('id', threadId)

          await auth.supabase.from('editor_messages').insert({
            thread_id: threadId,
            user_id: auth.userId,
            role: 'assistant',
            content: fallbackAssistantContent,
            runtime: 'editor-deep',
          })

          await auth.supabase.from('editor_thread_state').upsert(
            {
              thread_id: threadId,
              state: deepAgent.getState(),
              editor_context: effectiveEditorContext,
              last_message_at: new Date().toISOString(),
              last_note_id: effectiveEditorContext.currentNoteId || null,
              rolling_summary: fallbackAssistantContent.slice(0, 1200),
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'thread_id' }
          )

          await stream.writeSSE({
            data: JSON.stringify({
              type: 'error',
              data: errorMessage,
            }),
          })

          if (!assistantStartSeen) {
            await stream.writeSSE({
              data: JSON.stringify({
                type: 'assistant-start',
                data: { sourceNode: 'route-catch-fallback' },
              }),
            })
          }

          if (!assistantFinalSeen) {
            await stream.writeSSE({
              data: JSON.stringify({
                type: 'assistant-final',
                data: fallbackAssistantContent,
              }),
            })
          }

          await stream.writeSSE({
            data: JSON.stringify(
              bufferedDoneEvent || {
                type: 'done',
                data: { threadId },
              }
            ),
          })
        }
      })
    }

    const result = await deepAgent.run({
      message: body.input,
      threadId,
      context: effectiveEditorContext,
      historyWindowTurns,
    })

    await auth.supabase.from('editor_threads').upsert(
      {
        id: threadId,
        user_id: auth.userId,
        title: body.input.slice(0, 100),
        status: 'idle',
        runtime: 'editor-deep',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    )

    await auth.supabase.from('editor_messages').insert([
      {
        thread_id: threadId,
        user_id: auth.userId,
        role: 'user',
        content: body.input,
        runtime: 'editor-deep',
      },
      {
        thread_id: threadId,
        user_id: auth.userId,
        role: 'assistant',
        content: result.response,
        runtime: 'editor-deep',
      },
    ])

    await auth.supabase.from('editor_thread_state').upsert(
      {
        thread_id: threadId,
        state: deepAgent.getState(),
        editor_context: effectiveEditorContext,
        last_message_at: new Date().toISOString(),
        last_note_id: effectiveEditorContext.currentNoteId || null,
        rolling_summary: result.response.slice(0, 1200),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'thread_id' }
    )

    return c.json({
      response: result.response,
      runtime: 'editor-deep',
      threadId: result.threadId,
    })
  }

  // Dynamically import to avoid bundling issues
  const { EditorAgent, InkdownDeepAgent } = await import('@inkdown/ai/agents')

  // Check if this is a compound request requiring task decomposition
  const isCompound = InkdownDeepAgent.isCompoundRequest(body.input)

  if (isCompound && body.stream) {
    // Use DeepAgent for compound requests with streaming
    const deepAgent = new InkdownDeepAgent({
      supabase: auth.supabase,
      userId: auth.userId,
      openaiApiKey,
      ollamaApiKey: process.env.OLLAMA_API_KEY,
    })

    return streamSSE(c, async (stream) => {
      try {
        const generator = deepAgent.stream({
          message: body.input,
          context: mergedEditorContext,
        })

        for await (const event of generator) {
          await stream.writeSSE({
            data: JSON.stringify(event),
          })
        }
      } catch (err) {
        await stream.writeSSE({
          data: JSON.stringify({ type: 'error', data: String(err) }),
        })
      }
    })
  }

  // Use EditorAgent for simple requests or non-streaming
  const editorAgent = new EditorAgent({
    supabase: auth.supabase,
    userId: auth.userId,
    openaiApiKey,
  })

  // Load session if provided
  if (body.sessionId) {
    await editorAgent.loadSession(body.sessionId)
  }

  if (body.stream) {
    return streamSSE(c, async (stream) => {
      try {
        const generator = editorAgent.stream({
          message: body.input,
          context: mergedEditorContext,
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

  const result = await editorAgent.run({
    message: body.input,
    context: mergedEditorContext,
    sessionId: body.sessionId,
  })

  return c.json(result)
})

// ============================================================================
// Chat Agent
// ============================================================================

/**
 * Chat agent with RAG
 * POST /api/agent/chat
 */
agent.post('/chat', zValidator('json', AgentRequestSchema), async (c) => {
  const auth = requireAuth(c)
  const body = c.req.valid('json')
  const openaiApiKey = process.env.OPENAI_API_KEY

  if (!openaiApiKey) {
    return c.json({ error: 'OpenAI API key not configured' }, 500)
  }

  const { ChatAgent } = await import('@inkdown/ai/agents')

  const chatAgent = new ChatAgent({
    supabase: auth.supabase,
    userId: auth.userId,
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
          maxChunks: 5,
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
    maxChunks: 5,
  })

  return c.json(result)
})

// ============================================================================
// Note Agent
// ============================================================================

/**
 * Note manipulation agent
 * POST /api/agent/note/action
 */
agent.post('/note/action', zValidator('json', NoteAgentSchema), async (c) => {
  const auth = requireAuth(c)
  const body = c.req.valid('json')
  const openaiApiKey = process.env.OPENAI_API_KEY

  if (!openaiApiKey) {
    return c.json({ error: 'OpenAI API key not configured' }, 500)
  }

  const { NoteAgent } = await import('@inkdown/ai/agents')

  const noteAgent = new NoteAgent({
    supabase: auth.supabase,
    userId: auth.userId,
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
})

// ============================================================================
// Planner Agent
// ============================================================================

/**
 * Planner agent - create plan
 * POST /api/agent/planner/plan
 */
agent.post('/planner/plan', zValidator('json', PlannerSchema), async (c) => {
  const auth = requireAuth(c)
  const body = c.req.valid('json')
  const openaiApiKey = process.env.OPENAI_API_KEY

  if (!openaiApiKey) {
    return c.json({ error: 'OpenAI API key not configured' }, 500)
  }

  const { PlannerAgent } = await import('@inkdown/ai/agents')

  const plannerAgent = new PlannerAgent({
    supabase: auth.supabase,
    userId: auth.userId,
    openaiApiKey,
  })

  if (body.stream) {
    return streamSSE(c, async (stream) => {
      try {
        const generator = plannerAgent.streamCreatePlan({
          goal: body.goal,
          context: body.context,
          constraints: body.constraints,
          maxSteps: body.maxSteps ?? 10,
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
    maxSteps: body.maxSteps ?? 10,
  })

  return c.json(result)
})

/**
 * Update plan step
 * POST /api/agent/planner/update
 */
agent.post(
  '/planner/update',
  zValidator(
    'json',
    z.object({
      stepId: z.number().int().min(1),
      status: z.enum(['pending', 'in_progress', 'completed', 'failed']),
      result: z.string().optional(),
    })
  ),
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
      userId: auth.userId,
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
agent.post('/course/generate', zValidator('json', CourseAgentSchema), async (c) => {
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
})

// ============================================================================
// Agentic AI (Autonomous Task Execution)
// ============================================================================

/**
 * Agentic task schema
 */
const AgenticTaskSchema = z.object({
  task: z.string().min(1).max(5000),
  noteId: z.string().uuid().optional(),
  dryRun: z.boolean().optional().default(false),
})

/**
 * Execute autonomous task
 * POST /api/agent/agentic/task
 */
agent.post('/agentic/task', zValidator('json', AgenticTaskSchema), async (c) => {
  requireAuth(c)
  const body = c.req.valid('json')
  const openaiApiKey = process.env.OPENAI_API_KEY

  if (!openaiApiKey) {
    return c.json({ error: 'OpenAI API key not configured' }, 500)
  }

  const { createAgenticAgent } = await import('@inkdown/ai')
  const agenticAgent = createAgenticAgent(openaiApiKey)

  // Check Accept header for SSE
  const acceptSSE = c.req.header('Accept')?.includes('text/event-stream')

  if (acceptSSE) {
    return streamSSE(c, async (stream) => {
      try {
        const result = await agenticAgent.executeTask(
          body.task,
          body.noteId,
          async (progress: {
            taskId: string
            status: string
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
    const result = await agenticAgent.executeTask(body.task, body.noteId)
    return c.json(result)
  } catch (error) {
    return c.json({ error: String(error) }, 500)
  }
})

/**
 * Preview task plan without executing
 * POST /api/agent/agentic/plan
 */
agent.post(
  '/agentic/plan',
  zValidator(
    'json',
    z.object({
      task: z.string().min(1).max(5000),
    })
  ),
  async (c) => {
    const body = c.req.valid('json')
    const openaiApiKey = process.env.OPENAI_API_KEY

    if (!openaiApiKey) {
      return c.json({ error: 'OpenAI API key not configured' }, 500)
    }

    const { createAgenticAgent } = await import('@inkdown/ai')
    const agenticAgent = createAgenticAgent(openaiApiKey)

    try {
      const steps = await agenticAgent.planTask(body.task)
      return c.json({
        task: body.task,
        steps,
        stepCount: steps.length,
        formattedPlan: agenticAgent.formatPlan(steps),
      })
    } catch (error) {
      return c.json({ error: String(error) }, 500)
    }
  }
)

/**
 * Get task status
 * GET /api/agent/agentic/task/:id
 */
agent.get('/agentic/task/:id', async (c) => {
  const taskId = c.req.param('id')
  const openaiApiKey = process.env.OPENAI_API_KEY

  if (!openaiApiKey) {
    return c.json({ error: 'OpenAI API key not configured' }, 500)
  }

  const { createAgenticAgent } = await import('@inkdown/ai')
  const agenticAgent = createAgenticAgent(openaiApiKey)

  const task = agenticAgent.getTask(taskId)

  if (!task) {
    return c.json({ error: 'Task not found' }, 404)
  }

  return c.json({
    taskId: task.id,
    description: task.description,
    status: task.status,
    stepCount: task.steps.length,
    completedSteps: task.steps.filter((s: { status: string }) => s.status === 'Completed').length,
    failedSteps: task.steps.filter((s: { status: string }) => s.status === 'Failed').length,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  })
})

/**
 * Cancel running task
 * POST /api/agent/agentic/task/:id/cancel
 */
agent.post('/agentic/task/:id/cancel', async (c) => {
  const taskId = c.req.param('id')
  const openaiApiKey = process.env.OPENAI_API_KEY

  if (!openaiApiKey) {
    return c.json({ error: 'OpenAI API key not configured' }, 500)
  }

  const { createAgenticAgent } = await import('@inkdown/ai')
  const agenticAgent = createAgenticAgent(openaiApiKey)

  const cancelled = agenticAgent.cancelTask(taskId)

  if (!cancelled) {
    return c.json({ error: 'Task not found or already completed' }, 400)
  }

  return c.json({ success: true, message: 'Task cancelled' })
})

/**
 * Research a topic
 * POST /api/agent/agentic/research
 */
agent.post(
  '/agentic/research',
  zValidator(
    'json',
    z.object({
      query: z.string().min(1).max(1000),
    })
  ),
  async (c) => {
    const body = c.req.valid('json')
    const openaiApiKey = process.env.OPENAI_API_KEY

    if (!openaiApiKey) {
      return c.json({ error: 'OpenAI API key not configured' }, 500)
    }

    const { createAgenticAgent } = await import('@inkdown/ai')
    const agenticAgent = createAgenticAgent(openaiApiKey)

    try {
      const result = await agenticAgent.research(body.query)
      return c.json(result)
    } catch (error) {
      return c.json({ error: String(error) }, 500)
    }
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
