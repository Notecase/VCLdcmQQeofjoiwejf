/**
 * Claude Code WebSocket Client Service
 *
 * Manages the WebSocket connection to the API's Claude Code bridge.
 * Handles: connect, disconnect, reconnect, message send, event dispatch.
 * Bridges domain events (note.edited, artifact.created) to existing aiStore pipelines.
 */

import { useClaudeCodeStore } from '@/stores/claudeCode'
import { useAIStore } from '@/stores/ai'
import { useEditorStore } from '@/stores/editor'
import { computeDiffHunks } from '@/services/ai.service'
import type { NoteshellEvent, WsClientPayload } from '@inkdown/shared/types'

const MAX_RECONNECT_ATTEMPTS = 5
const BASE_RECONNECT_DELAY = 1000 // 1s → 2s → 4s → 8s → 16s

// Throttle content.delta mutations to ~20/sec
const DELTA_THROTTLE_MS = 50

class ClaudeCodeService {
  private ws: WebSocket | null = null
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private token: string | null = null
  private waitingForResponse = false // Prevents double-send before WS event loop catches up
  private responseTimeout: ReturnType<typeof setTimeout> | null = null

  // Delta throttling
  private deltaBuffer = ''
  private deltaTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * Connect to the Claude Code WebSocket endpoint.
   */
  connect(token: string): void {
    this.token = token
    this.reconnectAttempts = 0
    this.waitingForResponse = false

    const store = useClaudeCodeStore()
    store.clearSession() // Reset stale state from previous sessions
    store.connectionStatus = 'connecting'

    this.doConnect()
  }

  /**
   * Disconnect and clean up.
   */
  disconnect(): void {
    this.reconnectAttempts = MAX_RECONNECT_ATTEMPTS // Prevent reconnect
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.deltaTimer) {
      clearTimeout(this.deltaTimer)
      this.deltaTimer = null
    }
    if (this.responseTimeout) {
      clearTimeout(this.responseTimeout)
      this.responseTimeout = null
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }

