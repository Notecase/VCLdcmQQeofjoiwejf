/**
 * AI Service V2
 *
 * Client-side service using the new Vercel AI SDK V2 endpoints.
 * Provides cleaner streaming and automatic tool execution.
 *
 * Endpoints:
 * - /api/v2/agent/secretary - Main entry point with tool routing
 * - /api/v2/agent/chat - Chat with RAG support
 * - /api/v2/agent/note - Note manipulation
 * - /api/v2/agent/planner/plan - Planning
 */

import { useAIStore } from '@/stores/ai'
import type { ChatSession } from '@/stores/ai'

const API_BASE = '/api/v2/agent'

// ============================================================================
// Types
// ============================================================================

export interface V2RequestOptions {
  message: string
  context?: {
    noteIds?: string[]
    projectId?: string
    currentNoteId?: string
  }
  sessionId?: string
  stream?: boolean
}

export interface ChatRequestOptions extends V2RequestOptions {
  includeRag?: boolean
}

export interface NoteRequestOptions {
  action: 'create' | 'update' | 'organize' | 'summarize' | 'expand'
  input: string
  noteId?: string
  projectId?: string
  stream?: boolean
}

export interface PlannerRequestOptions {
  goal: string
  context?: string
  constraints?: string[]
  maxSteps?: number
  stream?: boolean
}

export interface StreamChunk {
  type: 'text-delta' | 'thinking' | 'tool-call' | 'tool-result' | 'finish' | 'error'
  data: unknown
}

export interface V2Capabilities {
  version: string
  framework: string
  model: string
  agents: Array<{
    type: string
    name: string
    description: string
    capabilities: string[]
  }>
}

// ============================================================================
// Secretary Agent
// ============================================================================

/**
 * Send a message to the Secretary agent (main entry point with tool routing)
 */
export async function sendToSecretaryV2(options: V2RequestOptions): Promise<string> {
  const store = useAIStore()

  try {
    store.setStatus('streaming')

    if (options.stream !== false) {
      return await streamFromAgentV2('secretary', options)
    }

    const response = await fetch(`${API_BASE}/secretary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: options.message,
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
    return result.content || result.response
  } catch (err) {
    store.setError(err instanceof Error ? err.message : 'Unknown error')
    throw err
  }
}

// ============================================================================
// Chat Agent
// ============================================================================

/**
 * Send a message to the Chat agent with optional RAG
 */
export async function sendToChatV2(options: ChatRequestOptions): Promise<string> {
  const store = useAIStore()

  try {
    store.setStatus('streaming')

    if (options.stream !== false) {
      return await streamFromAgentV2('chat', {
        ...options,
        includeRag: options.includeRag ?? true,
      } as unknown as V2RequestOptions)
    }

    const response = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: options.message,
        context: options.context,
        includeRag: options.includeRag ?? true,
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

// ============================================================================
// Note Agent
// ============================================================================

/**
 * Execute a note action (create, update, organize, summarize, expand)
 */
export async function sendToNoteAgentV2(options: NoteRequestOptions): Promise<{
  content: string
  noteId?: string
  title?: string
}> {
  const store = useAIStore()

  try {
    store.setStatus('streaming')

    const response = await fetch(`${API_BASE}/note`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: options.action,
        input: options.input,
        noteId: options.noteId,
        projectId: options.projectId,
        stream: options.stream ?? true,
      }),
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    if (options.stream !== false) {
      const result = await processSSEResponseV2(response, store)
      return {
        content: result.content,
        noteId: result.noteId,
        title: result.title,
      }
    }

    const result = await response.json()
    store.setStatus('idle')
    return result
  } catch (err) {
    store.setError(err instanceof Error ? err.message : 'Unknown error')
    throw err
  }
}

// ============================================================================
// Planner Agent
// ============================================================================

/**
 * Create a plan with the Planner agent
 */
export async function createPlanV2(options: PlannerRequestOptions): Promise<{
  success: boolean
  plan?: {
    id: string
    goal: string
    summary: string
    steps: Array<{
      id: number
      description: string
      status: string
      estimatedTime?: string
    }>
  }
  message?: string
}> {
  const store = useAIStore()

  try {
    store.setStatus('streaming')

    const response = await fetch(`${API_BASE}/planner/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal: options.goal,
        context: options.context,
        constraints: options.constraints,
        maxSteps: options.maxSteps,
        stream: options.stream ?? false,
      }),
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    const result = await response.json()
    store.setStatus('idle')
    return result
  } catch (err) {
    store.setError(err instanceof Error ? err.message : 'Unknown error')
    throw err
  }
}

