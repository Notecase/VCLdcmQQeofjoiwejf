/**
 * AI Store
 * 
 * Pinia store for AI state management, ported from Note3's Zustand-based aiStore.
 * Manages chat sessions, thinking steps, citations, and pending edits.
 */

import { defineStore } from 'pinia'
import { ref, computed, reactive } from 'vue'

// ============================================================================
// Types (ported from Note3)
// ============================================================================

export interface ChatSession {
    id: string
    title: string
    agentType: 'chat' | 'note' | 'planner' | 'course' | 'slides' | 'research' | null
    contextNoteIds: string[]
    contextProjectId: string | null
    messages: ChatMessage[]
    createdAt: Date
    updatedAt: Date
}

export interface ChatMessage {
    id: string
    role: 'user' | 'assistant' | 'system' | 'tool'
    content: string
    model?: string
    provider?: string
    inputTokens?: number
    outputTokens?: number
    retrievedChunks?: RetrievedChunk[]
    toolCalls?: ToolCall[]
    createdAt: Date
}

export interface RetrievedChunk {
    noteId: string
    noteTitle: string
    chunkText: string
    similarity: number
}

export interface ToolCall {
    id: string
    toolName: string
    arguments: Record<string, unknown>
    result?: unknown
    status: 'pending' | 'running' | 'complete' | 'error'
}

export interface ThinkingStep {
    id: string
    type:
    | 'thought'     // General reasoning
    | 'search'      // Web/note search
    | 'read'        // Reading blocks/notes
    | 'write'       // Writing/editing
    | 'create'      // Creating databases/artifacts
    | 'tool'        // Other tool execution
    | 'analyze'     // Analysis operations
    | 'explore'     // Exploration
    | 'reasoning'   // Extended reasoning
    description: string
    status: 'running' | 'complete' | 'error'
    startedAt: Date
    completedAt?: Date
    durationMs?: number
    errorMessage?: string
}

export interface Citation {
    number: number
    noteId?: string
    title: string
    url?: string
    snippet: string
    source: 'note' | 'web'
    publishedDate?: string
}

export interface PendingEdit {
    id: string
    blockId: string
    noteId: string
    originalContent: string
    proposedContent: string
    diffHunks: DiffHunk[]
    status: 'pending' | 'accepted' | 'rejected'
    createdAt: Date
}

export interface DiffHunk {
    oldStart: number
    oldLines: number
    newStart: number
    newLines: number
    content: string
    type: 'add' | 'remove' | 'context'
}

export type AIStatus = 'idle' | 'streaming' | 'tool-calling' | 'thinking' | 'error'

// ============================================================================
// Store Definition
// ============================================================================

