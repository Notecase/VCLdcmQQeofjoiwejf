/**
 * Shared Context Service
 *
 * Provides cross-agent context sharing via a Supabase-backed logbook.
 * Agents read recent entries to enrich their prompts, and write entries
 * after significant actions so other agents can be aware.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ContextEntry, ContextEntryType } from '@inkdown/shared/types'

export interface SharedContextReadOptions {
  relevantTypes?: ContextEntryType[]
  maxEntries?: number
  maxChars?: number
}

interface ContextRow {
  agent: string
  type: string
  summary: string
  payload: Record<string, unknown>
  created_at: string
}

export class SharedContextService {
  constructor(
    private supabase: SupabaseClient,
    private userId: string
  ) {}

  /**
   * Read cross-agent context as a formatted markdown string for prompt injection.
   * Returns empty string if no entries exist or on error.
   */
  async read(options?: SharedContextReadOptions): Promise<string> {
    const maxEntries = options?.maxEntries ?? 10
    const maxChars = options?.maxChars ?? 800

    try {
      let query = this.supabase
        .from('user_context_entries')
        .select('agent, type, summary, payload, created_at')
        .eq('user_id', this.userId)
        .order('created_at', { ascending: false })
        .limit(maxEntries)

      if (options?.relevantTypes && options.relevantTypes.length > 0) {
        query = query.in('type', options.relevantTypes)
      }

      const { data, error } = await query

      if (error || !data || data.length === 0) return ''

      // Also read soul content
      const soul = await this.readSoul()

      // Group entries by type for readable output
      const grouped = new Map<string, ContextRow[]>()
      for (const row of data as ContextRow[]) {
        // Skip expired entries
        const existing = grouped.get(row.type) || []
        existing.push(row)
        grouped.set(row.type, existing)
      }

      const parts: string[] = ['### Cross-Agent Context']

      if (soul) {
        parts.push('')
        parts.push('**Your Goals & Style**')
        parts.push(soul.slice(0, 300))
      }

      const typeLabels: Record<string, string> = {
        active_plan: 'Active Plans',
        research_done: 'Recent Research',
        course_saved: 'Courses',
        note_created: 'Recent Notes',
        note_edited: 'Recent Edits',
        goal_set: 'Goals',
        soul_updated: 'Preferences',
      }

      for (const [type, entries] of grouped) {
        const label = typeLabels[type] || type
        parts.push('')
        parts.push(`**${label}**`)
        for (const entry of entries.slice(0, 3)) {
          if (entry.summary) {
            parts.push(`- ${entry.summary}`)
          }
        }
      }

      const result = parts.join('\n')
      return result.length > maxChars ? result.slice(0, maxChars) + '...' : result
    } catch {
      // Graceful degradation — context bus failure should never block the agent
      return ''
    }
  }

  /**
   * Write one context entry after a significant action.
   * Errors are swallowed to avoid blocking agent operations.
   */
  async write(entry: ContextEntry): Promise<void> {
    try {
      await this.supabase.from('user_context_entries').insert({
        user_id: this.userId,
        agent: entry.agent,
        type: entry.type,
        summary: entry.summary,
        payload: entry.payload,
        expires_at: entry.expiresAt || null,
      })
    } catch {
      // Swallow — context writes are best-effort
    }
  }

  /**
   * Read user's SOUL preferences.
   * Returns empty string if not set or on error.
   */
  async readSoul(): Promise<string> {
    try {
      const { data } = await this.supabase
        .from('user_soul')
        .select('content')
        .eq('user_id', this.userId)
        .maybeSingle()

      return data?.content || ''
    } catch {
      return ''
    }
  }

  /**
   * Update user's SOUL preferences.
   */
  async writeSoul(content: string): Promise<void> {
    await this.supabase.from('user_soul').upsert(
      {
        user_id: this.userId,
        content,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
  }
}
