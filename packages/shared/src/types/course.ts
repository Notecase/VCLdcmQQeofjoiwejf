// ============================================================
// COURSE TYPES — packages/shared/src/types/course.ts
// ============================================================

// --- Course Structure Types ---

export type CourseDifficulty = 'beginner' | 'intermediate' | 'advanced'
export type CourseStatus = 'generating' | 'ready' | 'archived'
export type LessonType = 'lecture' | 'video' | 'slides' | 'practice' | 'quiz'
export type LessonStatus = 'locked' | 'available' | 'in_progress' | 'completed'
export type ModuleStatus = 'locked' | 'available' | 'in_progress' | 'completed'

export interface Course {
  id: string
  userId: string
  title: string
  topic: string
  description: string
  difficulty: CourseDifficulty
  estimatedHours: number
  prerequisites: string[]
  learningObjectives: string[]
  status: CourseStatus
  progress: number
  settings: CourseSettings
  researchReport: string | null
  thinkingTrace: string | null
  generatedAt: string
  createdAt: string
  updatedAt: string
}

export interface CourseModule {
  id: string
  courseId: string
  title: string
  description: string
  order: number
  status: ModuleStatus
  progress: number
  lessons: Lesson[]
}

export interface Lesson {
  id: string
  moduleId: string
  title: string
  type: LessonType
  duration: string
  order: number
  status: LessonStatus
  content: LessonContent
  completedAt?: string
}

export interface LessonContent {
  markdown: string
  practiceProblems?: PracticeProblem[]
  slides?: SlideData[]
  videoUrl?: string
  videoId?: string
  videoThumbnail?: string
  videoChannel?: string
  keyPoints?: string[]
  timestamps?: { time: string; label: string }[]
  transcript?: string
  keyTerms?: { term: string; definition: string }[]
}

export interface SlideData {
  id: number
  title: string
  subtitle?: string
  bullets?: string[]
  notes?: string
  visual?: string
}

export interface PracticeProblem {
  id: string
  type: 'multiple-choice' | 'matching' | 'short-answer'
  question: string
  options?: string[]
  correctIndex?: number
  pairs?: { left: string; right: string }[]
  sampleAnswer?: string
  explanation: string
  rubric?: string[]
}

// --- Course Settings ---

export interface CourseSettings {
  includeVideos: boolean
  includeSlides: boolean
  includePractice: boolean
  includeQuizzes: boolean
  estimatedWeeks: number
  hoursPerWeek: number
  focusAreas: string[]
  maxSlidesPerLesson: number
  quickTest?: boolean
}

// --- Generation Pipeline Types ---

export type GenerationStageType =
  | 'research'
  | 'indexing'
  | 'analysis'
  | 'planning'
  | 'approval'
  | 'content'
  | 'multimedia'
  | 'saving'
  | 'assembly'
  | 'review'
  | 'complete'

export interface CourseOutline {
  title: string
  topic: string
  description: string
  difficulty: CourseDifficulty
  estimatedHours: number
  prerequisites: string[]
  learningObjectives: string[]
  modules: CourseOutlineModule[]
}

export interface CourseOutlineModule {
  id: string
  title: string
  description: string
  order: number
  lessons: CourseOutlineLesson[]
}

export interface CourseOutlineLesson {
  id: string
  title: string
  type: LessonType
  estimatedMinutes: number
  keyTopics: string[]
  learningObjectives: string[]
  order: number
}

// --- Generation Progress & Events ---

export interface CourseGenerationProgress {
  courseId: string
  threadId: string
  stage: GenerationStageType
  stageProgress: number
  overallProgress: number
  thinkingOutput: string
  currentNode: string
  error?: string
}

export interface ResearchProgress {
  status: 'starting' | 'researching' | 'writing' | 'complete' | 'failed'
  progress: number
  thinking: string
  sources: ResearchSource[]
  partialReport: string | null
}

export interface ResearchSource {
  url: string
  title: string
  status: 'queued' | 'reading' | 'done' | 'failed'
}