export const useAIStore = defineStore('ai', () => {
    // ---------------------------------------------------------------------------
    // State
    // ---------------------------------------------------------------------------

    // Sessions - using reactive object instead of Map for proper Vue reactivity
    const sessions = reactive<Record<string, ChatSession>>({})
    const activeSessionId = ref<string | null>(null)

    // Current interaction state
    const status = ref<AIStatus>('idle')
    const currentAgentType = ref<ChatSession['agentType']>(null)

    // Thinking steps (displayed during AI processing)
    const thinkingSteps = ref<ThinkingStep[]>([])

    // Citations (from RAG retrieval)
    const citations = ref<Citation[]>([])

    // Pending edits (proposed changes from Note agent)
    const pendingEdits = ref<PendingEdit[]>([])

    // Error state
    const error = ref<string | null>(null)

    // ---------------------------------------------------------------------------
    // Computed
    // ---------------------------------------------------------------------------

    const activeSession = computed(() => {
        if (!activeSessionId.value) return null
        return sessions[activeSessionId.value] || null
    })

    const isProcessing = computed(() =>
        status.value === 'streaming' ||
        status.value === 'tool-calling' ||
        status.value === 'thinking'
    )

    const currentThinkingStep = computed(() =>
        thinkingSteps.value.find(s => s.status === 'running')
    )

    const pendingEditCount = computed(() =>
        pendingEdits.value.filter(e => e.status === 'pending').length
    )

    // ---------------------------------------------------------------------------
    // Session Actions
    // ---------------------------------------------------------------------------

    function createSession(config: {
        agentType?: ChatSession['agentType']
        contextNoteIds?: string[]
        contextProjectId?: string | null
        title?: string
    }): ChatSession {
        const id = crypto.randomUUID()
        const session: ChatSession = {
            id,
            title: config.title || 'New Chat',
            agentType: config.agentType || null,
            contextNoteIds: config.contextNoteIds || [],
            contextProjectId: config.contextProjectId || null,
            messages: [],
            createdAt: new Date(),
            updatedAt: new Date(),
        }

        sessions[id] = session
        activeSessionId.value = id
        return session
    }

    function getOrCreateSession(
        sessionId?: string,
        config?: Parameters<typeof createSession>[0]
    ): ChatSession {
        if (sessionId && sessionId in sessions) {
            activeSessionId.value = sessionId
            return sessions[sessionId]
        }
        return createSession(config || {})
    }

    function setActiveSession(sessionId: string | null) {
        activeSessionId.value = sessionId
        // Clear transient state when switching sessions
        thinkingSteps.value = []
        citations.value = []
        error.value = null
    }

    function deleteSession(sessionId: string) {
        delete sessions[sessionId]
        if (activeSessionId.value === sessionId) {
            activeSessionId.value = null
        }
    }

    // ---------------------------------------------------------------------------
    // Message Actions
    // ---------------------------------------------------------------------------

    function addMessage(sessionId: string, message: Omit<ChatMessage, 'id' | 'createdAt'>): ChatMessage {
        const session = sessions[sessionId]
        if (!session) throw new Error(`Session ${sessionId} not found`)

        const newMessage: ChatMessage = {
            id: crypto.randomUUID(),
            createdAt: new Date(),
            ...message,
        }

        session.messages.push(newMessage)
        session.updatedAt = new Date()
        return newMessage
    }

    function appendToLastMessage(sessionId: string, textDelta: string) {
        const session = sessions[sessionId]
        if (!session) return

        const lastMessage = session.messages[session.messages.length - 1]
        if (lastMessage && lastMessage.role === 'assistant') {
            lastMessage.content += textDelta
        }
    }

    function updateMessage(sessionId: string, messageId: string, updates: Partial<ChatMessage>) {
        const session = sessions[sessionId]
        if (!session) return

        const message = session.messages.find(m => m.id === messageId)
        if (message) {
            Object.assign(message, updates)
        }
    }

    // ---------------------------------------------------------------------------
    // Thinking Steps Actions
    // ---------------------------------------------------------------------------

    function addThinkingStep(step: Omit<ThinkingStep, 'id' | 'startedAt'>): ThinkingStep {
        const newStep: ThinkingStep = {
            id: crypto.randomUUID(),
            startedAt: new Date(),
            ...step,
        }
        thinkingSteps.value.push(newStep)
        return newStep
    }

    function completeThinkingStep(stepId: string, errorMessage?: string) {
        const step = thinkingSteps.value.find(s => s.id === stepId)
        if (step) {
            step.status = errorMessage ? 'error' : 'complete'
            step.completedAt = new Date()
            step.durationMs = step.completedAt.getTime() - step.startedAt.getTime()
            if (errorMessage) step.errorMessage = errorMessage
        }
    }

    function clearThinkingSteps() {
        thinkingSteps.value = []
    }

    // ---------------------------------------------------------------------------
    // Citation Actions
    // ---------------------------------------------------------------------------

    function addCitation(citation: Omit<Citation, 'number'>): Citation {
        const number = citations.value.length + 1
        const newCitation = { ...citation, number }
        citations.value.push(newCitation)
        return newCitation
    }

    function clearCitations() {
        citations.value = []
    }

    function setCitationsFromChunks(chunks: RetrievedChunk[]) {
        citations.value = chunks.map((chunk, index) => ({
            number: index + 1,
            noteId: chunk.noteId,
            title: chunk.noteTitle,
            snippet: chunk.chunkText.slice(0, 200),
            source: 'note' as const,
        }))
    }

    // ---------------------------------------------------------------------------
    // Pending Edit Actions
    // ---------------------------------------------------------------------------

    function addPendingEdit(edit: Omit<PendingEdit, 'id' | 'status' | 'createdAt'>): PendingEdit {
        const newEdit: PendingEdit = {
            id: crypto.randomUUID(),
            status: 'pending',
            createdAt: new Date(),
            ...edit,
        }
        pendingEdits.value.push(newEdit)
        return newEdit
    }

    function acceptEdit(editId: string) {
        const edit = pendingEdits.value.find(e => e.id === editId)
        if (edit) {
            edit.status = 'accepted'
        }
    }

    function rejectEdit(editId: string) {
        const edit = pendingEdits.value.find(e => e.id === editId)
        if (edit) {
            edit.status = 'rejected'
        }
    }

    function clearPendingEdits(noteId?: string) {
        if (noteId) {
            pendingEdits.value = pendingEdits.value.filter(e => e.noteId !== noteId)
        } else {
            pendingEdits.value = []
        }
    }

    // ---------------------------------------------------------------------------
    // Status Actions
    // ---------------------------------------------------------------------------

    function setStatus(newStatus: AIStatus) {
        status.value = newStatus
        if (newStatus === 'idle' || newStatus === 'error') {
            // Complete any running thinking steps
            thinkingSteps.value
                .filter(s => s.status === 'running')
                .forEach(s => completeThinkingStep(s.id))
        }
    }

    function setError(errorMessage: string | null) {
        error.value = errorMessage
        if (errorMessage) {
            status.value = 'error'
        }
    }

    function clearError() {
        error.value = null
        if (status.value === 'error') {
            status.value = 'idle'
        }
    }

    // ---------------------------------------------------------------------------
    // Reset
    // ---------------------------------------------------------------------------

    function reset() {
        // Clear all sessions by deleting each key
        for (const key of Object.keys(sessions)) {
            delete sessions[key]
        }
        activeSessionId.value = null
        status.value = 'idle'
        currentAgentType.value = null
        thinkingSteps.value = []
        citations.value = []
        pendingEdits.value = []
        error.value = null
    }

    // ---------------------------------------------------------------------------
    // Return
    // ---------------------------------------------------------------------------

    return {
        // State
        sessions,
        activeSessionId,
        status,
        currentAgentType,
        thinkingSteps,
        citations,
        pendingEdits,
        error,

        // Computed
        activeSession,
        isProcessing,
        currentThinkingStep,
        pendingEditCount,

        // Session actions
        createSession,
        getOrCreateSession,
        setActiveSession,
        deleteSession,

        // Message actions
        addMessage,
        appendToLastMessage,
        updateMessage,

        // Thinking steps
        addThinkingStep,
        completeThinkingStep,
        clearThinkingSteps,

        // Citations
        addCitation,
        clearCitations,
        setCitationsFromChunks,

        // Pending edits
        addPendingEdit,
        acceptEdit,
        rejectEdit,
        clearPendingEdits,

        // Status
        setStatus,
        setError,
        clearError,

        // Reset
        reset,
    }
})
