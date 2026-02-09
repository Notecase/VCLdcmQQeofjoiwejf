/**
 * Course Explain Store
 *
 * Lightweight Pinia store for the AI Tutor sidebar in course viewer.
 * Manages chat messages, streaming state, and highlighted text context.
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { authFetchSSE } from '@/utils/api'
import type { ExplainLessonContext } from '@inkdown/shared/types'

export interface ExplainMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  highlightContext?: string
  createdAt: number
}

export const useCourseExplainStore = defineStore('courseExplain', () => {
  const messages = ref<ExplainMessage[]>([])
  const isStreaming = ref(false)
  const error = ref<string | null>(null)
  const highlightedText = ref<string | null>(null)
  const highlightSurroundingContext = ref<string | null>(null)
  const highlightSection = ref<string | null>(null)

  let abortController: AbortController | null = null

  function setHighlightedText(text: string, surroundingContext?: string, sectionHeading?: string) {
    highlightedText.value = text
    highlightSurroundingContext.value = surroundingContext || null
    highlightSection.value = sectionHeading || null
  }

  function clearHighlightedText() {
    highlightedText.value = null
    highlightSurroundingContext.value = null
    highlightSection.value = null
  }

  function clearMessages() {
    messages.value = []
    error.value = null
    stopStreaming()
  }

  function clearError() {
    error.value = null
  }

  function stopStreaming() {
    if (abortController) {
      abortController.abort()
      abortController = null
    }
    isStreaming.value = false
  }

  async function sendMessage(message: string, lessonContext: ExplainLessonContext) {
    error.value = null

    // Add user message
    const userMsg: ExplainMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: message,
      highlightContext: highlightedText.value || undefined,
      createdAt: Date.now(),
    }
    messages.value.push(userMsg)

    // Build conversation history (exclude current message)
    const conversationHistory = messages.value
      .filter((m) => m.id !== userMsg.id)
      .map((m) => ({
        role: m.role,
        content: m.highlightContext
          ? `[Regarding: "${m.highlightContext}"]\n${m.content}`
          : m.content,
      }))

    // Prepare assistant message placeholder
    const assistantMsg: ExplainMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      createdAt: Date.now(),
    }
    messages.value.push(assistantMsg)

    // Capture context before clearing
    const sentSurroundingContext = highlightSurroundingContext.value || undefined
    const sentHighlightSection = highlightSection.value || undefined

    // Clear highlight after sending
    highlightedText.value = null
    highlightSurroundingContext.value = null
    highlightSection.value = null
    isStreaming.value = true
    abortController = new AbortController()

    try {
      const response = await authFetchSSE('/api/explain/chat', {
        method: 'POST',
        body: JSON.stringify({
          message,
          lessonContext,
          highlightedText: userMsg.highlightContext,
          highlightSurroundingContext: sentSurroundingContext,
          highlightSection: sentHighlightSection,
          conversationHistory,
        }),
        signal: abortController.signal,
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data:')) continue
          const raw = line.slice(5).trim()
          if (!raw) continue

          try {
            const event = JSON.parse(raw)
            if (event.event === 'text') {
              assistantMsg.content += event.data
              // Trigger reactivity
              const idx = messages.value.findIndex((m) => m.id === assistantMsg.id)
              if (idx >= 0) {
                messages.value[idx] = { ...assistantMsg }
              }
            } else if (event.event === 'error') {
              error.value = event.data
            }
          } catch {
            // Skip malformed SSE lines
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        error.value = err instanceof Error ? err.message : 'Failed to get response'
      }
    } finally {
      isStreaming.value = false
      abortController = null
    }
  }

  return {
    messages,
    isStreaming,
    error,
    highlightedText,
    setHighlightedText,
    clearHighlightedText,
    clearMessages,
    clearError,
    sendMessage,
    stopStreaming,
  }
})
