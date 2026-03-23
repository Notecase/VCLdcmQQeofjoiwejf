/**
 * Course Service
 *
 * Client-side service for course generation and management API.
 * Handles SSE streaming for real-time generation progress.
 */

import { authFetch, authFetchSSE } from '@/utils/api'
import type {
  Course,
  CourseModule,
  Lesson,
  CourseOutline,
  CourseSettings,
  CourseDifficulty,
  CourseGenerationProgress,
  CourseAgentStep,
  CourseTodoItem,
  ResearchProgress,
  GenerationStageType,
  LessonReadyEvent,
} from '@inkdown/shared/types'

const API_BASE = `${import.meta.env.VITE_API_URL || ''}/api/course`

// ============================================================================
// snake_case → camelCase mappers (Supabase rows → frontend types)
// ============================================================================

function mapLessonFromApi(raw: Record<string, unknown>): Lesson {
  return {
    id: raw.id as string,
    moduleId: (raw.module_id ?? raw.moduleId) as string,
    title: raw.title as string,
    type: raw.type as Lesson['type'],
    duration: (raw.duration ?? '') as string,
    order: (raw.order ?? 0) as number,
    status: (raw.status ?? 'locked') as Lesson['status'],
    content: (raw.content ?? { markdown: '' }) as Lesson['content'],
    completedAt: (raw.completed_at ?? raw.completedAt) as string | undefined,
  }
}

function mapModuleFromApi(raw: Record<string, unknown>): CourseModule {
  const rawLessons = (raw.lessons ?? []) as Array<Record<string, unknown>>
  return {
    id: raw.id as string,
    courseId: (raw.course_id ?? raw.courseId) as string,
    title: raw.title as string,
    description: (raw.description ?? '') as string,
    order: (raw.order ?? 0) as number,
    status: (raw.status ?? 'locked') as CourseModule['status'],
    progress: (raw.progress ?? 0) as number,
    lessons: rawLessons.map(mapLessonFromApi),
  }
}

function mapCourseFromApi(raw: Record<string, unknown>): Course {
  return {
    id: raw.id as string,
    userId: (raw.user_id ?? raw.userId ?? '') as string,
    title: (raw.title ?? '') as string,
    topic: (raw.topic ?? '') as string,
    description: (raw.description ?? '') as string,
    difficulty: (raw.difficulty ?? 'beginner') as Course['difficulty'],
    estimatedHours: (raw.estimated_hours ?? raw.estimatedHours ?? 0) as number,
    prerequisites: (raw.prerequisites ?? []) as string[],
    learningObjectives: (raw.learning_objectives ?? raw.learningObjectives ?? []) as string[],
    status: (raw.status ?? 'generating') as Course['status'],
    progress: (raw.progress ?? 0) as number,
    settings: (raw.settings ?? {}) as Course['settings'],
    researchReport: (raw.research_report ?? raw.researchReport ?? null) as string | null,
    thinkingTrace: (raw.thinking_trace ?? raw.thinkingTrace ?? null) as string | null,
    generatedAt: (raw.generated_at ?? raw.generatedAt ?? '') as string,
    createdAt: (raw.created_at ?? raw.createdAt ?? '') as string,
    updatedAt: (raw.updated_at ?? raw.updatedAt ?? '') as string,
  }
}

// ============================================================================
// Generation API
// ============================================================================

/**
 * Start course generation pipeline
 */
export async function startCourseGeneration(
  topic: string,
  difficulty: CourseDifficulty,
  settings: Partial<CourseSettings>,
  focusAreas: string[]
): Promise<{ courseId: string; threadId: string }> {
  const response = await authFetch(`${API_BASE}/generate`, {
    method: 'POST',
    body: JSON.stringify({ topic, difficulty, settings, focusAreas }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: `API error: ${response.status}` }))
    throw new Error(err.message || `API error: ${response.status}`)
  }

  return response.json()
}

/**
 * Get current generation status (poll-based fallback)
 */
