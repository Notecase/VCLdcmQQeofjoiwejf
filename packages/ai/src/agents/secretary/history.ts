/**
 * Secretary Conversation History Service
 *
 * Loads and windows conversation history from `secretary_chat_messages`
 * so the Secretary agent can maintain multi-turn context.
 *
 * Note: `secretary_chat_messages.thread_id` is an FK to `secretary_threads.id`
 * (the internal UUID PK), NOT the public `secretary_threads.thread_id` (TEXT).
 * The agent receives the public thread ID, so resolution is required.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { windowMessages, type ThreadMessage } from '../../utils/conversation-history'

export class SecretaryHistoryService {
  constructor(
    private supabase: SupabaseClient,
    private userId: string
  ) {}

  async loadThreadMessages(params: {
    threadId: string
    windowTurns?: number
    maxChars?: number
  }): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
    try {
      const windowTurns = Math.min(Math.max(params.windowTurns ?? 20, 1), 50)
      const maxChars = Math.max(params.maxChars ?? 16000, 1)
      const limit = windowTurns * 2

      // Validate threadId format before interpolating into .or() filter
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      if (!UUID_RE.test(params.threadId)) return []

      // Resolve public threadId → internal DB UUID
      const { data: threadRow } = await this.supabase
        .from('secretary_threads')
        .select('id')
        .or(`thread_id.eq.${params.threadId},id.eq.${params.threadId}`)
        .single()

      if (!threadRow) return []

      // Query messages using internal UUID
      const { data, error } = await this.supabase
        .from('secretary_chat_messages')
        .select('role, content, created_at')
        .eq('thread_id', threadRow.id)
        .eq('user_id', this.userId)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error || !data) return []

      const mapped: ThreadMessage[] = (
        data as Array<{ role: string; content: string; created_at: string }>
      )
        .filter((row) => row.role === 'user' || row.role === 'assistant')
        .map((row) => ({
          role: row.role as 'user' | 'assistant',
          content: row.content || '',
          createdAt: row.created_at,
        }))

      return windowMessages(mapped, { maxTurns: windowTurns, maxChars })
    } catch {
      return []
    }
  }
}
