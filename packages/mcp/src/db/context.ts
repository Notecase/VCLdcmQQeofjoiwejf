/**
 * Context Bus & Soul DB Queries
 *
 * Adapted from packages/ai/src/services/shared-context.service.ts.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface ContextEntryRow {
  id: string
  user_id: string
  agent: string
  type: string
  summary: string
  payload: Record<string, unknown>
  expires_at: string | null
  created_at: string
}

export class ContextDb {
  constructor(
    private supabase: SupabaseClient,
    private userId: string
  ) {}

  async readEntries(opts?: {
    types?: string[]
    limit?: number
  }): Promise<ContextEntryRow[]> {
    let query = this.supabase
      .from('user_context_entries')
      .select('*')
      .eq('user_id', this.userId)
      .order('created_at', { ascending: false })
      .limit(opts?.limit ?? 20)

    if (opts?.types && opts.types.length > 0) {
      query = query.in('type', opts.types)
    }

    const { data, error } = await query
    if (error) throw new Error(`context.readEntries failed: ${error.message}`)
    return (data ?? []) as ContextEntryRow[]
  }

  async writeEntry(entry: {
    agent: string
    type: string
    summary: string
    payload?: Record<string, unknown>
    expiresAt?: string
  }): Promise<void> {
    const { error } = await this.supabase.from('user_context_entries').insert({
      user_id: this.userId,
      agent: entry.agent,
      type: entry.type,
      summary: entry.summary,
      payload: entry.payload ?? {},
      expires_at: entry.expiresAt ?? null,
    })

    if (error) throw new Error(`context.writeEntry failed: ${error.message}`)
  }

  async readSoul(): Promise<string> {
    const { data } = await this.supabase
      .from('user_soul')
      .select('content')
      .eq('user_id', this.userId)
      .maybeSingle()

    return data?.content ?? ''
  }

  async writeSoul(content: string): Promise<void> {
    const { error } = await this.supabase.from('user_soul').upsert(
      {
        user_id: this.userId,
        content,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )

    if (error) throw new Error(`context.writeSoul failed: ${error.message}`)
  }
}
