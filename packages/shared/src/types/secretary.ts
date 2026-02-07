/**
 * Secretary Types — AI-powered daily planner, roadmap manager, and learning assistant.
 *
 * These types are shared between frontend and backend.
 */

// =============================================================================
// Memory File Types
// =============================================================================

/**
 * A markdown memory file stored in Supabase (Plan.md, AI.md, Today.md, etc.)
 */
export interface MemoryFile {
  id: string
  userId: string
  filename: string // 'Plan.md' | 'AI.md' | 'Today.md' | 'Tomorrow.md' | 'Plans/*.md'
  content: string // Raw markdown content
  updatedAt: string // ISO timestamp
  createdAt: string
}

// =============================================================================
// Roadmap Types
// =============================================================================

/**
 * A learning roadmap with progress tracking
 */
export interface LearningRoadmap {
  id: string // Short ID like 'OPT', 'AWS', 'AI'
  name: string // "11-Day Optics Roadmap"
  status: 'active' | 'completed' | 'paused' | 'archived'
  dateRange: {
    start: string // YYYY-MM-DD
    end: string
  }
  schedule: {
    hoursPerDay: number // e.g. 2
    studyDays: string[] // ['Mon', 'Wed', 'Fri'] or ['Daily']
    dates?: string[] // Computed exact dates
  }
  progress: {
    currentWeek: number
    totalWeeks: number
    currentDay: number
    totalDays: number
    percentComplete: number
  }
  currentTopic: string // "Day 4: Lens combinations + magnification"
  archiveFilename: string // "Plans/optics-roadmap.md"
}

// =============================================================================
// Daily Plan Types
// =============================================================================

export type TaskType = 'learn' | 'practice' | 'review' | 'project' | 'break'
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'skipped'

/**
 * A single scheduled task in a daily plan
 */
export interface ScheduledTask {
  id: string
  title: string
  type: TaskType
  status: TaskStatus
  scheduledTime: string // "09:00" (HH:MM)
  durationMinutes: number // 45, 60, 15, etc.
  planId?: string // Links to LearningRoadmap.id
  noteId?: string // Links to an Inkdown note for "Study Now" navigation
  aiGenerated: boolean
  aiReason?: string // Why AI scheduled this
}

/**
 * A full daily plan with time-blocked tasks
 */
export interface DailyPlan {
  id: string
  date: string // YYYY-MM-DD
  tasks: ScheduledTask[]
  createdAt: string
  updatedAt: string
  isApproved: boolean // User confirmed the plan
  aiGeneratedAt?: string
  userModified: boolean // User edited after AI generation
  totalMinutes: number
  completedMinutes: number
}

// =============================================================================
// User Preferences (parsed from AI.md)
// =============================================================================

/**
 * User's study preferences, extracted from AI.md
 */
export interface StudyPreferences {
  focusTime: {
    bestStart: string // "09:00"
    bestEnd: string // "12:00"
  }
  breakFrequency: number // minutes between breaks (e.g. 45)
  breakDuration: number // minutes per break (e.g. 15)
  weekdayHours: number // study hours on weekdays
  weekendHours: number // study hours on weekends
  availability: {
    weekday: { start: string; end: string }
    weekend: { start: string; end: string }
  }
  timezone?: string // IANA timezone identifier, e.g. "America/New_York"
}

// =============================================================================
// Reflection Types
// =============================================================================

export type ReflectionMood = 'great' | 'good' | 'okay' | 'struggling' | 'overwhelmed'

/**
 * End-of-day reflection entry
 */
export interface DailyReflection {
  date: string
  mood: ReflectionMood
  content: string
  submittedAt: string
}

// =============================================================================
// Secretary Intent Types
// =============================================================================

/**
 * Intent classification for secretary requests
 */
export type SecretaryIntent =
  | 'create_roadmap'
  | 'save_roadmap'
  | 'modify_roadmap'
  | 'daily_plan'
  | 'preferences'
  | 'calendar'
  | 'query'
  | 'general'

// =============================================================================
// API Request/Response Types
// =============================================================================

/**
 * Chat request to the secretary agent
 */
export interface SecretaryChatRequest {
  message: string
  threadId?: string // For conversation continuity
}

