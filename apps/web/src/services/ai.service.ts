/**
 * AI Service
 *
 * Client-side service for communicating with agent API endpoints.
 * Handles SSE streaming and state management.
 */

import { useAIStore, type DiffHunk, type ThinkingStep } from '@/stores/ai'
import { authFetch, authFetchSSE } from '@/utils/api'
import * as Diff from 'diff'

const API_BASE = import.meta.env.VITE_API_BASE || '/api/agent'

// ============================================================================
// Types
// ============================================================================

export interface AgentRequestOptions {
  input: string
  context?: {
    noteIds?: string[]
    projectId?: string
    currentNoteId?: string
  }
  sessionId?: string
  stream?: boolean
}

export interface StreamChunk {
  type:
    | 'text-delta'
    | 'thinking'
    | 'tool-call'
    | 'tool-result'
    | 'intent'
    | 'citation'
    | 'edit-proposal'
    | 'finish'
    | 'error'
  data: unknown
}

export interface EditProposalData {
  noteId: string
  blockId?: string
  original: string
  proposed: string
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
 * Compute diff hunks from original and proposed content
 * Uses jsdiff to compute structural changes and groups them into logical hunks
 */
export function computeDiffHunks(original: string, proposed: string): DiffHunk[] {
  const hunks: DiffHunk[] = []

  // Use structuredPatch to get unified diff hunks
  const patch = Diff.structuredPatch('original', 'proposed', original, proposed, '', '', {
    context: 3, // Include 3 lines of context around changes
  })

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
      context: options.context,
      sessionId: options.sessionId,
      stream: true,
    }),
  })

  if (!response.ok) {
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
              case 'text-delta':
                fullContent += chunk.data as string
                // Update last message in store
                if (store.activeSession) {
                  store.appendToLastMessage(store.activeSession.id, chunk.data as string)
                }
                break

              case 'finish':
                store.setStatus('idle')
                break

              case 'error':
                store.setError(chunk.data as string)
                break

              case 'thinking': {
                // Add thinking step to store
                const thinkingData = chunk.data as { description: string; type?: ThinkingStep['type'] }
                const runningThoughts = store.thinkingSteps.filter(
                  (step) => step.status === 'running' && step.type !== 'tool'
                )
                const lastRunningThought = runningThoughts[runningThoughts.length - 1]
                if (lastRunningThought) {
                  store.completeThinkingStep(lastRunningThought.id)
                }
                store.addThinkingStep({
                  type: thinkingData.type || 'thought',
                  description: thinkingData.description || (thinkingData as unknown as string),
                  status: 'running',
                })
                store.setStatus('thinking')
                break
              }

              case 'tool-call': {
                // Add tool call as thinking step
                // Backend may send 'tool' or 'name' depending on the source
                const toolData = chunk.data as {
                  name?: string
                  tool?: string
                  arguments?: Record<string, unknown>
                }
                const toolName = toolData.name || toolData.tool || 'unknown'
                const runningThoughts = store.thinkingSteps.filter(
                  (step) => step.status === 'running' && step.type !== 'tool'
                )
                const lastRunningThought = runningThoughts[runningThoughts.length - 1]
                if (lastRunningThought) {
                  store.completeThinkingStep(lastRunningThought.id)
                }
                store.addThinkingStep({
                  type: 'tool',
                  description: `Calling ${toolName}...`,
                  status: 'running',
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
                break
              }

              case 'intent':
              case 'citation':
                console.log(`[AI] ${chunk.type}:`, chunk.data)
                break
            }
          } catch {
            // Ignore parse errors for malformed chunks
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
    // Clear any previous error
    store.clearError()
    store.clearThinkingSteps()

    // Get or create session
    const session = store.getOrCreateSession(undefined, { agentType })

    // Add user message
    store.addMessage(session.id, {
      role: 'user',
      content: message,
    })

    // Add placeholder assistant message
    store.addMessage(session.id, {
      role: 'assistant',
      content: '',
    })

    // Send to agent
    try {
      if (agentType === 'chat') {
        await sendToChat({
          input: message,
          context,
          sessionId: session.id,
        })
      } else {
        await sendToSecretary({
          input: message,
          context,
          sessionId: session.id,
        })
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