    const store = useClaudeCodeStore()
    store.connectionStatus = 'disconnected'
  }

  /**
   * Send a chat message with optional editor context.
   */
  sendMessage(
    content: string,
    context?: { noteId?: string; selectedText?: string; noteTitle?: string }
  ): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    if (this.waitingForResponse) return // Prevent double-send

    this.waitingForResponse = true

    // Safety timeout: unlock UI if no response arrives within 60s
    this.responseTimeout = setTimeout(() => {
      this.waitingForResponse = false
      this.responseTimeout = null
      const ccStore = useClaudeCodeStore()
      ccStore.handleEvent({
        type: 'error',
        message: 'No response received — Claude Code may have failed to start.',
        code: 'response_timeout',
      } as NoteshellEvent)
    }, 60000)

    const store = useClaudeCodeStore()
    store.addUserMessage(content)

    const payload: WsClientPayload = {
      type: 'message',
      content,
      context,
    }
    this.ws.send(JSON.stringify(payload))
  }

  /**
   * Interrupt the current Claude Code operation.
   */
  interrupt(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return

    const payload: WsClientPayload = { type: 'interrupt' }
    this.ws.send(JSON.stringify(payload))
  }

  /**
   * Whether connected and ready to send.
   */
  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  // ===========================================================================
  // Internal
  // ===========================================================================

  private doConnect(): void {
    if (!this.token) return

    const baseUrl = import.meta.env.VITE_API_URL || ''
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = baseUrl ? new URL(baseUrl).host : window.location.host.replace(':5173', ':3001') // dev proxy fallback
    const url = `${protocol}//${host}/ws/claude-code?token=${encodeURIComponent(this.token)}`

    this.ws = new WebSocket(url)

    this.ws.onopen = () => {
      const store = useClaudeCodeStore()
      store.connectionStatus = 'connected'
      store.clearError()
      this.reconnectAttempts = 0
    }

    this.ws.onmessage = (evt) => {
      this.handleRawMessage(evt.data)
    }

    this.ws.onclose = () => {
      this.ws = null
      this.flushDelta()
      this.scheduleReconnect()
    }

    this.ws.onerror = () => {
      // onclose will fire after this
    }
  }

  private handleRawMessage(data: string): void {
    let event: NoteshellEvent
    try {
      event = JSON.parse(data)
    } catch {
      return
    }

    // Throttle content.delta events
    if (event.type === 'content.delta') {
      this.bufferDelta(event.text)
      return
    }

    // Flush any buffered delta before handling other events
    if (this.deltaBuffer) {
      this.flushDelta()
    }

    // Reset send guard when response completes or errors
    if (
      event.type === 'turn.completed' ||
      event.type === 'error' ||
      (event.type === 'session.state' && (event.state === 'idle' || event.state === 'stopped'))
    ) {
      this.waitingForResponse = false
      if (this.responseTimeout) {
        clearTimeout(this.responseTimeout)
        this.responseTimeout = null
      }
    }

    // Dispatch to store
    const store = useClaudeCodeStore()
    store.handleEvent(event)

    // Bridge domain events to existing pipelines
    this.bridgeDomainEvent(event)
  }

  private bufferDelta(text: string): void {
    this.deltaBuffer += text

    if (!this.deltaTimer) {
      this.deltaTimer = setTimeout(() => {
        this.flushDelta()
      }, DELTA_THROTTLE_MS)
    }
  }

  private flushDelta(): void {
    if (this.deltaTimer) {
      clearTimeout(this.deltaTimer)
      this.deltaTimer = null
    }
    if (this.deltaBuffer) {
      const store = useClaudeCodeStore()
      store.handleEvent({ type: 'content.delta', text: this.deltaBuffer })
      this.deltaBuffer = ''
    }
  }

  /**
   * Bridge domain events to existing aiStore and editorStore pipelines.
   * This is the key integration point — Claude Code edits flow through
   * the same diff/artifact system as EditorDeep.
   */
  private bridgeDomainEvent(event: NoteshellEvent): void {
    switch (event.type) {
      case 'note.edited':
        this.handleNoteEdited(event)
        break
      case 'note.created':
        this.handleNoteCreated(event)
        break
      case 'artifact.created':
        this.handleArtifactCreated(event)
        break
    }
  }

  private handleNoteEdited(event: NoteshellEvent & { type: 'note.edited' }): void {
    const aiStore = useAIStore()

    // Compute diff hunks using existing pipeline
    const diffHunks = computeDiffHunks(event.original, event.proposed)

    // Bridge to existing pending edits system
    // PendingEdit uses: blockId, noteId, originalContent, proposedContent, diffHunks
    aiStore.addPendingEdit({
      blockId: event.editId,
      noteId: event.noteId,
      originalContent: event.original,
      proposedContent: event.proposed,
      diffHunks,
    })
  }

  private handleNoteCreated(event: NoteshellEvent & { type: 'note.created' }): void {
    const editorStore = useEditorStore()
    editorStore.loadDocument(event.noteId)
    editorStore.loadDocuments()
  }

  private handleArtifactCreated(event: NoteshellEvent & { type: 'artifact.created' }): void {
    const aiStore = useAIStore()
    aiStore.addPendingArtifact(event.noteId, {
      title: event.title,
      html: event.html,
      css: event.css || '',
      javascript: event.javascript || '',
    })
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      const store = useClaudeCodeStore()
      store.connectionStatus = 'error'
      store.error = 'Connection lost. Please refresh to reconnect.'
      return
    }

    const store = useClaudeCodeStore()
    store.connectionStatus = 'connecting'

    const delay = BASE_RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts)
    this.reconnectAttempts++

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.doConnect()
    }, delay)
  }
}

// Singleton
export const claudeCodeService = new ClaudeCodeService()