/**
 * Non-streaming chat response from the secretary agent
 */
export interface SecretaryChatResponse {
  type: 'text' | 'roadmap_preview' | 'daily_plan' | 'memory_update' | 'error'
  content: string
  metadata?: {
    roadmap?: LearningRoadmap
    dailyPlan?: DailyPlan
    updatedFiles?: string[]
  }
}

/**
 * Server-Sent Event emitted during streaming secretary chat
 */
export interface SecretaryStreamEvent {
  event: 'text' | 'tool_call' | 'tool_result' | 'roadmap_preview' | 'daily_plan' | 'thinking' | 'memory_updated' | 'done' | 'error' | 'thread-id'
  data: string
  /**
   * Monotonic sequence number for stream de-duplication.
   * Optional for backward compatibility with older emitters.
   */
  seq?: number
  /**
   * Stable ID for the message/tool event source.
   */
  messageId?: string
  /**
   * LangGraph/deepagents node source ("agent", "tools", "planner", etc).
   */
  sourceNode?: string
  /**
   * Whether `data` should be appended as delta text.
   */
  isDelta?: boolean
  metadata?: Record<string, unknown>
}

// =============================================================================
// Markdown Parse Contracts
// =============================================================================

export interface ParserWarning {
  code: string
  message: string
  file: string
  line?: number
  severity: 'info' | 'warning' | 'error'
}

export interface RoadmapCandidate {
  filename: string
  id: string
  name: string
}

export interface ActivationSuggestion {
  action: 'none' | 'auto_activated' | 'needs_selection'
  reason: string
  candidates: RoadmapCandidate[]
  selectedId?: string
}

export interface PlanParseResult {
  plans: LearningRoadmap[]
  activePlans: LearningRoadmap[]
  thisWeekSection: string
  warnings: ParserWarning[]
}

export interface DailyPlanParseResult {
  plan: DailyPlan | null
  warnings: ParserWarning[]
}

// =============================================================================
// Dashboard State Types
// =============================================================================

/**
 * Full dashboard state for the secretary view
 */
export interface SecretaryDashboardState {
  activePlans: LearningRoadmap[]
  todayPlan: DailyPlan | null
  tomorrowPlan: DailyPlan | null
  todayReflection: DailyReflection | null
  memoryFiles: MemoryFile[]
  thisWeek: WeekSchedule
  isGeneratingPlan: boolean
  isGeneratingTomorrow: boolean
}

/**
 * A week's schedule extracted from Plan.md
 */
export interface WeekSchedule {
  weekStart: string // YYYY-MM-DD (Monday)
  weekEnd: string // YYYY-MM-DD (Sunday)
  days: WeekDay[]
}

/**
 * A single day in the week schedule
 */
export interface WeekDay {
  date: string // YYYY-MM-DD
  dayName: string // 'Mon', 'Tue', etc.
  isToday: boolean
  planEntries: {
    planId: string // Links to LearningRoadmap.id
    topic: string
  }[]
}

// =============================================================================
// Day Transition Types
// =============================================================================

/**
 * Result of a day transition check
 */
export interface DayTransitionResult {
  transitioned: boolean
  archivedDate?: string
  promotedTomorrow?: boolean
}

/**
 * A pending roadmap preview waiting for user confirmation
 */
export interface PendingRoadmap {
  id: string
  name: string
  content: string
  durationDays: number
  hoursPerDay: number
  createdAt: string
}

/**
 * An archived daily plan entry
 */
export interface HistoryEntry {
  filename: string
  date: string
  updatedAt: string
}

// =============================================================================
// Thread / Chat Persistence Types (DB layer)
// =============================================================================

/**
 * A secretary chat thread (maps to secretary_threads table)
 */
export interface SecretaryThread {
  id: string
  threadId: string
  title: string | null
  createdAt: string
  updatedAt: string
}

/**
 * A chat message row from the database (maps to secretary_chat_messages table)
 */
export interface SecretaryChatMessageRow {
  id: string
  threadId: string
  role: 'user' | 'assistant'
  content: string
  toolCalls: Record<string, unknown>[] | null
  thinkingSteps: string[] | null
  model: string | null
  createdAt: string
}
