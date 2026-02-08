/**
 * Deep Agent Store
 *
 * Pinia store for the Deep Research Agent feature.
 * Manages research threads, chat state, virtual files, todos,
 * sub-agents, and human-in-the-loop interrupts.
 *
 * SSE processing is inline (following the secretary.ts pattern).
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authFetch, authFetchSSE } from '@/utils/api'
import { useNotificationsStore } from '@/stores/notifications'
import { getAutoOutputDestinationForMessage, getRequestModeForMessage } from './deepAgent.output-policy'
import { saveResearchDraft } from '@/services/deepAgent.service'
import {
  applyNoteDraftDelta,
  applyNoteDraftSnapshot,
  setNoteDraftHidden,
} from './deepAgent.note-draft'
import type {
  ResearchThread,
  ResearchThreadStatus,
  ResearchNoteDraft,
  VirtualFile,
  TodoItem,
  InterruptData,
  InterruptResponse,
  SubagentInfo,
  ResearchStreamEvent,
  ResearchToolCall,
} from '@inkdown/shared/types'

const API_BASE = import.meta.env.VITE_API_BASE?.replace('/api/agent', '') || ''
const RESEARCH_API = `${API_BASE}/api/research`

// ============================================================================
// Chat Types (local to store)
// ============================================================================

export interface DeepAgentChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: Date
  toolCalls?: ResearchToolCall[]
  subagents?: SubagentInfo[]
  noteDraft?: DeepAgentNoteDraft
}

export interface DeepAgentNoteDraft extends ResearchNoteDraft {
  hidden?: boolean
  isSaving?: boolean
  isSaved?: boolean
  messageId?: string
}

export type OutputDestination = 'chat' | 'md_file' | 'note'

export interface OutputClarificationOption {
  id: OutputDestination
  label: string
  description: string
}

export interface OutputClarificationRequest {
  id: string
  originalMessage: string
  reason: string
  options: OutputClarificationOption[]
}

interface SendChatMessageOptions {
  outputDestination?: OutputDestination
}

// ============================================================================
// Store
// ============================================================================

export const useDeepAgentStore = defineStore('deepAgent', () => {
  const notifications = useNotificationsStore()

  // ---- Thread management ----
  const threads = ref<ResearchThread[]>([])
  const activeThreadId = ref<string | null>(null)

  // ---- Chat state ----
  const chatMessages = ref<DeepAgentChatMessage[]>([])
  const isChatStreaming = ref(false)
  const streamingContent = ref('')
  const streamingToolCalls = ref<ResearchToolCall[]>([])
  const streamingSubagents = ref<SubagentInfo[]>([])
  const streamingNoteDraft = ref<DeepAgentNoteDraft | null>(null)
  const seenStreamingToolCallSignatures = ref(new Set<string>())
  const lastStreamSeq = ref<number>(0)
  const lastReceivedThreadId = ref<string | null>(null)

  // ---- Research-specific state ----
  const todos = ref<TodoItem[]>([])
  const files = ref<VirtualFile[]>([])
  const activeSubagents = ref<SubagentInfo[]>([])
  const pendingInterrupt = ref<InterruptData | null>(null)
  const pendingOutputClarification = ref<OutputClarificationRequest | null>(null)
  const threadStatus = ref<ResearchThreadStatus>('idle')
  const activeNoteDraft = ref<DeepAgentNoteDraft | null>(null)

  // ---- Computed ----

  const activeThread = computed(() => {
    if (!activeThreadId.value) return null
    return threads.value.find(t => t.id === activeThreadId.value) || null
  })

  const completedTodos = computed(() => todos.value.filter(t => t.status === 'completed'))
  const pendingTodos = computed(() => todos.value.filter(t => t.status !== 'completed'))
  const hasActiveInterrupt = computed(() => pendingInterrupt.value !== null)
  const hasPendingOutputClarification = computed(() => pendingOutputClarification.value !== null)
  const hasActiveNoteDraft = computed(() => activeNoteDraft.value !== null)
  const streamEventQueue: ResearchStreamEvent[] = []
  let streamFlushTimer: ReturnType<typeof setTimeout> | null = null
  const STREAM_FLUSH_INTERVAL_MS = 40

  // ---- Actions ----

  function clearStreamEventQueue() {
    streamEventQueue.splice(0, streamEventQueue.length)
    if (streamFlushTimer) {
      clearTimeout(streamFlushTimer)
      streamFlushTimer = null
    }
  }

  function flushStreamEventQueue() {
    if (streamFlushTimer) {
      clearTimeout(streamFlushTimer)
      streamFlushTimer = null
    }
    if (streamEventQueue.length === 0) return

    const events = streamEventQueue.splice(0, streamEventQueue.length)
    for (const queuedEvent of events) {
      processStreamEvent(queuedEvent)
    }
  }

  function enqueueStreamEvent(event: ResearchStreamEvent) {
    streamEventQueue.push(event)
    if (streamFlushTimer) return

    streamFlushTimer = setTimeout(() => {
      flushStreamEventQueue()
    }, STREAM_FLUSH_INTERVAL_MS)
  }

  function syncDraftToMessage() {
    const draft = activeNoteDraft.value
    if (!draft?.messageId) return
    const message = chatMessages.value.find(m => m.id === draft.messageId)
    if (message && message.role === 'assistant') {
      message.noteDraft = { ...draft }
    }
  }

  function attachDraftToLatestAssistant() {
    const draft = activeNoteDraft.value
    if (!draft) return
    const lastAssistant = [...chatMessages.value].reverse().find(m => m.role === 'assistant')
    if (!lastAssistant) return
    draft.messageId = lastAssistant.id
    lastAssistant.noteDraft = { ...draft }
  }

  function ingestNoteDraftDelta(payload: {
    draftId: string
    title: string
    originalContent: string
    currentContent?: string
    delta?: string
    noteId?: string
  }) {
    const base = applyNoteDraftDelta(activeNoteDraft.value, payload) as DeepAgentNoteDraft
    streamingNoteDraft.value = base
    activeNoteDraft.value = base
  }

  function ingestNoteDraft(payload: ResearchNoteDraft) {
    activeNoteDraft.value = applyNoteDraftSnapshot(activeNoteDraft.value, payload) as DeepAgentNoteDraft
    streamingNoteDraft.value = { ...activeNoteDraft.value }
    syncDraftToMessage()
  }

  async function loadThreads() {
    try {
      const res = await authFetch(`${RESEARCH_API}/threads`)
      const data = await res.json()
      threads.value = data.threads || []
    } catch (err) {
      notifications.error(err instanceof Error ? err.message : 'Failed to load research threads')
    }
  }

  async function loadThread(threadId: string) {
    activeThreadId.value = threadId
    chatMessages.value = []
    todos.value = []
    files.value = []
    activeNoteDraft.value = null
    streamingNoteDraft.value = null
    activeSubagents.value = []
    pendingInterrupt.value = null
    threadStatus.value = 'idle'

    try {
      const res = await authFetch(`${RESEARCH_API}/threads/${threadId}/messages`)
      const data = await res.json()
      chatMessages.value = (data.messages || []).map((m: any) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: new Date(m.createdAt),
        toolCalls: m.toolCalls || undefined,
        subagents: m.subagents || undefined,
      }))

      // Restore thread-specific state if provided
      if (data.todos) todos.value = data.todos
      if (data.files) files.value = data.files
      if (data.noteDraft) {
        ingestNoteDraft(data.noteDraft as ResearchNoteDraft)
        attachDraftToLatestAssistant()
      }
      if (data.status) threadStatus.value = data.status
    } catch (err) {
      notifications.error(err instanceof Error ? err.message : 'Failed to load research thread')
    }
  }

  function createNewThread() {
    activeThreadId.value = null
    chatMessages.value = []
    todos.value = []
    files.value = []
    activeNoteDraft.value = null
    streamingNoteDraft.value = null
    activeSubagents.value = []
    pendingInterrupt.value = null
    pendingOutputClarification.value = null
    threadStatus.value = 'idle'
  }

  function getAutoOutputDestination(message: string): OutputDestination | undefined {
    return getAutoOutputDestinationForMessage(message)
  }

  function requestOutputClarification(message: string): boolean {
    const input = message.trim()
    if (!input) return false

    // Only show clarification for genuinely ambiguous DETAILED long-form requests
    const mode = getRequestModeForMessage(input)
    if (mode !== 'markdown') return false

    pendingOutputClarification.value = {
      id: crypto.randomUUID(),
      originalMessage: input,
      reason: 'This looks like a detailed request. Where should the output go?',
      options: [
        {
          id: 'chat',
          label: 'Chat Reply',
          description: 'Return the full answer directly in chat.',
        },
        {
          id: 'md_file',
          label: 'Markdown File',
          description: 'Write output to final_report.md in this thread.',
        },
        {
          id: 'note',
          label: 'Real Note',
          description: 'Create a true Inkdown note and open it in the editor.',
        },
      ],
    }
    return true
  }

  function resolveOutputClarification(
    destination: OutputDestination,
  ): { message: string; outputDestination: OutputDestination } | null {
    const request = pendingOutputClarification.value
    if (!request) return null
    pendingOutputClarification.value = null
    return {
      message: request.originalMessage,
      outputDestination: destination,
    }
  }

  function cancelOutputClarification() {
    pendingOutputClarification.value = null
  }

  async function deleteThread(threadId: string) {
    try {
      await authFetch(`${RESEARCH_API}/threads/${threadId}`, { method: 'DELETE' })
      threads.value = threads.value.filter(t => t.id !== threadId)
      if (activeThreadId.value === threadId) {
        createNewThread()
      }
    } catch (err) {
      notifications.error(err instanceof Error ? err.message : 'Failed to delete research thread')
    }
  }

  async function sendChatMessage(message: string, options: SendChatMessageOptions = {}) {
    pendingOutputClarification.value = null
    const mode = getRequestModeForMessage(message, options.outputDestination)
    if (mode === 'note') {
      const { useAIStore } = await import('@/stores/ai')
      useAIStore().closeNotePreview()
    }
    if (mode !== 'research') {
      todos.value = []
    }
    const userMsg: DeepAgentChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: message,
      createdAt: new Date(),
    }
    chatMessages.value.push(userMsg)
    isChatStreaming.value = true
    streamingContent.value = ''
    streamingToolCalls.value = []
    streamingSubagents.value = []
    streamingNoteDraft.value = null
    seenStreamingToolCallSignatures.value.clear()
    lastStreamSeq.value = 0
    lastReceivedThreadId.value = null
    clearStreamEventQueue()

    try {
      const MAX_RETRIES = 2
      let lastError: Error | null = null

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (attempt > 0) {
          await new Promise(r => setTimeout(r, 1000))
          // Reset streaming state for retry
          streamingContent.value = ''
          streamingToolCalls.value = []
          streamingSubagents.value = []
          streamingNoteDraft.value = null
          seenStreamingToolCallSignatures.value.clear()
          lastStreamSeq.value = 0
          clearStreamEventQueue()
        }

        try {
          const res = await authFetchSSE(`${RESEARCH_API}/chat`, {
            method: 'POST',
            body: JSON.stringify({
              message,
              threadId: activeThreadId.value || undefined,
              outputPreference: options.outputDestination || undefined,
            }),
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
                  const event = JSON.parse(line.slice(5).trim()) as ResearchStreamEvent
                  enqueueStreamEvent(event)
                } catch {
                  // skip malformed JSON
                }
              }
            }
          }

          flushStreamEventQueue()

          lastError = null
          break // Success
        } catch (err) {
          clearStreamEventQueue()
          lastError = err instanceof Error ? err : new Error(String(err))
          if (attempt === MAX_RETRIES) throw lastError
        }
      }

      // Finalize: push assembled assistant message
      if (streamingContent.value || streamingToolCalls.value.length > 0 || streamingNoteDraft.value) {
        const assistantMessage: DeepAgentChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: streamingContent.value,
          createdAt: new Date(),
          toolCalls: streamingToolCalls.value.length > 0 ? [...streamingToolCalls.value] : undefined,
          subagents: streamingSubagents.value.length > 0 ? [...streamingSubagents.value] : undefined,
          noteDraft: streamingNoteDraft.value ? { ...streamingNoteDraft.value } : undefined,
        }
        chatMessages.value.push(assistantMessage)
        if (streamingNoteDraft.value) {
          activeNoteDraft.value = {
            ...streamingNoteDraft.value,
            messageId: assistantMessage.id,
          }
          assistantMessage.noteDraft = { ...activeNoteDraft.value }
        }
      }

      // Handle thread tracking
      if (lastReceivedThreadId.value && !activeThreadId.value) {
        activeThreadId.value = lastReceivedThreadId.value
      }
      await loadThreads()

      // Auto-title new threads
      if (activeThreadId.value) {
        const thread = threads.value.find(t => t.id === activeThreadId.value)
        if (thread && !thread.title) {
          const title = extractTitle(message)
          try {
            await authFetch(`${RESEARCH_API}/threads/${activeThreadId.value}`, {
              method: 'PATCH',
              body: JSON.stringify({ title }),
            })
            thread.title = title
          } catch {
            // Non-critical
          }
        }
      }
    } catch (err) {
      notifications.error(err instanceof Error ? err.message : 'Failed to send research message')
    } finally {
      clearStreamEventQueue()
      isChatStreaming.value = false
      streamingContent.value = ''
      streamingToolCalls.value = []
      streamingSubagents.value = []
      streamingNoteDraft.value = null
    }
  }

  async function respondToInterrupt(response: InterruptResponse) {
    if (!pendingInterrupt.value) return
    if (!activeThreadId.value) {
      notifications.error('No active thread for interrupt response')
      return
    }

    const currentInterrupt = pendingInterrupt.value
    pendingInterrupt.value = null

    try {
      const res = await authFetch(`${RESEARCH_API}/threads/${activeThreadId.value}/interrupt-response`, {
        method: 'POST',
        body: JSON.stringify(response),
      })

      if (!res.ok) {
        const errorText = await res.text()
        throw new Error(errorText || `Interrupt response failed (${res.status})`)
      }

      // Important: the original /chat SSE stream keeps running and will continue
      // emitting events after this resolve call. Do not open a second stream here.
    } catch (err) {
      // Restore pending interrupt so user can retry
      pendingInterrupt.value = currentInterrupt
      notifications.error(err instanceof Error ? err.message : 'Failed to respond to interrupt')
    }
  }

  async function saveFileAsNote(filename: string) {
    const file = files.value.find(f => f.name === filename)
    if (!file) return

    const { createNote } = await import('@/services/notes.service')
    const { useAuthStore } = await import('@/stores/auth')
    const { useEditorStore } = await import('@/stores/editor')
    const auth = useAuthStore()

    if (!auth.user?.id) {
      notifications.error('Not authenticated')
      return
    }

    try {
      const result = await createNote(auth.user.id, {
        title: filename.replace(/\.[^/.]+$/, ''),
        content: file.content,
      })

      if (result.error) {
        notifications.error('Failed to save as note')
        return
      }

      notifications.success(`Saved "${filename}" as a note`)
      const editorStore = useEditorStore()
      await editorStore.loadDocuments()
    } catch (err) {
      notifications.error(err instanceof Error ? err.message : 'Failed to save as note')
    }
  }

  function editFile(filename: string, content: string) {
    const existing = files.value.find(f => f.name === filename)
    if (existing) {
      existing.content = content
      existing.updatedAt = new Date().toISOString()
    } else {
      files.value.push({
        name: filename,
        content,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    }
  }

  function updateNoteDraftContent(payload: { title?: string; content: string }) {
    if (!activeNoteDraft.value) return
    if (typeof payload.title === 'string' && payload.title.trim()) {
      activeNoteDraft.value.title = payload.title.trim()
    }
    activeNoteDraft.value.proposedContent = payload.content
    activeNoteDraft.value.currentContent = payload.content
    activeNoteDraft.value.updatedAt = new Date().toISOString()
    activeNoteDraft.value.isSaved = false
    syncDraftToMessage()
  }

  function hideNoteDraft() {
    activeNoteDraft.value = setNoteDraftHidden(activeNoteDraft.value, true) as DeepAgentNoteDraft | null
    syncDraftToMessage()
  }

  function reopenNoteDraft() {
    activeNoteDraft.value = setNoteDraftHidden(activeNoteDraft.value, false) as DeepAgentNoteDraft | null
    syncDraftToMessage()
  }

  async function saveNoteDraft(payload?: { title?: string; content?: string }) {
    if (!activeThreadId.value || !activeNoteDraft.value) return null

    const title = payload?.title?.trim() || activeNoteDraft.value.title.trim()
    const content = payload?.content ?? activeNoteDraft.value.currentContent
    if (!title || !content.trim()) {
      notifications.error('Draft title and content are required')
      return null
    }

    activeNoteDraft.value.isSaving = true
    syncDraftToMessage()

    try {
      const result = await saveResearchDraft(activeThreadId.value, { title, content })
      activeNoteDraft.value = {
        ...activeNoteDraft.value,
        title: result.title,
        noteId: result.noteId,
        savedAt: result.savedAt,
        isSaving: false,
        isSaved: true,
        hidden: false,
        originalContent: content,
        proposedContent: content,
        currentContent: content,
        updatedAt: result.savedAt,
      }
      syncDraftToMessage()

      const { useAIStore } = await import('@/stores/ai')
      const { useEditorStore } = await import('@/stores')
      const aiStore = useAIStore()
      const editorStore = useEditorStore()
      aiStore.openNotePreview(result.noteId)
      await editorStore.loadDocument(result.noteId)
      await editorStore.loadDocuments()

      notifications.success(`Saved "${result.title}"`)
      return result
    } catch (err) {
      activeNoteDraft.value.isSaving = false
      syncDraftToMessage()
      notifications.error(err instanceof Error ? err.message : 'Failed to save note draft')
      return null
    }
  }

  // ---- SSE Event Handler ----

  function stableStringify(value: unknown): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value)
    if (Array.isArray(value)) return `[${value.map(item => stableStringify(item)).join(',')}]`
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`)
    return `{${entries.join(',')}}`
  }

  function processStreamEvent(event: ResearchStreamEvent) {
    // Sequence dedup guard
    if (typeof event.seq === 'number' && event.seq > 0) {
      if (event.seq <= lastStreamSeq.value) return
      lastStreamSeq.value = event.seq
    }

    switch (event.event) {
      case 'text':
        if (event.isDelta === false) {
          // Full-text snapshot: replace if empty, append if new content
          if (!streamingContent.value) {
            streamingContent.value = String(event.data)
          } else if (!streamingContent.value.endsWith(String(event.data))) {
            streamingContent.value += String(event.data)
          }
        } else {
          streamingContent.value += String(event.data)
        }
        break

      case 'thinking':
        // Thinking steps — currently no dedicated UI, but content is preserved
        // for potential future display
        break

      case 'tool_call': {
        let toolData: Record<string, unknown>
        try {
          toolData = (typeof event.data === 'string' ? JSON.parse(event.data) : event.data) as Record<string, unknown>
        } catch {
          break
        }
        const toolName = (toolData.toolName as string | undefined) || (toolData.name as string | undefined) || 'unknown'
        const toolArgs = (toolData.arguments as Record<string, unknown> | undefined)
          || (toolData.args as Record<string, unknown> | undefined)
          || {}
        const semanticSignature = `${toolName}:${stableStringify(toolArgs)}`
        if (seenStreamingToolCallSignatures.value.has(semanticSignature)) {
          break
        }
        seenStreamingToolCallSignatures.value.add(semanticSignature)

        const toolId = (toolData.id as string | undefined) || crypto.randomUUID()
        if (streamingToolCalls.value.some(tc => tc.id === toolId)) {
          break
        }
        const existingByName = [...streamingToolCalls.value]
          .reverse()
          .find(tc => tc.toolName === toolName)
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
        break
      }

      case 'tool_result': {
        let resultData: Record<string, unknown>
        try {
          resultData = (typeof event.data === 'string' ? JSON.parse(event.data) : event.data) as Record<string, unknown>
        } catch {
          break
        }
        let toolCall = streamingToolCalls.value.find(
          tc => tc.id === ((resultData.id as string | undefined) || (resultData.toolCallId as string | undefined)),
        )
        // Fallback: match by toolName if ID matching fails
        if (!toolCall) {
          toolCall = [...streamingToolCalls.value].reverse().find(
            tc => tc.status === 'running'
              && tc.toolName === (
                (resultData.toolName as string | undefined)
                || (resultData.name as string | undefined)
              ),
          )
        }
        if (toolCall) {
          toolCall.result = (resultData.result as string | undefined)
            || (resultData.output as string | undefined)
            || ''
          toolCall.status = resultData.error ? 'error' : 'complete'
        }
        break
      }

      case 'note-draft-delta': {
        let draftDeltaData: Record<string, unknown>
        try {
          draftDeltaData = (typeof event.data === 'string' ? JSON.parse(event.data) : event.data) as Record<string, unknown>
        } catch {
          break
        }
        const draftId = draftDeltaData.draftId as string | undefined
        const currentContent = typeof draftDeltaData.currentContent === 'string'
          ? draftDeltaData.currentContent
          : undefined
        const delta = typeof draftDeltaData.delta === 'string'
          ? draftDeltaData.delta
          : undefined
        if (!draftId || (currentContent === undefined && delta === undefined)) break
        ingestNoteDraftDelta({
          draftId,
          title: (draftDeltaData.title as string | undefined) || 'Untitled Draft',
          originalContent: (draftDeltaData.originalContent as string | undefined) || '',
          currentContent,
          delta,
          noteId: draftDeltaData.noteId as string | undefined,
        })
        break
      }

      case 'note-draft': {
        let draftData: ResearchNoteDraft
        try {
          draftData = (typeof event.data === 'string' ? JSON.parse(event.data) : event.data) as ResearchNoteDraft
        } catch {
          break
        }
        ingestNoteDraft(draftData)
        break
      }

      case 'todo-update': {
        let todoData: Record<string, unknown>
        try {
          todoData = (typeof event.data === 'string' ? JSON.parse(event.data) : event.data) as Record<string, unknown>
        } catch {
          break
        }
        if (Array.isArray(todoData.todos)) {
          todos.value = todoData.todos as TodoItem[]
        } else if (Array.isArray(todoData)) {
          todos.value = todoData as unknown as TodoItem[]
        }
        break
      }

      case 'file-write': {
        let fileData: Record<string, unknown>
        try {
          fileData = (typeof event.data === 'string' ? JSON.parse(event.data) : event.data) as Record<string, unknown>
        } catch {
          break
        }
        const filename = fileData.name as string | undefined
        const content = fileData.content as string | undefined
        if (!filename || content === undefined) break

        const existing = files.value.find(f => f.name === filename)
        if (existing) {
          existing.content = content
          existing.updatedAt = new Date().toISOString()
        } else {
          files.value.push({
            name: filename,
            content,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })
        }
        break
      }

      case 'file-delete': {
        let deleteData: Record<string, unknown>
        try {
          deleteData = (typeof event.data === 'string' ? JSON.parse(event.data) : event.data) as Record<string, unknown>
        } catch {
          break
        }
        const deleteName = (deleteData.name as string | undefined) || (deleteData.filename as string | undefined)
        if (deleteName) {
          files.value = files.value.filter(f => f.name !== deleteName)
        }
        break
      }

      case 'interrupt': {
        let interruptData: InterruptData
        try {
          interruptData = (typeof event.data === 'string' ? JSON.parse(event.data) : event.data) as InterruptData
        } catch {
          break
        }
        pendingInterrupt.value = interruptData
        break
      }

      case 'subagent-start': {
        let subagentData: SubagentInfo
        try {
          subagentData = (typeof event.data === 'string' ? JSON.parse(event.data) : event.data) as SubagentInfo
        } catch {
          break
        }
        // Add to both active list and streaming list
        const existingActive = activeSubagents.value.findIndex(s => s.id === subagentData.id)
        if (existingActive >= 0) {
          activeSubagents.value[existingActive] = subagentData
        } else {
          activeSubagents.value.push(subagentData)
        }
        const existingStreaming = streamingSubagents.value.findIndex(s => s.id === subagentData.id)
        if (existingStreaming >= 0) {
          streamingSubagents.value[existingStreaming] = subagentData
        } else {
          streamingSubagents.value.push(subagentData)
        }
        break
      }

      case 'subagent-result': {
        let resultData: Record<string, unknown>
        try {
          resultData = (typeof event.data === 'string' ? JSON.parse(event.data) : event.data) as Record<string, unknown>
        } catch {
          break
        }
        const subagentId = resultData.id as string | undefined
        if (!subagentId) break

        // Update in active subagents
        const activeIdx = activeSubagents.value.findIndex(s => s.id === subagentId)
        if (activeIdx >= 0) {
          activeSubagents.value[activeIdx] = {
            ...activeSubagents.value[activeIdx],
            status: (resultData.status as SubagentInfo['status']) || 'completed',
            output: (resultData.output as string | undefined) || '',
            completedAt: (resultData.completedAt as string | undefined) || new Date().toISOString(),
          }
        }
        // Update in streaming subagents
        const streamIdx = streamingSubagents.value.findIndex(s => s.id === subagentId)
        if (streamIdx >= 0) {
          streamingSubagents.value[streamIdx] = {
            ...streamingSubagents.value[streamIdx],
            status: (resultData.status as SubagentInfo['status']) || 'completed',
            output: (resultData.output as string | undefined) || '',
            completedAt: (resultData.completedAt as string | undefined) || new Date().toISOString(),
          }
        }
        break
      }

      case 'thread-status': {
        let statusData: Record<string, unknown>
        try {
          statusData = (typeof event.data === 'string' ? JSON.parse(event.data) : event.data) as Record<string, unknown>
        } catch {
          break
        }
        if (statusData.status) {
          threadStatus.value = statusData.status as ResearchThreadStatus
        }
        break
      }

      case 'thread-id': {
        let threadData: Record<string, unknown>
        try {
          threadData = (typeof event.data === 'string' ? JSON.parse(event.data) : event.data) as Record<string, unknown>
        } catch {
          break
        }
        if (threadData.threadId) {
          lastReceivedThreadId.value = threadData.threadId as string
        } else if ((threadData as any).data?.threadId) {
          lastReceivedThreadId.value = (threadData as any).data.threadId
        }
        break
      }

      case 'note-navigate': {
        let navData: Record<string, unknown>
        try {
          navData = (typeof event.data === 'string' ? JSON.parse(event.data) : event.data) as Record<string, unknown>
        } catch {
          break
        }
        const noteId = navData.noteId as string | undefined
        if (!noteId) break

        void (async () => {
          try {
            const { useAIStore } = await import('@/stores/ai')
            const { useEditorStore } = await import('@/stores')
            const aiStore = useAIStore()
            const editorStore = useEditorStore()
            aiStore.openNotePreview(noteId)
            await editorStore.loadDocument(noteId)
            await editorStore.loadDocuments()
          } catch {
            // Non-critical: preview sync can fail without breaking stream state
          }
        })()
        break
      }

      case 'done':
        // Capture threadId from done event metadata if present
        if (event.metadata?.threadId) {
          lastReceivedThreadId.value = event.metadata.threadId as string
        }
        // Clear active subagents on completion
        activeSubagents.value = []
        threadStatus.value = 'idle'
        break

      case 'error':
        notifications.error(typeof event.data === 'string' ? event.data : 'Research agent error')
        threadStatus.value = 'error'
        break
    }
  }

  // ---- Helpers ----

  function extractTitle(message: string): string {
    const sentenceMatch = message.match(/^(.+?[.!?])/)
    if (sentenceMatch && sentenceMatch[1].length <= 60) {
      return sentenceMatch[1].trim()
    }
    if (message.length <= 60) return message.trim()
    return `${message.slice(0, 57).trim()}...`
  }

  return {
    // Thread management
    threads,
    activeThreadId,
    activeThread,

    // Chat state
    chatMessages,
    isChatStreaming,
    streamingContent,
    streamingToolCalls,
    streamingSubagents,
    streamingNoteDraft,

    // Research-specific state
    todos,
    files,
    activeSubagents,
    pendingInterrupt,
    pendingOutputClarification,
    threadStatus,
    activeNoteDraft,

    // Computed
    completedTodos,
    pendingTodos,
    hasActiveInterrupt,
    hasPendingOutputClarification,
    hasActiveNoteDraft,

    // Actions
    sendChatMessage,
    respondToInterrupt,
    loadThreads,
    loadThread,
    createNewThread,
    deleteThread,
    saveFileAsNote,
    editFile,
    updateNoteDraftContent,
    saveNoteDraft,
    hideNoteDraft,
    reopenNoteDraft,
    requestOutputClarification,
    resolveOutputClarification,
    cancelOutputClarification,
    getAutoOutputDestination,
    ingestNoteDraftDelta,
    ingestNoteDraft,
  }
})
