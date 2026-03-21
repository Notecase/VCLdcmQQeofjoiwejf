/**
 * AI Service
 *
 * Client-side service for communicating with agent API endpoints.
 * Handles SSE streaming and state management.
 */

import { useAIStore, type DiffHunk, type ThinkingStep } from '@/stores/ai'
import { useAuthStore } from '@/stores/auth'
import { useCreditsStore } from '@/stores/credits'
import { authFetch, authFetchSSE } from '@/utils/api'
import { buildEmptyAssistantFallback } from './ai.fallback'
import { isDemoMode } from '@/utils/demo'
import * as Diff from 'diff'

const API_BASE = import.meta.env.VITE_API_BASE || '/api/agent'

// ============================================================================
// Types
// ============================================================================

export interface AgentRequestOptions {
  input: string
  runtime?: 'legacy' | 'editor-deep'
  threadId?: string
  context?: {
    noteIds?: string[]
    projectId?: string
    workspaceId?: string
    currentNoteId?: string
    currentBlockId?: string
    selectedText?: string
    selectedBlockIds?: string[] // For clarification flow - user-selected targets (deprecated)
    selectedLineNumbers?: number[] // For clarification flow - line numbers are stable across re-parsing
  }
  editorContext?: {
    workspaceId?: string
    currentNoteId?: string
    currentBlockId?: string
    selectedBlockIds?: string[]
    selectedText?: string
    projectId?: string
    noteIds?: string[]
    selectedLineNumbers?: number[]
  }
  sessionId?: string
  stream?: boolean
}

export interface StreamChunk {
  type:
    | 'assistant-start'
    | 'assistant-delta'
    | 'assistant-final'
    | 'done'
    | 'text-delta'
    | 'thinking'
    | 'tool-call'
    | 'tool-result'
    | 'intent'
    | 'citation'
    | 'edit-proposal'
    | 'clarification-request'
    | 'clarification-requested'
    | 'artifact'
    | 'code-preview'
    | 'pre-action-question'
    | 'finish'
    | 'error'
    // DeepAgent events for compound request handling
    | 'decomposition'
    | 'subtask-start'
    | 'subtask-progress'
    | 'subtask-complete'
    | 'note-navigate'
    // Multi-mode streaming events (subagent lifecycle + custom progress)
    | 'subagent-start'
    | 'subagent-delta'
    | 'subagent-complete'
    | 'custom-progress'
    | 'synthesis-start'
  data: unknown
}

// DeepAgent event data types
export interface SubTaskData {
  id: string
  type: 'edit_note' | 'create_artifact' | 'database_action' | 'chat'
  description: string
  status?: 'pending' | 'in_progress' | 'completed' | 'failed'
  dependsOn?: string[]
}

export interface DecompositionData {
  tasks: SubTaskData[]
  reasoning: string
}

export interface SubtaskProgressData {
  taskId: string
  progress: number
  message: string
}

export interface ArtifactData {
  title: string
  html: string
  css: string
  javascript: string
  noteId: string | null
}

export interface EditProposalData {
  noteId: string
  blockId?: string
  original: string
  proposed: string
}

