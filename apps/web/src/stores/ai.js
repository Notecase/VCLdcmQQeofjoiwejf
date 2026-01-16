/**
 * AI Store
 *
 * Pinia store for AI state management, ported from Note3's Zustand-based aiStore.
 * Manages chat sessions, thinking steps, citations, and pending edits.
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
// ============================================================================
// Store Definition
// ============================================================================
export const useAIStore = defineStore('ai', () => {
    // ---------------------------------------------------------------------------
    // State
    // ---------------------------------------------------------------------------
    // Sessions
    const sessions = ref(new Map());
    const activeSessionId = ref(null);
    // Current interaction state
    const status = ref('idle');
    const currentAgentType = ref(null);
    // Thinking steps (displayed during AI processing)
    const thinkingSteps = ref([]);
    // Citations (from RAG retrieval)
    const citations = ref([]);
    // Pending edits (proposed changes from Note agent)
    const pendingEdits = ref([]);
    // Error state
    const error = ref(null);
    // ---------------------------------------------------------------------------
    // Computed
    // ---------------------------------------------------------------------------
    const activeSession = computed(() => {
        if (!activeSessionId.value)
            return null;
        return sessions.value.get(activeSessionId.value) || null;
    });
    const isProcessing = computed(() => status.value === 'streaming' ||
        status.value === 'tool-calling' ||
        status.value === 'thinking');
    const currentThinkingStep = computed(() => thinkingSteps.value.find(s => s.status === 'running'));
    const pendingEditCount = computed(() => pendingEdits.value.filter(e => e.status === 'pending').length);
    // ---------------------------------------------------------------------------
    // Session Actions
    // ---------------------------------------------------------------------------
    function createSession(config) {
        const id = crypto.randomUUID();
        const session = {
            id,
            title: config.title || 'New Chat',
            agentType: config.agentType || null,
            contextNoteIds: config.contextNoteIds || [],
            contextProjectId: config.contextProjectId || null,
            messages: [],
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        sessions.value.set(id, session);
        activeSessionId.value = id;
        return session;
    }
    function getOrCreateSession(sessionId, config) {
        if (sessionId && sessions.value.has(sessionId)) {
            activeSessionId.value = sessionId;
            return sessions.value.get(sessionId);
        }
        return createSession(config || {});
    }
    function setActiveSession(sessionId) {
        activeSessionId.value = sessionId;
        // Clear transient state when switching sessions
        thinkingSteps.value = [];
        citations.value = [];
        error.value = null;
    }
    function deleteSession(sessionId) {
        sessions.value.delete(sessionId);
        if (activeSessionId.value === sessionId) {
            activeSessionId.value = null;
        }
    }
    // ---------------------------------------------------------------------------
    // Message Actions
    // ---------------------------------------------------------------------------
    function addMessage(sessionId, message) {
        const session = sessions.value.get(sessionId);
        if (!session)
            throw new Error(`Session ${sessionId} not found`);
        const newMessage = {
            id: crypto.randomUUID(),
            createdAt: new Date(),
            ...message,
        };
        session.messages.push(newMessage);
        session.updatedAt = new Date();
        return newMessage;
    }
    function appendToLastMessage(sessionId, textDelta) {
        const session = sessions.value.get(sessionId);
        if (!session)
            return;
        const lastMessage = session.messages[session.messages.length - 1];
        if (lastMessage && lastMessage.role === 'assistant') {
            lastMessage.content += textDelta;
        }
    }
    function updateMessage(sessionId, messageId, updates) {
        const session = sessions.value.get(sessionId);
        if (!session)
            return;
        const message = session.messages.find(m => m.id === messageId);
        if (message) {
            Object.assign(message, updates);
        }
    }
    // ---------------------------------------------------------------------------
    // Thinking Steps Actions
    // ---------------------------------------------------------------------------
    function addThinkingStep(step) {
        const newStep = {
            id: crypto.randomUUID(),
            startedAt: new Date(),
            ...step,
        };
        thinkingSteps.value.push(newStep);
        return newStep;
    }
    function completeThinkingStep(stepId, errorMessage) {
        const step = thinkingSteps.value.find(s => s.id === stepId);
        if (step) {
            step.status = errorMessage ? 'error' : 'complete';
            step.completedAt = new Date();
            step.durationMs = step.completedAt.getTime() - step.startedAt.getTime();
            if (errorMessage)
                step.errorMessage = errorMessage;
        }
    }
    function clearThinkingSteps() {
        thinkingSteps.value = [];
    }
    // ---------------------------------------------------------------------------
    // Citation Actions
    // ---------------------------------------------------------------------------
    function addCitation(citation) {
        const number = citations.value.length + 1;
        const newCitation = { ...citation, number };
        citations.value.push(newCitation);
        return newCitation;
    }
    function clearCitations() {
        citations.value = [];
    }
    function setCitationsFromChunks(chunks) {
        citations.value = chunks.map((chunk, index) => ({
            number: index + 1,
            noteId: chunk.noteId,
            title: chunk.noteTitle,
            snippet: chunk.chunkText.slice(0, 200),
            source: 'note',
        }));
    }
    // ---------------------------------------------------------------------------
    // Pending Edit Actions
    // ---------------------------------------------------------------------------
    function addPendingEdit(edit) {
        const newEdit = {
            id: crypto.randomUUID(),
            status: 'pending',
            createdAt: new Date(),
            ...edit,
        };
        pendingEdits.value.push(newEdit);
        return newEdit;
    }
    function acceptEdit(editId) {
        const edit = pendingEdits.value.find(e => e.id === editId);
        if (edit) {
            edit.status = 'accepted';
        }
    }
    function rejectEdit(editId) {
        const edit = pendingEdits.value.find(e => e.id === editId);
        if (edit) {
            edit.status = 'rejected';
        }
    }
    function clearPendingEdits(noteId) {
        if (noteId) {
            pendingEdits.value = pendingEdits.value.filter(e => e.noteId !== noteId);
        }
        else {
            pendingEdits.value = [];
        }
    }
    // ---------------------------------------------------------------------------
    // Status Actions
    // ---------------------------------------------------------------------------
    function setStatus(newStatus) {
        status.value = newStatus;
        if (newStatus === 'idle' || newStatus === 'error') {
            // Complete any running thinking steps
            thinkingSteps.value
                .filter(s => s.status === 'running')
                .forEach(s => completeThinkingStep(s.id));
        }
    }
    function setError(errorMessage) {
        error.value = errorMessage;
        if (errorMessage) {
            status.value = 'error';
        }
    }
    function clearError() {
        error.value = null;
        if (status.value === 'error') {
            status.value = 'idle';
        }
    }
    // ---------------------------------------------------------------------------
    // Reset
    // ---------------------------------------------------------------------------
    function reset() {
        sessions.value.clear();
        activeSessionId.value = null;
        status.value = 'idle';
        currentAgentType.value = null;
        thinkingSteps.value = [];
        citations.value = [];
        pendingEdits.value = [];
        error.value = null;
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
    };
});
