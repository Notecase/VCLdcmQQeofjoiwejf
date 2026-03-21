import type { SupabaseClient } from '@supabase/supabase-js'

export type EditorMemoryScopeType = 'note' | 'workspace' | 'user'

export interface EditorMemoryRow {
  id: string
  key: string
  value: string
  memory_type: string
  scope_type: EditorMemoryScopeType
  scope_id: string
  source_thread_id: string | null
  importance: number
  last_used_at: string | null
  created_at: string
  updated_at: string
}

interface BuildContextOptions {
  currentNoteId?: string
  workspaceId?: string
}

interface DistillTurnInput {
  threadId: string
  userMessage: string
  assistantMessage: string
  context?: BuildContextOptions
}

export class EditorLongTermMemory {
  constructor(
    private supabase: SupabaseClient,
    private userId: string
  ) {}

  async read(
    key: string,
    options?: {
      currentNoteId?: string
      workspaceId?: string
      scopeType?: EditorMemoryScopeType
      scopeId?: string
    }
  ): Promise<EditorMemoryRow | null> {
    if (!key.trim()) return null

    const memories = await this.list(80)
    const matches = memories.filter((memory) => memory.key === key)
    if (matches.length === 0) return null

    if (options?.scopeType && options.scopeId) {
      const exact = matches.find(
        (memory) => memory.scope_type === options.scopeType && memory.scope_id === options.scopeId
      )
      if (exact) {
        await this.touch([exact.id])
        return exact
      }
    }

    const ranked = this.rankMemories(matches, {
      currentNoteId: options?.currentNoteId,
      workspaceId: options?.workspaceId,
      query: key,
    })
    const winner = ranked[0] || null
    if (winner) {
      await this.touch([winner.id])
    }
    return winner
  }

  async write(params: {
    key: string
    value: string
    memoryType?: string
    scopeType?: EditorMemoryScopeType
    scopeId?: string
    sourceThreadId?: string
    importance?: number
  }): Promise<void> {
    const scopeType = params.scopeType ?? 'user'
    const scopeId = params.scopeId ?? (scopeType === 'user' ? this.userId : '')
    const now = new Date().toISOString()
    const importance = Math.min(Math.max(params.importance ?? 0.5, 0), 1)

    await this.supabase.from('editor_memories').upsert(
      {
        user_id: this.userId,
        key: params.key,
        value: params.value,
        memory_type: params.memoryType || 'preference',
        scope_type: scopeType,
        scope_id: scopeId,
        source_thread_id: params.sourceThreadId || null,
        importance,
        last_used_at: now,
        updated_at: now,
      },
      {
        onConflict: 'user_id,scope_type,scope_id,key',
      }
    )
  }

  async list(limit = 20): Promise<EditorMemoryRow[]> {
    const { data, error } = await this.supabase
      .from('editor_memories')
      .select(
        'id, key, value, memory_type, scope_type, scope_id, source_thread_id, importance, last_used_at, created_at, updated_at'
      )
      .eq('user_id', this.userId)
      .order('updated_at', { ascending: false })
      .limit(limit)

    if (error || !data) return []

    return (data as Array<Partial<EditorMemoryRow>>).map((row) => ({
      id: row.id || crypto.randomUUID(),
      key: row.key || '',
      value: row.value || '',
      memory_type: row.memory_type || 'preference',
      scope_type: (row.scope_type || 'user') as EditorMemoryScopeType,
      scope_id: row.scope_id || this.userId,
      source_thread_id: row.source_thread_id || null,
      importance: typeof row.importance === 'number' ? row.importance : 0.5,
      last_used_at: row.last_used_at || null,
      created_at: row.created_at || new Date(0).toISOString(),
      updated_at: row.updated_at || new Date(0).toISOString(),
    }))
  }

  async buildContextSummary(message: string, options?: BuildContextOptions): Promise<string> {
    const memories = await this.list(80)
    if (memories.length === 0) return ''

    // Exclude note_summary memories — these store assistant responses from prior turns
    // and cause the LLM to repeat old answers. Conversation history already carries this context.
    const filteredMemories = memories.filter((m) => m.memory_type !== 'note_summary')
    if (filteredMemories.length === 0) return ''

    const ranked = this.rankMemories(filteredMemories, {
      query: message,
      currentNoteId: options?.currentNoteId,
      workspaceId: options?.workspaceId,
    })

    const picked = ranked.slice(0, 8)
    if (picked.length === 0) return ''

    await this.touch(picked.map((memory) => memory.id))

    const lines = picked.map((memory) => {
      const snippet =
        memory.value.length > 200 ? `${memory.value.slice(0, 200).trim()}...` : memory.value
      return `- [${memory.scope_type}] [${memory.memory_type}] ${memory.key}: ${snippet}`
    })

    return lines.join('\n')
  }

  async distillAndStoreTurn(input: DistillTurnInput): Promise<void> {
    const normalizedUser = input.userMessage.replace(/\s+/g, ' ').trim()
    const normalizedAssistant = input.assistantMessage.replace(/\s+/g, ' ').trim()

    if (input.context?.currentNoteId && normalizedAssistant) {
      await this.write({
        key: 'latest_summary',
        value: normalizedAssistant.slice(0, 500),
        memoryType: 'note_summary',
        scopeType: 'note',
        scopeId: input.context.currentNoteId,
        sourceThreadId: input.threadId,
        importance: 0.7,
      })
    }

    const preferenceSignal = /(?:prefer|always|never|please|avoid|use)\b/i
    if (preferenceSignal.test(normalizedUser)) {
      const keyFragment = this.toKeyFragment(normalizedUser)
      await this.write({
        key: `preference_${keyFragment}`,
        value: normalizedUser.slice(0, 240),
        memoryType: 'preference',
        scopeType: input.context?.workspaceId ? 'workspace' : 'user',
        scopeId: input.context?.workspaceId || this.userId,
        sourceThreadId: input.threadId,
        importance: 0.6,
      })
    }
  }

  private toKeyFragment(value: string): string {
    const cleaned = value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
    return cleaned.slice(0, 48) || 'latest'
  }

  private rankMemories(
    memories: EditorMemoryRow[],
    input: { query: string; currentNoteId?: string; workspaceId?: string }
  ): EditorMemoryRow[] {
    const tokens = input.query
      .toLowerCase()
      .split(/\s+/)
      .filter((token) => token.length > 2)

    const scored = memories.map((memory) => {
      const haystack = `${memory.key}\n${memory.value}`.toLowerCase()
      const tokenMatches = tokens.reduce((count, token) => count + (haystack.includes(token) ? 1 : 0), 0)

      let scopeScore = 0
      if (memory.scope_type === 'note' && input.currentNoteId && memory.scope_id === input.currentNoteId) {
        scopeScore = 3
      } else if (
        memory.scope_type === 'workspace' &&
        input.workspaceId &&
        memory.scope_id === input.workspaceId
      ) {
        scopeScore = 2
      } else if (memory.scope_type === 'user') {
        scopeScore = 1
      }

      return {
        memory,
        score: scopeScore * 100 + tokenMatches * 10 + (memory.importance || 0),
      }
    })

    return scored
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        return b.memory.updated_at.localeCompare(a.memory.updated_at)
      })
      .map((entry) => entry.memory)
  }

  private async touch(memoryIds: string[]): Promise<void> {
    const uniqueIds = Array.from(new Set(memoryIds.filter(Boolean)))
    if (uniqueIds.length === 0) return

    await this.supabase
      .from('editor_memories')
      .update({ last_used_at: new Date().toISOString() })
      .in('id', uniqueIds)
  }
}
