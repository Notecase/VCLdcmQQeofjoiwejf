/**
 * Claude Code Store
 *
 * Manages Claude Code session state: connection, messages, tool calls, streaming.
 * Events flow from WebSocket → handleEvent() → reactive state → UI components.
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { NoteshellEvent, ToolStartedEvent, ToolCompletedEvent } from '@inkdown/shared/types'

// ============================================================================
// Types
// ============================================================================

export interface ToolCallInfo {
  id: string
  name: string
  input: Record<string, unknown>
  output: string
  status: 'running' | 'completed' | 'error'
  startedAt: number
  completedAt?: number
}

export interface ClaudeCodeMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolCalls: ToolCallInfo[]
  thinkingContent: string
  timestamp: number
}

// ============================================================================
// Store
// ============================================================================

export const useClaudeCodeStore = defineStore('claudeCode', () => {
  // Connection state
  const connectionStatus = ref<'disconnected' | 'connecting' | 'connected' | 'error'>(
    'disconnected'
  )
  const sessionId = ref<string | null>(null)
  const model = ref('')
  const tools = ref<string[]>([])

  // Message state
  const messages = ref<ClaudeCodeMessage[]>([])
  const isStreaming = ref(false)
  const isThinking = ref(false)
  const activeToolCall = ref<ToolCallInfo | null>(null)

  // Usage tracking
  const totalTokens = ref({ input: 0, output: 0 })
  const totalCostUsd = ref(0)

  // Edit mode
  const autoApplyEdits = ref(false)

  // Error
  const error = ref<string | null>(null)

  // ============================================================================
  // Computed
  // ============================================================================

  const lastMessage = computed(() =>
    messages.value.length > 0 ? messages.value[messages.value.length - 1] : null
  )

  const isActive = computed(() => connectionStatus.value === 'connected')

  // ============================================================================
  // Actions
  // ============================================================================

  /** Add a user message to the list */
  function addUserMessage(content: string) {
    messages.value.push({
      id: crypto.randomUUID(),
      role: 'user',
      content,
      toolCalls: [],
      thinkingContent: '',
      timestamp: Date.now(),
    })
  }

  /** Ensure there's an assistant message to stream into */
  function ensureAssistantMessage(): ClaudeCodeMessage {
    const last = messages.value[messages.value.length - 1]
    if (last && last.role === 'assistant') return last

    const msg: ClaudeCodeMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      toolCalls: [],
      thinkingContent: '',
      timestamp: Date.now(),
    }
    messages.value.push(msg)
    return msg
  }

  /** Central event dispatcher — called by the WebSocket service */
  function handleEvent(event: NoteshellEvent) {
    error.value = null

    switch (event.type) {
      case 'session.started':
        sessionId.value = event.sessionId
        model.value = event.model
        tools.value = event.tools
        connectionStatus.value = 'connected'
        break

      case 'session.state':
        if (event.state === 'running') {
          isStreaming.value = true
        } else if (event.state === 'idle' || event.state === 'stopped') {
          isStreaming.value = false
          isThinking.value = false
          activeToolCall.value = null
        } else if (event.state === 'error') {
          connectionStatus.value = 'error'
        }
        break

      case 'content.delta': {
        isThinking.value = false
        isStreaming.value = true
        const msg = ensureAssistantMessage()
        msg.content += event.text
        break
      }

      case 'content.done': {
        const msg = ensureAssistantMessage()
        msg.content = event.text
        isStreaming.value = false
        break
      }

      case 'thinking.delta': {
        isThinking.value = true
        const msg = ensureAssistantMessage()
        msg.thinkingContent += event.text
        break
      }

      case 'tool.started':
        handleToolStarted(event)
        break

      case 'tool.completed':
        handleToolCompleted(event)
        break

      case 'turn.completed':
        isStreaming.value = false
        isThinking.value = false
        activeToolCall.value = null
        totalTokens.value = {
          input: totalTokens.value.input + event.usage.inputTokens,
          output: totalTokens.value.output + event.usage.outputTokens,
        }
        totalCostUsd.value += event.costUsd
        break

      case 'error':
        error.value = event.message
        isStreaming.value = false
        isThinking.value = false
        break

      // Domain events are handled by claude-code.service.ts
      // (they bridge to the existing aiStore for diff/artifact pipelines)
      case 'note.edited':
      case 'note.created':
      case 'artifact.created':
        break
    }
  }

  function handleToolStarted(event: ToolStartedEvent) {
    const msg = ensureAssistantMessage()
    const existing = msg.toolCalls.find((tc) => tc.id === event.toolUseId)
    if (existing) {
      // Update with complete input (second emit after JSON accumulation)
      existing.input = event.input
    } else {
      const tc: ToolCallInfo = {
        id: event.toolUseId,
        name: event.name,
        input: event.input,
        output: '',
        status: 'running',
        startedAt: Date.now(),
      }
      msg.toolCalls.push(tc)
      activeToolCall.value = tc
    }
  }

  function handleToolCompleted(event: ToolCompletedEvent) {
    const msg = ensureAssistantMessage()
    const tc = msg.toolCalls.find((t) => t.id === event.toolUseId)
    if (tc) {
      tc.output = event.output
      tc.status = event.isError ? 'error' : 'completed'
      tc.completedAt = Date.now()
    }
    activeToolCall.value = null
  }

  /** Clear messages and reset state */
  function clearSession() {
    messages.value = []
    isStreaming.value = false
    isThinking.value = false
    activeToolCall.value = null
    error.value = null
  }

  function clearError() {
    error.value = null
  }

  return {
    // State
    connectionStatus,
    sessionId,
    model,
    tools,
    messages,
    isStreaming,
    isThinking,
    activeToolCall,
    totalTokens,
    totalCostUsd,
    autoApplyEdits,
    error,

    // Computed
    lastMessage,
    isActive,

    // Actions
    addUserMessage,
    handleEvent,
    clearSession,
    clearError,
  }
})
