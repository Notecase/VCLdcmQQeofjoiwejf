/**
 * Secretary Types — AI-powered daily planner, roadmap manager, and learning assistant.
 *
 * These types are shared between frontend and backend.
 */

// =============================================================================
// Calendar Event Types
// =============================================================================

/**
 * A structured calendar event from an external source (Google Calendar, etc.)
 */
export interface CalendarEvent {
  id: string
  title: string
  startTime: string // ISO datetime or YYYY-MM-DD for all-day
  endTime: string
  isAllDay: boolean
  date: string // YYYY-MM-DD for grouping
  location?: string
  description?: string
  source: 'gcal'
}

/**
 * Cached calendar events stored in secretary_memory as JSON
 */
export interface CalendarEventsCache {
  syncedAt: string
  rangeStart: string // YYYY-MM-DD
  rangeEnd: string // YYYY-MM-DD
  events: CalendarEvent[]
}

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
  projectId?: string // UUID of linked editor project/folder
}

// =============================================================================
// Daily Plan Types
// =============================================================================

export type TaskType = 'learn' | 'practice' | 'review' | 'project' | 'break'
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'skipped'
export type TaskSource = 'manual' | 'ai' | 'gcal' | 'notion' | 'notes' | 'obsidian'

/**
 * A single scheduled task in a daily plan
 */
export type TaskArtifactKind = 'note' | 'research' | 'course' | 'mission'
export type TaskArtifactStatus = 'pending' | 'ready' | 'blocked'

export interface TaskArtifactLink {
  id: string
  kind: TaskArtifactKind
  status: TaskArtifactStatus
  label: string
  targetId?: string
  href?: string
  missionId?: string
  createdByAgent: string
  createdAt: string
}

export interface ScheduledTask {
  id: string
  title: string
  type: TaskType
  status: TaskStatus
  scheduledTime: string // "09:00" (HH:MM)
  durationMinutes: number // 45, 60, 15, etc.
  planId?: string // Links to LearningRoadmap.id
  noteId?: string // Links to an Inkdown note for "Study Now" navigation
  artifacts?: TaskArtifactLink[]
  source?: TaskSource // Where this task originated (ai, gcal, notion, notes, obsidian, manual)
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
  event:
    | 'text'
    | 'tool_call'
    | 'tool_result'
    | 'roadmap_preview'
    | 'daily_plan'
    | 'thinking'
    | 'memory_updated'
    | 'done'
    | 'error'
    | 'thread-id'
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

export type SecretaryAttentionStatus = 'pending' | 'ready' | 'blocked' | 'info'

export interface SecretaryAttentionItem {
  id: string
  kind: 'artifact' | 'approval' | 'heartbeat' | 'workspace' | 'system'
  title: string
  summary: string
  status: SecretaryAttentionStatus
  href?: string
  missionId?: string
  targetId?: string
  label?: string
  createdAt: string
}

export interface SecretaryHeartbeatState {
  enabled: boolean
  config: {
    timezone?: string
    morning_hour?: number
    evening_hour?: number
  }
  last_heartbeat_at: string | null
  last_morning_at: string | null
  last_evening_at: string | null
  last_weekly_at: string | null
  next_action?: string | null
  next_action_at?: string | null
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

// =============================================================================
// Plan Workspace Types
// =============================================================================

/** Frequency for plan schedule automations */
export type PlanScheduleFrequency = 'daily' | 'weekly' | 'custom'

/** Workflow types available for plan schedule automations */
export type PlanScheduleWorkflow =
  | 'make_note_from_task'
  | 'research_topic_from_task'
  | 'make_course_from_plan'

/** A recurring automation attached to a plan */
export interface PlanScheduleItem {
  id: string
  planId: string
  title: string
  instructions?: string
  workflow: PlanScheduleWorkflow
  frequency: PlanScheduleFrequency
  time: string // "HH:MM"
  days?: string[] // For 'weekly': ['Mon', 'Fri'], for 'custom': specific days
  enabled: boolean
  lastRunAt?: string
  nextRunAt?: string
  runCount: number
  lastRunStatus?: 'success' | 'error'
  lastRunError?: string
  createdAt: string
}

/** Aggregated workspace state for a single plan */
export interface PlanWorkspaceState {
  plan: LearningRoadmap
  instructions: string
  roadmapContent: string
  schedules: PlanScheduleItem[]
  artifacts: TaskArtifactLink[]
  projectId?: string
  projectNotes?: Array<{ id: string; title: string; updatedAt: string }>
}

// =============================================================================
// Inbox Proposal Types (Messaging Capture)
// =============================================================================

/** Supported messaging channels */
export type ChannelType = 'telegram' | 'discord' | 'whatsapp'

/** Category for inbox items */
export type ProposalCategory = 'task' | 'vocabulary' | 'calendar' | 'note' | 'reading' | 'thought'

/** Status of an inbox proposal */
export type ProposalStatus =
  | 'pending'
  | 'executing'
  | 'awaiting_clarification'
  | 'approved'
  | 'rejected'
  | 'applied'
  | 'failed'

/** Source of an inbox capture */
export type ProposalSource = 'telegram' | 'discord' | 'whatsapp' | 'shortcut' | 'web' | 'manual'

/** Action types the smart classifier can propose */
export type ProposalActionType =
  | 'create_note'
  | 'add_task'
  | 'add_calendar_event'
  | 'add_vocabulary'
  | 'add_reading'
  | 'add_thought'
  | 'needs_clarification'

/** Typed payloads per action type */
export interface CreateNotePayload {
  title: string
  content: string
  projectId?: string
}
export interface AddTaskPayload {
  taskLine: string
  targetFile: 'Today.md' | 'Tomorrow.md'
  dueDate?: string
}
export interface AddCalendarEventPayload {
  eventTitle: string
  dateTime?: string
  description?: string
}
export interface AddVocabularyPayload {
  word: string
  definition: string
  context?: string
}
export interface AddReadingPayload {
  title: string
  url?: string
  description?: string
}
export interface AddThoughtPayload {
  text: string
}

export type ProposalPayload =
  | CreateNotePayload
  | AddTaskPayload
  | AddCalendarEventPayload
  | AddVocabularyPayload
  | AddReadingPayload
  | AddThoughtPayload

/** A linked messaging channel */
export interface ChannelLink {
  id: string
  channel: ChannelType
  displayName: string | null
  status: 'pending' | 'active' | 'revoked'
  createdAt: string
}

/** An inbox proposal from any capture source */
export interface InboxProposal {
  id: string
  userId: string
  source: ProposalSource
  rawText: string
  category: ProposalCategory | null
  targetFile: string | null
  proposedContent: string | null
  confidence: number
  status: ProposalStatus
  batchId: string | null
  metadata: Record<string, unknown>
  actionType: ProposalActionType | null
  payload: ProposalPayload | null
  previewText: string | null
  executionResult: ExecutionResultData | null
  createdAt: string
  updatedAt: string
}

/** AI categorization result for a single item (batch categorizer) */
export interface CategorizationResult {
  id: string
  category: ProposalCategory
  targetFile: string
  proposedContent: string
  confidence: number
  metadata: Record<string, unknown>
}

/** Smart per-message classification result */
export interface SmartClassificationResult {
  actionType: ProposalActionType
  category: ProposalCategory
  targetFile: string
  payload: Record<string, unknown>
  proposedContent: string
  previewText: string
  confidence: number
  botReplyText: string
  clarificationQuestion?: string
}

/** Result data stored after autonomous execution */
export interface ExecutionResultData {
  noteId?: string
  updatedFile?: string
  error?: string
  durationMs?: number
}
