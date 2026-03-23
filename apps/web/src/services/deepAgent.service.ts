/**
 * Deep Agent Service
 *
 * Thin SSE utility layer for the Deep Research Agent.
 * Provides typed request helpers for the research API endpoints.
 *
 * Note: SSE stream parsing is handled inline in the store (deepAgent.ts)
 * following the secretary.ts pattern. This service provides the transport layer.
 */

import { authFetch, authFetchSSE } from '@/utils/api'
import type { InterruptResponse } from '@inkdown/shared/types'

const API_URL = import.meta.env.VITE_API_URL || ''
const RESEARCH_API = `${API_URL}/api/research`

/**
 * Send a chat message and get an SSE stream response.
 */
export async function sendResearchChat(
  message: string,
  threadId?: string,
  outputPreference?: 'chat' | 'md_file' | 'note'
): Promise<Response> {
  return authFetchSSE(`${RESEARCH_API}/chat`, {
    method: 'POST',
    body: JSON.stringify({ message, threadId, outputPreference }),
  })
}

/**
 * Respond to a human-in-the-loop interrupt and resume the SSE stream.
 */
export async function sendInterruptResponse(
  threadId: string,
  response: InterruptResponse
): Promise<Response> {
  return authFetch(`${RESEARCH_API}/threads/${threadId}/interrupt-response`, {
    method: 'POST',
    body: JSON.stringify(response),
  })
}

/**
 * Load all research threads for the current user.
 */
export async function fetchThreads(): Promise<any> {
  const res = await authFetch(`${RESEARCH_API}/threads`)
  return res.json()
}

/**
 * Load messages for a specific research thread.
 */
export async function fetchThreadMessages(threadId: string): Promise<any> {
  const res = await authFetch(`${RESEARCH_API}/threads/${threadId}/messages`)
  return res.json()
}

/**
 * Delete a research thread.
 */
export async function deleteResearchThread(threadId: string): Promise<void> {
  await authFetch(`${RESEARCH_API}/threads/${threadId}`, { method: 'DELETE' })
}

/**
 * Update a research thread (e.g. set title).
 */
export async function updateResearchThread(
  threadId: string,
  updates: { title?: string }
): Promise<void> {
  await authFetch(`${RESEARCH_API}/threads/${threadId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  })
}

export async function saveResearchDraft(
  threadId: string,
  payload: { title: string; content: string }
): Promise<{ noteId: string; title: string; savedAt: string }> {
  const res = await authFetch(`${RESEARCH_API}/threads/${threadId}/save-draft`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return res.json()
}
