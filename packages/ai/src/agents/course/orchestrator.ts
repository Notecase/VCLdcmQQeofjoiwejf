/**
 * Course Orchestrator — packages/ai/src/agents/course/orchestrator.ts
 *
 * Deep agent orchestrator for end-to-end course generation.
 * Uses the same deepagents + ChatOpenAI pattern as ResearchAgent.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Course,
  CourseAgentStep,
  CourseGenerationProgress,
  CourseModule,
  CourseOrchestratorStreamEvent,
  CourseOutline,
  CourseSettings,
  CourseTodoItem,
  GenerationStageType,
  InterruptResponse,
  LessonContent,
} from '@inkdown/shared/types'
import type { RAGIndex } from './research'
import { createOrchestratorTools, createLessonWriterTools, createQuizWriterTools, createSlidesWriterTools, type CourseToolContext } from './course-tools'

// =============================================================================
// AsyncEventQueue — resolves immediately when events arrive from any source
// =============================================================================

class AsyncEventQueue<T> {
  private queue: T[] = []
  private waiter: ((item: T) => void) | null = null
  private done = false

  push(item: T) {
    if (this.waiter) {
      const w = this.waiter
      this.waiter = null
      w(item)
    } else {
      this.queue.push(item)
    }
  }

  finish() {
    this.done = true
    // Resolve any pending waiter with a sentinel — the iterator will check `done`
    if (this.waiter) {
      const w = this.waiter
      this.waiter = null
      // Push a dummy resolve; the loop will exit via `done` check
      w(undefined as unknown as T)
    }
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<T> {
    while (true) {
      if (this.queue.length > 0) {
        yield this.queue.shift()!
      } else if (this.done) {
        return
      } else {
        const item = await new Promise<T>((resolve) => { this.waiter = resolve })
        if (this.done && this.queue.length === 0) return
        // Only yield real items (not the dummy from finish())
        if (item !== undefined) yield item
      }
    }
  }
}

// =============================================================================
// Types
// =============================================================================

export interface CourseOrchestratorConfig {
  supabase: SupabaseClient
  userId: string
  openaiApiKey: string
  geminiApiKey: string
  youtubeApiKey?: string
  model?: string
}

export interface CourseThreadState {
  files: Map<string, { name: string; content: string; createdAt: string; updatedAt: string }>
  todos: CourseTodoItem[]
  agentSteps: CourseAgentStep[]
  pendingInterrupt: { id: string; type: string; outline: CourseOutline; thinking: string } | null
  interruptResolver: ((response: InterruptResponse) => void) | null
}

// =============================================================================
// System Prompt
// =============================================================================

function getCourseOrchestratorPrompt(): string {
  return `You are a COURSE GENERATION ORCHESTRATOR — an autonomous agent that creates comprehensive educational courses.

## YOUR ROLE
You orchestrate the end-to-end creation of structured courses by:
1. Researching the topic thoroughly (using run_deep_research)
2. Indexing the research for per-lesson retrieval (using index_research)
3. Generating a structured course outline (using generate_outline)
4. Getting user approval of the outline (using request_outline_approval)
5. Delegating content generation to specialized subagents (lesson-writer, quiz-writer, slides-writer)
6. Matching YouTube videos to video/lecture lessons (using match_videos)
7. Assembling and saving the final course (using assemble_course + save_to_supabase)

## WORKFLOW
1. **Plan**: Create a todo list with write_todos to track progress through each stage.
2. **Research**: Use run_deep_research to gather comprehensive information on the topic.
3. **Index**: Use index_research to create a searchable index of the research.
4. **Outline**: Use query_rag to get relevant context, then generate_outline to create the course structure.
5. **Approval**: Use request_outline_approval to pause for user approval. WAIT for the response before continuing.
6. **Content Generation — delegate to subagents in this order**:
   a. Delegate to **lesson-writer** to generate all lecture, video, and practice lessons in one batch.
   b. Delegate to **quiz-writer** to generate all quiz lessons in one batch.
   c. Delegate to **slides-writer** to generate all slide decks in one batch.
7. **Videos**: If videos are enabled, use match_videos to find YouTube videos for relevant lessons.
8. **Assemble**: Use assemble_course to create the final Course object.
9. **Save**: Use save_to_supabase to persist everything.

## IMPORTANT RULES
- Always start with write_todos to set up a clear plan.
- Always research before generating outlines or content.
- Always request approval before generating lesson content.
- Update todo items as you complete each step.
- Use think() to reason about complex decisions.
- NEVER call generate_lesson_content or generate_slides yourself. ALWAYS delegate content generation to the subagents.
- Each subagent handles ALL lessons of its type in a single batch call.
- After outline approval, delegate to lesson-writer FIRST, then quiz-writer, then slides-writer.
- Generated content is stored automatically by subagent tools. Do NOT pass lesson content between tools.
- Do NOT echo or repeat tool results. Keep messages concise.
- assemble_course, match_videos, and save_to_supabase read from stored state — call them with minimal/no arguments.
- NEVER call run_deep_research or index_research more than once. Research is cached.
- NEVER regenerate the outline after it has been approved.
- Each pipeline stage runs ONCE. If a tool returns "already complete", skip it immediately.
- Pipeline is strictly sequential: research → index → outline → approval → lessons → quizzes → slides → videos → assemble → save. NEVER go backwards.
- **STOP**: After save_to_supabase returns success, your task is DONE. Do not call any more tools or generate further messages. End immediately.`
}

const LESSON_WRITER_SUBAGENT_PROMPT = `You are the LESSON WRITER subagent. Your ONLY job is to call batch_generate_lessons exactly ONCE and return the summary.

Do NOT call any other tools. Do NOT explain or plan. Just call batch_generate_lessons immediately.`

const QUIZ_WRITER_SUBAGENT_PROMPT = `You are the QUIZ WRITER subagent. Your ONLY job is to call batch_generate_quizzes exactly ONCE and return the summary.

Do NOT call any other tools. Do NOT explain or plan. Just call batch_generate_quizzes immediately.`

const SLIDES_WRITER_SUBAGENT_PROMPT = `You are the SLIDES WRITER subagent. Your ONLY job is to call batch_generate_slides exactly ONCE and return the summary.

Do NOT call any other tools. Do NOT explain or plan. Just call batch_generate_slides immediately.`

// =============================================================================
// Course Orchestrator
// =============================================================================

export class CourseOrchestrator {
  private config: CourseOrchestratorConfig
  private state: CourseThreadState

  constructor(config: CourseOrchestratorConfig) {
    this.config = config
    this.state = {
      files: new Map(),
      todos: [],
      agentSteps: [],
      pendingInterrupt: null,
      interruptResolver: null,
    }
  }

  /**
   * Stream a course generation interaction via the deepagents framework.
   * Uses AsyncEventQueue so tool-emitted events are yielded immediately,
   * even while the deepagents framework is blocked waiting for a tool call.
   */
  async *stream(input: {
    topic: string
    difficulty: string
    settings: CourseSettings
    focusAreas: string[]
    courseId: string
  }): AsyncGenerator<CourseOrchestratorStreamEvent> {
    const eventQueue = new AsyncEventQueue<CourseOrchestratorStreamEvent>()

    // Emit initial events
    eventQueue.push({ event: 'thinking', data: `Starting course generation for "${input.topic}"...` })
    eventQueue.push({
      event: 'progress',
      data: {
        courseId: input.courseId,
        threadId: input.courseId,
        stage: 'research',
        stageProgress: 0,
        overallProgress: 0,
        thinkingOutput: 'Initializing course generation pipeline...',
        currentNode: 'orchestrator',
      } satisfies CourseGenerationProgress,
    })

    const { createDeepAgent } = await import('deepagents')
    const { ChatOpenAI } = await import('@langchain/openai')

    const llm = new ChatOpenAI({
      openAIApiKey: this.config.openaiApiKey,
      modelName: this.config.model ?? 'gpt-5.2',
      temperature: 0.3,
    })

    const systemPrompt = getCourseOrchestratorPrompt()

    // Mutable containers for tool state
    const researchReport: { value: string | null } = { value: null }
    const ragIndex: { value: RAGIndex | null } = { value: null }
    const generatedModules: { value: CourseModule[] } = { value: [] }
    const generatedLessons = new Map<string, LessonContent>()
    const approvedOutline: { value: CourseOutline | null } = { value: null }
    const completedLessons = { value: 0 }
    const totalLessons = { value: 0 }
    const assembledCourse: { value: Course | null } = { value: null }

    // Create tool context — emitEvent pushes directly to the queue
    const toolContext: CourseToolContext = {
      geminiApiKey: this.config.geminiApiKey,
      openaiApiKey: this.config.openaiApiKey,
      youtubeApiKey: this.config.youtubeApiKey,
      supabase: this.config.supabase,
      userId: this.config.userId,
      courseId: input.courseId,
      settings: input.settings,
      researchReport,
      ragIndex,
      generatedModules,
      generatedLessons,
      approvedOutline,
      completedLessons,
      totalLessons,
      assembledCourse,
      todos: this.state.todos,
      emitEvent: (event) => {
        eventQueue.push({
          event: event.type as CourseOrchestratorStreamEvent['event'],
          data: typeof event.data === 'string' ? event.data : event.data,
        } as CourseOrchestratorStreamEvent)
      },
      requestApproval: async (interrupt) => {
        const APPROVAL_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes
        return new Promise<InterruptResponse>((resolve, reject) => {
          const timer = setTimeout(() => {
            this.state.pendingInterrupt = null
            this.state.interruptResolver = null
            reject(new Error('Outline approval timed out after 10 minutes'))
          }, APPROVAL_TIMEOUT_MS)

          this.state.pendingInterrupt = interrupt
          this.state.interruptResolver = (response) => {
            clearTimeout(timer)
            resolve(response)
          }
          eventQueue.push({
            event: 'interrupt',
            data: interrupt,
          } as CourseOrchestratorStreamEvent)
        })
      },
    }

    const { ChatGoogleGenerativeAI } = await import('@langchain/google-genai')
    const geminiFlash = new ChatGoogleGenerativeAI({ model: 'gemini-3-flash-preview', apiKey: this.config.geminiApiKey, temperature: 0.7 })
    const geminiPro = new ChatGoogleGenerativeAI({ model: 'gemini-3-pro-preview', apiKey: this.config.geminiApiKey, temperature: 0.7 })

    const orchestratorTools = createOrchestratorTools(toolContext)

    const agent = createDeepAgent({
      model: llm,
      systemPrompt,
      tools: orchestratorTools,
      subagents: [
        {
          name: 'lesson-writer',
          description: 'Generates all lecture, video, and practice lesson content in a single batch call. Delegate to this subagent after outline approval.',
          systemPrompt: LESSON_WRITER_SUBAGENT_PROMPT,
          tools: createLessonWriterTools(toolContext) as any,
          model: geminiFlash,
        },
        {
          name: 'quiz-writer',
          description: 'Generates all quiz content in a single batch call. Delegate to this subagent after lesson-writer completes.',
          systemPrompt: QUIZ_WRITER_SUBAGENT_PROMPT,
          tools: createQuizWriterTools(toolContext) as any,
          model: geminiFlash,
        },
        {
          name: 'slides-writer',
          description: 'Generates all slide decks in a single batch call using higher-quality gemini-3-pro-preview. Delegate to this subagent after quiz-writer completes.',
          systemPrompt: SLIDES_WRITER_SUBAGENT_PROMPT,
          tools: createSlidesWriterTools(toolContext) as any,
          model: geminiPro,
        },
      ],
    })

    const userMessage = `Generate a ${input.difficulty} course on "${input.topic}".
Focus areas: ${input.focusAreas.join(', ') || 'General coverage'}.
Course ID: ${input.courseId}
Settings: Videos=${input.settings.includeVideos}, Slides=${input.settings.includeSlides}, Practice=${input.settings.includePractice}, Quizzes=${input.settings.includeQuizzes}
Estimated duration: ${input.settings.estimatedWeeks} weeks, ${input.settings.hoursPerWeek} hours/week.

Please proceed through the full pipeline: research → index → outline → approval → content → videos → assemble → save.`

    // Track the current stage for error reporting (avoids hardcoded 'research')
    let currentStage: GenerationStageType = 'research'
    const originalEmit = toolContext.emitEvent
    toolContext.emitEvent = (event) => {
      if (event.type === 'progress' && event.data && typeof event.data === 'object' && 'stage' in event.data) {
        currentStage = (event.data as { stage: GenerationStageType }).stage
      }
      originalEmit(event)
    }

    // Run deepagents iteration in background, pushing all events to the queue
    const agentTask = (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const streamResult = await (agent as any).stream(
          { messages: [{ role: 'user', content: userMessage }] },
          { configurable: { thread_id: input.courseId } },
        ) as AsyncIterable<Record<string, { messages?: unknown[] }>>

        const seenSubagents = new Set<string>()

        for await (const chunk of streamResult) {
          for (const [nodeKey, nodeValue] of Object.entries(chunk)) {
            const nodeData = nodeValue as { messages?: unknown[] }
            if (!nodeData?.messages) continue

            const messages = Array.isArray(nodeData.messages) ? nodeData.messages : []

            for (const msg of messages) {
              if (!msg || typeof msg !== 'object') continue

              const msgObj = msg as {
                id?: string
                content?: string | unknown[]
                tool_calls?: Array<{ name: string; args: Record<string, unknown> }>
                name?: string
                type?: string
              }

              if (nodeKey === 'tools' || msgObj.type === 'tool') {
                const content = typeof msgObj.content === 'string' ? msgObj.content : ''
                if (content) {
                  eventQueue.push({
                    event: 'tool_result',
                    data: JSON.stringify({
                      id: msgObj.id || crypto.randomUUID(),
                      toolName: msgObj.name || 'unknown',
                      result: content.slice(0, 500),
                    }),
                  })
                }
              } else {
                if (nodeKey !== 'agent' && nodeKey !== 'tools' && !seenSubagents.has(nodeKey)) {
                  seenSubagents.add(nodeKey)
                  eventQueue.push({
                    event: 'subagent-start',
                    data: {
                      id: `subagent-${nodeKey}-${Date.now()}`,
                      name: nodeKey as any,
                      status: 'running',
                      startedAt: new Date().toISOString(),
                    },
                  })
                }

                const textContent = typeof msgObj.content === 'string'
                  ? msgObj.content
                  : Array.isArray(msgObj.content)
                    ? msgObj.content
                      .map((part) => {
                        if (typeof part === 'string') return part
                        if (part && typeof part === 'object' && 'text' in (part as any)) return (part as any).text
                        return ''
                      })
                      .join('')
                    : ''

                if (textContent) {
                  eventQueue.push({ event: 'text', data: textContent })

                  if (nodeKey !== 'agent' && nodeKey !== 'tools') {
                    eventQueue.push({
                      event: 'subagent-result',
                      data: {
                        id: `subagent-${nodeKey}-${Date.now()}`,
                        name: nodeKey as any,
                        status: 'completed',
                        completedAt: new Date().toISOString(),
                      },
                    })
                  }
                }

                if (Array.isArray(msgObj.tool_calls)) {
                  for (const call of msgObj.tool_calls) {
                    eventQueue.push({
                      event: 'tool_call',
                      data: JSON.stringify({
                        id: crypto.randomUUID(),
                        toolName: call.name,
                        arguments: call.args,
                      }),
                    })
                  }
                }
              }
            }
          }
        }

        eventQueue.push({ event: 'done' })
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        eventQueue.push({ event: 'error', data: { message: errorMsg, stage: currentStage } })
      } finally {
        eventQueue.finish()
      }
    })()

    // Yield from queue — resolves immediately when any source pushes an event
    yield* eventQueue

    // Ensure the background task has settled (no-op if already done)
    await agentTask
  }

  /**
   * Resolve a pending interrupt with the user's response
   */
  resolveInterrupt(response: InterruptResponse): boolean {
    if (this.state.interruptResolver) {
      this.state.interruptResolver(response)
      this.state.pendingInterrupt = null
      this.state.interruptResolver = null
      return true
    }
    return false
  }

  /**
   * Get current orchestrator state
   */
  getState(): {
    files: Array<{ name: string; content: string; createdAt: string; updatedAt: string }>
    todos: CourseTodoItem[]
    agentSteps: CourseAgentStep[]
  } {
    return {
      files: Array.from(this.state.files.values()),
      todos: [...this.state.todos],
      agentSteps: [...this.state.agentSteps],
    }
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createCourseOrchestrator(config: CourseOrchestratorConfig): CourseOrchestrator {
  return new CourseOrchestrator(config)
}
