import { AppError, ErrorCode } from '@inkdown/shared'
import type { SupabaseClient } from '@supabase/supabase-js'

interface ThreadRow {
  id: string
  thread_id: string
  title: string | null
  created_at: string
  updated_at: string
}

interface MessageRow {
  id: string
  role: 'user' | 'assistant'
  content: string
  tool_calls: unknown | null
  thinking_steps: unknown | null
  model: string | null
  created_at: string
}

export class ChatPersistenceService {
  constructor(private supabase: SupabaseClient) {}

  private static readonly UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

  /**
   * Resolve a thread by either public thread_id or internal DB id.
   * This keeps the API resilient if older clients pass the internal id.
   */
  private async resolveThread(
    threadIdentifier: string
  ): Promise<{ id: string; threadId: string } | null> {
    const byThreadId = await this.supabase
      .from('secretary_threads')
      .select('id, thread_id')
      .eq('thread_id', threadIdentifier)
      .single()

    if (!byThreadId.error && byThreadId.data) {
      return { id: byThreadId.data.id, threadId: byThreadId.data.thread_id }
    }

    if (!ChatPersistenceService.UUID_PATTERN.test(threadIdentifier)) {
      return null
    }

    const byInternalId = await this.supabase
      .from('secretary_threads')
      .select('id, thread_id')
      .eq('id', threadIdentifier)
      .single()

    if (byInternalId.error || !byInternalId.data) {
      return null
    }

    return { id: byInternalId.data.id, threadId: byInternalId.data.thread_id }
  }

  async createThread(userId: string, title?: string): Promise<{ id: string; threadId: string }> {
    const threadId = crypto.randomUUID()

    const { data, error } = await this.supabase
      .from('secretary_threads')
      .insert({
        user_id: userId,
        thread_id: threadId,
        title: title ?? null,
      })
      .select('id, thread_id')
      .single()

    if (error || !data) {
      throw new AppError(
        `Failed to create thread: ${error?.message ?? 'unknown'}`,
        ErrorCode.DB_QUERY_FAILED,
        'Could not create chat thread'
      )
    }

    return { id: data.id, threadId: data.thread_id }
  }

  async getThreads(
    userId: string
  ): Promise<
    Array<{
      id: string
      threadId: string
      title: string | null
      createdAt: string
      updatedAt: string
    }>
  > {
    const { data, error } = await this.supabase
      .from('secretary_threads')
      .select('id, thread_id, title, created_at, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })

    if (error) {
      throw new AppError(
        `Failed to fetch threads: ${error.message}`,
        ErrorCode.DB_QUERY_FAILED,
        'Could not load chat threads'
      )
    }

    return (data as ThreadRow[]).map((row) => ({
      id: row.id,
      threadId: row.thread_id,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
  }

  async getMessages(
    threadId: string
  ): Promise<
    Array<{
      id: string
      role: string
      content: string
      toolCalls: unknown | null
      thinkingSteps: unknown | null
      model: string | null
      createdAt: string
    }>
  > {
    const thread = await this.resolveThread(threadId)
    if (!thread) {
      throw new AppError(
        `Thread not found: ${threadId}`,
        ErrorCode.DB_NOT_FOUND,
        'Chat thread not found'
      )
    }

    const { data, error } = await this.supabase
      .from('secretary_chat_messages')
      .select('id, role, content, tool_calls, thinking_steps, model, created_at')
      .eq('thread_id', thread.id)
      .order('created_at', { ascending: true })

    if (error) {
      throw new AppError(
        `Failed to fetch messages: ${error.message}`,
        ErrorCode.DB_QUERY_FAILED,
        'Could not load chat messages'
      )
    }

    return (data as MessageRow[]).map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      toolCalls: row.tool_calls,
      thinkingSteps: row.thinking_steps,
      model: row.model,
      createdAt: row.created_at,
    }))
  }

  async saveMessage(
    threadId: string,
    userId: string,
    msg: {
      role: string
      content: string
      toolCalls?: unknown
      thinkingSteps?: unknown
      model?: string
    }
  ): Promise<{ id: string }> {
    const thread = await this.resolveThread(threadId)
    if (!thread) {
      throw new AppError(
        `Thread not found: ${threadId}`,
        ErrorCode.DB_NOT_FOUND,
        'Chat thread not found'
      )
    }

    const { data, error } = await this.supabase
      .from('secretary_chat_messages')
      .insert({
        thread_id: thread.id,
        user_id: userId,
        role: msg.role,
        content: msg.content,
        tool_calls: msg.toolCalls ?? null,
        thinking_steps: msg.thinkingSteps ?? null,
        model: msg.model ?? null,
      })
      .select('id')
      .single()

    if (error || !data) {
      throw new AppError(
        `Failed to save message: ${error?.message ?? 'unknown'}`,
        ErrorCode.DB_QUERY_FAILED,
        'Could not save chat message'
      )
    }

    // Update thread's updated_at timestamp
    await this.supabase
      .from('secretary_threads')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', thread.id)

    return { id: data.id }
  }

  async deleteThread(threadId: string): Promise<void> {
    const thread = await this.resolveThread(threadId)
    if (!thread) {
      throw new AppError(
        `Thread not found: ${threadId}`,
        ErrorCode.DB_NOT_FOUND,
        'Chat thread not found'
      )
    }

    const { error } = await this.supabase.from('secretary_threads').delete().eq('id', thread.id)

    if (error) {
      throw new AppError(
        `Failed to delete thread: ${error.message}`,
        ErrorCode.DB_QUERY_FAILED,
        'Could not delete chat thread'
      )
    }
  }

  async updateThreadTitle(threadId: string, title: string): Promise<void> {
    const thread = await this.resolveThread(threadId)
    if (!thread) {
      throw new AppError(
        `Thread not found: ${threadId}`,
        ErrorCode.DB_NOT_FOUND,
        'Chat thread not found'
      )
    }

    const { error } = await this.supabase
      .from('secretary_threads')
      .update({ title, updated_at: new Date().toISOString() })
      .eq('id', thread.id)

    if (error) {
      throw new AppError(
        `Failed to update thread title: ${error.message}`,
        ErrorCode.DB_QUERY_FAILED,
        'Could not update thread title'
      )
    }
  }
}
