/**
 * Secretary Store
 *
 * Pinia store for the AI Secretary feature — daily planner, roadmap manager.
 * Manages memory files, daily plans, active roadmaps, and chat state.
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authFetch, authFetchSSE } from '@/utils/api'
import { parseSSEStream } from '@/utils/sse-parser'
import { useNotificationsStore } from '@/stores/notifications'
import { partitionMemoryFiles } from './secretary.file-grouping'
import { getMissionState, startMission, writeLastMissionId } from '@/services/missions.service'
import {
  parseDailyPlanMarkdown,
  parsePlanMarkdown,
  renderDailyPlanMarkdown,
  getTodayDate,
  getTomorrowDate,
} from '@inkdown/shared/secretary'
import type {
  MemoryFile,
  LearningRoadmap,
  DailyPlan,
  ScheduledTask,
  SecretaryStreamEvent,
  SecretaryThread,
  ReflectionMood,
  ParserWarning,
  SecretaryAttentionItem,
  SecretaryHeartbeatState,
  TaskArtifactLink,
  WorkflowKey,
  CalendarEvent,
  PlanWorkspaceState,
  PlanScheduleItem,
  PlanScheduleWorkflow,
} from '@inkdown/shared/types'
import { isDemoMode } from '@/utils/demo'
import {
  DEMO_MEMORY_FILES,
  DEMO_ACTIVE_PLANS,
  DEMO_TODAY_PLAN,
  DEMO_TOMORROW_PLAN,
} from '@/data/demo-secretary'
import {
  buildPendingWorkflowArtifact,
  buildPlanWorkflowGoal,
  buildTaskWorkflowGoal,
  resolveWorkflowArtifactFromMission,
} from './secretary.workflow'

const API_URL = import.meta.env.VITE_API_URL || ''
const SECRETARY_API = `${API_URL}/api/secretary`
const HEARTBEAT_API = `${API_URL}/api/settings/heartbeat`
const INTEGRATIONS_API = `${API_URL}/api/integrations`
const SECRETARY_HARDENING_ENABLED = !['0', 'false', 'off', 'no'].includes(
  String(import.meta.env.VITE_SECRETARY_PHASE5_HARDENING ?? 'true')
    .trim()
    .toLowerCase()
)

/** Detect browser timezone (e.g. "America/New_York") */
const BROWSER_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone

/** Timezone header to include in secretary API calls */
const TIMEZONE_HEADERS = { 'X-Timezone': BROWSER_TIMEZONE }

// ============================================================================
// Chat Types
// ============================================================================

export interface SecretaryToolCall {
  id: string
  toolName: string
  arguments: Record<string, unknown>
  result?: string
  status: 'pending' | 'running' | 'complete' | 'error'
}

export interface SecretaryChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: Date
  toolCalls?: SecretaryToolCall[]
  thinkingSteps?: string[]
  model?: string
  /** Internal flag: true while this message is still being streamed */
  _streaming?: boolean
}

// ============================================================================
// Store
// ============================================================================