export async function getGenerationStatus(threadId: string): Promise<{
  status: string
  stage: string
  outline: CourseOutline | null
  error?: string
  courseId: string
}> {
  const response = await authFetch(`${API_BASE}/generate/${threadId}/status`)

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`)
  }

  return response.json()
}

/**
 * Stream generation progress via SSE
 *
 * Connects to the generation stream and dispatches events to callbacks
 * as they arrive. Follows the same SSE pattern as ai.service.ts.
 */
export async function streamGenerationProgress(
  threadId: string,
  callbacks: {
    onProgress?: (progress: CourseGenerationProgress) => void
    onResearchProgress?: (progress: ResearchProgress) => void
    onOutlineReady?: (data: { outline: CourseOutline; thinking: string }) => void
    onContentProgress?: (data: {
      moduleIndex: number
      lessonIndex: number
      totalModules: number
      totalLessons: number
    }) => void
    onLessonReady?: (data: LessonReadyEvent) => void
    onComplete?: (data: { courseId: string }) => void
    onError?: (data: { message: string; stage: GenerationStageType }) => void
    // Orchestrator events (DeepAgentsJS)
    onAgentStep?: (step: CourseAgentStep) => void
    onTodoUpdate?: (data: { todos: CourseTodoItem[] }) => void
    onSubAgentStart?: (data: {
      id: string
      name: string
      status: string
      startedAt: string
    }) => void
    onSubAgentResult?: (data: {
      id: string
      name: string
      status: string
      completedAt: string
      output?: string
    }) => void
    onThinking?: (text: string) => void
    onText?: (text: string) => void
    onInterrupt?: (data: {
      id: string
      type: string
      outline: CourseOutline
      thinking: string
    }) => void
    onDone?: () => void
  }
): Promise<void> {
  const response = await authFetchSSE(`${API_BASE}/generate/${threadId}/stream`)

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`)
  }

  const { parseSSEStream } = await import('@/utils/sse-parser')
  let receivedTerminalEvent = false

  await parseSSEStream(response, {
    onEvent: (sseEvent) => {
      const parsed = sseEvent.data as Record<string, unknown>
      // Event type from SSE event: line, parsed envelope, or parsed.event
      const eventType = sseEvent.event || (parsed.event as string) || ''
      const eventData = (parsed.data as Record<string, unknown>) ?? parsed

      switch (eventType) {
        case 'progress':
          callbacks.onProgress?.(eventData as CourseGenerationProgress)
          break

        case 'research_progress':
          callbacks.onResearchProgress?.(eventData as ResearchProgress)
          break

        case 'outline_ready':
          callbacks.onOutlineReady?.(eventData as { outline: CourseOutline; thinking: string })
          break

        case 'interrupt':
          // Orchestrator emits interrupts for outline approval
          callbacks.onInterrupt?.(
            eventData as { id: string; type: string; outline: CourseOutline; thinking: string }
          )
          // Backward compatibility: also trigger onOutlineReady for outline_approval interrupts
          if ((eventData as { type?: string }).type === 'outline_approval') {
            callbacks.onOutlineReady?.({
              outline: (eventData as { outline: CourseOutline }).outline,
              thinking: (eventData as { thinking: string }).thinking,
            })
          }
          break

        case 'content_progress':
          callbacks.onContentProgress?.(
            eventData as {
              moduleIndex: number
              lessonIndex: number
              totalModules: number
              totalLessons: number
            }
          )
          break

        case 'lesson_ready':
          callbacks.onLessonReady?.(eventData as LessonReadyEvent)
          break

        case 'agent-step':
          callbacks.onAgentStep?.(eventData as CourseAgentStep)
          break

        case 'todo-update':
          callbacks.onTodoUpdate?.(eventData as { todos: CourseTodoItem[] })
          break

        case 'subagent-start':
          callbacks.onSubAgentStart?.(
            eventData as { id: string; name: string; status: string; startedAt: string }
          )
          break

        case 'subagent-result':
          callbacks.onSubAgentResult?.(
            eventData as {
              id: string
              name: string
              status: string
              completedAt: string
              output?: string
            }
          )
          break

        case 'text':
          callbacks.onText?.(typeof eventData === 'string' ? eventData : String(eventData))
          break

        case 'thinking':
          callbacks.onThinking?.(typeof eventData === 'string' ? eventData : String(eventData))
          break

        case 'complete':
          receivedTerminalEvent = true
          callbacks.onComplete?.(eventData as { courseId: string })
          break

        case 'done':
          receivedTerminalEvent = true
          callbacks.onDone?.()
          break

        case 'error':
          receivedTerminalEvent = true
          callbacks.onError?.(eventData as { message: string; stage: GenerationStageType })
          break
      }
    },
    onError: (err) => {
      console.error('[Course Service] Failed to parse SSE chunk:', err)
    },
    onDone: () => {
      // If the stream ended without a terminal event, the connection dropped silently.
      // Delegate recovery to onDone (do NOT call onError — it would set error state
      // that onDone's recovery logic can't clear).
      if (!receivedTerminalEvent) {
        console.warn(
          '[Course Service] SSE stream ended without terminal event — delegating to onDone'
        )
        callbacks.onDone?.()
      }
    },
  })
}