export interface ClarificationRequestData {
  options: Array<{
    id: string
    label: string
    preview: string
    line: number
  }>
  reason: string
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Send a message to the Secretary agent (main entry point)
 */
export async function sendToSecretary(options: AgentRequestOptions): Promise<string> {
  const store = useAIStore()

  try {
    store.setStatus('streaming')

    if (options.stream !== false) {
      return await streamFromAgent('secretary', options)
    }

    const response = await authFetch(`${API_BASE}/secretary`, {
      method: 'POST',
      body: JSON.stringify({
        input: options.input,
        runtime: options.runtime ?? 'editor-deep',
        threadId: options.threadId,
        context: options.context,
        editorContext: options.editorContext,
        sessionId: options.sessionId,
        stream: false,
      }),
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    const result = await response.json()
    store.setStatus('idle')
    return result.response
  } catch (err) {
    store.setError(err instanceof Error ? err.message : 'Unknown error')
    throw err
  }
}

/**
 * Send a message to the Chat agent
 */
export async function sendToChat(options: AgentRequestOptions): Promise<string> {
  const store = useAIStore()

  try {
    store.setStatus('streaming')

    if (options.stream !== false) {
      return await streamFromAgent('chat', options)
    }

    const response = await authFetch(`${API_BASE}/chat`, {
      method: 'POST',
      body: JSON.stringify({
        input: options.input,
        context: options.context,
        sessionId: options.sessionId,
        stream: false,
      }),
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    const result = await response.json()
    store.setStatus('idle')
    return result.content
  } catch (err) {
    store.setError(err instanceof Error ? err.message : 'Unknown error')
    throw err
  }
}

/**
 * Execute a note action
 */
export async function sendToNoteAgent(
  action: 'create' | 'update' | 'organize' | 'summarize' | 'expand',
  input: string,
  noteId?: string,
  projectId?: string
): Promise<string> {
  const store = useAIStore()

  try {
    store.setStatus('streaming')

    const response = await authFetchSSE(`${API_BASE}/note/action`, {
      method: 'POST',
      body: JSON.stringify({
        action,
        input,
        noteId,
        projectId,
        stream: true,
      }),
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    // Stream the response
    return await processSSEResponse(response, store)
  } catch (err) {
    store.setError(err instanceof Error ? err.message : 'Unknown error')
    throw err
  }
}

/**
 * Create a plan with the Planner agent
 */
export async function createPlan(
  goal: string,
  context?: string,
  constraints?: string[]
): Promise<{ success: boolean; plan?: unknown; message: string }> {
  const response = await authFetch(`${API_BASE}/planner/plan`, {
    method: 'POST',
    body: JSON.stringify({
      goal,
      context,
      constraints,
      stream: false,
    }),
  })

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`)
  }

  return response.json()
}

/**
 * Get agent capabilities
 */
export async function getAgentCapabilities(): Promise<{
  agents: Array<{
    type: string
    name: string
    description: string
    capabilities: string[]
    status: string
  }>
}> {
  const response = await authFetch(`${API_BASE}/capabilities`)
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`)
  }
  return response.json()
}

// ============================================================================
// Diff Computation
// ============================================================================

/**
 * Split markdown content into sections by heading levels (# through ######).
 * Each section includes the heading line + all content until the next heading.
 *
 * Example:
 *   "# Title\nIntro\n## Section 1\nContent" ->
 *   ["# Title\nIntro", "## Section 1\nContent"]
 */
function splitMarkdownBySections(markdown: string): string[] {
  const lines = markdown.split('\n')
  const sections: string[] = []
  let currentSection: string[] = []

  for (const line of lines) {
    // Check if line is a heading (# through ######)
    const isHeading = /^#{1,6}\s/.test(line)

    if (isHeading && currentSection.length > 0) {
      // Flush previous section
      sections.push(currentSection.join('\n').trim())
      currentSection = []
    }

    currentSection.push(line)
  }

  // Flush final section
  if (currentSection.length > 0) {
    const trimmed = currentSection.join('\n').trim()
    if (trimmed) {
      sections.push(trimmed)
    }
  }

  return sections
}

/**
 * Compute diff hunks from original and proposed content
 * Uses jsdiff to compute structural changes and groups them into logical hunks
 */
export function computeDiffHunks(original: string, proposed: string): DiffHunk[] {
  // Normalize trailing newlines to prevent jsdiff from treating
  // newline-only differences as 'modify' hunks instead of clean 'add' hunks.
  // This is critical for incremental edits (e.g., DeepAgent appending a table)
  // where the original content may lack a trailing newline from LLM streaming.
  const normalizedOriginal = original && !original.endsWith('\n') ? original + '\n' : original
  const normalizedProposed = proposed && !proposed.endsWith('\n') ? proposed + '\n' : proposed

  // Special case: empty note → new content = multiple addition hunks by section
  // This splits content at heading levels so users can accept/reject individual sections
  // Uses raw values (not normalized) to preserve existing section-split behavior
  if (!original.trim() && proposed.trim()) {
    const sections = splitMarkdownBySections(proposed)

    // If no headings found (single section or no headings), fall back to single hunk
    if (sections.length <= 1) {
      return [
        {
          id: crypto.randomUUID(),
          oldStart: 1,
          oldLines: 0,
          newStart: 1,
          newLines: proposed.split('\n').length,
          oldContent: '',
          newContent: proposed,
          type: 'add',
          status: 'pending',
        },
      ]
    }

    // Create one hunk per section
    let lineNumber = 1
    return sections.map((section) => {
      const sectionLines = section.split('\n').length
      const hunk: DiffHunk = {
        id: crypto.randomUUID(),
        oldStart: 1, // All sections "replace" nothing at line 1
        oldLines: 0,
        newStart: lineNumber,
        newLines: sectionLines,
        oldContent: '',
        newContent: section,
        type: 'add',
        status: 'pending',
      }
      lineNumber += sectionLines + 1 // +1 for blank line between sections
      return hunk
    })
  }

  const hunks: DiffHunk[] = []

  // Use structuredPatch to get unified diff hunks (with normalized inputs)
  const patch = Diff.structuredPatch(
    'original',
    'proposed',
    normalizedOriginal,
    normalizedProposed,
    '',
    '',
    {
      context: 3, // Include 3 lines of context around changes
    }
  )

  for (const hunk of patch.hunks) {
    let oldLineNum = hunk.oldStart
    let newLineNum = hunk.newStart

    // Group consecutive changes into logical blocks
    let currentHunk: {
      oldStart: number
      oldLines: string[]
      newLines: string[]
      type: 'add' | 'remove' | 'modify' | 'context'
    } | null = null

    const flushHunk = () => {
      if (!currentHunk) return

      const hunkType: 'add' | 'remove' | 'modify' | 'context' =
        currentHunk.oldLines.length === 0
          ? 'add'
          : currentHunk.newLines.length === 0
            ? 'remove'
            : 'modify'

      hunks.push({
        id: crypto.randomUUID(),
        oldStart: currentHunk.oldStart,
        oldLines: currentHunk.oldLines.length,
        newStart: newLineNum - currentHunk.newLines.length,
        newLines: currentHunk.newLines.length,
        oldContent: currentHunk.oldLines.join('\n'),
        newContent: currentHunk.newLines.join('\n'),
        type: hunkType,
        status: 'pending',
      })

      currentHunk = null
    }

    for (const line of hunk.lines) {
      const prefix = line[0]
      const content = line.slice(1)

      if (prefix === ' ') {
        // Context line - flush any pending hunk
        flushHunk()
        oldLineNum++
        newLineNum++
      } else if (prefix === '-') {
        // Removed line
        if (!currentHunk) {
          currentHunk = {
            oldStart: oldLineNum,
            oldLines: [],
            newLines: [],
            type: 'remove',
          }
        }
        currentHunk.oldLines.push(content)
        oldLineNum++
      } else if (prefix === '+') {
        // Added line
        if (!currentHunk) {
          currentHunk = {
            oldStart: oldLineNum,
            oldLines: [],
            newLines: [],
            type: 'add',
          }
        }
        currentHunk.newLines.push(content)
        newLineNum++
      }
    }

    // Flush any remaining hunk
    flushHunk()
  }

  return hunks
}

// ============================================================================
// Streaming Helpers
// ============================================================================

/**
 * Stream response from an agent endpoint
 */
async function streamFromAgent(agentType: string, options: AgentRequestOptions): Promise<string> {
  const store = useAIStore()

  const response = await authFetchSSE(`${API_BASE}/${agentType}`, {
    method: 'POST',
    body: JSON.stringify({
      input: options.input,
      runtime: options.runtime ?? 'editor-deep',
      threadId: options.threadId,
      context: options.context,
      editorContext: options.editorContext,
      sessionId: options.sessionId,
      stream: true,
    }),
  })

  if (!response.ok) {
    if (response.status === 402) {
      const creditsStore = useCreditsStore()
      creditsStore.markExhausted()
      throw new Error('CREDITS_EXHAUSTED')
    }
    throw new Error(`API error: ${response.status}`)
  }

  return await processSSEResponse(response, store)
}

/**
 * Process SSE response and update store
 */
async function processSSEResponse(
  response: Response,
  store: ReturnType<typeof useAIStore>
): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('No response body')
  }

  const decoder = new TextDecoder()
  let fullContent = ''
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // Process complete SSE messages
      const lines = buffer.split('\n')
      buffer = lines.pop() || '' // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          if (data === '[DONE]') continue

          try {
            const chunk: StreamChunk = JSON.parse(data)

            switch (chunk.type) {
              case 'assistant-start':
                store.setStatus('streaming')
                break

              case 'assistant-delta':
              case 'text-delta': {
                fullContent += chunk.data as string
                // Use activeSessionId directly to avoid computed property race condition
                // The computed activeSession can return null if sessions[id] lookup fails
                // during the brief window between session creation and state synchronization
                const sessionId = store.activeSessionId
                if (sessionId && store.sessions[sessionId]) {
                  store.appendToLastMessage(sessionId, chunk.data as string)
                } else {
                  console.warn(
                    '[AI Service] Received text-delta but no active session - chunk dropped:',
                    chunk.data
                  )
                }
                break
              }

              case 'assistant-final': {
                const finalText = typeof chunk.data === 'string' ? chunk.data : ''
                if (finalText && !fullContent.trim()) {
                  fullContent = finalText
                  const sessionId = store.activeSessionId
                  if (sessionId && store.sessions[sessionId]) {
                    store.appendToLastMessage(sessionId, finalText)
                  }
                }
                store.setStatus('idle')
                break
              }

              case 'done':
              case 'finish':
                store.setStatus('idle')
                break

              case 'error':
                store.setError(chunk.data as string)
                break

              case 'thinking': {
                // Add thinking step to store, linked to current assistant message
                const thinkingData = chunk.data as {
                  description: string
                  type?: ThinkingStep['type']
                }
                const runningThoughts = store.thinkingSteps.filter(
                  (step) => step.status === 'running' && step.type !== 'tool'
                )
                const lastRunningThought = runningThoughts[runningThoughts.length - 1]
                if (lastRunningThought) {
                  store.completeThinkingStep(lastRunningThought.id)
                }

                // Get current assistant message ID for linking
                const sessionId = store.activeSessionId
                const session = sessionId ? store.sessions[sessionId] : null
                const lastMessage = session?.messages[session.messages.length - 1]
                const messageId = lastMessage?.role === 'assistant' ? lastMessage.id : undefined

                store.addThinkingStep({
                  type: thinkingData.type || 'thought',
                  description: thinkingData.description || (thinkingData as unknown as string),
                  status: 'running',
                  messageId,
                })
                store.setStatus('thinking')
                break
              }

              case 'tool-call': {
                // Add tool call as thinking step, linked to current assistant message
                // Backend may send 'tool' or 'name' depending on the source
                const toolData = chunk.data as {
                  name?: string
                  tool?: string
                  toolName?: string
                  arguments?: Record<string, unknown>
                }
                const toolName = toolData.name || toolData.tool || toolData.toolName || 'unknown'
                const runningThoughts = store.thinkingSteps.filter(
                  (step) => step.status === 'running' && step.type !== 'tool'
                )
                const lastRunningThought = runningThoughts[runningThoughts.length - 1]
                if (lastRunningThought) {
                  store.completeThinkingStep(lastRunningThought.id)
                }

                // Get current assistant message ID for linking
                const sessionId = store.activeSessionId
                const session = sessionId ? store.sessions[sessionId] : null
                const lastMessage = session?.messages[session.messages.length - 1]
                const messageId = lastMessage?.role === 'assistant' ? lastMessage.id : undefined

                store.addThinkingStep({
                  type: 'tool',
                  description: `Calling ${toolName}...`,
                  status: 'running',
                  messageId,
                })
                store.setStatus('tool-calling')
                break
              }

              case 'tool-result': {
                // Complete the last tool thinking step
                const runningTools = store.thinkingSteps.filter(
                  (step) => step.status === 'running' && step.type === 'tool'
                )
                const stepToComplete =
                  runningTools[runningTools.length - 1] ||
                  store.thinkingSteps.filter((step) => step.status === 'running').slice(-1)[0]
                if (stepToComplete) {
                  store.completeThinkingStep(stepToComplete.id)
                }
                store.setStatus('streaming')
                break
              }

              case 'edit-proposal': {
                // Handle edit proposal - compute diff hunks and add to store
                const editData = chunk.data as EditProposalData
                const diffHunks = computeDiffHunks(editData.original, editData.proposed)

                const pendingEdit = store.addPendingEdit({
                  blockId: editData.blockId || '',
                  noteId: editData.noteId,
                  originalContent: editData.original,
                  proposedContent: editData.proposed,
                  diffHunks,
                })

                // Automatically activate this edit for inline visualization
                store.setActiveEdit(pendingEdit.id)

                // Auto-open preview panel if there's a noteId
                if (editData.noteId && !store.previewPanelVisible) {
                  store.openNotePreview(editData.noteId)
                }
                break
              }

              case 'clarification-request': {
                // Handle clarification request - AI needs user to select target section
                const clarificationData = chunk.data as ClarificationRequestData
                store.setClarificationRequest({
                  noteId: store.activeSession?.contextNoteIds?.[0] || '',
                  instruction: store.activeSession?.messages?.slice(-2)?.[0]?.content || '',
                  options: clarificationData.options,
                  reason: clarificationData.reason,
                })
                // Complete any running thinking steps
                const runningSteps = store.thinkingSteps.filter((step) => step.status === 'running')
                runningSteps.forEach((step) => store.completeThinkingStep(step.id))
                // Status is set to 'clarifying' inside setClarificationRequest
                break
              }

              case 'clarification-requested': {
                const clarificationData = chunk.data as {
                  options?: ClarificationRequestData['options']
                  reason?: string
                }
                store.setClarificationRequest({
                  noteId: store.activeSession?.contextNoteIds?.[0] || '',
                  instruction: store.activeSession?.messages?.slice(-2)?.[0]?.content || '',
                  options: clarificationData.options || [],
                  reason: clarificationData.reason || 'Please provide more context.',
                })
                const runningSteps = store.thinkingSteps.filter((step) => step.status === 'running')
                runningSteps.forEach((step) => store.completeThinkingStep(step.id))
                break
              }

              case 'code-preview': {
                // Handle code preview during artifact streaming
                const previewData = chunk.data as {
                  phase: 'html' | 'css' | 'javascript'
                  preview: string
                  totalChars: number
                }
                store.updateCodePreview(previewData)
                break
              }

              case 'pre-action-question': {
                // Handle proactive AI question before creating notes or major edits
                const questionData = chunk.data as {
                  id: string
                  question: string
                  options: Array<{ id: string; label: string; description?: string }>
                  allowFreeText?: boolean
                  context?: string
                }
                store.setPreActionQuestion(questionData)
                // Complete any running thinking steps
                const runningSteps2 = store.thinkingSteps.filter(
                  (step) => step.status === 'running'
                )
                runningSteps2.forEach((step) => store.completeThinkingStep(step.id))
                break
              }

              case 'artifact': {
                // Handle artifact creation - add to pending artifacts for insertion into editor
                const artifactData = chunk.data as ArtifactData
                const authStore = useAuthStore()

                // Clear the streaming preview when artifact completes
                store.clearCodePreview()

                const noteId = artifactData.noteId || store.activeSession?.contextNoteIds?.[0] || ''

                if (noteId) {
                  // Pass userId for database persistence
                  // Note: Don't pass sessionId - chat sessions aren't persisted to DB yet,
                  // so the local UUID would cause FK constraint violation (409 Conflict)
                  store.addPendingArtifact(
                    noteId,
                    {
                      title: artifactData.title,
                      html: artifactData.html,
                      css: artifactData.css,
                      javascript: artifactData.javascript,
                    },
                    {
                      userId: authStore.user?.id,
                    }
                  )

                  // Track completed artifact linked to the current assistant message for UI rendering
                  const session = store.activeSession
                  if (session && session.messages.length > 0) {
                    const lastMessage = session.messages[session.messages.length - 1]
                    if (lastMessage.role === 'assistant') {
                      store.addCompletedArtifact({
                        title: artifactData.title,
                        noteId,
                        sessionId: store.activeSessionId || '',
                        messageId: lastMessage.id,
                      })
                    }
                  }

                  console.log('[AI] Artifact added to pending:', artifactData.title)
                } else {
                  console.warn('[AI] Received artifact but no noteId available')
                }
                break
              }

              case 'intent':
              case 'citation':
                console.log(`[AI] ${chunk.type}:`, chunk.data)
                break

              // ===== DeepAgent Events =====

              case 'decomposition': {
                // Task decomposition from DeepAgent
                const decompositionData = chunk.data as DecompositionData
                store.setSubTasks(decompositionData.tasks)
                console.log('[AI] Task decomposition:', decompositionData.reasoning)
                break
              }

              case 'subtask-start': {
                // Subagent starting work on a task
                const startData = chunk.data as SubTaskData
                store.updateSubTask(startData.id, { status: 'in_progress' })

                // Get current assistant message ID for linking
                const sessionId = store.activeSessionId
                const session = sessionId ? store.sessions[sessionId] : null
                const lastMessage = session?.messages[session.messages.length - 1]
                const messageId = lastMessage?.role === 'assistant' ? lastMessage.id : undefined

                store.addThinkingStep({
                  type: 'create',
                  description: `Working on: ${startData.description}`,
                  status: 'running',
                  messageId,
                })
                store.setStatus('thinking')
                break
              }

              case 'subtask-progress': {
                // Progress update from subagent
                const progressData = chunk.data as SubtaskProgressData
                store.updateSubTaskProgress(
                  progressData.taskId,
                  progressData.progress,
                  progressData.message
                )
                break
              }

              case 'subtask-complete': {
                // Subagent completed task
                const completeData = chunk.data as { taskId: string; result: unknown }
                store.updateSubTask(completeData.taskId, { status: 'completed' })

                // Complete the thinking step
                const runningSteps = store.thinkingSteps.filter((step) => step.status === 'running')
                const lastRunningStep = runningSteps[runningSteps.length - 1]
                if (lastRunningStep) {
                  store.completeThinkingStep(lastRunningStep.id)
                }

                store.setStatus('streaming')
                break
              }

              // ===== Multi-Mode Streaming Events =====

              case 'subagent-start': {
                const subagentData = chunk.data as {
                  id: string
                  name: string
                  description: string
                  status: string
                  startedAt?: number
                }
                store.startSubagentTracker(subagentData)

                // Add as thinking step
                const sessionId = store.activeSessionId
                const session = sessionId ? store.sessions[sessionId] : null
                const lastMessage = session?.messages[session.messages.length - 1]
                const messageId = lastMessage?.role === 'assistant' ? lastMessage.id : undefined

                store.addThinkingStep({
                  type: 'create',
                  description: `Subagent: ${subagentData.name}`,
                  status: 'running',
                  messageId,
                })
                break
              }

              case 'subagent-delta': {
                const deltaData = chunk.data as { id: string; text: string }
                store.appendSubagentText(deltaData.id, deltaData.text)
                break
              }

              case 'subagent-complete': {
                const completeData = chunk.data as {
                  id: string
                  name: string
                  status: string
                  elapsedMs?: number
                  result?: string
                }
                store.completeSubagentTracker(completeData.id, completeData.result)

                // Complete the matching thinking step
                const runningSteps = store.thinkingSteps.filter(
                  (step) =>
                    step.status === 'running' &&
                    step.description.includes(completeData.name || completeData.id)
                )
                const lastRunning = runningSteps[runningSteps.length - 1]
                if (lastRunning) {
                  store.completeThinkingStep(lastRunning.id)
                }
                break
              }

              case 'custom-progress': {
                // Render as a thinking step
                const progressData = chunk.data as { step?: string; [key: string]: unknown }
                const sessionId = store.activeSessionId
                const session = sessionId ? store.sessions[sessionId] : null
                const lastMessage = session?.messages[session.messages.length - 1]
                const messageId = lastMessage?.role === 'assistant' ? lastMessage.id : undefined

                // Complete previous non-tool running steps
                const runningThoughts = store.thinkingSteps.filter(
                  (step) => step.status === 'running' && step.type !== 'tool'
                )
                const lastRunningThought = runningThoughts[runningThoughts.length - 1]
                if (lastRunningThought) {
                  store.completeThinkingStep(lastRunningThought.id)
                }

                store.addThinkingStep({
                  type: 'thought',
                  description: progressData.step || 'Processing...',
                  status: 'running',
                  messageId,
                })
                break
              }

              case 'synthesis-start': {
                store.setSynthesizing(true)
                break
              }

              case 'note-navigate': {
                // DeepAgent created a new note — open in preview panel + load in editor
                const navData = chunk.data as { noteId: string }
                store.openNotePreview(navData.noteId)
                const { useEditorStore } = await import('@/stores')
                const editorStore = useEditorStore()
                await editorStore.loadDocument(navData.noteId)
                // Refresh sidebar document list so the new note appears immediately
                await editorStore.loadDocuments()
                break
              }
            }
          } catch (err) {
            console.error('[AI Service] Failed to parse SSE chunk:', data, err)
          }
        }
      }
    }
    store.setStatus('idle')
    return fullContent
  } catch (error) {
    // Handle stream errors - ensure store state is updated
    store.setError(error instanceof Error ? error.message : 'Stream error')
    throw error
  } finally {
    reader.releaseLock()
  }
}

