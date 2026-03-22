import type { SupabaseClient } from '@supabase/supabase-js'

interface EditorMessageRow {
  role: string
  content: string
  created_at: string
}

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

    const validMessages = (data as EditorMessageRow[])
      .slice(0, limit)
      .filter((row) => row.role === 'user' || row.role === 'assistant')
      .map((row) => ({
        role: row.role as 'user' | 'assistant',
        content: (row.content || '').trim(),
        createdAt: row.created_at,
      }))
      .filter((row) => row.content.length > 0)

    if (validMessages.length === 0) return []

    const chronological = validMessages
      .slice()
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map(({ role, content }) => ({ role, content }))

    // Deterministic newest-first windowing: keep newest messages that fit budget.
    const newestFirstKept: EditorThreadMessage[] = []
    let usedChars = 0

    for (let index = chronological.length - 1; index >= 0; index -= 1) {
      const message = chronological[index]
      const messageChars = message.content.length

      if (newestFirstKept.length > 0 && usedChars + messageChars > maxChars) {
        break
      }

      if (newestFirstKept.length === 0 && messageChars > maxChars) {
        newestFirstKept.push({
          role: message.role,
          content: message.content.slice(messageChars - maxChars),
        })
        usedChars = maxChars
        break
      }

      newestFirstKept.push(message)
      usedChars += messageChars
    }

    return newestFirstKept.reverse()
  }
}