export const useSecretaryStore = defineStore('secretary', () => {
  const notifications = useNotificationsStore()
  const workflowMonitors = new Map<string, ReturnType<typeof setTimeout>>()

  // ---- State ----
  const memoryFiles = ref<MemoryFile[]>([])
  const activePlans = ref<LearningRoadmap[]>([])
  const todayPlan = ref<DailyPlan | null>(null)
  const tomorrowPlan = ref<DailyPlan | null>(null)
  const isLoading = ref(false)
  const isGeneratingTomorrow = ref(false)
  const isInitialized = ref(false)
  const error = ref<string | null>(null)
  const parserWarnings = ref<ParserWarning[]>([])

  // Calendar events state
  const calendarEvents = ref<CalendarEvent[]>([])
  const calendarSyncedAt = ref<string | null>(null)
  const isLoadingCalendarEvents = ref(false)

  // Chat state
  const chatMessages = ref<SecretaryChatMessage[]>([])
  const isChatStreaming = ref(false)
  const streamingContent = ref('')
  const streamingToolCalls = ref<SecretaryToolCall[]>([])
  const streamingThinkingSteps = ref<string[]>([])
  const seenStreamingToolCallSignatures = ref(new Set<string>())

  // UI state
  const selectedFilename = ref<string | null>(null)
  const heartbeatState = ref<SecretaryHeartbeatState | null>(null)
  const planArtifacts = ref<Record<string, TaskArtifactLink[]>>({})

  // Plan workspace state
  const currentWorkspace = ref<PlanWorkspaceState | null>(null)
  const isLoadingWorkspace = ref(false)

  // Plan-project links (planId -> projectId, and reverse)
  const planProjectLinks = ref<Map<string, string>>(new Map())
  const projectPlanLinks = ref<Map<string, string>>(new Map())

  // Thread state
  const activeThreadId = ref<string | null>(null)
  const threads = ref<SecretaryThread[]>([])
  const lastReceivedThreadId = ref<string | null>(null)
  const lastStreamSeq = ref<number>(0)

  // Live assistant message being streamed — updated in-place to avoid DOM swap
  let liveAssistantMsg: SecretaryChatMessage | null = null

  let memoryRefreshTimer: ReturnType<typeof setTimeout> | null = null
  const pendingMemoryRefresh = new Set<string>()

  // ---- Computed ----
  const groupedMemoryFiles = computed(() => partitionMemoryFiles(memoryFiles.value))
  const rootMemoryFiles = computed(() => groupedMemoryFiles.value.rootMemoryFiles)
  const historyEntries = computed(() => groupedMemoryFiles.value.historyEntries)
  const planArchiveEntries = computed(() => groupedMemoryFiles.value.planArchiveEntries)

  const todayProgress = computed(() => {
    if (!todayPlan.value) return { completed: 0, total: 0, percent: 0 }
    const tasks = todayPlan.value.tasks
    const completed = tasks.filter((t) => t.status === 'completed').length
    return {
      completed,
      total: tasks.length,
      percent: tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 0,
    }
  })

  const showTomorrowSection = computed(() => {
    const hour = new Date().getHours()
    return hour >= 21 || hour < 4
  })

  const showReflectionSection = computed(() => {
    const hour = new Date().getHours()
    return hour >= 20 || hour < 4
  })

  const isTomorrowApproved = computed(() => {
    const f = memoryFiles.value.find((f) => f.filename === 'Tomorrow.md')
    return !!f && f.content.includes('**Status:** Approved')
  })

  const selectedFile = computed(() => {
    if (!selectedFilename.value) return null
    return memoryFiles.value.find((f) => f.filename === selectedFilename.value) || null
  })

  const primaryPlan = computed(() => activePlans.value[0] || null)

  const currentTopic = computed(
    () =>
      primaryPlan.value?.currentTopic ||
      todayPlan.value?.tasks.find((task) => task.status !== 'completed')?.title ||
      ''
  )

  const nextTask = computed(
    () =>
      todayPlan.value?.tasks.find(
        (task) => task.status !== 'completed' && task.status !== 'skipped'
      ) || null
  )

  const upcomingTasks = computed(() => {
    if (!todayPlan.value) return []
    return todayPlan.value.tasks.filter(
      (task) => task.status !== 'completed' && task.status !== 'skipped'
    )
  })

  const calendarEventsByDate = computed(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const event of calendarEvents.value) {
      const existing = map.get(event.date)
      if (existing) {
        existing.push(event)
      } else {
        map.set(event.date, [event])
      }
    }
    return map
  })

  const busyDates = computed(() => {
    const dates = new Set<string>()
    if (todayPlan.value) dates.add(todayPlan.value.date)
    if (tomorrowPlan.value) dates.add(tomorrowPlan.value.date)
    for (const date of calendarEventsByDate.value.keys()) {
      dates.add(date)
    }
    return dates
  })

  const attentionItems = computed<SecretaryAttentionItem[]>(() => {
    const items: SecretaryAttentionItem[] = []

    if (todayPlan.value) {
      for (const task of todayPlan.value.tasks) {
        for (const artifact of task.artifacts || []) {
          items.push({
            id: `${task.id}:${artifact.id}`,
            kind: 'artifact',
            title: artifact.label,
            summary: `${task.title}${task.planId ? ` · ${task.planId}` : ''}`,
            status:
              artifact.status === 'blocked'
                ? 'blocked'
                : artifact.status === 'ready'
                  ? 'ready'
                  : 'pending',
            href: artifact.href,
            missionId: artifact.missionId,
            targetId: artifact.targetId,
            label: task.title,
            createdAt: artifact.createdAt,
          })
        }
      }
    }

    for (const [planId, artifacts] of Object.entries(planArtifacts.value)) {
      const plan = activePlans.value.find((item) => item.id === planId)
      for (const artifact of artifacts) {
        items.push({
          id: `${planId}:${artifact.id}`,
          kind: 'artifact',
          title: artifact.label,
          summary: plan
            ? `${plan.name}${plan.currentTopic ? ` · ${plan.currentTopic}` : ''}`
            : planId,
          status:
            artifact.status === 'blocked'
              ? 'blocked'
              : artifact.status === 'ready'
                ? 'ready'
                : 'pending',
          href: artifact.href,
          missionId: artifact.missionId,
          targetId: artifact.targetId,
          label: plan?.name || planId,
          createdAt: artifact.createdAt,
        })
      }
    }

    return items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 8)
  })

  // ---- Actions ----

  async function initialize() {
    if (isInitialized.value) return

    // Demo mode: load static fixtures
    if (isDemoMode()) {
      memoryFiles.value = DEMO_MEMORY_FILES
      activePlans.value = DEMO_ACTIVE_PLANS
      todayPlan.value = DEMO_TODAY_PLAN
      tomorrowPlan.value = DEMO_TOMORROW_PLAN
      isInitialized.value = true
      return
    }

    isLoading.value = true
    error.value = null

    try {
      // Day transition is handled by App.vue on every page load (fire-and-forget).
      // No need to duplicate it here.

      const res = await authFetch(`${SECRETARY_API}/memory`)
      if (!res.ok) {
        throw new Error(`Memory fetch failed: ${res.status}`)
      }
      const data = await res.json()

      if (data.files && data.files.length > 0) {
        memoryFiles.value = data.files
      } else {
        const initRes = await authFetch(`${SECRETARY_API}/initialize`, { method: 'POST' })
        if (initRes.ok) {
          const initData = await initRes.json()
          memoryFiles.value = initData.files || []
        }
      }

      parsePlanData()
      await loadHeartbeatState()

      await loadThreads()
      // Auto-load most recent thread
      if (threads.value.length > 0) {
        await loadThread(threads.value[0].threadId)
      }

      isInitialized.value = true
      startTaskNotifications()
      // Load plan-project links in the background (non-blocking)
      loadPlanProjectLinks()

      // Load calendar events (non-blocking)
      loadCalendarEvents().catch(() => {})
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to initialize secretary'
      error.value = msg
      notifications.error(msg)
    } finally {
      isLoading.value = false
    }
  }

  let refreshMemoryPromise: Promise<void> | null = null

  async function refreshMemoryFiles() {
    // Deduplicate: if a refresh is already in-flight, reuse it
    if (refreshMemoryPromise) return refreshMemoryPromise
    refreshMemoryPromise = refreshMemoryFilesImpl()
    try {
      await refreshMemoryPromise
    } finally {
      refreshMemoryPromise = null
    }
  }

  async function refreshMemoryFilesImpl() {
    try {
      const res = await authFetch(`${SECRETARY_API}/memory`)
      if (!res.ok) {
        // Don't overwrite existing data on error (e.g. 429 rate limit)
        console.warn(`[Secretary] refreshMemoryFiles failed: ${res.status}`)
        return
      }
      const data = await res.json()
      memoryFiles.value = data.files || []
      parsePlanData()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to refresh memory files'
      console.warn(`[Secretary] ${msg}`)
    }
  }

  async function refreshMemoryFilesByName(filenames: string[]) {
    try {
      for (const filename of filenames) {
        const res = await authFetch(`${SECRETARY_API}/memory/${encodeURI(filename)}`)
        if (res.status === 404) {
          memoryFiles.value = memoryFiles.value.filter((f) => f.filename !== filename)
          continue
        }
        if (!res.ok) continue
        const data = await res.json()
        if (!data.file) continue
        const idx = memoryFiles.value.findIndex((f) => f.filename === filename)
        if (idx >= 0) {
          memoryFiles.value[idx] = data.file
        } else {
          memoryFiles.value.push(data.file)
          memoryFiles.value.sort((a, b) => a.filename.localeCompare(b.filename))
        }
      }
      parsePlanData()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to refresh memory files'
      notifications.error(msg)
    }
  }

  function scheduleMemoryRefresh(updatedFiles: string[] = []) {
    for (const file of updatedFiles) {
      if (typeof file === 'string' && file.trim()) pendingMemoryRefresh.add(file.trim())
    }
    if (memoryRefreshTimer) return

    memoryRefreshTimer = setTimeout(async () => {
      memoryRefreshTimer = null
      const files = [...pendingMemoryRefresh]
      pendingMemoryRefresh.clear()

      if (files.length > 0) {
        await refreshMemoryFilesByName(files)
      } else {
        await refreshMemoryFiles()
      }
    }, 800)
  }

  async function updateMemoryFile(
    filename: string,
    content: string,
    options?: { silent?: boolean }
  ) {
    if (isDemoMode()) {
      const idx = memoryFiles.value.findIndex((f) => f.filename === filename)
      if (idx >= 0) {
        memoryFiles.value[idx] = {
          ...memoryFiles.value[idx],
          content,
          updatedAt: new Date().toISOString(),
        }
      }
      parsePlanData()
      if (!options?.silent) notifications.success('File saved successfully')
      return
    }
    try {
      const res = await authFetch(`${SECRETARY_API}/memory/${filename}`, {
        method: 'PUT',
        body: JSON.stringify({ content }),
      })
      const data = await res.json()

      const idx = memoryFiles.value.findIndex((f) => f.filename === filename)
      if (idx >= 0 && data.file) {
        memoryFiles.value[idx] = data.file
      }

      parsePlanData()
      if (!options?.silent) notifications.success('File saved successfully')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update memory file'
      notifications.error(msg)
    }
  }

  async function persistTodayPlan(options?: { silent?: boolean }) {
    if (!todayPlan.value) return
    const markdown = dailyPlanToMarkdown(todayPlan.value)
    await updateMemoryFile('Today.md', markdown, options)
  }

  function getPlanArtifacts(planId: string): TaskArtifactLink[] {
    return planArtifacts.value[planId] || []
  }

  function openMemoryFile(filename: string) {
    selectedFilename.value = filename
  }

  function upsertTaskArtifact(taskId: string, artifact: TaskArtifactLink) {
    if (!todayPlan.value) return
    const task = todayPlan.value.tasks.find((item) => item.id === taskId)
    if (!task) return

    const artifacts = [...(task.artifacts || [])]
    const idx = artifacts.findIndex(
      (item) =>
        item.id === artifact.id ||
        (item.kind === artifact.kind && item.missionId === artifact.missionId)
    )

    if (idx >= 0) {
      artifacts[idx] = { ...artifacts[idx], ...artifact }
    } else {
      artifacts.push(artifact)
    }

    task.artifacts = artifacts
    if (artifact.kind === 'note' && artifact.targetId) {
      task.noteId = artifact.targetId
    }

    void persistTodayPlan({ silent: true })
  }

  function upsertPlanArtifact(planId: string, artifact: TaskArtifactLink) {
    const current = [...(planArtifacts.value[planId] || [])]
    const idx = current.findIndex(
      (item) =>
        item.id === artifact.id ||
        (item.kind === artifact.kind && item.missionId === artifact.missionId)
    )

    if (idx >= 0) {
      current[idx] = { ...current[idx], ...artifact }
    } else {
      current.push(artifact)
    }

    planArtifacts.value = {
      ...planArtifacts.value,
      [planId]: current,
    }
  }

  async function loadHeartbeatState() {
    if (isDemoMode()) {
      heartbeatState.value = {
        enabled: true,
        config: { timezone: BROWSER_TIMEZONE, morning_hour: 8, evening_hour: 21 },
        last_heartbeat_at: new Date().toISOString(),
        last_morning_at: new Date().toISOString(),
        last_evening_at: null,
        last_weekly_at: null,
        next_action: 'evening',
        next_action_at: null,
      }
      return
    }

    try {
      const res = await authFetch(HEARTBEAT_API)
      if (!res.ok) return
      const data = await res.json()
      heartbeatState.value = data.state || null
    } catch {
      // Keep the cockpit usable if settings are unavailable.
    }
  }

  async function loadCalendarEvents(from?: string, to?: string) {
    if (isDemoMode()) return
    isLoadingCalendarEvents.value = true
    try {
      const params = new URLSearchParams()
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      const qs = params.toString()
      const url = `${INTEGRATIONS_API}/gcal/events${qs ? `?${qs}` : ''}`
      const res = await authFetch(url)
      if (!res.ok) return
      const data = await res.json()
      calendarEvents.value = data.events || []
      calendarSyncedAt.value = data.syncedAt || null
    } catch {
      // Non-critical — calendar events are supplementary
    } finally {
      isLoadingCalendarEvents.value = false
    }
  }

  function clearWorkflowMonitor(missionId: string) {
    const timer = workflowMonitors.get(missionId)
    if (timer) {
      clearTimeout(timer)
      workflowMonitors.delete(missionId)
    }
  }

  function scheduleWorkflowMonitor(input: {
    missionId: string
    workflowKey: WorkflowKey
    targetType: 'task' | 'plan'
    targetId: string
  }) {
    clearWorkflowMonitor(input.missionId)
    const timer = setTimeout(async () => {
      try {
        const state = await getMissionState(input.missionId)
        const artifact = resolveWorkflowArtifactFromMission(state, input.workflowKey)

        if (artifact) {
          if (input.targetType === 'task') {
            upsertTaskArtifact(input.targetId, artifact)
          } else {
            upsertPlanArtifact(input.targetId, artifact)
          }
        }

        if (
          state.mission.status === 'completed' ||
          state.mission.status === 'blocked' ||
          state.mission.status === 'error' ||
          state.mission.status === 'cancelled'
        ) {
          clearWorkflowMonitor(input.missionId)
          return
        }

        scheduleWorkflowMonitor(input)
      } catch {
        clearWorkflowMonitor(input.missionId)
      }
    }, 2_000)

    workflowMonitors.set(input.missionId, timer)
  }

  async function launchTaskWorkflow(task: ScheduledTask, workflowKey: WorkflowKey) {
    if (isDemoMode()) {
      notifications.info('Autonomous mission actions are available in the full version')
      return null
    }

    const plan = task.planId ? activePlans.value.find((item) => item.id === task.planId) : null
    const goal = buildTaskWorkflowGoal(workflowKey, task.title, plan?.name)

    const { missionId } = await startMission({
      goal,
      workflowKey,
      triggerSource: 'user',
      constraints: {
        sourceTaskId: task.id,
        sourceTaskTitle: task.title,
        sourcePlanId: task.planId,
        sourcePlanTitle: plan?.name,
        sourceTopic: plan?.currentTopic,
      },
    })

    writeLastMissionId(missionId)
    upsertTaskArtifact(task.id, buildPendingWorkflowArtifact(workflowKey, missionId))
    scheduleWorkflowMonitor({
      missionId,
      workflowKey,
      targetType: 'task',
      targetId: task.id,
    })

    return missionId
  }

  async function launchPlanWorkflow(plan: LearningRoadmap, workflowKey: WorkflowKey) {
    if (isDemoMode()) {
      notifications.info('Autonomous mission actions are available in the full version')
      return null
    }

    const goal = buildPlanWorkflowGoal(workflowKey, plan.name, plan.currentTopic)
    const { missionId } = await startMission({
      goal,
      workflowKey,
      triggerSource: 'user',
      constraints: {
        sourcePlanId: plan.id,
        sourcePlanTitle: plan.name,
        sourceTopic: plan.currentTopic,
      },
    })

    writeLastMissionId(missionId)
    upsertPlanArtifact(plan.id, buildPendingWorkflowArtifact(workflowKey, missionId))
    scheduleWorkflowMonitor({
      missionId,
      workflowKey,
      targetType: 'plan',
      targetId: plan.id,
    })

    return missionId
  }

  async function updateTaskStatus(taskId: string, status: ScheduledTask['status']) {
    if (!todayPlan.value) return

    const task = todayPlan.value.tasks.find((t) => t.id === taskId)
    if (!task) return

    task.status = status

    todayPlan.value.completedMinutes = todayPlan.value.tasks
      .filter((t) => t.status === 'completed')
      .reduce((sum, t) => sum + t.durationMinutes, 0)

    // Check milestones after completing a task (E2)
    if (status === 'completed') {
      const nonBreakTasks = todayPlan.value.tasks.filter(
        (t) => !t.title.toLowerCase().includes('break')
      )
      const completedNonBreak = nonBreakTasks.filter((t) => t.status === 'completed').length
      const totalNonBreak = nonBreakTasks.length

      if (totalNonBreak > 0 && completedNonBreak === totalNonBreak) {
        notifications.success('All tasks completed! Amazing work today!')
      } else if (totalNonBreak > 0 && completedNonBreak === Math.ceil(totalNonBreak / 2)) {
        notifications.success('Halfway there! Keep it up!')
      }
    }

    await persistTodayPlan()
  }

  async function prepareTomorrow() {
    if (isDemoMode()) {
      notifications.info('AI planning available in full version')
      return
    }
    isGeneratingTomorrow.value = true
    error.value = null

    try {
      const res = await authFetchSSE(`${SECRETARY_API}/prepare-tomorrow`, {
        method: 'POST',
        headers: TIMEZONE_HEADERS,
      })
      if (!res.ok) {
        const errorText = await res.text()
        throw new Error(errorText || `Request failed (${res.status})`)
      }

      await parseSSEStream(res, {
        onEvent: (sseEvent) => {
          const event = sseEvent.data as SecretaryStreamEvent
          if (event.event === 'error') {
            notifications.error(event.data)
          }
        },
        onError: (err) => console.warn('[Secretary] prepareTomorrow SSE parse error:', err),
      })

      await refreshMemoryFiles()
      notifications.success('Tomorrow plan ready!')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to prepare tomorrow plan'
      notifications.error(msg)
    } finally {
      isGeneratingTomorrow.value = false
    }
  }

  async function approveTomorrow() {
    try {
      const res = await authFetch(`${SECRETARY_API}/approve-tomorrow`, {
        method: 'POST',
        headers: TIMEZONE_HEADERS,
      })
      const data = await res.json()
      if (data.error) {
        notifications.error(data.error)
        return
      }
      await refreshMemoryFiles()
      if (tomorrowPlan.value) {
        notifications.success('Tomorrow plan approved — will activate on its date')
      } else {
        notifications.success('Plan approved and moved to Today')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to approve tomorrow plan'
      notifications.error(msg)
    }
  }

  async function loadThreads() {
    if (isDemoMode()) return
    try {
      const res = await authFetch(`${SECRETARY_API}/threads`)
      const data = await res.json()
      threads.value = data.threads || []
    } catch (err) {
      notifications.error(err instanceof Error ? err.message : 'Failed to load threads')
    }
  }

  async function loadThread(threadId: string) {
    const resolvedThreadId =
      threads.value.find((t) => t.threadId === threadId || t.id === threadId)?.threadId || threadId
    activeThreadId.value = resolvedThreadId
    chatMessages.value = []
    try {
      const res = await authFetch(`${SECRETARY_API}/threads/${resolvedThreadId}/messages`)
      const data = await res.json()
      chatMessages.value = (data.messages || []).map((m: any) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: new Date(m.createdAt),
        toolCalls: m.toolCalls || undefined,
        thinkingSteps: m.thinkingSteps || undefined,
        model: m.model || undefined,
      }))
    } catch (err) {
      notifications.error(err instanceof Error ? err.message : 'Failed to load thread')
    }
  }

  function createNewThread() {
    activeThreadId.value = null
    chatMessages.value = []
  }

  async function deleteThread(threadId: string) {
    try {
      const resolvedThreadId =
        threads.value.find((t) => t.threadId === threadId || t.id === threadId)?.threadId ||
        threadId
      await authFetch(`${SECRETARY_API}/threads/${resolvedThreadId}`, { method: 'DELETE' })
      threads.value = threads.value.filter((t) => t.threadId !== resolvedThreadId)
      if (activeThreadId.value === resolvedThreadId) {
        activeThreadId.value = null
        chatMessages.value = []
      }
    } catch (err) {
      notifications.error(err instanceof Error ? err.message : 'Failed to delete thread')
    }
  }

  async function sendChatMessage(message: string) {
    if (isDemoMode()) {
      notifications.info('AI chat available in full version')
      return
    }
    const userMsg: SecretaryChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: message,
      createdAt: new Date(),
    }
    chatMessages.value.push(userMsg)

    // Push an empty assistant message now and update it in-place during streaming.
    // This prevents a DOM swap (unmount streaming card + mount finalized card) that causes visual jumps.
    const assistantMsgId = crypto.randomUUID()
    const assistantMsg: SecretaryChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      createdAt: new Date(),
      _streaming: true,
    }
    chatMessages.value.push(assistantMsg)
    // Get the reactive proxy — Vue wraps objects pushed into ref arrays.
    // Without this, mutations via liveAssistantMsg bypass reactivity.
    liveAssistantMsg = chatMessages.value[chatMessages.value.length - 1]

    isChatStreaming.value = true
    streamingContent.value = ''
    lastStreamEventType = ''
    streamingToolCalls.value = []
    streamingThinkingSteps.value = []
    seenStreamingToolCallSignatures.value.clear()
    lastStreamSeq.value = 0

    lastReceivedThreadId.value = null

    try {
      const MAX_RETRIES = 2
      let lastError: Error | null = null

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (attempt > 0) {
          await new Promise((r) => setTimeout(r, 1000))
          // Reset streaming state for retry
          streamingContent.value = ''
          streamingToolCalls.value = []
          streamingThinkingSteps.value = []
          seenStreamingToolCallSignatures.value.clear()
          lastStreamSeq.value = 0
          // Reset the live message too
          if (liveAssistantMsg) {
            liveAssistantMsg.content = ''
            liveAssistantMsg.toolCalls = undefined
            liveAssistantMsg.thinkingSteps = undefined
          }
        }

        try {
          const res = await authFetchSSE(`${SECRETARY_API}/chat`, {
            method: 'POST',
            headers: TIMEZONE_HEADERS,
            body: JSON.stringify({ message, threadId: activeThreadId.value || undefined }),
          })
          if (!res.ok) {
            const errorText = await res.text()
            throw new Error(errorText || `Request failed (${res.status})`)
          }

          await parseSSEStream(res, {
            onEvent: (sseEvent) => {
              handleStreamEvent(sseEvent.data as SecretaryStreamEvent)
            },
            onError: (err) => console.warn('[Secretary] chat SSE parse error:', err),
          })

          lastError = null
          break // Success
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err))
          if (attempt === MAX_RETRIES) throw lastError
        }
      }

      // Finalize: update the live assistant message in-place (no DOM swap)
      if (liveAssistantMsg) {
        if (streamingContent.value || streamingToolCalls.value.length > 0) {
          liveAssistantMsg.content = streamingContent.value
          liveAssistantMsg.toolCalls =
            streamingToolCalls.value.length > 0 ? [...streamingToolCalls.value] : undefined
          liveAssistantMsg.thinkingSteps =
            streamingThinkingSteps.value.length > 0 ? [...streamingThinkingSteps.value] : undefined
          delete liveAssistantMsg._streaming
        } else {
          // No content generated — remove the empty assistant message
          const idx = chatMessages.value.indexOf(liveAssistantMsg)
          if (idx >= 0) chatMessages.value.splice(idx, 1)
        }
      }

      // Handle thread tracking
      if (lastReceivedThreadId.value && !activeThreadId.value) {
        activeThreadId.value = lastReceivedThreadId.value
      }
      await loadThreads()

      // Auto-title new threads
      if (activeThreadId.value) {
        const thread = threads.value.find((t) => t.threadId === activeThreadId.value)
        if (thread && !thread.title) {
          const title = extractTitle(message)
          try {
            await authFetch(`${SECRETARY_API}/threads/${activeThreadId.value}`, {
              method: 'PATCH',
              body: JSON.stringify({ title }),
            })
            thread.title = title
          } catch {
            // Non-critical
          }
        }
      }

      // Memory refresh is handled by SSE memory_updated events via scheduleMemoryRefresh().
      // No need for an explicit full refresh here.
    } catch (err) {
      notifications.error(err instanceof Error ? err.message : 'Failed to send chat message')
    } finally {
      isChatStreaming.value = false
      streamingContent.value = ''
      streamingToolCalls.value = []
      streamingThinkingSteps.value = []
      liveAssistantMsg = null
    }
  }

  function stableStringify(value: unknown): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value)
    if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`)
    return `{${entries.join(',')}}`
  }

  let lastStreamEventType = ''

  function handleStreamEvent(event: SecretaryStreamEvent) {
    if (SECRETARY_HARDENING_ENABLED && typeof event.seq === 'number' && event.seq > 0) {
      if (event.seq <= lastStreamSeq.value) return
      lastStreamSeq.value = event.seq
    }

    switch (event.event) {
      case 'text': {
        // Insert paragraph break when text resumes after a tool call/result
        const needsSeparator =
          streamingContent.value &&
          (lastStreamEventType === 'tool_call' || lastStreamEventType === 'tool_result')
        const separator = needsSeparator ? '\n\n' : ''

        if (SECRETARY_HARDENING_ENABLED && event.isDelta === false) {
          if (!streamingContent.value) {
            streamingContent.value = event.data
          } else if (!streamingContent.value.endsWith(event.data)) {
            streamingContent.value += separator + event.data
          }
        } else {
          streamingContent.value += separator + event.data
        }
        // Sync to live message for in-place rendering
        if (liveAssistantMsg) liveAssistantMsg.content = streamingContent.value
        lastStreamEventType = event.event
        break
      }

      case 'tool_call': {
        let toolData: Record<string, unknown>
        try {
          toolData = (
            typeof event.data === 'string' ? JSON.parse(event.data) : event.data
          ) as Record<string, unknown>
        } catch {
          break
        }
        const toolName =
          (toolData.toolName as string | undefined) ||
          (toolData.name as string | undefined) ||
          'unknown'
        const toolArgs =
          (toolData.arguments as Record<string, unknown> | undefined) ||
          (toolData.args as Record<string, unknown> | undefined) ||
          {}
        const semanticSignature = `${toolName}:${stableStringify(toolArgs)}`
        if (seenStreamingToolCallSignatures.value.has(semanticSignature)) {
          break
        }
        seenStreamingToolCallSignatures.value.add(semanticSignature)

        const toolId = (toolData.id as string | undefined) || crypto.randomUUID()
        if (streamingToolCalls.value.some((tc) => tc.id === toolId)) {
          break
        }
        const existingByName = [...streamingToolCalls.value]
          .reverse()
          .find((tc) => tc.toolName === toolName)
        if (existingByName) {
          existingByName.arguments = toolArgs
          existingByName.status = 'running'
          break
        }
        streamingToolCalls.value.push({
          id: toolId,
          toolName,
          arguments: toolArgs,
          status: 'running',
        })
        // Sync to live message
        if (liveAssistantMsg) liveAssistantMsg.toolCalls = [...streamingToolCalls.value]
        lastStreamEventType = event.event
        break
      }

      case 'tool_result': {
        let resultData: Record<string, unknown>
        try {
          resultData = (
            typeof event.data === 'string' ? JSON.parse(event.data) : event.data
          ) as Record<string, unknown>
        } catch {
          break
        }
        let toolCall = streamingToolCalls.value.find(
          (tc) =>
            tc.id ===
            ((resultData.id as string | undefined) || (resultData.toolCallId as string | undefined))
        )
        // Fallback: match by toolName if ID matching fails
        if (!toolCall) {
          toolCall = [...streamingToolCalls.value]
            .reverse()
            .find(
              (tc) =>
                tc.status === 'running' &&
                tc.toolName ===
                  ((resultData.toolName as string | undefined) ||
                    (resultData.name as string | undefined))
            )
        }
        if (toolCall) {
          toolCall.result =
            (resultData.result as string | undefined) ||
            (resultData.output as string | undefined) ||
            ''
          toolCall.status = resultData.error ? 'error' : 'complete'
          // Sync to live message
          if (liveAssistantMsg) liveAssistantMsg.toolCalls = [...streamingToolCalls.value]
        }
        lastStreamEventType = event.event
        break
      }

      case 'thinking':
        streamingThinkingSteps.value.push(event.data)
        // Sync to live message
        if (liveAssistantMsg) liveAssistantMsg.thinkingSteps = [...streamingThinkingSteps.value]
        break

      case 'memory_updated':
        try {
          const payload = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
          const updatedFiles = Array.isArray(payload?.updatedFiles) ? payload.updatedFiles : []
          scheduleMemoryRefresh(updatedFiles)
        } catch {
          scheduleMemoryRefresh()
        }
        break

      case 'error':
        notifications.error(event.data)
        break

      case 'done':
        // Capture threadId from done event metadata
        if (event.metadata?.threadId) {
          lastReceivedThreadId.value = event.metadata.threadId as string
        }
        break

      case 'thread-id' as any: {
        // Backend sends thread-id event after persisting messages
        const threadData = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
        if (threadData?.threadId) {
          lastReceivedThreadId.value = threadData.threadId
        } else if (threadData?.data?.threadId) {
          lastReceivedThreadId.value = threadData.data.threadId
        }
        break
      }
    }
  }

  function parsePlanData() {
    const planFile = memoryFiles.value.find((f) => f.filename === 'Plan.md')
    const todayFile = memoryFiles.value.find((f) => f.filename === 'Today.md')
    const tomorrowFile = memoryFiles.value.find((f) => f.filename === 'Tomorrow.md')
    const warnings: ParserWarning[] = []

    if (planFile) {
      const parsedPlan = parsePlanMarkdown(planFile.content)
      activePlans.value = parsedPlan.activePlans
      warnings.push(...parsedPlan.warnings)
    } else {
      activePlans.value = []
    }
    if (todayFile) {
      const todayParsed = parseDailyPlanMarkdown(
        todayFile.content,
        getTodayDate(BROWSER_TIMEZONE),
        'Today.md'
      )
      todayPlan.value = todayParsed.plan
      warnings.push(...todayParsed.warnings)
    } else {
      todayPlan.value = null
    }
    if (tomorrowFile && tomorrowFile.content.trim()) {
      const tomorrowParsed = parseDailyPlanMarkdown(
        tomorrowFile.content,
        getTomorrowDate(BROWSER_TIMEZONE),
        'Tomorrow.md'
      )
      tomorrowPlan.value = tomorrowParsed.plan
      warnings.push(...tomorrowParsed.warnings)
    } else {
      tomorrowPlan.value = null
    }

    parserWarnings.value = warnings
  }

  function extractTitle(message: string): string {
    // First sentence (up to period/question mark/exclamation) or first 60 chars
    const sentenceMatch = message.match(/^(.+?[.!?])/)
    if (sentenceMatch && sentenceMatch[1].length <= 60) {
      return sentenceMatch[1].trim()
    }
    if (message.length <= 60) return message.trim()
    return `${message.slice(0, 57).trim()}...`
  }

  // ---------- dailyPlanToMarkdown (F1 + F2) ----------
  // Moved inside the store so it can access memoryFiles for section preservation.

  function dailyPlanToMarkdown(plan: DailyPlan): string {
    const todayFile = memoryFiles.value.find((f) => f.filename === 'Today.md')
    return renderDailyPlanMarkdown(plan, {
      existingContent: todayFile?.content || '',
      defaultHeader: "# Today's Plan",
    })
  }

  // ---------- Task start notifications (E1) ----------

  let taskNotificationTimer: ReturnType<typeof setInterval> | null = null

  function startTaskNotifications() {
    if (taskNotificationTimer) return
    taskNotificationTimer = setInterval(() => {
      if (!todayPlan.value) return
      const now = new Date()
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

      for (const task of todayPlan.value.tasks) {
        if (task.status !== 'pending') continue
        if (task.scheduledTime !== currentTime) continue

        const flag = `secretary_task_notif_${task.id}_${currentTime}`
        if (sessionStorage.getItem(flag)) continue
        sessionStorage.setItem(flag, '1')

        notifications.info(`Starting now: ${task.title}`)
      }
    }, 60_000)
  }

  function stopTaskNotifications() {
    if (taskNotificationTimer) {
      clearInterval(taskNotificationTimer)
      taskNotificationTimer = null
    }
  }

  // ---------- Auto-generate tomorrow (C1) ----------

  const shouldAutoPrepareTomorrow = computed(() => {
    const hour = new Date().getHours()
    return (
      (hour >= 21 || hour < 4) &&
      !tomorrowPlan.value &&
      !isGeneratingTomorrow.value &&
      activePlans.value.length > 0
    )
  })

  async function checkAndAutoPrepareTomorrow() {
    if (!shouldAutoPrepareTomorrow.value) return
    const flag = `secretary_auto_tomorrow_${getTodayDate(BROWSER_TIMEZONE)}`
    if (sessionStorage.getItem(flag)) return
    sessionStorage.setItem(flag, '1')
    notifications.info("Auto-generating tomorrow's plan...")
    await prepareTomorrow()
  }

  // ---------- Study Now (D1) ----------

  function studyNow(task: ScheduledTask) {
    const readyNoteArtifact = (task.artifacts || []).find(
      (artifact) => artifact.kind === 'note' && artifact.status === 'ready' && artifact.targetId
    )
    const noteId = readyNoteArtifact?.targetId || task.noteId

    if (noteId) {
      window.location.href = `/editor?noteId=${noteId}`
    }
    updateTaskStatus(task.id, 'in_progress')
  }

  // ---------- Reflection submission (B1) ----------

  async function submitReflection(mood: ReflectionMood, text: string) {
    // sendChatMessage triggers SSE memory_updated events which handle refresh via scheduleMemoryRefresh.
    await sendChatMessage(
      `Save my daily reflection. My mood is "${mood}". ${text ? `Notes: ${text}` : 'No additional notes.'}`
    )
  }

  // ---- Plan-Project Link Actions ----

  async function loadPlanProjectLinks() {
    if (isDemoMode()) return
    try {
      const res = await authFetch(`${SECRETARY_API}/plan-links`)
      if (!res.ok) return
      const data = await res.json()
      const links = data.links as Record<string, string>
      planProjectLinks.value = new Map(Object.entries(links))
      projectPlanLinks.value = new Map(Object.entries(links).map(([k, v]) => [v, k]))
    } catch {
      // Non-critical
    }
  }

  async function linkPlanToProject(planId: string): Promise<string | undefined> {
    if (isDemoMode()) return
    try {
      const res = await authFetch(
        `${SECRETARY_API}/plan/${encodeURIComponent(planId)}/link-project`,
        {
          method: 'POST',
        }
      )
      const data = await res.json()
      if (data.projectId) {
        planProjectLinks.value.set(planId, data.projectId)
        projectPlanLinks.value.set(data.projectId, planId)
        return data.projectId
      }
    } catch (err) {
      console.warn('Failed to link plan to project', err)
    }
  }

  function getPlanIdForProject(projectId: string): string | undefined {
    return projectPlanLinks.value.get(projectId)
  }

  function getProjectIdForPlan(planId: string): string | undefined {
    return planProjectLinks.value.get(planId)
  }

  // ---- Plan Workspace Actions ----

  async function loadPlanWorkspace(planId: string) {
    if (isDemoMode()) return
    isLoadingWorkspace.value = true
    try {
      const res = await authFetch(`${SECRETARY_API}/plan/${encodeURIComponent(planId)}`, {
        headers: TIMEZONE_HEADERS,
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || `Failed to load plan workspace (${res.status})`)
      }
      const data = await res.json()

      // Auto-link existing plans that don't have a project yet
      let projectId = data.projectId
      if (!projectId) {
        projectId = await linkPlanToProject(planId)
      } else {
        planProjectLinks.value.set(planId, projectId)
        projectPlanLinks.value.set(projectId, planId)
      }

      currentWorkspace.value = {
        plan: data.plan,
        instructions: data.instructions || '',
        roadmapContent: data.roadmapContent || '',
        schedules: data.schedules || [],
        artifacts: getPlanArtifacts(planId),
        projectId,
        projectNotes: data.projectNotes || [],
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load plan workspace'
      notifications.error(msg)
      throw err
    } finally {
      isLoadingWorkspace.value = false
    }
  }

  async function savePlanInstructions(planId: string, content: string) {
    try {
      await authFetch(`${SECRETARY_API}/plan/${encodeURIComponent(planId)}/instructions`, {
        method: 'PUT',
        body: JSON.stringify({ content }),
      })
      if (currentWorkspace.value && currentWorkspace.value.plan.id === planId) {
        currentWorkspace.value.instructions = content
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save instructions'
      notifications.error(msg)
    }
  }

  async function createPlanSchedule(
    planId: string,
    schedule: Omit<PlanScheduleItem, 'id' | 'createdAt' | 'runCount' | 'planId'>
  ) {
    try {
      const res = await authFetch(`${SECRETARY_API}/plan/${encodeURIComponent(planId)}/schedules`, {
        method: 'POST',
        body: JSON.stringify(schedule),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      if (currentWorkspace.value && currentWorkspace.value.plan.id === planId) {
        currentWorkspace.value.schedules.push(data.schedule)
      }
      notifications.success('Automation created')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create schedule'
      notifications.error(msg)
    }
  }

  async function updatePlanSchedule(
    planId: string,
    scheduleId: string,
    updates: Partial<PlanScheduleItem>
  ) {
    try {
      const res = await authFetch(
        `${SECRETARY_API}/plan/${encodeURIComponent(planId)}/schedules/${scheduleId}`,
        {
          method: 'PUT',
          body: JSON.stringify(updates),
        }
      )
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      if (currentWorkspace.value && currentWorkspace.value.plan.id === planId) {
        const idx = currentWorkspace.value.schedules.findIndex((s) => s.id === scheduleId)
        if (idx >= 0) {
          currentWorkspace.value.schedules[idx] = {
            ...currentWorkspace.value.schedules[idx],
            ...updates,
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update schedule'
      notifications.error(msg)
    }
  }

  async function deletePlanSchedule(planId: string, scheduleId: string) {
    try {
      const res = await authFetch(
        `${SECRETARY_API}/plan/${encodeURIComponent(planId)}/schedules/${scheduleId}`,
        {
          method: 'DELETE',
        }
      )
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      if (currentWorkspace.value && currentWorkspace.value.plan.id === planId) {
        currentWorkspace.value.schedules = currentWorkspace.value.schedules.filter(
          (s) => s.id !== scheduleId
        )
      }
      notifications.success('Automation deleted')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete schedule'
      notifications.error(msg)
    }
  }

  async function togglePlanSchedule(planId: string, scheduleId: string, enabled: boolean) {
    await updatePlanSchedule(planId, scheduleId, { enabled })
  }

  async function runPlanNow(
    planId: string,
    workflow: PlanScheduleWorkflow = 'make_note_from_task'
  ) {
    const plan = activePlans.value.find((p) => p.id === planId) || currentWorkspace.value?.plan
    if (!plan) {
      notifications.error('Plan not found')
      return
    }
    try {
      await launchPlanWorkflow(plan, workflow)
      notifications.success('Mission started')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start mission'
      notifications.error(msg)
    }
  }

  // --- Streaming schedule execution state ---
  const runningScheduleId = ref<string | null>(null)
  const runningScheduleSteps = ref<Array<{ text: string; status: 'active' | 'done' }>>([])

  function _addRunStep(text: string) {
    // Mark previous active step as done
    const steps = runningScheduleSteps.value
    if (steps.length > 0 && steps[steps.length - 1].status === 'active') {
      steps[steps.length - 1].status = 'done'
    }
    steps.push({ text, status: 'active' })
  }

  function _friendlyToolName(name: string): string {
    switch (name) {
      case 'web_search':
        return 'Searching web'
      case 'save_note':
        return 'Saving note'
      case 'advance_progress':
        return 'Updating progress'
      default:
        return name
    }
  }

  async function runScheduleNow(planId: string, scheduleId: string) {
    runningScheduleId.value = scheduleId
    runningScheduleSteps.value = []

    try {
      const res = await authFetchSSE(
        `${API_URL}/api/secretary/plan/${planId}/schedules/${scheduleId}/run`,
        { method: 'POST' }
      )

      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error || `Request failed (${res.status})`)
      }

      await parseSSEStream(res, {
        onEvent: (sseEvent) => {
          const eventType = sseEvent.event
          const data = sseEvent.data as Record<string, unknown>

          switch (eventType) {
            case 'status':
              _addRunStep(data.step as string)
              break
            case 'tool-call': {
              const name = _friendlyToolName(data.name as string)
              const query = data.query as string | undefined
              _addRunStep(query ? `${name}: "${query}"` : name)
              break
            }
            case 'tool-result': {
              // Mark current step as done
              const steps = runningScheduleSteps.value
              if (steps.length > 0) steps[steps.length - 1].status = 'done'
              break
            }
            case 'done':
              notifications.success(`Note created: ${(data.noteTitle as string) || 'Untitled'}`)
              break
            case 'error':
              notifications.error((data.message as string) || 'Automation failed')
              break
          }
        },
        onError: (err) => {
          notifications.error(err.message || 'Stream error')
        },
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Automation failed'
      notifications.error(msg)
    } finally {
      runningScheduleId.value = null
      runningScheduleSteps.value = []
      await loadPlanWorkspace(planId)
    }
  }

  return {
    memoryFiles,
    rootMemoryFiles,
    historyEntries,
    planArchiveEntries,
    activePlans,
    todayPlan,
    tomorrowPlan,
    calendarEvents,
    calendarSyncedAt,
    isLoadingCalendarEvents,
    calendarEventsByDate,
    busyDates,
    isLoading,
    isGeneratingTomorrow,
    isInitialized,
    error,
    parserWarnings,
    chatMessages,
    isChatStreaming,
    streamingContent,
    streamingToolCalls,
    streamingThinkingSteps,
    selectedFilename,
    activeThreadId,
    threads,
    heartbeatState,
    planArtifacts,
    currentWorkspace,
    isLoadingWorkspace,
    todayProgress,
    showTomorrowSection,
    showReflectionSection,
    isTomorrowApproved,
    selectedFile,
    primaryPlan,
    currentTopic,
    nextTask,
    upcomingTasks,
    attentionItems,
    initialize,
    refreshMemoryFiles,
    scheduleMemoryRefresh,
    updateMemoryFile,
    updateTaskStatus,
    prepareTomorrow,
    approveTomorrow,
    sendChatMessage,
    loadThreads,
    loadThread,
    createNewThread,
    deleteThread,
    submitReflection,
    studyNow,
    loadCalendarEvents,
    launchTaskWorkflow,
    launchPlanWorkflow,
    getPlanArtifacts,
    openMemoryFile,
    startTaskNotifications,
    stopTaskNotifications,
    shouldAutoPrepareTomorrow,
    checkAndAutoPrepareTomorrow,
    planProjectLinks,
    projectPlanLinks,
    loadPlanProjectLinks,
    linkPlanToProject,
    getPlanIdForProject,
    getProjectIdForPlan,
    loadPlanWorkspace,
    savePlanInstructions,
    createPlanSchedule,
    updatePlanSchedule,
    deletePlanSchedule,
    togglePlanSchedule,
    runPlanNow,
    runScheduleNow,
    runningScheduleId,
    runningScheduleSteps,
  }
})
