/**
 * Research Conversation History Service
 *
 * Loads and windows conversation history from `research_messages`
 * so the Research agent can maintain multi-turn context.
 *
 * Simpler than Secretary — `research_messages.thread_id` uses a direct UUID
 * (no resolution needed). Also, `research_messages` has no `user_id` column
 * (RLS handles access control).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { windowMessages, type ThreadMessage } from '../../utils/conversation-history'

export class ResearchHistoryService {
  constructor(private supabase: SupabaseClient) {}

  async loadThreadMessages(params: {
    threadId: string
    windowTurns?: number
    maxChars?: number
  }): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
    try {
      const windowTurns = Math.min(Math.max(params.windowTurns ?? 16, 1), 50)
      const maxChars = Math.max(params.maxChars ?? 14000, 1)
      const limit = windowTurns * 2

      const { data, error } = await this.supabase
        .from('research_messages')
        .select('role, content, created_at')
        .eq('thread_id', params.threadId)
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
