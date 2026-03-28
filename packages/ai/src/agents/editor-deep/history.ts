import type { SupabaseClient } from '@supabase/supabase-js'
import { windowMessages, type ThreadMessage } from '../../utils/conversation-history'

export interface EditorThreadMessage {
  role: 'user' | 'assistant'
  content: string
}

export class EditorConversationHistoryService {
  constructor(
    private supabase: SupabaseClient,
    private userId: string
  ) {}

  async loadThreadMessages(params: {
    threadId: string
    windowTurns?: number
    maxChars?: number
  }): Promise<EditorThreadMessage[]> {
    const windowTurns = Math.min(Math.max(params.windowTurns ?? 12, 1), 50)
    const maxChars = Math.max(params.maxChars ?? 12000, 1)
    const limit = windowTurns * 2

    const { data, error } = await this.supabase
      .from('editor_messages')
      .select('role, content, created_at')
      .eq('thread_id', params.threadId)
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
  }
}
