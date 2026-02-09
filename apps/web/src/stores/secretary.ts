/**
 * Secretary Store
 *
 * Pinia store for the AI Secretary feature — daily planner, roadmap manager.
 * Manages memory files, daily plans, active roadmaps, and chat state.
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authFetch, authFetchSSE } from '@/utils/api'
import { useNotificationsStore } from '@/stores/notifications'
import { partitionMemoryFiles } from './secretary.file-grouping'
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
} from '@inkdown/shared/types'

const API_BASE = import.meta.env.VITE_API_BASE?.replace('/api/agent', '') || ''
const SECRETARY_API = `${API_BASE}/api/secretary`
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

  // Chat state
  const chatMessages = ref<SecretaryChatMessage[]>([])
  const isChatStreaming = ref(false)
  const streamingContent = ref('')
  const streamingToolCalls = ref<SecretaryToolCall[]>([])
  const streamingThinkingSteps = ref<string[]>([])
  const seenStreamingToolCallSignatures = ref(new Set<string>())

  // UI state
  const selectedFilename = ref<string | null>(null)

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

  const selectedFile = computed(() => {
    if (!selectedFilename.value) return null
    return memoryFiles.value.find((f) => f.filename === selectedFilename.value) || null
  })

  // ---- Actions ----

  async function initialize() {
    if (isInitialized.value) return
    isLoading.value = true
    error.value = null

    try {
      // Run day transition on mount
      try {
        await authFetch(`${SECRETARY_API}/day-transition`, {
          method: 'POST',
          headers: TIMEZONE_HEADERS,
        })
      } catch {
        // Non-critical — don't block initialization
      }

      const res = await authFetch(`${SECRETARY_API}/memory`)
      const data = await res.json()

      if (data.files && data.files.length > 0) {
        memoryFiles.value = data.files
      } else {
        const initRes = await authFetch(`${SECRETARY_API}/initialize`, { method: 'POST' })
        const initData = await initRes.json()
        memoryFiles.value = initData.files || []
      }

      parsePlanData()

      await loadThreads()
      // Auto-load most recent thread
      if (threads.value.length > 0) {
        await loadThread(threads.value[0].threadId)
      }

      isInitialized.value = true
      startTaskNotifications()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to initialize secretary'
      error.value = msg
      notifications.error(msg)
    } finally {
      isLoading.value = false
    }
  }

  async function refreshMemoryFiles() {
    try {
      const res = await authFetch(`${SECRETARY_API}/memory`)
      const data = await res.json()
      memoryFiles.value = data.files || []
      parsePlanData()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to refresh memory files'
      notifications.error(msg)
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
    }, 120)
  }

  async function updateMemoryFile(filename: string, content: string) {
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
      notifications.success('File saved successfully')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update memory file'
      notifications.error(msg)
    }
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

    const markdown = dailyPlanToMarkdown(todayPlan.value)
    await updateMemoryFile('Today.md', markdown)
  }

  async function prepareTomorrow() {
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

      if (!res.body) throw new Error('No response body')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data:')) {
            try {
              const event = JSON.parse(line.slice(5).trim()) as SecretaryStreamEvent
              if (event.event === 'error') {
                notifications.error(event.data)
              }
            } catch {
              // skip
            }
          }
        }
      }

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
      notifications.success('Tomorrow plan approved and moved to Today')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to approve tomorrow plan'
      notifications.error(msg)
    }
  }

  async function loadThreads() {
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
    liveAssistantMsg = assistantMsg

    isChatStreaming.value = true
    streamingContent.value = ''
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

          if (!res.body) throw new Error('No response body')

          const reader = res.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ''

          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''

            for (const line of lines) {
              if (line.startsWith('data:')) {
                try {
                  const event = JSON.parse(line.slice(5).trim()) as SecretaryStreamEvent
                  handleStreamEvent(event)
                } catch {
                  // skip malformed JSON
                }
              }
            }
          }

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

      await refreshMemoryFiles()
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

  function handleStreamEvent(event: SecretaryStreamEvent) {
    if (SECRETARY_HARDENING_ENABLED && typeof event.seq === 'number' && event.seq > 0) {
      if (event.seq <= lastStreamSeq.value) return
      lastStreamSeq.value = event.seq
    }

    switch (event.event) {
      case 'text':
        if (SECRETARY_HARDENING_ENABLED && event.isDelta === false) {
          if (!streamingContent.value) {
            streamingContent.value = event.data
          } else if (!streamingContent.value.endsWith(event.data)) {
            streamingContent.value += event.data
          }
        } else {
          streamingContent.value += event.data
        }
        // Sync to live message for in-place rendering
        if (liveAssistantMsg) liveAssistantMsg.content = streamingContent.value
        break

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
    if (task.noteId) {
      window.location.href = `/editor?noteId=${task.noteId}`
    }
    updateTaskStatus(task.id, 'in_progress')
  }

  // ---------- Reflection submission (B1) ----------

  async function submitReflection(mood: ReflectionMood, text: string) {
    await sendChatMessage(
      `Save my daily reflection. My mood is "${mood}". ${text ? `Notes: ${text}` : 'No additional notes.'}`
    )
    await refreshMemoryFiles()
  }

  return {
    memoryFiles,
    rootMemoryFiles,
    historyEntries,
    planArchiveEntries,
    activePlans,
    todayPlan,
    tomorrowPlan,
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
    todayProgress,
    showTomorrowSection,
    showReflectionSection,
    selectedFile,
    initialize,
    refreshMemoryFiles,
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
    startTaskNotifications,
    stopTaskNotifications,
    shouldAutoPrepareTomorrow,
    checkAndAutoPrepareTomorrow,
  }
})