// --- API Request/Response Types ---

export interface StartCourseGenerationRequest {
  topic: string
  difficulty?: CourseDifficulty
  settings?: Partial<CourseSettings>
  focusAreas?: string[]
}

export interface CourseGenerationResponse {
  status: 'running' | 'awaiting_approval' | 'complete' | 'error' | 'cancelled'
  courseId: string
  threadId: string
  outline: CourseOutline | null
  course: Course | null
  stage: GenerationStageType
  progress: number
  thinkingOutput: string
  error?: string
}

export interface ApproveOutlineRequest {
  threadId: string
  courseId: string
  modifiedOutline?: CourseOutline
}

export interface RejectOutlineRequest {
  threadId: string
  courseId: string
  feedback: string
}

// --- Course Stream Events (SSE) ---

export type CourseStreamEvent =
  | { event: 'progress'; data: CourseGenerationProgress }
  | { event: 'research_progress'; data: ResearchProgress }
  | { event: 'outline_ready'; data: { outline: CourseOutline; thinking: string } }
  | {
      event: 'content_progress'
      data: { moduleIndex: number; lessonIndex: number; totalModules: number; totalLessons: number }
    }
  | { event: 'complete'; data: { courseId: string } }
  | { event: 'error'; data: { message: string; stage: GenerationStageType } }

// --- Quiz & Exam Types ---

export interface QuizAttempt {
  id: string
  lessonId: string
  courseId: string
  userId: string
  answers: Record<string, number | string>
  score: number
  passed: boolean
  submittedAt: string
}

export interface CourseProgress {
  courseId: string
  userId: string
  completedLessons: string[]
  quizScores: Record<string, number>
  totalProgress: number
  lastAccessedAt: string
  startedAt: string
}

// --- YouTube Video Types ---

export interface YouTubeVideo {
  videoId: string
  title: string
  channelTitle: string
  thumbnailUrl: string
  description: string
}

export interface LessonVideoMatch {
  lessonId: string
  videos: YouTubeVideo[]
  selectedVideoId: string | null
}

// --- Agent Step Tracking (for DeepAgentsJS orchestrator) ---

export interface CourseAgentStep {
  id: string
  name: string
  description: string
  status: 'pending' | 'running' | 'completed' | 'error'
  startedAt?: string
  completedAt?: string
  thinkingText?: string
  error?: string
}

export interface CourseTodoItem {
  id: string
  text: string
  status: 'pending' | 'in_progress' | 'completed'
  agentName?: string
}

export type CourseSubAgentName =
  | 'researcher'
  | 'outline-planner'
  | 'lesson-writer'
  | 'quiz-writer'
  | 'slides-writer'
  | 'video-matcher'
  | 'assembler'

// Extended stream events for DeepAgentsJS orchestrator
export type CourseOrchestratorStreamEvent =
  | { event: 'thinking'; data: string }
  | { event: 'agent-step'; data: CourseAgentStep }
  | { event: 'todo-update'; data: { todos: CourseTodoItem[] } }
  | {
      event: 'subagent-start'
      data: { id: string; name: CourseSubAgentName; status: 'running'; startedAt: string }
    }
  | {
      event: 'subagent-result'
      data: {
        id: string
        name: CourseSubAgentName
        status: 'completed' | 'error'
        completedAt: string
        output?: string
      }
    }
  | { event: 'text'; data: string }
  | { event: 'tool_call'; data: string }
  | { event: 'tool_result'; data: string }
  | {
      event: 'interrupt'
      data: { id: string; type: 'outline_approval'; outline: CourseOutline; thinking: string }
    }
  | { event: 'progress'; data: CourseGenerationProgress }
  | { event: 'research_progress'; data: ResearchProgress }
  | {
      event: 'content_progress'
      data: { moduleIndex: number; lessonIndex: number; totalModules: number; totalLessons: number }
    }
  | { event: 'complete'; data: { courseId: string } }
  | { event: 'error'; data: { message: string; stage: GenerationStageType } }
  | { event: 'done'; data?: string }