// ============================================================================
// Composable for Vue components
// ============================================================================

export function useAIChat() {
  const store = useAIStore()

  async function sendMessage(
    message: string,
    agentType: 'secretary' | 'chat' = 'secretary',
    context?: AgentRequestOptions['context']
  ) {
    if (isDemoMode()) return

    // Clear any previous error
    store.clearError()
    store.clearThinkingSteps()

    // Reuse active session by default for continuity unless agent type changes.
    const activeSessionId = store.activeSessionId
    const activeSession = activeSessionId ? store.sessions[activeSessionId] : null
    const reusableSessionId =
      activeSession && activeSession.agentType === agentType ? activeSessionId : undefined

    // Get or create session and capture the ID to use consistently
    const session = store.getOrCreateSession(reusableSessionId, { agentType })
    const sessionId = session.id

    // Ensure activeSessionId is set correctly before streaming
    store.setActiveSession(sessionId)

    // Add user message
    store.addMessage(sessionId, {
      role: 'user',
      content: message,
    })

    // Add placeholder assistant message
    store.addMessage(sessionId, {
      role: 'assistant',
      content: '',
    })

    // Send to agent
    try {
      let streamedResponse = ''
      if (agentType === 'chat') {
        streamedResponse = await sendToChat({
          input: message,
          context,
          sessionId,
        })
      } else {
        streamedResponse = await sendToSecretary({
          input: message,
          runtime: 'editor-deep',
          threadId: sessionId,
          context,
          editorContext: context,
          sessionId,
        })
      }

      // After streaming completes, check if the assistant message is empty
      // This can happen if the API returned no text-delta chunks
      const currentSession = store.sessions[sessionId]
      if (currentSession) {
        const lastMessage = currentSession.messages[currentSession.messages.length - 1]
        if (lastMessage && lastMessage.role === 'assistant' && !lastMessage.content.trim()) {
          // Check if there's a pending edit or clarification - if so, empty response is expected
          const hasPendingEdit = store.pendingEdits.some((e) => e.noteId && e.status === 'pending')
          const hasPendingClarification = store.hasPendingClarification
          const hasBackendError = Boolean(store.error)
          const hasServerFinal = Boolean(streamedResponse.trim())

          if (!hasPendingEdit && !hasPendingClarification && !hasBackendError && !hasServerFinal) {
            lastMessage.content = buildEmptyAssistantFallback({
              hasCurrentNote:
                Boolean(context?.currentNoteId) ||
                Boolean(currentSession.contextNoteIds && currentSession.contextNoteIds.length > 0),
            })
          }
        }
      }
    } catch (err) {
      console.error('Chat error:', err)
    }
  }

  function clearChat() {
    store.reset()
  }

  return {
    // State
    session: store.activeSession,
    status: store.status,
    isProcessing: store.isProcessing,
    error: store.error,

    // Actions
    sendMessage,
    clearChat,
    clearError: store.clearError,
  }
}
