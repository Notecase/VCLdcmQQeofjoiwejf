/**
 * AI Service
 * 
 * Client-side service for communicating with agent API endpoints.
 * Handles SSE streaming and state management.
 */

import { useAIStore } from '@/stores/ai'

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
    type: 'text-delta' | 'thinking' | 'tool-call' | 'tool-result' | 'intent' | 'citation' | 'finish' | 'error'
    data: unknown
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

        const response = await fetch(`${API_BASE}/secretary`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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

        const response = await fetch(`${API_BASE}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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

        const response = await fetch(`${API_BASE}/note/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
    const response = await fetch(`${API_BASE}/planner/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
 * Stream response from an agent endpoint
 */
async function streamFromAgent(
    agentType: string,
    options: AgentRequestOptions
): Promise<string> {
    const store = useAIStore()

    const response = await fetch(`${API_BASE}/${agentType}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

                            // Skip thinking/tool-call for now - can be added later
                            case 'thinking':
                            case 'tool-call':
                            case 'tool-result':
                            case 'intent':
                            case 'citation':
                                // Future: display these in UI
                                console.log(`[AI] ${chunk.type}:`, chunk.data)
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
    return fullContent
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
            // Error already set in store
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