// ============================================================================
// Capabilities
// ============================================================================

/**
 * Get V2 API capabilities
 */
export async function getAgentCapabilitiesV2(): Promise<V2Capabilities> {
  const response = await fetch(`${API_BASE}/capabilities`)
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`)
  }
  return response.json()
}

// ============================================================================
// Streaming Helpers
// ============================================================================

/**
 * Stream response from a V2 agent endpoint
 */
async function streamFromAgentV2(
  agentType: 'secretary' | 'chat',
  options: V2RequestOptions
): Promise<string> {
  const store = useAIStore()

  const body: Record<string, unknown> = {
    message: options.message,
    context: options.context,
    sessionId: options.sessionId,
    stream: true,
  }

  // Add includeRag for chat agent
  if (agentType === 'chat') {
    body.includeRag = (options as unknown as ChatRequestOptions).includeRag ?? true
  }

  const response = await fetch(`${API_BASE}/${agentType}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`)
  }

  const result = await processSSEResponseV2(response, store)
  return result.content
}

/**
 * Process SSE response and update store
 */
async function processSSEResponseV2(
  response: Response,
  store: ReturnType<typeof useAIStore>
): Promise<{ content: string; noteId?: string; title?: string }> {
  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('No response body')
  }

  const decoder = new TextDecoder()
  let fullContent = ''
  let buffer = ''
  let noteId: string | undefined
  let title: string | undefined

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

              case 'thinking':
                store.addThinkingStep({
                  type: 'thought',
                  description: chunk.data as string,
                  status: 'running',
                })
                break

              case 'tool-call':
                store.addThinkingStep({
                  type: 'tool',
                  description: `Using tool: ${(chunk.data as { name?: string })?.name || 'unknown'}`,
                  status: 'running',
                })
                break

              case 'tool-result': {
                // Complete the last thinking step
                const runningSteps = store.thinkingSteps.filter((s) => s.status === 'running')
                if (runningSteps.length > 0) {
                  store.completeThinkingStep(runningSteps[runningSteps.length - 1].id)
                }
                break
              }

              case 'finish': {
                store.setStatus('idle')
                // Extract noteId/title from finish data if present
                const finishData = chunk.data as { noteId?: string; title?: string }
                if (finishData?.noteId) noteId = finishData.noteId
                if (finishData?.title) title = finishData.title
                break
              }

              case 'error':
                store.setError(chunk.data as string)
                break
            }
          } catch {
            // Ignore parse errors for malformed chunks
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }

  store.setStatus('idle')
  return { content: fullContent, noteId, title }
}

// ============================================================================
// Vue Composable
// ============================================================================

/**
 * Composable for using V2 AI agents in Vue components
 */
export function useAIChatV2() {
  const store = useAIStore()

  async function sendMessage(
    message: string,
    agentType: 'secretary' | 'chat' = 'secretary',
    context?: V2RequestOptions['context']
  ) {
    // Get or create session
    const session = store.getOrCreateSession(undefined, {
      agentType: agentType as ChatSession['agentType'],
    })

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

    // Clear previous thinking steps
    store.clearThinkingSteps()

    // Send to agent
    try {
      if (agentType === 'chat') {
        await sendToChatV2({
          message,
          context,
          sessionId: session.id,
        })
      } else {
        await sendToSecretaryV2({
          message,
          context,
          sessionId: session.id,
        })
      }
    } catch (err) {
      console.error('Chat error:', err)
    }
  }

  async function createNote(
    input: string,
    action: NoteRequestOptions['action'] = 'create',
    projectId?: string
  ) {
    return await sendToNoteAgentV2({
      action,
      input,
      projectId,
    })
  }

  async function planGoal(goal: string, context?: string, constraints?: string[]) {
    return await createPlanV2({
      goal,
      context,
      constraints,
    })
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
    thinkingSteps: store.thinkingSteps,

    // Actions
    sendMessage,
    createNote,
    planGoal,
    clearChat,
    clearError: store.clearError,
  }
}