/**
 * Approve an outline to continue generation
 */
export async function approveOutline(
  threadId: string,
  modifiedOutline?: CourseOutline
): Promise<void> {
  const response = await authFetch(`${API_BASE}/generate/${threadId}/approve`, {
    method: 'POST',
    body: JSON.stringify({ modifiedOutline }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: `API error: ${response.status}` }))
    throw new Error(err.error || err.message || `API error: ${response.status}`)
  }
}

/**
 * Reject an outline with feedback
 */
export async function rejectOutline(threadId: string, feedback: string): Promise<void> {
  const response = await authFetch(`${API_BASE}/generate/${threadId}/reject`, {
    method: 'POST',
    body: JSON.stringify({ feedback }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: `API error: ${response.status}` }))
    throw new Error(err.error || err.message || `API error: ${response.status}`)
  }
}

/**
 * Cancel an in-progress generation
 */
export async function cancelGeneration(threadId: string): Promise<void> {
  const response = await authFetch(`${API_BASE}/generate/${threadId}/cancel`, {
    method: 'POST',
  })

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`)
  }
}

// ============================================================================
// Course CRUD
// ============================================================================

/**
 * Fetch all courses for the current user
 */
export async function fetchCourses(): Promise<Course[]> {
  const response = await authFetch(`${API_BASE}/list`)

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`)
  }

  const result = await response.json()
  const rawCourses = (result.courses ?? result) as Array<Record<string, unknown>>
  return rawCourses.map(mapCourseFromApi)
}

/**
 * Fetch a single course with all modules and lessons
 */
export async function fetchCourse(
  courseId: string
): Promise<{ course: Course; modules: CourseModule[] }> {
  const response = await authFetch(`${API_BASE}/${courseId}`)

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`)
  }

  const raw = await response.json()
  return {
    course: mapCourseFromApi(raw.course),
    modules: (raw.modules ?? []).map(mapModuleFromApi),
  }
}

/**
 * Mark a lesson as completed
 */
export async function completeLesson(courseId: string, lessonId: string): Promise<void> {
  const response = await authFetch(`${API_BASE}/${courseId}/lessons/${lessonId}/complete`, {
    method: 'POST',
  })

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`)
  }
}

/**
 * Submit quiz answers and get score
 */
export async function submitQuiz(
  courseId: string,
  lessonId: string,
  answers: Record<string, number | string>
): Promise<{ score: number; passed: boolean }> {
  const response = await authFetch(`${API_BASE}/${courseId}/lessons/${lessonId}/quiz`, {
    method: 'POST',
    body: JSON.stringify({ answers }),
  })

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`)
  }

  return response.json()
}

/**
 * Get thread status (poll-based, used as fallback for completion detection)
 */
export async function getThreadStatus(threadId: string): Promise<{
  status: string
  stage: string
  progress: number
  courseId: string
  outline?: import('@inkdown/shared/types').CourseOutline | null
  error?: string | null
}> {
  const response = await authFetch(`${API_BASE}/generate/${threadId}/status`)

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`)
  }

  return response.json()
}

/**
 * Delete a course
 */
export async function deleteCourse(courseId: string): Promise<void> {
  const response = await authFetch(`${API_BASE}/${courseId}`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`)
  }
}
