/**
 * AI Store
 *
 * Pinia store for AI state management, ported from Note3's Zustand-based aiStore.
 * Manages chat sessions, thinking steps, citations, and pending edits.
 */

import { defineStore } from 'pinia'
import { ref, computed, reactive } from 'vue'
import {
  createArtifact,
  getPendingArtifacts,
  getArtifacts as fetchAllArtifacts,
  markArtifactInserted as markArtifactInsertedDB,
  type Artifact,
} from '../services/artifacts.service'

// ============================================================================
// Types (ported from Note3)
// ============================================================================

export interface ChatSession {
  id: string
  title: string
  agentType: 'chat' | 'secretary' | 'note' | 'planner' | 'course' | 'slides' | 'research' | null
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
    | 'thought' // General reasoning
    | 'search' // Web/note search
    | 'read' // Reading blocks/notes
    | 'write' // Writing/editing
    | 'create' // Creating databases/artifacts
    | 'tool' // Other tool execution
    | 'analyze' // Analysis operations
    | 'explore' // Exploration
    | 'reasoning' // Extended reasoning
  description: string
  status: 'running' | 'complete' | 'error'
  startedAt: Date
  completedAt?: Date
  durationMs?: number
  errorMessage?: string
  messageId?: string // Links to the assistant message being generated
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

export type DiffHunkStatus = 'pending' | 'accepted' | 'rejected'

export interface DiffHunk {
  id: string
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  oldContent: string
  newContent: string
  type: 'add' | 'remove' | 'modify' | 'context'
  status: DiffHunkStatus
}

export type AIStatus = 'idle' | 'streaming' | 'tool-calling' | 'thinking' | 'clarifying' | 'error'

/**
 * CodePreviewState - Tracks real-time code generation during artifact streaming
 */
export interface CodePreviewState {
  active: boolean
  phase: 'html' | 'css' | 'javascript'
  preview: string
  totalChars: number
}

/**
 * ClarificationRequest - Shown when AI needs user to select target section
 */
export interface ClarificationRequest {
  id: string
  noteId: string
  instruction: string // Original user instruction
  options: ClarificationOption[]
  reason: string
  status: 'pending' | 'resolved' | 'cancelled'
  createdAt: Date
}

export interface ClarificationOption {
  id: string
  label: string
  preview: string
  line: number
}

/**
 * DiffBlockPair - Tracks a pair of injected blocks for inline diff visualization
 *
 * When the AI proposes an edit, we inject TWO real paragraph blocks into Muya:
 * 1. Original block (styled as deletion - red strikethrough)
 * 2. Proposed block (styled as addition - green highlight)
 *
 * Both blocks have action buttons for accept/reject. This approach ensures
 * the diff hunks scroll naturally with the editor content.
 */
export interface DiffBlockPair {
  id: string
  editId: string
  hunkId: string
  noteId: string
  originalBlockIndex: number // Index in scrollPage.children (before injection)
  proposedBlockIndex: number // Index of inserted proposed block
  proposedBlockCount: number // Number of blocks created for this hunk (tables/headings parsed from markdown)
  originalContent: string
  proposedContent: string
  status: 'pending' | 'accepted' | 'rejected'
}

/**
 * DiffBlock - Tracks an INDIVIDUAL block for per-block accept/reject
 *
 * Each block from a hunk gets its own unique blockId, allowing users to
 * accept or reject individual blocks instead of all blocks from a hunk together.
 */
export interface DiffBlock {
  id: string // Unique block ID
  editId: string // Parent edit
  hunkId: string // Parent hunk
  noteId: string
  blockIndex: number // Index within hunk's blocks
  blockType: string // 'atx-heading', 'paragraph', 'table', etc.
  content: string // This block's content
  status: 'pending' | 'accepted' | 'rejected'
  isOriginal: boolean // true = deletion block, false = addition block
  hunkIndex?: number // Position among all hunks (0, 1, 2...) for ordering
  hunkNewStart?: number // Line number from DiffHunk for visual alignment
}

/**
 * PendingArtifact - Tracks artifacts created by AI before insertion into notes
 */
export interface PendingArtifact {
  id: string
  artifactId?: string // Database record ID for persistence
  noteId: string
  sessionId?: string // Chat session ID for linking
  data: {
    title: string
    html: string
    css: string
    javascript: string
  }
  status: 'pending' | 'inserted'
  createdAt: Date
}

/**
 * CompletedArtifact - Links completed artifacts to chat messages for UI rendering
 */
export interface CompletedArtifact {
  id: string
  title: string
  noteId: string
  sessionId: string
  messageId: string // Links to assistant message for rendering in ChatMessage
  createdAt: Date
}

/**
 * SubagentTracker - Tracks a subagent's lifecycle from multi-mode streaming.
 * Used for inline subagent progress cards and synthesis indicators.
 */
export interface SubagentTracker {
  id: string
  name: string
  description: string
  status: 'pending' | 'running' | 'complete' | 'error'
  lastMessage: string
  startedAt: number
  completedAt?: number
  elapsedMs?: number
}

/**
 * SubTask - Tracks individual tasks from DeepAgent decomposition
 * Used when processing compound requests with multiple outputs
 */
export interface SubTask {
  id: string
  type: 'edit_note' | 'create_artifact' | 'database_action' | 'chat'
  description: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  progress: number // 0-100
  progressMessage?: string
  dependsOn?: string[]
  result?: unknown
  startedAt?: Date
  completedAt?: Date
}

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
  // Thinking steps (displayed during AI processing)
  const thinkingSteps = ref<ThinkingStep[]>([])

