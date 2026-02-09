/**
 * Course Store
 *
 * Pinia store for course state management.
 * Manages course list, active course viewing, generation pipeline, and quiz/practice state.
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  Course,
  CourseModule,
  CourseOutline,
  CourseSettings,
  CourseDifficulty,
  CourseAgentStep,
  CourseTodoItem,
  ResearchProgress,
  GenerationStageType,
} from '@inkdown/shared/types'
import * as courseService from '@/services/course.service'
import { canSubmitOutlineApproval } from './course.approval-guard'

export const useCourseStore = defineStore('course', () => {
  // ---------------------------------------------------------------------------
  // State: Course List
  // ---------------------------------------------------------------------------

  const courses = ref<Course[]>([])
  const isLoadingCourses = ref(false)

  // ---------------------------------------------------------------------------
  // State: Active Course (viewing)
  // ---------------------------------------------------------------------------

  const activeCourse = ref<Course | null>(null)
  const activeModules = ref<CourseModule[]>([])
  const selectedModuleIndex = ref(0)
  const selectedLessonIndex = ref(0)

  // ---------------------------------------------------------------------------
  // State: Generation
  // ---------------------------------------------------------------------------

  const isGenerating = ref(false)
  const generationThreadId = ref<string | null>(null)
  const generationCourseId = ref<string | null>(null)
  const generationStage = ref<GenerationStageType>('research')
  const generationProgress = ref(0)
  const generationThinking = ref('')
  const researchProgress = ref<ResearchProgress | null>(null)
  const pendingOutline = ref<CourseOutline | null>(null)
  const isAwaitingApproval = ref(false)
  const isApprovingOutline = ref(false)
  const generationError = ref<string | null>(null)

  // ---------------------------------------------------------------------------
  // State: Agent Orchestrator (DeepAgentsJS events)
  // ---------------------------------------------------------------------------

  const agentSteps = ref<CourseAgentStep[]>([])
  const agentTodos = ref<CourseTodoItem[]>([])
  const activeSubAgents = ref<
    Array<{
      id: string
      name: string
      status: string
      startedAt?: string
      completedAt?: string
      output?: string
    }>
  >([])

  // ---------------------------------------------------------------------------
  // State: Quiz / Practice
  // ---------------------------------------------------------------------------

  const practiceAnswers = ref<Record<string, number | string>>({})
  const practiceSubmitted = ref(false)
  const currentSlide = ref(0)

  // ---------------------------------------------------------------------------
  // Computed
  // ---------------------------------------------------------------------------

  const currentModule = computed(() => {
    if (activeModules.value.length === 0) return null
    return activeModules.value[selectedModuleIndex.value] ?? null
  })

  const currentLesson = computed(() => {
    if (!currentModule.value) return null
    return currentModule.value.lessons[selectedLessonIndex.value] ?? null
  })

  const courseProgress = computed(() => {
    if (!activeModules.value.length) return 0
    let totalLessons = 0
    let completedLessons = 0
    for (const mod of activeModules.value) {
      for (const lesson of mod.lessons) {
        totalLessons++
        if (lesson.status === 'completed') completedLessons++
      }
    }
    return totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0
  })

  // ---------------------------------------------------------------------------
  // Actions: Course List
  // ---------------------------------------------------------------------------

  async function fetchCourses() {
    isLoadingCourses.value = true
    try {
      courses.value = await courseService.fetchCourses()
    } catch (err) {
      console.error('[Course Store] Failed to fetch courses:', err)
    } finally {
      isLoadingCourses.value = false
    }
  }

  // ---------------------------------------------------------------------------
  // Actions: Active Course
  // ---------------------------------------------------------------------------

  async function fetchCourse(courseId: string) {
    try {
      const result = await courseService.fetchCourse(courseId)
      activeCourse.value = result.course
      activeModules.value = result.modules
      selectedModuleIndex.value = 0
      selectedLessonIndex.value = 0
      resetPractice()
    } catch (err) {
      console.error('[Course Store] Failed to fetch course:', err)
    }
  }

  // ---------------------------------------------------------------------------
  // Actions: Generation
  // ---------------------------------------------------------------------------

  async function startGeneration(
    topic: string,
    difficulty: CourseDifficulty,
    settings: Partial<CourseSettings>,
    focusAreas: string[]
  ) {
    isGenerating.value = true
    generationError.value = null
    generationStage.value = 'research'
    generationProgress.value = 0
    generationThinking.value = ''
    researchProgress.value = null
    pendingOutline.value = null
    isAwaitingApproval.value = false
    isApprovingOutline.value = false
    agentSteps.value = []
    agentTodos.value = []
    activeSubAgents.value = []

    try {
      const { courseId, threadId } = await courseService.startCourseGeneration(
        topic,
        difficulty,
        settings,
        focusAreas
      )
      generationCourseId.value = courseId
      generationThreadId.value = threadId

      // Connect to SSE stream for real-time progress
      await courseService.streamGenerationProgress(threadId, {
        onProgress: (progress) => {
          generationStage.value = progress.stage
          const clamped = Math.min(progress.overallProgress, 100)
          // Never let progress go backwards
          if (clamped >= generationProgress.value) {
            generationProgress.value = clamped
          }
          generationThinking.value = progress.thinkingOutput
        },

        onResearchProgress: (progress) => {
          researchProgress.value = progress
        },

        onOutlineReady: (data) => {
          pendingOutline.value = data.outline
          generationThinking.value = data.thinking
          isAwaitingApproval.value = true
          generationStage.value = 'approval'
        },

        onContentProgress: (data) => {
          generationStage.value = 'content'
          if (data.totalLessons > 0) {
            const progress = Math.min(
              65 + Math.round(((data.lessonIndex + 1) / data.totalLessons) * 25),
              90
            )
            if (progress >= generationProgress.value) {
              generationProgress.value = progress
            }
          }
        },

        onComplete: async (data) => {
          generationCourseId.value = data.courseId
          generationStage.value = 'complete'
          generationProgress.value = 100
          generationThinking.value = ''
          isGenerating.value = false
          isAwaitingApproval.value = false
          // Load the completed course
          await fetchCourse(data.courseId)
          // Refresh courses list
          await fetchCourses()
        },

        onError: (data) => {
          generationError.value = data.message
          generationStage.value = data.stage
          isGenerating.value = false
        },

        // Orchestrator events
        onAgentStep: (step) => {
          const existingIdx = agentSteps.value.findIndex((s) => s.id === step.id)
          if (existingIdx >= 0) {
            agentSteps.value[existingIdx] = step
          } else {
            agentSteps.value.push(step)
          }
        },

        onTodoUpdate: (data) => {
          agentTodos.value = data.todos
        },

        onSubAgentStart: (data) => {
          const existing = activeSubAgents.value.findIndex((s) => s.id === data.id)
          if (existing >= 0) {
            activeSubAgents.value[existing] = { ...activeSubAgents.value[existing], ...data }
          } else {
            activeSubAgents.value.push(data)
          }
        },

        onSubAgentResult: (data) => {
          const existing = activeSubAgents.value.findIndex((s) => s.id === data.id)
          if (existing >= 0) {
            activeSubAgents.value[existing] = { ...activeSubAgents.value[existing], ...data }
          }
        },

        onText: (text) => {
          // Show recent agent reasoning as thinking text (truncate to last 500 chars)
          if (text && text.length > 5) {
            generationThinking.value = text.slice(-500)
          }
        },

        onThinking: (text) => {
          generationThinking.value += text
        },

        onInterrupt: (data) => {
          if (data.type === 'outline_approval') {
            pendingOutline.value = data.outline
            isAwaitingApproval.value = true
            generationStage.value = 'approval'
          }
        },

        onDone: async () => {
          activeSubAgents.value = []
          // Fallback: if the agent finished but 'complete' event was lost,
          // poll thread status with retries to recover
          if (generationStage.value !== 'complete') {
            console.warn(
              '[Course Store] onDone fallback: generation stage is',
              generationStage.value,
              'at',
              generationProgress.value,
              '%. Polling thread status with retries...'
            )
            const threadId = generationThreadId.value
            if (!threadId) return

            const MAX_RETRIES = 12
            const INITIAL_DELAY = 2000
            const RETRY_INTERVAL = 5000

            // Wait before first poll to give backend time to commit
            await new Promise((r) => setTimeout(r, INITIAL_DELAY))

            for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
              try {
                const status = await courseService.getThreadStatus(threadId)

                if (status.status === 'complete') {
                  // Generation completed — recover
                  generationError.value = null
                  generationStage.value = 'complete'
                  generationProgress.value = 100
                  generationThinking.value = ''
                  isGenerating.value = false
                  isAwaitingApproval.value = false
                  if (generationCourseId.value) {
                    await fetchCourse(generationCourseId.value)
                    await fetchCourses()
                  }
                  return
                } else if (status.status === 'error') {
                  // Backend reported an error — surface it immediately
                  generationError.value = status.error ?? 'Generation failed on the server.'
                  isGenerating.value = false
                  return
                } else if (status.status === 'awaiting_approval') {
                  // Outline is ready but SSE dropped before frontend got it — recover
                  console.warn('[Course Store] Recovering awaiting_approval state')
                  generationError.value = null
                  isAwaitingApproval.value = true
                  generationStage.value = 'approval'
                  if (status.outline) {
                    pendingOutline.value = status.outline
                  }
                  return
                }

                // Still running/saving/assembling — retry after interval
                if (attempt < MAX_RETRIES) {
                  console.log(
                    `[Course Store] Poll attempt ${attempt}/${MAX_RETRIES}: status="${status.status}", progress=${status.progress}. Retrying in ${RETRY_INTERVAL}ms...`
                  )
                  await new Promise((r) => setTimeout(r, RETRY_INTERVAL))
                }
              } catch (err) {
                console.error(`[Course Store] Poll attempt ${attempt}/${MAX_RETRIES} failed:`, err)
                if (attempt < MAX_RETRIES) {
                  await new Promise((r) => setTimeout(r, RETRY_INTERVAL))
                }
              }
            }

            // All retries exhausted — backend is still running or in unknown state
            generationError.value =
              'Connection lost. Generation may still be running. Check your courses list.'
            isGenerating.value = false
          }
        },
      })
    } catch (err) {
      generationError.value = err instanceof Error ? err.message : 'Generation failed'
      isGenerating.value = false
    }
  }

  async function approveOutline(modifiedOutline?: CourseOutline) {
    if (!canSubmitOutlineApproval(generationThreadId.value, isApprovingOutline.value)) return

    try {
      isApprovingOutline.value = true
      await courseService.approveOutline(generationThreadId.value, modifiedOutline)
      isAwaitingApproval.value = false
      generationStage.value = 'content'
    } catch (err) {
      generationError.value = err instanceof Error ? err.message : 'Failed to approve outline'
    } finally {
      isApprovingOutline.value = false
    }
  }

  async function rejectOutline(feedback: string) {
    if (!generationThreadId.value) return

    try {
      await courseService.rejectOutline(generationThreadId.value, feedback)
      isAwaitingApproval.value = false
      pendingOutline.value = null
      generationStage.value = 'planning'
    } catch (err) {
      generationError.value = err instanceof Error ? err.message : 'Failed to reject outline'
    }
  }

  async function cancelGeneration() {
    if (!generationThreadId.value) return

    try {
      await courseService.cancelGeneration(generationThreadId.value)
    } catch (err) {
      console.error('[Course Store] Failed to cancel generation:', err)
    } finally {
      isGenerating.value = false
      isAwaitingApproval.value = false
      isApprovingOutline.value = false
      generationError.value = null
      generationThreadId.value = null
      generationCourseId.value = null
    }
  }

  // ---------------------------------------------------------------------------
  // Actions: Lesson Navigation & Completion
  // ---------------------------------------------------------------------------

  function selectLesson(moduleIndex: number, lessonIndex: number) {
    selectedModuleIndex.value = moduleIndex
    selectedLessonIndex.value = lessonIndex
    resetPractice()
    currentSlide.value = 0
  }

  async function completeLesson(lessonId: string) {
    if (!activeCourse.value) return

    try {
      await courseService.completeLesson(activeCourse.value.id, lessonId)

      // Update local state
      for (const mod of activeModules.value) {
        const lesson = mod.lessons.find((l) => l.id === lessonId)
        if (lesson) {
          lesson.status = 'completed'
          lesson.completedAt = new Date().toISOString()
          break
        }
      }

      // Update course progress
      if (activeCourse.value) {
        activeCourse.value.progress = courseProgress.value
      }
    } catch (err) {
      console.error('[Course Store] Failed to complete lesson:', err)
    }
  }

  // ---------------------------------------------------------------------------
  // Actions: Quiz / Practice
  // ---------------------------------------------------------------------------

  async function submitQuiz(
    lessonId: string,
    answers: Record<string, number | string>
  ): Promise<{ score: number; passed: boolean } | null> {
    if (!activeCourse.value) return null

    try {
      const result = await courseService.submitQuiz(activeCourse.value.id, lessonId, answers)
      return result
    } catch (err) {
      console.error('[Course Store] Failed to submit quiz:', err)
      return null
    }
  }

  function handleAnswer(problemId: string, answer: number | string) {
    practiceAnswers.value[problemId] = answer
  }

  function submitPractice() {
    practiceSubmitted.value = true
  }

  function resetPractice() {
    practiceAnswers.value = {}
    practiceSubmitted.value = false
  }

  // ---------------------------------------------------------------------------
  // Actions: Delete
  // ---------------------------------------------------------------------------

  async function deleteCourse(courseId: string) {
    try {
      await courseService.deleteCourse(courseId)
      courses.value = courses.value.filter((c) => c.id !== courseId)
      if (activeCourse.value?.id === courseId) {
        activeCourse.value = null
        activeModules.value = []
      }
    } catch (err) {
      console.error('[Course Store] Failed to delete course:', err)
    }
  }

  // ---------------------------------------------------------------------------
  // Return
  // ---------------------------------------------------------------------------

  return {
    // State: Course List
    courses,
    isLoadingCourses,

    // State: Active Course
    activeCourse,
    activeModules,
    selectedModuleIndex,
    selectedLessonIndex,

    // State: Generation
    isGenerating,
    generationThreadId,
    generationCourseId,
    generationStage,
    generationProgress,
    generationThinking,
    researchProgress,
    pendingOutline,
    isAwaitingApproval,
    isApprovingOutline,
    generationError,

    // State: Agent Orchestrator
    agentSteps,
    agentTodos,
    activeSubAgents,

    // State: Quiz / Practice
    practiceAnswers,
    practiceSubmitted,
    currentSlide,

    // Computed
    currentModule,
    currentLesson,
    courseProgress,

    // Actions
    fetchCourses,
    fetchCourse,
    startGeneration,
    approveOutline,
    rejectOutline,
    cancelGeneration,
    selectLesson,
    completeLesson,
    submitQuiz,
    handleAnswer,
    submitPractice,
    resetPractice,
    deleteCourse,
  }
})
