/**
 * Course Orchestrator Tools — packages/ai/src/agents/course/course-tools.ts
 *
 * LangChain-compatible tools split into 4 factories:
 *  - createOrchestratorTools: pipeline management (no content generation)
 *  - createLessonWriterTools: batch lesson content generation
 *  - createQuizWriterTools: batch quiz generation
 *  - createSlidesWriterTools: batch slide deck generation
 *
 * Each subagent factory includes a query_rag tool for isolated RAG access.
 */

import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { StructuredToolInterface } from '@langchain/core/tools'
import type {
  Course,
  CourseModule,
  CourseOutline,
  CourseOutlineLesson,
  CourseOutlineModule,
  CourseSettings,
  CourseTodoItem,
  InterruptResponse,
  LessonContent,
} from '@inkdown/shared/types'
import type { RAGIndex } from './research'
import { selectModel } from '../../providers/model-registry'
import { createLangChainModel } from '../../providers/client-factory'
import { TokenTrackingCallback } from '../../providers/langchain-token-callback'

// =============================================================================
// Tool Context
// =============================================================================

export interface CourseToolContext {
  // Config
  geminiApiKey: string
  openaiApiKey: string
  youtubeApiKey?: string
  supabase: any
  userId: string
  courseId: string
  settings: CourseSettings
  // Mutable state
  researchReport: { value: string | null }
  ragIndex: { value: RAGIndex | null }
  generatedModules: { value: CourseModule[] }
  generatedLessons: Map<string, LessonContent>
  approvedOutline: { value: CourseOutline | null }
  completedLessons: { value: number }
  totalLessons: { value: number }
  assembledCourse: { value: Course | null }
  todos: CourseTodoItem[]
  // Callbacks
  emitEvent: (event: { type: string; data: unknown }) => void
  requestApproval: (interrupt: {
    id: string
    type: string
    outline: CourseOutline
    thinking: string
  }) => Promise<InterruptResponse>
}

// =============================================================================
// Shared Helper: query_rag tool (reused by orchestrator + all subagents)
// =============================================================================

function createQueryRagTool(ctx: CourseToolContext): StructuredToolInterface {
  return tool(
    async ({ query, topK }) => {
      if (!ctx.ragIndex.value) {
        return ctx.researchReport.value?.slice(0, 2000) ?? 'No research data available.'
      }

      const { queryRAG } = await import('./research/rag-indexer')
      return await queryRAG(ctx.ragIndex.value, query, ctx.openaiApiKey, topK ?? 3)
    },
    {
      name: 'query_rag',
      description:
        'Query the indexed research report for context relevant to a specific topic or lesson.',
      schema: z.object({
        query: z.string().describe('The query to search for in the research index'),
        topK: z.number().optional().describe('Number of top results to return (default: 3)'),
      }),
    }
  )
}

// =============================================================================
// Orchestrator Tools (pipeline management — no content generation)
// =============================================================================