  // Citations (from RAG retrieval)
  const citations = ref<Citation[]>([])

  // Pending edits (proposed changes from Note agent)
  const pendingEdits = ref<PendingEdit[]>([])

  // Active edit for inline diff visualization (deprecated - hunks now shown inline)
  const activeEditId = ref<string | null>(null)

  // Diff block pairs - tracks injected block pairs for true inline diff visualization
  const diffBlockPairs = ref<DiffBlockPair[]>([])

  // Individual diff blocks - tracks each block separately for per-block accept/reject
  const diffBlocks = ref<DiffBlock[]>([])

  // Pending artifacts - artifacts created by AI awaiting insertion
  const pendingArtifacts = ref<PendingArtifact[]>([])

  // Completed artifacts - links artifacts to chat messages for UI rendering
  const completedArtifacts = ref<CompletedArtifact[]>([])

  // Code preview state for streaming artifacts
  const codePreview = ref<CodePreviewState>({
    active: false,
    phase: 'html',
    preview: '',
    totalChars: 0,
  })

  // Error state
  const error = ref<string | null>(null)

  // Clarification request (when AI needs user to select target section)
  const pendingClarification = ref<ClarificationRequest | null>(null)

  // SubTasks from DeepAgent decomposition (for compound requests)
  const subTasks = ref<SubTask[]>([])

  // Subagent trackers (multi-mode streaming)
  const activeSubagents = ref<SubagentTracker[]>([])
  const isSynthesizing = ref(false)

  // Note preview panel (AI Chat page - right panel showing note being edited)
  const previewNoteId = ref<string | null>(null)
  const previewPanelVisible = ref(false)

  // ---------------------------------------------------------------------------
  // Computed
  // ---------------------------------------------------------------------------

  const activeSession = computed(() => {
    if (!activeSessionId.value) return null
    return sessions[activeSessionId.value] || null
  })

  const isProcessing = computed(
    () =>
      status.value === 'streaming' || status.value === 'tool-calling' || status.value === 'thinking'
  )

  const currentThinkingStep = computed(() =>
    thinkingSteps.value.find((s) => s.status === 'running')
  )

  const pendingEditCount = computed(
    () => pendingEdits.value.filter((e) => e.status === 'pending').length
  )

  const activeEdit = computed(() => {
    if (!activeEditId.value) return null
    return pendingEdits.value.find((e) => e.id === activeEditId.value) || null
  })

  // Get all pending hunks across all edits for a specific note
  const getPendingHunksForNote = (noteId: string) => {
    return pendingEdits.value
      .filter((e) => e.noteId === noteId && e.status === 'pending')
      .flatMap((e) => e.diffHunks.filter((h) => h.status === 'pending'))
  }

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

