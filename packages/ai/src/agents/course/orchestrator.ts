/**
 * Course Orchestrator — packages/ai/src/agents/course/orchestrator.ts
 *
 * AI SDK v6 ToolLoopAgent orchestrator for end-to-end course generation.
 * Uses centralized model registry + AI SDK factory.
 */

import { ToolLoopAgent, stepCountIs } from 'ai'
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
import {
  createOrchestratorTools,
  createLessonWriterTools,
  createQuizWriterTools,
  createSlidesWriterTools,
  type CourseToolContext,
} from './course-tools'

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
    if (this.waiter) {
      const w = this.waiter
      this.waiter = null
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
        const item = await new Promise<T>((resolve) => {
          this.waiter = resolve
        })
        if (this.done && this.queue.length === 0) return
        if (item !== undefined) yield item
      }
    }
  }
}

// =============================================================================
// Types
// =============================================================================

import type { SharedContextService } from '../../services/shared-context.service'
import { getModelForTask } from '../../providers/ai-sdk-factory'
import { trackAISDKUsage } from '../../providers/ai-sdk-usage'

export interface CourseOrchestratorConfig {
  supabase: SupabaseClient
  userId: string
  youtubeApiKey?: string
  model?: string
  sharedContextService?: SharedContextService
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
5. Generating lesson content (using batch_generate_lessons)
6. Generating quiz content (using batch_generate_quizzes)
7. Generating slide decks (using batch_generate_slides)
8. Matching YouTube videos to video/lecture lessons (using match_videos)
9. Assembling and saving the final course (using assemble_course + save_to_supabase)

## WORKFLOW
1. **Plan**: Create a todo list with write_todos to track progress through each stage.
2. **Research**: Use run_deep_research to gather comprehensive information on the topic.
3. **Index**: Use index_research to create a searchable index of the research.
4. **Outline**: Use query_rag to get relevant context, then generate_outline to create the course structure.
5. **Approval**: Use request_outline_approval to pause for user approval. WAIT for the response before continuing.
6. **Content Generation — call these tools in order**:
   a. Call **batch_generate_lessons** to generate all lecture, video, and practice lessons.
   b. Call **batch_generate_quizzes** to generate all quiz lessons.
   c. Call **batch_generate_slides** to generate all slide decks.
7. **Videos**: If videos are enabled, use match_videos to find YouTube videos for relevant lessons.
8. **Assemble**: Use assemble_course to create the final Course object.
9. **Save**: Use save_to_supabase to persist everything.

## IMPORTANT RULES
- Always start with write_todos to set up a clear plan.
- Always research before generating outlines or content.
- Always request approval before generating lesson content.
- Update todo items as you complete each step.
- Use think() to reason about complex decisions.
- After outline approval, call batch_generate_lessons FIRST, then batch_generate_quizzes, then batch_generate_slides.
- Generated content is stored automatically by batch tools. Do NOT pass lesson content between tools.
- Do NOT echo or repeat tool results. Keep messages concise.
- assemble_course, match_videos, and save_to_supabase read from stored state — call them with minimal/no arguments.
- NEVER call run_deep_research or index_research more than once. Research is cached.
- NEVER regenerate the outline after it has been approved.
- Each pipeline stage runs ONCE. If a tool returns "already complete", skip it immediately.
- Pipeline is strictly sequential: research → index → outline → approval → lessons → quizzes → slides → videos → assemble → save. NEVER go backwards.
- **STOP**: After save_to_supabase returns success, your task is DONE. Do not call any more tools or generate further messages. End immediately.`
}

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
   * Stream a course generation interaction via AI SDK v6 ToolLoopAgent.
   * Uses AsyncEventQueue so tool-emitted events are yielded immediately,
   * even while the ToolLoopAgent is blocked waiting for a tool call.
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
    eventQueue.push({
      event: 'thinking',
      data: `Starting course generation for "${input.topic}"...`,
    })
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

    const sharedCtx = this.config.sharedContextService
      ? await this.config.sharedContextService.read({
          relevantTypes: ['active_plan', 'soul_updated'],
        })
      : ''
    const basePrompt = getCourseOrchestratorPrompt()
    const systemPrompt = sharedCtx ? `${basePrompt}\n\n${sharedCtx}` : basePrompt

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

    // Merge all tools into a single ToolLoopAgent (replaces deepagents subagents)
    const orchestratorTools = createOrchestratorTools(toolContext)
    const lessonWriterTools = createLessonWriterTools(toolContext)
    const quizWriterTools = createQuizWriterTools(toolContext)
    const slidesWriterTools = createSlidesWriterTools(toolContext)

    const allTools = {
      ...orchestratorTools,
      ...lessonWriterTools,
      ...quizWriterTools,
      ...slidesWriterTools,
    }

    const model = getModelForTask('course')
    const agent = new ToolLoopAgent({
      model,
      instructions: systemPrompt,
      tools: allTools,
      stopWhen: stepCountIs(25),
      onFinish: trackAISDKUsage({ model: 'course', taskType: 'course' }),
    })

    const userMessage = `Generate a ${input.difficulty} course on "${input.topic}".
Focus areas: ${input.focusAreas.join(', ') || 'General coverage'}.
Course ID: ${input.courseId}
Settings: Videos=${input.settings.includeVideos}, Slides=${input.settings.includeSlides}, Practice=${input.settings.includePractice}, Quizzes=${input.settings.includeQuizzes}
Estimated duration: ${input.settings.estimatedWeeks} weeks, ${input.settings.hoursPerWeek} hours/week.

Please proceed through the full pipeline: research → index → outline → approval → content → videos → assemble → save.`

    // Track the current stage for error reporting
    let currentStage: GenerationStageType = 'research'
    const originalEmit = toolContext.emitEvent
    toolContext.emitEvent = (event) => {
      if (
        event.type === 'progress' &&
        event.data &&
        typeof event.data === 'object' &&
        'stage' in event.data
      ) {
        currentStage = (event.data as { stage: GenerationStageType }).stage
      }
      originalEmit(event)
    }

    // Run ToolLoopAgent in background, pushing all events to the queue
    const agentTask = (async () => {
      try {
        const result = await agent.stream({
          messages: [{ role: 'user', content: userMessage }],
        })

        for await (const part of result.fullStream) {
          switch (part.type) {
            case 'text-delta': {
              eventQueue.push({ event: 'text', data: part.text })
              break
            }

            case 'tool-call': {
              eventQueue.push({
                event: 'tool_call',
                data: JSON.stringify({
                  id: part.toolCallId,
                  toolName: part.toolName,
                  arguments: part.input,
                }),
              })
              break
            }

            case 'tool-result': {
              eventQueue.push({
                event: 'tool_result',
                data: JSON.stringify({
                  id: part.toolCallId,
                  toolName: part.toolName,
                  result:
                    typeof part.output === 'string'
                      ? part.output.slice(0, 500)
                      : JSON.stringify(part.output).slice(0, 500),
                }),
              })
              break
            }

            case 'tool-error': {
              eventQueue.push({
                event: 'error',
                data: {
                  message: `Tool "${part.toolName}" failed: ${part.error}`,
                  stage: currentStage,
                },
              })
              break
            }

            case 'reasoning-delta': {
              eventQueue.push({
                event: 'thinking',
                data: part.text,
              })
              break
            }

            default:
              break
          }
        }

        // Write shared context entry for completed course
        if (this.config.sharedContextService) {
          await this.config.sharedContextService.write({
            agent: 'course',
            type: 'course_saved',
            summary: `Course generated: ${input.topic}`,
            payload: { courseId: input.courseId, topic: input.topic },
          })
        }

        eventQueue.push({ event: 'done' })
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        console.error('[CourseOrchestrator] agentTask error:', errorMsg)
        eventQueue.push({ event: 'error', data: { message: errorMsg, stage: currentStage } })
        // Defense-in-depth: update DB directly in case SSE handler is gone
        try {
          await toolContext.supabase
            .from('course_generation_threads')
            .update({ status: 'error', stage: currentStage, error: errorMsg })
            .eq('course_id', input.courseId)
        } catch {
          /* best-effort */
        }
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