export function createOrchestratorTools(ctx: CourseToolContext): StructuredToolInterface[] {
  const tools: StructuredToolInterface[] = []
  let researchStarted = false

  // ---------- Deep Research ----------

  tools.push(
    tool(
      async ({ topic, focusAreas }) => {
        if (ctx.researchReport.value) {
          console.log(
            `[CourseTools] run_deep_research SKIPPED — already complete (${ctx.researchReport.value.length} chars)`
          )
          return `Research already complete (${ctx.researchReport.value.length} chars). Proceed to next stage.`
        }
        if (researchStarted) {
          console.log(`[CourseTools] run_deep_research SKIPPED — already started`)
          return 'Research already in progress or attempted. Do NOT retry. Proceed to next stage without research if needed.'
        }
        researchStarted = true
        console.log(`[CourseTools] run_deep_research called for "${topic}"`)
        const { runDeepResearch } = await import('./research/deep-research')

        ctx.emitEvent({
          type: 'agent-step',
          data: {
            id: `step-research-${Date.now()}`,
            name: 'Deep Research',
            description: `Researching "${topic}"`,
            status: 'running',
            startedAt: new Date().toISOString(),
          },
        })

        const result = await runDeepResearch(topic, focusAreas, {
          geminiApiKey: ctx.geminiApiKey,
          onProgress: (progress) => {
            ctx.emitEvent({
              type: 'progress',
              data: {
                courseId: ctx.courseId,
                threadId: ctx.courseId,
                stage: 'research',
                stageProgress: progress.progress,
                overallProgress: Math.round(progress.progress * 0.5),
                thinkingOutput: progress.thinking,
                currentNode: 'run_deep_research',
              },
            })

            ctx.emitEvent({
              type: 'research_progress',
              data: {
                status: progress.status,
                progress: progress.progress,
                thinking: progress.thinking,
                sources: progress.sources,
                partialReport: progress.partialReport,
              },
            })
          },
        })

        if (!result.success || !result.report) {
          return `Research failed: ${result.error ?? 'No report produced'}`
        }

        ctx.researchReport.value = result.report
        return `Research complete. Report length: ${result.report.length} chars. Sources: ${result.sources.length}`
      },
      {
        name: 'run_deep_research',
        description:
          'Run deep research on the course topic using Gemini Deep Research. Returns a comprehensive research report.',
        schema: z.object({
          topic: z.string().describe('The topic to research'),
          focusAreas: z.array(z.string()).describe('Specific focus areas for the research'),
        }),
      }
    )
  )

  // ---------- Index Research ----------

  let indexStarted = false

  tools.push(
    tool(
      async () => {
        if (ctx.ragIndex.value) {
          console.log(
            `[CourseTools] index_research SKIPPED — already built (${ctx.ragIndex.value.chunks.length} chunks)`
          )
          return `Index already built (${ctx.ragIndex.value.chunks.length} chunks). Proceed to outline generation.`
        }
        if (indexStarted) {
          console.log(`[CourseTools] index_research SKIPPED — already started`)
          return 'Index already being built or attempted. Do NOT retry. Proceed without index if needed.'
        }
        indexStarted = true
        console.log('[CourseTools] index_research called')
        if (!ctx.researchReport.value) {
          return 'No research report available to index.'
        }

        ctx.emitEvent({
          type: 'progress',
          data: {
            courseId: ctx.courseId,
            threadId: ctx.courseId,
            stage: 'indexing',
            stageProgress: 0,
            overallProgress: 50,
            thinkingOutput: 'Building knowledge index from research report...',
            currentNode: 'index_research',
          },
        })

        const { indexResearchReport } = await import('./research/rag-indexer')
        const ragIndex = await indexResearchReport(ctx.researchReport.value, ctx.openaiApiKey)
        ctx.ragIndex.value = ragIndex

        ctx.emitEvent({
          type: 'progress',
          data: {
            courseId: ctx.courseId,
            threadId: ctx.courseId,
            stage: 'indexing',
            stageProgress: 100,
            overallProgress: 55,
            thinkingOutput: `Indexed ${ragIndex.chunks.length} chunks from the research report.`,
            currentNode: 'index_research',
          },
        })

        return `Indexed ${ragIndex.chunks.length} chunks from the research report.`
      },
      {
        name: 'index_research',
        description:
          'Index the research report into a RAG vector store for per-lesson context retrieval.',
        schema: z.object({}),
      }
    )
  )

  // ---------- Query RAG ----------

  tools.push(createQueryRagTool(ctx))

  // ---------- Generate Outline ----------

  tools.push(
    tool(
      async ({ topic, difficulty, focusAreas, researchContext, feedbackSection }) => {
        if (ctx.approvedOutline.value) {
          console.log(
            `[CourseTools] generate_outline SKIPPED — outline already approved (${ctx.approvedOutline.value.modules.length} modules)`
          )
          return `Outline already approved (${ctx.approvedOutline.value.modules.length} modules). Proceed to content generation.`
        }
        console.log(`[CourseTools] generate_outline called for "${topic}"`)
        ctx.emitEvent({
          type: 'progress',
          data: {
            courseId: ctx.courseId,
            threadId: ctx.courseId,
            stage: 'planning',
            stageProgress: 0,
            overallProgress: 55,
            thinkingOutput: 'Generating course outline...',
            currentNode: 'generate_outline',
          },
        })

        const { PROMPTS } = await import('./prompts')
        const { parseOutlineJSON } = await import('./tools')

        const courseContext = `Topic: ${topic}\nDifficulty: ${difficulty}\nFocus Areas: ${focusAreas.join(', ')}\nSettings: Videos=${ctx.settings.includeVideos}, Slides=${ctx.settings.includeSlides}, Practice=${ctx.settings.includePractice}, Quizzes=${ctx.settings.includeQuizzes}\nEstimated Weeks: ${ctx.settings.estimatedWeeks}, Hours/Week: ${ctx.settings.hoursPerWeek}`

        const sizeInstructions = ctx.settings.quickTest
          ? '- Create exactly 1 module with exactly 4 lessons: 1 lecture, 1 practice, 1 quiz, 1 slides (in that order). Keep all content minimal for quick testing.'
          : '- Create 4-8 modules depending on topic breadth\n- Each module should have 3-7 lessons'

        const prompt = PROMPTS.OUTLINE.replace(/{TOPIC}/g, topic)
          .replace(/{DIFFICULTY}/g, difficulty)
          .replace(/{FOCUS_AREAS}/g, focusAreas.join(', '))
          .replace(/{RESEARCH_CONTEXT}/g, researchContext)
          .replace(/{COURSE_CONTEXT}/g, courseContext)
          .replace(/{FEEDBACK_SECTION}/g, feedbackSection ?? '')
          .replace(/{SIZE_INSTRUCTIONS}/g, sizeInstructions)

        const outlineModel = selectModel('course')
        const model = await createLangChainModel(outlineModel, {
          temperature: 0.4,
          callbacks: [new TokenTrackingCallback({ model: outlineModel.id, taskType: 'course' })],
        })

        const response = await model.invoke(prompt)
        const content =
          typeof response.content === 'string'
            ? response.content
            : response.content.map((c) => ('text' in c ? c.text : '')).join('')

        const outline = parseOutlineJSON(content)

        ctx.totalLessons.value = outline.modules.reduce(
          (sum: number, m: CourseOutlineModule) => sum + m.lessons.length,
          0
        )

        ctx.emitEvent({
          type: 'progress',
          data: {
            courseId: ctx.courseId,
            threadId: ctx.courseId,
            stage: 'planning',
            stageProgress: 100,
            overallProgress: 65,
            thinkingOutput: 'Course outline ready.',
            currentNode: 'generate_outline',
          },
        })

        return JSON.stringify(outline)
      },
      {
        name: 'generate_outline',
        description: 'Generate a structured course outline with modules and lessons.',
        schema: z.object({
          topic: z.string().describe('Course topic'),
          difficulty: z.string().describe('Difficulty level: beginner, intermediate, or advanced'),
          focusAreas: z.array(z.string()).describe('Focus areas for the course'),
          researchContext: z.string().describe('Research context to inform the outline'),
          feedbackSection: z
            .string()
            .optional()
            .describe('Previous feedback to incorporate into revised outline'),
        }),
      }
    )
  )

  // ---------- Request Outline Approval (HITL interrupt) ----------

  tools.push(
    tool(
      async ({ outlineJson, thinkingText }) => {
        if (ctx.approvedOutline.value) {
          console.log('[CourseTools] request_outline_approval SKIPPED — outline already approved')
          return `Outline already approved. Proceed with content generation.`
        }
        console.log('[CourseTools] request_outline_approval called')
        const { parseOutlineJSON } = await import('./tools')
        const outline = parseOutlineJSON(outlineJson)

        const interruptId = `interrupt-outline-${Date.now()}`

        ctx.emitEvent({
          type: 'interrupt',
          data: {
            id: interruptId,
            type: 'outline_approval',
            outline,
            thinking: thinkingText,
          },
        })

        const response = await ctx.requestApproval({
          id: interruptId,
          type: 'outline_approval',
          outline,
          thinking: thinkingText,
        })

        if (response.decision === 'approve') {
          ctx.approvedOutline.value = outline
          ctx.totalLessons.value = outline.modules.reduce(
            (sum: number, m: CourseOutlineModule) => sum + m.lessons.length,
            0
          )
          return `Outline APPROVED. ${outline.modules.length} modules, ${ctx.totalLessons.value} lessons. Proceed with content generation.`
        } else if (response.decision === 'edit' && response.editedArgs?.outline) {
          const edited = parseOutlineJSON(JSON.stringify(response.editedArgs.outline))
          ctx.approvedOutline.value = edited
          ctx.totalLessons.value = edited.modules.reduce(
            (sum: number, m: CourseOutlineModule) => sum + m.lessons.length,
            0
          )
          return `Outline EDITED. ${edited.modules.length} modules, ${ctx.totalLessons.value} lessons. Proceed with content generation.`
        } else {
          return `Outline REJECTED. Feedback: ${response.message ?? 'No feedback provided'}. Regenerate outline.`
        }
      },
      {
        name: 'request_outline_approval',
        description:
          'Pause and request user approval of the course outline before generating content. The agent will wait for the user to approve, edit, or reject.',
        schema: z.object({
          outlineJson: z.string().describe('The generated outline as a JSON string'),
          thinkingText: z.string().describe('Summary of thinking/reasoning behind the outline'),
        }),
      }
    )
  )

  // ---------- Match Videos ----------

  tools.push(
    tool(
      async () => {
        if (!ctx.youtubeApiKey) {
          return 'Video matching skipped: no YouTube API key configured.'
        }

        const outline = ctx.approvedOutline.value
        if (!outline) return 'No approved outline. Generate and approve first.'

        const modules: CourseModule[] = outline.modules.map((mod: CourseOutlineModule) => ({
          id: mod.id,
          courseId: ctx.courseId,
          title: mod.title,
          description: mod.description,
          order: mod.order,
          status: 'available' as const,
          progress: 0,
          lessons: mod.lessons.map((les: CourseOutlineLesson) => ({
            id: les.id,
            moduleId: mod.id,
            title: les.title,
            type: les.type,
            duration: `${les.estimatedMinutes} minutes`,
            order: les.order,
            status: 'available' as const,
            content: ctx.generatedLessons.get(les.title) ?? {
              markdown: `> **Generation failed.** This lesson could not be generated. Try regenerating the course or edit this lesson manually.\n\n## ${les.title}\n\n*Content pending*`,
            },
          })),
        }))

        ctx.emitEvent({
          type: 'progress',
          data: {
            courseId: ctx.courseId,
            threadId: ctx.courseId,
            stage: 'multimedia',
            stageProgress: 50,
            overallProgress: 95,
            thinkingOutput: 'Matching YouTube videos to lessons...',
            currentNode: 'match_videos',
          },
        })

        const { matchVideosForLessons } = await import('./video-matcher')
        const matches = await matchVideosForLessons(modules, ctx.youtubeApiKey)

        ctx.emitEvent({
          type: 'progress',
          data: {
            courseId: ctx.courseId,
            threadId: ctx.courseId,
            stage: 'multimedia',
            stageProgress: 100,
            overallProgress: 96,
            thinkingOutput: `Matched videos for ${matches.length} lessons.`,
            currentNode: 'match_videos',
          },
        })

        return `Matched videos for ${matches.length} lessons.`
      },
      {
        name: 'match_videos',
        description:
          'Match YouTube videos to lessons in the generated modules. Reads from stored state — no arguments needed.',
        schema: z.object({}),
      }
    )
  )

  // ---------- Assemble Course ----------

  tools.push(
    tool(
      async ({ researchReport, thinkingTrace }) => {
        console.log('[CourseTools] assemble_course called')
        const outline = ctx.approvedOutline.value
        if (!outline) return 'No approved outline. Generate and approve first.'

        const modules: CourseModule[] = outline.modules.map((mod: CourseOutlineModule) => ({
          id: mod.id,
          courseId: ctx.courseId,
          title: mod.title,
          description: mod.description,
          order: mod.order,
          status: 'available' as const,
          progress: 0,
          lessons: mod.lessons.map((les: CourseOutlineLesson) => ({
            id: les.id,
            moduleId: mod.id,
            title: les.title,
            type: les.type,
            duration: `${les.estimatedMinutes} minutes`,
            order: les.order,
            status: 'available' as const,
            content: ctx.generatedLessons.get(les.title) ?? {
              markdown: `> **Generation failed.** This lesson could not be generated. Try regenerating the course or edit this lesson manually.\n\n## ${les.title}\n\n*Content pending*`,
            },
          })),
        }))

        ctx.generatedModules.value = modules

        const { assembleCourse } = await import('./tools')
        const course = assembleCourse(outline, {
          generatedModules: modules,
          userId: ctx.userId,
          courseId: ctx.courseId,
          researchReport: researchReport ?? ctx.researchReport.value,
          thinkingTrace: thinkingTrace ?? null,
          settings: ctx.settings,
        })

        ctx.assembledCourse.value = course

        const totalLessons = modules.reduce(
          (sum: number, m: CourseModule) => sum + m.lessons.length,
          0
        )

        ctx.emitEvent({
          type: 'progress',
          data: {
            courseId: ctx.courseId,
            threadId: ctx.courseId,
            stage: 'assembly',
            stageProgress: 100,
            overallProgress: 98,
            thinkingOutput: `Course "${course.title}" assembled: ${modules.length} modules, ${totalLessons} lessons.`,
            currentNode: 'assemble_course',
          },
        })

        return `Course "${course.title}" assembled: ${modules.length} modules, ${totalLessons} lessons.`
      },
      {
        name: 'assemble_course',
        description:
          'Assemble the final Course object from stored outline and generated lessons. Reads from stored state — only optional arguments needed.',
        schema: z.object({
          researchReport: z
            .string()
            .optional()
            .describe('The research report text (reads from state if omitted)'),
          thinkingTrace: z.string().optional().describe('Accumulated thinking/reasoning trace'),
        }),
      }
    )
  )

  // ---------- Save to Supabase ----------

  tools.push(
    tool(
      async () => {
        console.log('[CourseTools] save_to_supabase called')
        if (!ctx.assembledCourse.value)
          return 'No course assembled yet. Call assemble_course first.'

        ctx.emitEvent({
          type: 'progress',
          data: {
            courseId: ctx.courseId,
            threadId: ctx.courseId,
            stage: 'saving',
            stageProgress: 0,
            overallProgress: 99,
            thinkingOutput: 'Saving course to database...',
            currentNode: 'save_to_supabase',
          },
        })

        try {
          const { saveCourseToSupabase } = await import('./tools')
          await saveCourseToSupabase(
            ctx.assembledCourse.value,
            ctx.generatedModules.value,
            ctx.supabase,
            ({ modulesCompleted, totalModules }) => {
              ctx.emitEvent({
                type: 'thinking',
                data: `Saving module ${modulesCompleted}/${totalModules} to database...`,
              })
            }
          )
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          console.error(
            `[CourseTools] save_to_supabase failed for course ${ctx.courseId} while persisting ${ctx.generatedModules.value.length} modules: ${message}`
          )
          ctx.emitEvent({
            type: 'error',
            data: { message, stage: 'saving' },
          })
          throw error
        }

        // Defense-in-depth: update thread table directly so it reaches 'complete'
        // even if the SSE handler has exited and isn't processing events
        try {
          await ctx.supabase
            .from('course_generation_threads')
            .update({ status: 'complete', stage: 'complete', progress: 100 })
            .eq('course_id', ctx.courseId)
        } catch { /* best-effort — SSE handler will also update if still connected */ }

        console.log(
          '[CourseTools] save_to_supabase completed successfully, emitting complete event'
        )
        ctx.emitEvent({ type: 'complete', data: { courseId: ctx.courseId } })
        return `Course "${ctx.assembledCourse.value.title}" saved successfully to database.`
      },
      {
        name: 'save_to_supabase',
        description:
          'Persist the assembled course and its modules/lessons to Supabase. Reads from stored state — no arguments needed.',
        schema: z.object({}),
      }
    )
  )

  // ---------- Write Todos ----------

  tools.push(
    tool(
      async ({ todos: todoItems }) => {
        ctx.todos.length = 0
        for (let i = 0; i < todoItems.length; i++) {
          ctx.todos.push({
            id: `todo-${Date.now()}-${i}`,
            text: todoItems[i].text,
            status: todoItems[i].status || 'pending',
            agentName: todoItems[i].agentName,
          })
        }
        ctx.emitEvent({ type: 'todo-update', data: { todos: ctx.todos } })
        return `Created ${ctx.todos.length} todo items.`
      },
      {
        name: 'write_todos',
        description: 'Create or replace the todo list for tracking course generation progress.',
        schema: z.object({
          todos: z
            .array(
              z.object({
                text: z.string().describe('Task description'),
                status: z
                  .enum(['pending', 'in_progress', 'completed'])
                  .optional()
                  .describe('Task status (default: pending)'),
                agentName: z.string().optional().describe('Which sub-agent owns this task'),
              })
            )
            .describe('List of todo items'),
        }),
      }
    )
  )

  // ---------- Update Todo ----------

  tools.push(
    tool(
      async ({ todoId, status }) => {
        const todo = ctx.todos.find(
          (t) => t.id === todoId || t.text.toLowerCase().includes(todoId.toLowerCase())
        )
        if (!todo) return `Todo "${todoId}" not found.`
        todo.status = status
        ctx.emitEvent({ type: 'todo-update', data: { todos: ctx.todos } })
        return `Todo "${todo.text}" marked as ${status}.`
      },
      {
        name: 'update_todo',
        description: 'Update the status of a todo item by ID or content match.',
        schema: z.object({
          todoId: z.string().describe('Todo ID or partial content match'),
          status: z.enum(['pending', 'in_progress', 'completed']).describe('New status'),
        }),
      }
    )
  )

  // ---------- Think Tool ----------

  tools.push(
    tool(
      async ({ thought }) => {
        ctx.emitEvent({ type: 'thinking', data: thought })
        return `Thought recorded: ${thought}`
      },
      {
        name: 'think',
        description:
          'Record a strategic thought or plan your next steps. Use this to reason about complex decisions.',
        schema: z.object({
          thought: z.string().describe('Your strategic thought or reasoning'),
        }),
      }
    )
  )

  return tools
}