  function addMessage(
    sessionId: string,
    message: Omit<ChatMessage, 'id' | 'createdAt'>
  ): ChatMessage {
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

    const message = session.messages.find((m) => m.id === messageId)
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
    const step = thinkingSteps.value.find((s) => s.id === stepId)
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

  /**
   * Get thinking steps linked to a specific message
   */
  function getThinkingStepsForMessage(messageId: string): ThinkingStep[] {
    return thinkingSteps.value.filter((s) => s.messageId === messageId)
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
    const edit = pendingEdits.value.find((e) => e.id === editId)
    if (edit) {
      edit.status = 'accepted'
    }
  }

  function rejectEdit(editId: string) {
    const edit = pendingEdits.value.find((e) => e.id === editId)
    if (edit) {
      edit.status = 'rejected'
    }
  }

  function clearPendingEdits(noteId?: string) {
    if (noteId) {
      pendingEdits.value = pendingEdits.value.filter((e) => e.noteId !== noteId)
    } else {
      pendingEdits.value = []
    }
    // Clear active edit if it was removed
    if (activeEditId.value && !pendingEdits.value.find((e) => e.id === activeEditId.value)) {
      activeEditId.value = null
    }
  }

  // ---------------------------------------------------------------------------
  // Hunk-Level Actions (for inline diff visualization)
  // ---------------------------------------------------------------------------

  function setActiveEdit(editId: string | null) {
    activeEditId.value = editId
  }

  function acceptHunk(editId: string, hunkId: string) {
    const edit = pendingEdits.value.find((e) => e.id === editId)
    if (!edit) return

    const hunk = edit.diffHunks.find((h) => h.id === hunkId)
    if (hunk) {
      hunk.status = 'accepted'
    }
  }

  function rejectHunk(editId: string, hunkId: string) {
    const edit = pendingEdits.value.find((e) => e.id === editId)
    if (!edit) return

    const hunk = edit.diffHunks.find((h) => h.id === hunkId)
    if (hunk) {
      hunk.status = 'rejected'
    }
  }

  function acceptAllHunks(editId: string) {
    const edit = pendingEdits.value.find((e) => e.id === editId)
    if (!edit) return

    edit.diffHunks.forEach((hunk) => {
      if (hunk.status === 'pending') {
        hunk.status = 'accepted'
      }
    })
  }

  function rejectAllHunks(editId: string) {
    const edit = pendingEdits.value.find((e) => e.id === editId)
    if (!edit) return

    edit.diffHunks.forEach((hunk) => {
      if (hunk.status === 'pending') {
        hunk.status = 'rejected'
      }
    })
  }

  /**
   * Apply accepted hunks and return the final content
   * This merges only accepted changes into the original content
   */
  function applyAcceptedHunks(editId: string): string | null {
    const edit = pendingEdits.value.find((e) => e.id === editId)
    if (!edit) return null

    const originalLines = edit.originalContent.split('\n')
    const resultLines: string[] = []
    let originalIndex = 0

    // Sort hunks by oldStart to process in order
    const sortedHunks = [...edit.diffHunks].sort((a, b) => a.oldStart - b.oldStart)

    for (const hunk of sortedHunks) {
      // Add unchanged lines before this hunk
      while (originalIndex < hunk.oldStart - 1) {
        resultLines.push(originalLines[originalIndex])
        originalIndex++
      }

      if (hunk.status === 'accepted') {
        // Apply the new content
        if (hunk.newContent) {
          resultLines.push(...hunk.newContent.split('\n'))
        }
        // Skip the old lines
        originalIndex += hunk.oldLines
      } else {
        // Keep the old content (rejected or context)
        for (let i = 0; i < hunk.oldLines; i++) {
          if (originalIndex < originalLines.length) {
            resultLines.push(originalLines[originalIndex])
            originalIndex++
          }
        }
      }
    }

    // Add remaining lines
    while (originalIndex < originalLines.length) {
      resultLines.push(originalLines[originalIndex])
      originalIndex++
    }

    // Mark edit as accepted
    edit.status = 'accepted'

    return resultLines.join('\n')
  }

  function discardEdit(editId: string) {
    const edit = pendingEdits.value.find((e) => e.id === editId)
    if (edit) {
      edit.status = 'rejected'
    }
    if (activeEditId.value === editId) {
      activeEditId.value = null
    }
  }

  // ---------------------------------------------------------------------------
  // Diff Block Pair Actions (for true inline diff visualization)
  // ---------------------------------------------------------------------------

  /**
   * Add a diff block pair to track injected blocks
   * Accepts optional `id` to sync with DOM elements - if not provided, generates a new one
   */
  function addDiffBlockPair(pair: Omit<DiffBlockPair, 'status'> & { id?: string }): DiffBlockPair {
    const newPair: DiffBlockPair = {
      id: pair.id || crypto.randomUUID(),
      status: 'pending',
      editId: pair.editId,
      hunkId: pair.hunkId,
      noteId: pair.noteId,
      originalBlockIndex: pair.originalBlockIndex,
      proposedBlockIndex: pair.proposedBlockIndex,
      proposedBlockCount: pair.proposedBlockCount ?? 1,
      originalContent: pair.originalContent,
      proposedContent: pair.proposedContent,
    }
    diffBlockPairs.value.push(newPair)
    return newPair
  }

  /**
   * Update a diff block pair status
   */
  function updateDiffBlockPair(id: string, status: 'accepted' | 'rejected') {
    const pair = diffBlockPairs.value.find((p) => p.id === id)
    if (pair) {
      pair.status = status
    }
  }

  /**
   * Get all diff block pairs for a specific note
   */
  function getDiffBlockPairsForNote(noteId: string): DiffBlockPair[] {
    return diffBlockPairs.value.filter((p) => p.noteId === noteId && p.status === 'pending')
  }

  /**
   * Clear diff block pairs for a specific note or all pairs
   */
  function clearDiffBlockPairs(noteId?: string) {
    if (noteId) {
      diffBlockPairs.value = diffBlockPairs.value.filter((p) => p.noteId !== noteId)
    } else {
      diffBlockPairs.value = []
    }
  }

  // ---------------------------------------------------------------------------
  // Individual Diff Block Actions (for per-block accept/reject)
  // ---------------------------------------------------------------------------

  /**
   * Add an individual diff block to track
   */
  function addDiffBlock(block: Omit<DiffBlock, 'status'> & { id?: string }): DiffBlock {
    const newBlock: DiffBlock = {
      id: block.id || crypto.randomUUID(),
      status: 'pending',
      editId: block.editId,
      hunkId: block.hunkId,
      noteId: block.noteId,
      blockIndex: block.blockIndex,
      blockType: block.blockType,
      content: block.content,
      isOriginal: block.isOriginal,
    }
    diffBlocks.value.push(newBlock)
    return newBlock
  }

  /**
   * Update an individual diff block status
   */
  function updateDiffBlock(id: string, status: 'accepted' | 'rejected') {
    const block = diffBlocks.value.find((b) => b.id === id)
    if (block) {
      block.status = status
    }
  }

  /**
   * Get a specific diff block by ID
   */
  function getDiffBlock(id: string): DiffBlock | undefined {
    return diffBlocks.value.find((b) => b.id === id)
  }

  /**
   * Get all diff blocks for a specific note
   */
  function getDiffBlocksForNote(noteId: string): DiffBlock[] {
    return diffBlocks.value.filter((b) => b.noteId === noteId && b.status === 'pending')
  }

  /**
   * Get all diff blocks for a specific hunk
   */
  function getDiffBlocksForHunk(hunkId: string): DiffBlock[] {
    return diffBlocks.value.filter((b) => b.hunkId === hunkId)
  }

  /**
   * Check if all blocks for a note are resolved (accepted or rejected)
   */
  function areAllBlocksResolved(noteId: string): boolean {
    const blocks = diffBlocks.value.filter((b) => b.noteId === noteId)
    return blocks.length > 0 && blocks.every((b) => b.status !== 'pending')
  }

  /**
   * Clear diff blocks for a specific note or all blocks
   */
  function clearDiffBlocks(noteId?: string) {
    if (noteId) {
      diffBlocks.value = diffBlocks.value.filter((b) => b.noteId !== noteId)
    } else {
      diffBlocks.value = []
    }
  }

  // ---------------------------------------------------------------------------
  // Clarification Actions
  // ---------------------------------------------------------------------------

  /**
   * Set a pending clarification request
   */
  function setClarificationRequest(request: {
    noteId: string
    instruction: string
    options: ClarificationOption[]
    reason: string
  }): ClarificationRequest {
    const clarification: ClarificationRequest = {
      id: crypto.randomUUID(),
      noteId: request.noteId,
      instruction: request.instruction,
      options: request.options,
      reason: request.reason,
      status: 'pending',
      createdAt: new Date(),
    }
    pendingClarification.value = clarification
    status.value = 'clarifying'
    return clarification
  }

  /**
   * Resolve clarification with selected block IDs
   */
  function resolveClarification(selectedBlockIds: string[]): string[] {
    if (pendingClarification.value) {
      pendingClarification.value.status = 'resolved'
      pendingClarification.value = null
    }
    status.value = 'idle'
    return selectedBlockIds
  }

  /**
   * Cancel pending clarification
   */
  function cancelClarification() {
    if (pendingClarification.value) {
      pendingClarification.value.status = 'cancelled'
      pendingClarification.value = null
    }
    status.value = 'idle'
  }

  /**
   * Check if there's a pending clarification
   */
  const hasPendingClarification = computed(() => pendingClarification.value !== null)

  // ---------------------------------------------------------------------------
  // Pre-Action Question (HITL proactive AI questions)
  // ---------------------------------------------------------------------------

  const preActionQuestion = ref<{
    id: string
    question: string
    options: Array<{ id: string; label: string; description?: string }>
    allowFreeText?: boolean
    context?: string
  } | null>(null)

  /**
   * Set a pending pre-action question from the AI
   */
  function setPreActionQuestion(question: {
    id: string
    question: string
    options: Array<{ id: string; label: string; description?: string }>
    allowFreeText?: boolean
    context?: string
  }) {
    preActionQuestion.value = question
  }

  /**
   * Resolve the pre-action question (user selected an option or typed free text)
   */
  function resolvePreActionQuestion() {
    preActionQuestion.value = null
  }

  // ---------------------------------------------------------------------------
  // SubTask Actions (DeepAgent compound request tracking)
  // ---------------------------------------------------------------------------

  /**
   * Set the list of subtasks from DeepAgent decomposition
   */
  function setSubTasks(
    tasks: Array<{
      id: string
      type: 'edit_note' | 'create_artifact' | 'database_action' | 'chat'
      description: string
      dependsOn?: string[]
    }>
  ) {
    subTasks.value = tasks.map((t) => ({
      id: t.id,
      type: t.type,
      description: t.description,
      status: 'pending' as const,
      progress: 0,
      dependsOn: t.dependsOn || [],
    }))
  }

  /**
   * Update a subtask's status
   */
  function updateSubTask(taskId: string, updates: Partial<SubTask>) {
    const task = subTasks.value.find((t) => t.id === taskId)
    if (task) {
      Object.assign(task, updates)
      if (updates.status === 'in_progress') {
        task.startedAt = new Date()
      } else if (updates.status === 'completed' || updates.status === 'failed') {
        task.completedAt = new Date()
      }
    }
  }

  /**
   * Update a subtask's progress
   */
  function updateSubTaskProgress(taskId: string, progress: number, message?: string) {
    const task = subTasks.value.find((t) => t.id === taskId)
    if (task) {
      task.progress = progress
      task.progressMessage = message
    }
  }

  /**
   * Get subtasks in progress
   */
  const activeSubTasks = computed(() => subTasks.value.filter((t) => t.status === 'in_progress'))

  /**
   * Get completed subtask count
   */
  const completedSubTaskCount = computed(
    () => subTasks.value.filter((t) => t.status === 'completed').length
  )

  /**
   * Check if all subtasks are completed
   */
  const allSubTasksCompleted = computed(
    () =>
      subTasks.value.length > 0 &&
      subTasks.value.every((t) => t.status === 'completed' || t.status === 'failed')
  )

  /**
   * Clear all subtasks
   */
  function clearSubTasks() {
    subTasks.value = []
  }

  // ---------------------------------------------------------------------------
  // Subagent Tracker Actions (multi-mode streaming)
  // ---------------------------------------------------------------------------

  const subagentProgress = computed(() => {
    const total = activeSubagents.value.length
    const completed = activeSubagents.value.filter((s) => s.status === 'complete').length
    return {
      total,
      completed,
      percent: total === 0 ? 0 : Math.round((completed / total) * 100),
    }
  })

  function startSubagentTracker(data: {
    id: string
    name: string
    description?: string
    startedAt?: number
  }) {
    // Avoid duplicates
    if (activeSubagents.value.some((s) => s.id === data.id)) return

    activeSubagents.value.push({
      id: data.id,
      name: data.name,
      description: data.description || `Subagent ${data.name}`,
      status: 'running',
      lastMessage: '',
      startedAt: data.startedAt || Date.now(),
    })
  }

  function appendSubagentText(subagentId: string, text: string) {
    const sub = activeSubagents.value.find((s) => s.id === subagentId)
    if (sub) {
      sub.lastMessage += text
    }
  }

  function completeSubagentTracker(subagentId: string, result?: string) {
    const sub = activeSubagents.value.find((s) => s.id === subagentId)
    if (sub) {
      sub.status = 'complete'
      sub.completedAt = Date.now()
      sub.elapsedMs = sub.completedAt - sub.startedAt
      if (result) sub.lastMessage = result
    }
  }

  function clearSubagents() {
    activeSubagents.value = []
    isSynthesizing.value = false
  }

  function setSynthesizing(value: boolean) {
    isSynthesizing.value = value
  }

  // ---------------------------------------------------------------------------
  // Note Preview Panel Actions (AI Chat page)
  // ---------------------------------------------------------------------------

  function openNotePreview(noteId: string) {
    previewNoteId.value = noteId
    previewPanelVisible.value = true
  }

  function closeNotePreview() {
    previewPanelVisible.value = false
  }

  // ---------------------------------------------------------------------------
  // Status Actions
  // ---------------------------------------------------------------------------

  function setStatus(newStatus: AIStatus) {
    status.value = newStatus
    if (newStatus === 'idle' || newStatus === 'error') {
      // Complete any running thinking steps
      thinkingSteps.value
        .filter((s) => s.status === 'running')
        .forEach((s) => completeThinkingStep(s.id))
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
  // Pending Artifact Actions
  // ---------------------------------------------------------------------------

  /**
   * Add a pending artifact from AI generation
   * Persists to database for cross-session recovery
   */
  async function addPendingArtifact(
    noteId: string,
    data: PendingArtifact['data'],
    options?: { userId?: string; sessionId?: string }
  ): Promise<PendingArtifact> {
    const localId = crypto.randomUUID()
    let artifactId: string | undefined

    // Persist to database if userId is provided
    if (options?.userId) {
      try {
        const result = await createArtifact(options.userId, {
          note_id: noteId || null,
          session_id: options.sessionId || null,
          title: data.title,
          html: data.html,
          css: data.css,
          javascript: data.javascript,
          status: 'pending',
        })

        if (result.data && !Array.isArray(result.data)) {
          artifactId = result.data.id
          console.log('[AI Store] Artifact persisted to database:', artifactId)
        } else if (result.data && Array.isArray(result.data) && result.data.length > 0) {
          artifactId = result.data[0].id
          console.log('[AI Store] Artifact persisted to database:', artifactId)
        }
      } catch (err) {
        console.warn('[AI Store] Failed to persist artifact to database:', err)
        // Continue anyway - artifact will work in session, just won't persist
      }
    }

    const artifact: PendingArtifact = {
      id: localId,
      artifactId,
      noteId,
      sessionId: options?.sessionId,
      data,
      status: 'pending',
      createdAt: new Date(),
    }
    pendingArtifacts.value.push(artifact)
    return artifact
  }

  /**
   * Load persisted artifacts from database on app init or note change
   */
  async function loadPersistedArtifacts(userId: string, noteId?: string): Promise<void> {
    try {
      const result = noteId
        ? await fetchAllArtifacts(userId, { noteId, includeArchived: false })
        : await getPendingArtifacts(userId, noteId)

      if (result.error) {
        console.warn('[AI Store] Failed to load persisted artifacts:', result.error)
        return
      }

      if (result.data && result.data.length > 0) {
        // Convert database artifacts to PendingArtifact format
        // IMPORTANT: Use nullish coalescing (??) to ensure data fields are never undefined/null
        // This prevents JSON.stringify from silently omitting keys with undefined values
        const loadedArtifacts: PendingArtifact[] = result.data.map((dbArtifact: Artifact) => ({
          id: crypto.randomUUID(), // Local ID for this session
          artifactId: dbArtifact.id, // Database ID for persistence
          noteId: dbArtifact.note_id || '',
          sessionId: dbArtifact.session_id || undefined,
          data: {
            title: dbArtifact.title || 'Untitled Artifact',
            html: dbArtifact.html ?? '',
            css: dbArtifact.css ?? '',
            javascript: dbArtifact.javascript ?? '',
          },
          status: dbArtifact.status === 'inserted' ? 'inserted' : 'pending',
          createdAt: new Date(dbArtifact.created_at),
        }))

        // Merge with existing artifacts, avoiding duplicates by artifactId
        const existingArtifactIds = new Set(
          pendingArtifacts.value.filter((a) => a.artifactId).map((a) => a.artifactId)
        )

        const newArtifacts = loadedArtifacts.filter(
          (a) => !a.artifactId || !existingArtifactIds.has(a.artifactId)
        )

        if (newArtifacts.length > 0) {
          pendingArtifacts.value.push(...newArtifacts)
          console.log(`[AI Store] Loaded ${newArtifacts.length} persisted artifacts`)
        }
      }
    } catch (err) {
      console.warn('[AI Store] Failed to load persisted artifacts:', err)
    }
  }

  /**
   * Mark an artifact as inserted into the note
   * Updates both local state and database
   */
  async function markArtifactInserted(id: string): Promise<void> {
    const artifact = pendingArtifacts.value.find((a) => a.id === id)
    if (artifact) {
      artifact.status = 'inserted'

      // Update database if we have the artifactId
      if (artifact.artifactId) {
        try {
          await markArtifactInsertedDB(artifact.artifactId)
          console.log('[AI Store] Artifact marked as inserted in database:', artifact.artifactId)
        } catch (err) {
          console.warn('[AI Store] Failed to update artifact status in database:', err)
        }
      }
    }
  }

  /**
   * Get pending artifacts for a specific note
   */
  function getPendingArtifactsForNote(noteId: string): PendingArtifact[] {
    return pendingArtifacts.value.filter((a) => a.noteId === noteId && a.status === 'pending')
  }

  /**
   * Get ALL artifacts for a note (both pending and inserted).
   * Used by acceptAllDiffs() which needs inserted artifacts too,
   * since setMarkdown() will overwrite the DOM and destroy
   * artifacts that were auto-inserted by the EditorArea watcher.
   */
  function getArtifactsForNote(noteId: string): PendingArtifact[] {
    return pendingArtifacts.value.filter((a) => a.noteId === noteId)
  }

  /**
   * Clear pending artifacts for a note or all artifacts
   */
  function clearPendingArtifacts(noteId?: string) {
    if (noteId) {
      pendingArtifacts.value = pendingArtifacts.value.filter((a) => a.noteId !== noteId)
    } else {
      pendingArtifacts.value = []
    }
  }

  // ---------------------------------------------------------------------------
  // Completed Artifact Actions (for chat message UI)
  // ---------------------------------------------------------------------------

  /**
   * Add a completed artifact linked to a chat message
   */
  function addCompletedArtifact(
    artifact: Omit<CompletedArtifact, 'id' | 'createdAt'>
  ): CompletedArtifact {
    const newArtifact: CompletedArtifact = {
      id: crypto.randomUUID(),
      createdAt: new Date(),
      ...artifact,
    }
    completedArtifacts.value.push(newArtifact)
    return newArtifact
  }

  /**
   * Get completed artifacts for a specific message
   */
  function getCompletedArtifactsForMessage(messageId: string): CompletedArtifact[] {
    return completedArtifacts.value.filter((a) => a.messageId === messageId)
  }

  /**
   * Clear completed artifacts for a session or all artifacts
   */
  function clearCompletedArtifacts(sessionId?: string) {
    if (sessionId) {
      completedArtifacts.value = completedArtifacts.value.filter((a) => a.sessionId !== sessionId)
    } else {
      completedArtifacts.value = []
    }
  }

  // ---------------------------------------------------------------------------
  // Code Preview Actions (for streaming artifact visualization)
  // ---------------------------------------------------------------------------

  /**
   * Update code preview state during artifact streaming
   */
  function updateCodePreview(data: Omit<CodePreviewState, 'active'>) {
    codePreview.value = { ...data, active: true }
  }

  /**
   * Clear code preview state when artifact completes
   */
  function clearCodePreview() {
    codePreview.value = {
      active: false,
      phase: 'html',
      preview: '',
      totalChars: 0,
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
    thinkingSteps.value = []
    citations.value = []
    pendingEdits.value = []
    diffBlockPairs.value = []
    diffBlocks.value = []
    pendingArtifacts.value = []
    completedArtifacts.value = []
    codePreview.value = { active: false, phase: 'html', preview: '', totalChars: 0 }
    pendingClarification.value = null
    subTasks.value = []
    activeSubagents.value = []
    isSynthesizing.value = false
    previewNoteId.value = null
    previewPanelVisible.value = false
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
    thinkingSteps,
    citations,
    pendingEdits,
    activeEditId,
    diffBlockPairs,
    pendingClarification,
    subTasks,
    error,

    // Computed
    activeSession,
    isProcessing,
    currentThinkingStep,
    pendingEditCount,
    activeEdit,
    hasPendingClarification,
    getPendingHunksForNote,
    activeSubTasks,
    completedSubTaskCount,
    allSubTasksCompleted,

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
    getThinkingStepsForMessage,

    // Citations
    addCitation,
    clearCitations,
    setCitationsFromChunks,

    // Pending edits
    addPendingEdit,
    acceptEdit,
    rejectEdit,
    clearPendingEdits,

    // Hunk-level actions
    setActiveEdit,
    acceptHunk,
    rejectHunk,
    acceptAllHunks,
    rejectAllHunks,
    applyAcceptedHunks,
    discardEdit,

    // Diff block pair actions (true inline diff)
    addDiffBlockPair,
    updateDiffBlockPair,
    getDiffBlockPairsForNote,
    clearDiffBlockPairs,

    // Individual diff block actions (per-block accept/reject)
    diffBlocks,
    addDiffBlock,
    updateDiffBlock,
    getDiffBlock,
    getDiffBlocksForNote,
    getDiffBlocksForHunk,
    areAllBlocksResolved,
    clearDiffBlocks,

    // Clarification actions
    setClarificationRequest,
    resolveClarification,
    cancelClarification,

    // Pre-action question (HITL)
    preActionQuestion,
    setPreActionQuestion,
    resolvePreActionQuestion,

    // Note preview panel (AI Chat page)
    previewNoteId,
    previewPanelVisible,
    openNotePreview,
    closeNotePreview,

    // SubTask actions (DeepAgent compound request tracking)
    setSubTasks,
    updateSubTask,
    updateSubTaskProgress,
    clearSubTasks,

    // Subagent tracker actions (multi-mode streaming)
    activeSubagents,
    isSynthesizing,
    subagentProgress,
    startSubagentTracker,
    appendSubagentText,
    completeSubagentTracker,
    clearSubagents,
    setSynthesizing,

    // Pending artifact actions
    pendingArtifacts,
    addPendingArtifact,
    loadPersistedArtifacts,
    markArtifactInserted,
    getPendingArtifactsForNote,
    getArtifactsForNote,
    clearPendingArtifacts,

    // Completed artifact actions (chat message UI)
    completedArtifacts,
    addCompletedArtifact,
    getCompletedArtifactsForMessage,
    clearCompletedArtifacts,

    // Code preview actions (streaming artifact visualization)
    codePreview,
    updateCodePreview,
    clearCodePreview,

    // Status
    setStatus,
    setError,
    clearError,

    // Reset
    reset,
  }
})