// =============================================================================
// Lesson Writer Tools (batch content generation for lecture/video/practice)
// =============================================================================

export function createLessonWriterTools(ctx: CourseToolContext): StructuredToolInterface[] {
  let lessonsStarted = false
  return [
    tool(
      async () => {
        if (lessonsStarted) {
          console.log('[batch_generate_lessons] SKIPPED — already started')
          return 'Lesson generation already in progress or completed. Do NOT retry. Proceed to quiz generation.'
        }
        lessonsStarted = true
        const outline = ctx.approvedOutline.value
        if (!outline) return 'No approved outline. Cannot generate lessons.'

        const { PROMPTS } = await import('./prompts')
        const { parseLessonContent, extractMarkdownFallback } = await import('./tools')
        const { queryRAG } = await import('./research/rag-indexer')

        // Filter lessons that are NOT quiz and NOT slides
        const allLessons = outline.modules.flatMap((mod: CourseOutlineModule) =>
          mod.lessons
            .filter((les: CourseOutlineLesson) => les.type !== 'quiz' && les.type !== 'slides')
            .map((les: CourseOutlineLesson) => ({
              ...les,
              moduleId: mod.id,
              moduleTitle: mod.title,
              moduleDescription: mod.description,
            }))
        )

        if (allLessons.length === 0) return 'No lecture/video/practice lessons found in outline.'

        const contentModel = selectModel('course')
        const model = await createLangChainModel(contentModel, {
          temperature: 0.7,
          callbacks: [new TokenTrackingCallback({ model: contentModel.id, taskType: 'course' })],
        })

        let generated = 0
        const total = allLessons.length
        const errors: string[] = []

        console.log(`[batch_generate_lessons] Starting: ${total} lessons`)

        for (const lesson of allLessons) {
          let attempts = 0
          const maxAttempts = 3
          let lastResponseText = ''
          while (attempts < maxAttempts) {
            attempts++
            try {
              // Query RAG for lesson-specific context
              let researchContext = ''
              if (ctx.ragIndex.value) {
                researchContext = await queryRAG(
                  ctx.ragIndex.value,
                  `${lesson.title} ${lesson.keyTopics.join(' ')}`,
                  ctx.openaiApiKey,
                  3
                )
              } else if (ctx.researchReport.value) {
                researchContext = ctx.researchReport.value.slice(0, 2000)
              }

              const promptKey = lesson.type.toUpperCase() as keyof typeof PROMPTS
              const promptTemplate = PROMPTS[promptKey] ?? PROMPTS.LECTURE

              const prompt = promptTemplate
                .replace(/{LESSON_TITLE}/g, lesson.title)
                .replace(/{KEY_TOPICS}/g, lesson.keyTopics.join(', '))
                .replace(/{LEARNING_OBJECTIVES}/g, lesson.learningObjectives.join('\n- '))
                .replace(
                  /{MODULE_CONTEXT}/g,
                  `Module: ${lesson.moduleTitle} — ${lesson.moduleDescription}`
                )
                .replace(/{COURSE_CONTEXT}/g, `Course: ${outline.title} (${outline.difficulty})`)
                .replace(/{RESEARCH_CONTEXT}/g, researchContext)
                .replace(
                  /{PREVIOUS_LESSONS}/g,
                  generated > 0
                    ? `${generated} previous lessons generated.`
                    : 'This is the first lesson.'
                )

              const response = await model.invoke(prompt)
              lastResponseText =
                typeof response.content === 'string'
                  ? response.content
                  : response.content.map((c) => ('text' in c ? c.text : '')).join('')

              const outlineLesson = {
                id: lesson.id,
                title: lesson.title,
                type: lesson.type,
                estimatedMinutes: lesson.estimatedMinutes,
                keyTopics: lesson.keyTopics,
                learningObjectives: lesson.learningObjectives,
                order: lesson.order,
              }
              const content = parseLessonContent(lastResponseText, outlineLesson)

              if (!content.markdown || content.markdown.length < 50) {
                throw new Error('JSON parsed but markdown content is empty or too short')
              }

              ctx.generatedLessons.set(lesson.title, content)
              ctx.completedLessons.value++
              generated++

              // Progress: lessons map to 65–85%
              const completed = ctx.completedLessons.value
              const totalAll = Math.max(ctx.totalLessons.value, 1)
              const overallProgress = 65 + Math.round((completed / totalAll) * 20)

              ctx.emitEvent({
                type: 'progress',
                data: {
                  courseId: ctx.courseId,
                  threadId: ctx.courseId,
                  stage: 'content',
                  stageProgress: Math.round((generated / total) * 100),
                  overallProgress,
                  thinkingOutput: `Generated "${lesson.title}" (${lesson.type}) [${generated}/${total}]`,
                  currentNode: 'batch_generate_lessons',
                },
              })

              ctx.emitEvent({
                type: 'content_progress',
                data: {
                  moduleIndex: 0,
                  lessonIndex: completed - 1,
                  totalModules: outline.modules.length,
                  totalLessons: totalAll,
                },
              })

              ctx.emitEvent({
                type: 'lesson_ready',
                data: {
                  lessonTitle: lesson.title,
                  moduleTitle: lesson.moduleTitle,
                  lessonType: lesson.type,
                  lessonId: lesson.id,
                  moduleId: lesson.moduleId,
                  markdownPreview: content.markdown.slice(0, 300),
                },
              })

              console.log(
                `[batch_generate_lessons] DONE: "${lesson.title}" (${lesson.type}) — ${content.markdown.length} chars [${generated}/${total}]`
              )
              break // success
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err)
              if (attempts < maxAttempts) {
                console.warn(
                  `[batch_generate_lessons] RETRY ${attempts}: "${lesson.title}" — ${msg}`
                )
                ctx.emitEvent({
                  type: 'thinking',
                  data: `Retrying "${lesson.title}" (attempt ${attempts + 1}/${maxAttempts})...`,
                })
                await new Promise((r) => setTimeout(r, 1000 * attempts))
                continue
              }
              // All retries exhausted — try to salvage raw text as markdown
              if (lastResponseText.length > 100) {
                const fallback = extractMarkdownFallback(lastResponseText)
                if (fallback.length > 50) {
                  ctx.generatedLessons.set(lesson.title, { markdown: fallback })
                  ctx.completedLessons.value++
                  generated++
                  ctx.emitEvent({
                    type: 'lesson_ready',
                    data: {
                      lessonTitle: lesson.title,
                      moduleTitle: lesson.moduleTitle,
                      lessonType: lesson.type,
                      lessonId: lesson.id,
                      moduleId: lesson.moduleId,
                      markdownPreview: fallback.slice(0, 300),
                    },
                  })
                  console.log(
                    `[batch_generate_lessons] RECOVERED: "${lesson.title}" — ${fallback.length} chars (fallback extraction)`
                  )
                  break
                }
              }
              errors.push(`"${lesson.title}": ${msg}`)
              console.error(`[batch_generate_lessons] ERROR: "${lesson.title}" — ${msg}`)
              break
            }
          }
        }

        const summary = `Lessons complete: ${generated}/${total} generated.${errors.length > 0 ? ` Errors: ${errors.length}` : ''}`
        console.log(`[batch_generate_lessons] ${summary}`)
        return summary
      },
      {
        name: 'batch_generate_lessons',
        description:
          'Generate content for ALL lecture, video, and practice lessons in the approved outline. Reads from stored state — no arguments needed. Call exactly ONCE.',
        schema: z.object({}),
      }
    ),
    createQueryRagTool(ctx),
  ]
}

// =============================================================================
// Quiz Writer Tools (batch quiz generation)
// =============================================================================

export function createQuizWriterTools(ctx: CourseToolContext): StructuredToolInterface[] {
  let quizzesStarted = false
  return [
    tool(
      async () => {
        if (quizzesStarted) {
          console.log('[batch_generate_quizzes] SKIPPED — already started')
          return 'Quiz generation already in progress or completed. Do NOT retry. Proceed to slides generation.'
        }
        quizzesStarted = true
        const outline = ctx.approvedOutline.value
        if (!outline) return 'No approved outline. Cannot generate quizzes.'

        const { PROMPTS } = await import('./prompts')
        const { parseLessonContent, extractMarkdownFallback } = await import('./tools')
        const { queryRAG } = await import('./research/rag-indexer')

        const quizLessons = outline.modules.flatMap((mod: CourseOutlineModule) =>
          mod.lessons
            .filter((les: CourseOutlineLesson) => les.type === 'quiz')
            .map((les: CourseOutlineLesson) => ({
              ...les,
              moduleId: mod.id,
              moduleTitle: mod.title,
              moduleDescription: mod.description,
            }))
        )

        if (quizLessons.length === 0) return 'No quiz lessons found in outline.'

        const quizModel = selectModel('course')
        const model = await createLangChainModel(quizModel, {
          temperature: 0.7,
          callbacks: [new TokenTrackingCallback({ model: quizModel.id, taskType: 'course' })],
        })

        let generated = 0
        const total = quizLessons.length
        const errors: string[] = []

        console.log(`[batch_generate_quizzes] Starting: ${total} quizzes`)

        for (const lesson of quizLessons) {
          let attempts = 0
          const maxAttempts = 3
          let lastResponseText = ''
          while (attempts < maxAttempts) {
            attempts++
            try {
              let researchContext = ''
              if (ctx.ragIndex.value) {
                researchContext = await queryRAG(
                  ctx.ragIndex.value,
                  `${lesson.title} ${lesson.keyTopics.join(' ')}`,
                  ctx.openaiApiKey,
                  3
                )
              } else if (ctx.researchReport.value) {
                researchContext = ctx.researchReport.value.slice(0, 2000)
              }

              const promptTemplate = PROMPTS.QUIZ ?? PROMPTS.LECTURE

              const prompt = promptTemplate
                .replace(/{LESSON_TITLE}/g, lesson.title)
                .replace(/{KEY_TOPICS}/g, lesson.keyTopics.join(', '))
                .replace(/{LEARNING_OBJECTIVES}/g, lesson.learningObjectives.join('\n- '))
                .replace(
                  /{MODULE_CONTEXT}/g,
                  `Module: ${lesson.moduleTitle} — ${lesson.moduleDescription}`
                )
                .replace(/{COURSE_CONTEXT}/g, `Course: ${outline.title} (${outline.difficulty})`)
                .replace(/{RESEARCH_CONTEXT}/g, researchContext)
                .replace(
                  /{PREVIOUS_LESSONS}/g,
                  generated > 0
                    ? `${generated} previous quizzes generated.`
                    : 'This is the first quiz.'
                )

              const response = await model.invoke(prompt)
              lastResponseText =
                typeof response.content === 'string'
                  ? response.content
                  : response.content.map((c) => ('text' in c ? c.text : '')).join('')

              const outlineLesson = {
                id: lesson.id,
                title: lesson.title,
                type: lesson.type,
                estimatedMinutes: lesson.estimatedMinutes,
                keyTopics: lesson.keyTopics,
                learningObjectives: lesson.learningObjectives,
                order: lesson.order,
              }
              const content = parseLessonContent(lastResponseText, outlineLesson)

              if (!content.markdown || content.markdown.length < 50) {
                throw new Error('JSON parsed but markdown content is empty or too short')
              }

              ctx.generatedLessons.set(lesson.title, content)
              ctx.completedLessons.value++
              generated++

              // Progress: quizzes map to 85–90%
              const completed = ctx.completedLessons.value
              const totalAll = Math.max(ctx.totalLessons.value, 1)
              const overallProgress = 85 + Math.round((generated / total) * 5)

              ctx.emitEvent({
                type: 'progress',
                data: {
                  courseId: ctx.courseId,
                  threadId: ctx.courseId,
                  stage: 'content',
                  stageProgress: Math.round((generated / total) * 100),
                  overallProgress,
                  thinkingOutput: `Generated quiz "${lesson.title}" [${generated}/${total}]`,
                  currentNode: 'batch_generate_quizzes',
                },
              })

              ctx.emitEvent({
                type: 'content_progress',
                data: {
                  moduleIndex: 0,
                  lessonIndex: completed - 1,
                  totalModules: outline.modules.length,
                  totalLessons: totalAll,
                },
              })

              ctx.emitEvent({
                type: 'lesson_ready',
                data: {
                  lessonTitle: lesson.title,
                  moduleTitle: lesson.moduleTitle,
                  lessonType: lesson.type,
                  lessonId: lesson.id,
                  moduleId: lesson.moduleId,
                  markdownPreview: content.markdown.slice(0, 300),
                },
              })

              console.log(
                `[batch_generate_quizzes] DONE: "${lesson.title}" [${generated}/${total}]`
              )
              break // success
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err)
              if (attempts < maxAttempts) {
                console.warn(
                  `[batch_generate_quizzes] RETRY ${attempts}: "${lesson.title}" — ${msg}`
                )
                ctx.emitEvent({
                  type: 'thinking',
                  data: `Retrying "${lesson.title}" (attempt ${attempts + 1}/${maxAttempts})...`,
                })
                await new Promise((r) => setTimeout(r, 1000 * attempts))
                continue
              }
              // All retries exhausted — try to salvage raw text as markdown
              if (lastResponseText.length > 100) {
                const fallback = extractMarkdownFallback(lastResponseText)
                if (fallback.length > 50) {
                  ctx.generatedLessons.set(lesson.title, { markdown: fallback })
                  ctx.completedLessons.value++
                  generated++
                  ctx.emitEvent({
                    type: 'lesson_ready',
                    data: {
                      lessonTitle: lesson.title,
                      moduleTitle: lesson.moduleTitle,
                      lessonType: lesson.type,
                      lessonId: lesson.id,
                      moduleId: lesson.moduleId,
                      markdownPreview: fallback.slice(0, 300),
                    },
                  })
                  console.log(
                    `[batch_generate_quizzes] RECOVERED: "${lesson.title}" — ${fallback.length} chars (fallback extraction)`
                  )
                  break
                }
              }
              errors.push(`"${lesson.title}": ${msg}`)
              console.error(`[batch_generate_quizzes] ERROR: "${lesson.title}" — ${msg}`)
              break
            }
          }
        }

        const summary = `Quizzes complete: ${generated}/${total}.${errors.length > 0 ? ` Errors: ${errors.length}` : ''}`
        console.log(`[batch_generate_quizzes] ${summary}`)
        return summary
      },
      {
        name: 'batch_generate_quizzes',
        description:
          'Generate content for ALL quiz lessons in the approved outline. Reads from stored state — no arguments needed. Call exactly ONCE.',
        schema: z.object({}),
      }
    ),
    createQueryRagTool(ctx),
  ]
}

// =============================================================================
// Slides Writer Tools (batch slide deck generation)
// =============================================================================

export function createSlidesWriterTools(ctx: CourseToolContext): StructuredToolInterface[] {
  let slidesStarted = false
  return [
    tool(
      async () => {
        if (slidesStarted) {
          console.log('[batch_generate_slides] SKIPPED — already started')
          return 'Slides generation already in progress or completed. Do NOT retry. Proceed to video matching and assembly.'
        }
        slidesStarted = true
        const outline = ctx.approvedOutline.value
        if (!outline) return 'No approved outline. Cannot generate slides.'

        const { PROMPTS } = await import('./prompts')
        const { parseLessonContent, extractMarkdownFallback } = await import('./tools')
        const { queryRAG } = await import('./research/rag-indexer')
        const { generateSlidesWithModel } = await import('./slide-generator')

        const slideLessons = outline.modules.flatMap((mod: CourseOutlineModule) =>
          mod.lessons
            .filter((les: CourseOutlineLesson) => les.type === 'slides')
            .map((les: CourseOutlineLesson) => ({
              ...les,
              moduleId: mod.id,
              moduleTitle: mod.title,
              moduleDescription: mod.description,
            }))
        )

        if (slideLessons.length === 0) return 'No slide lessons found in outline.'

        const slidesModel = selectModel('slides')
        const model = await createLangChainModel(slidesModel, {
          temperature: 0.7,
          callbacks: [new TokenTrackingCallback({ model: slidesModel.id, taskType: 'slides' })],
        })

        let generated = 0
        const total = slideLessons.length
        const errors: string[] = []

        console.log(`[batch_generate_slides] Starting: ${total} slide lessons`)

        for (const lesson of slideLessons) {
          let attempts = 0
          const maxAttempts = 3
          let lastResponseText = ''
          while (attempts < maxAttempts) {
            attempts++
            try {
              let researchContext = ''
              if (ctx.ragIndex.value) {
                researchContext = await queryRAG(
                  ctx.ragIndex.value,
                  `${lesson.title} ${lesson.keyTopics.join(' ')}`,
                  ctx.openaiApiKey,
                  3
                )
              } else if (ctx.researchReport.value) {
                researchContext = ctx.researchReport.value.slice(0, 2000)
              }

              // Generate slide deck using slides model from registry
              const slides = await generateSlidesWithModel(
                lesson.title,
                lesson.keyTopics,
                researchContext,
                undefined,
                undefined,
                ctx.settings.maxSlidesPerLesson
              )

              // Also generate markdown content for the slides lesson
              const promptTemplate = PROMPTS.SLIDES ?? PROMPTS.LECTURE

              const prompt = promptTemplate
                .replace(/{LESSON_TITLE}/g, lesson.title)
                .replace(/{KEY_TOPICS}/g, lesson.keyTopics.join(', '))
                .replace(/{LEARNING_OBJECTIVES}/g, lesson.learningObjectives.join('\n- '))
                .replace(
                  /{MODULE_CONTEXT}/g,
                  `Module: ${lesson.moduleTitle} — ${lesson.moduleDescription}`
                )
                .replace(/{COURSE_CONTEXT}/g, `Course: ${outline.title} (${outline.difficulty})`)
                .replace(/{RESEARCH_CONTEXT}/g, researchContext)
                .replace(
                  /{PREVIOUS_LESSONS}/g,
                  generated > 0
                    ? `${generated} previous slide lessons generated.`
                    : 'This is the first slide lesson.'
                )

              const response = await model.invoke(prompt)
              lastResponseText =
                typeof response.content === 'string'
                  ? response.content
                  : response.content.map((c) => ('text' in c ? c.text : '')).join('')

              const outlineLesson = {
                id: lesson.id,
                title: lesson.title,
                type: lesson.type,
                estimatedMinutes: lesson.estimatedMinutes,
                keyTopics: lesson.keyTopics,
                learningObjectives: lesson.learningObjectives,
                order: lesson.order,
              }
              const content = parseLessonContent(lastResponseText, outlineLesson)
              content.slides = slides

              if (!content.markdown || content.markdown.length < 50) {
                throw new Error('JSON parsed but markdown content is empty or too short')
              }

              ctx.generatedLessons.set(lesson.title, content)
              ctx.completedLessons.value++
              generated++

              // Progress: slides map to 90–95%
              const completed = ctx.completedLessons.value
              const totalAll = Math.max(ctx.totalLessons.value, 1)
              const overallProgress = 90 + Math.round((generated / total) * 5)

              ctx.emitEvent({
                type: 'progress',
                data: {
                  courseId: ctx.courseId,
                  threadId: ctx.courseId,
                  stage: 'multimedia',
                  stageProgress: Math.round((generated / total) * 100),
                  overallProgress,
                  thinkingOutput: `Generated slides for "${lesson.title}" (${slides.length} slides) [${generated}/${total}]`,
                  currentNode: 'batch_generate_slides',
                },
              })

              ctx.emitEvent({
                type: 'content_progress',
                data: {
                  moduleIndex: 0,
                  lessonIndex: completed - 1,
                  totalModules: outline.modules.length,
                  totalLessons: totalAll,
                },
              })

              ctx.emitEvent({
                type: 'lesson_ready',
                data: {
                  lessonTitle: lesson.title,
                  moduleTitle: lesson.moduleTitle,
                  lessonType: lesson.type,
                  lessonId: lesson.id,
                  moduleId: lesson.moduleId,
                  markdownPreview: content.markdown.slice(0, 300),
                },
              })

              console.log(
                `[batch_generate_slides] DONE: "${lesson.title}" — ${slides.length} slides, ${content.markdown.length} chars [${generated}/${total}]`
              )
              break // success
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err)
              if (attempts < maxAttempts) {
                console.warn(
                  `[batch_generate_slides] RETRY ${attempts}: "${lesson.title}" — ${msg}`
                )
                ctx.emitEvent({
                  type: 'thinking',
                  data: `Retrying "${lesson.title}" (attempt ${attempts + 1}/${maxAttempts})...`,
                })
                await new Promise((r) => setTimeout(r, 1000 * attempts))
                continue
              }
              // All retries exhausted — try to salvage raw text as markdown
              if (lastResponseText.length > 100) {
                const fallback = extractMarkdownFallback(lastResponseText)
                if (fallback.length > 50) {
                  ctx.generatedLessons.set(lesson.title, { markdown: fallback })
                  ctx.completedLessons.value++
                  generated++
                  ctx.emitEvent({
                    type: 'lesson_ready',
                    data: {
                      lessonTitle: lesson.title,
                      moduleTitle: lesson.moduleTitle,
                      lessonType: lesson.type,
                      lessonId: lesson.id,
                      moduleId: lesson.moduleId,
                      markdownPreview: fallback.slice(0, 300),
                    },
                  })
                  console.log(
                    `[batch_generate_slides] RECOVERED: "${lesson.title}" — ${fallback.length} chars (fallback extraction)`
                  )
                  break
                }
              }
              errors.push(`"${lesson.title}": ${msg}`)
              console.error(`[batch_generate_slides] ERROR: "${lesson.title}" — ${msg}`)
              break
            }
          }
        }

        const summary = `Slides complete: ${generated}/${total}.${errors.length > 0 ? ` Errors: ${errors.length}` : ''}`
        console.log(`[batch_generate_slides] ${summary}`)
        return summary
      },
      {
        name: 'batch_generate_slides',
        description:
          'Generate slide decks and content for ALL slide-type lessons in the approved outline. Uses the slides model from the model registry for higher quality. Reads from stored state — no arguments needed. Call exactly ONCE.',
        schema: z.object({}),
      }
    ),
    createQueryRagTool(ctx),
  ]
}

// =============================================================================
// Deprecated alias — kept for backward compatibility
// =============================================================================

/** @deprecated Use createOrchestratorTools instead */
export const createCourseTools = createOrchestratorTools
