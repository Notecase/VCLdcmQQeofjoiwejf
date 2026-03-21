/**
 * Artifact DB Queries
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface ArtifactRow {
  id: string
  note_id: string | null
  title: string
  html: string
  css: string
  javascript: string
  status: string
  created_at: string
  updated_at: string
}

export class ArtifactsDb {
  constructor(
    private supabase: SupabaseClient,
    private userId: string
  ) {}

  async listByNote(noteId: string): Promise<ArtifactRow[]> {
    const { data, error } = await this.supabase
      .from('artifacts')
      .select('id, note_id, title, html, css, javascript, status, created_at, updated_at')
      .eq('user_id', this.userId)
      .eq('note_id', noteId)
      .order('created_at', { ascending: false })

    if (error) throw new Error(`artifacts.listByNote failed: ${error.message}`)
    return (data ?? []) as ArtifactRow[]
  }

  async create(opts: {
    title: string
    html: string
    css?: string
    javascript?: string
    noteId?: string
  }): Promise<ArtifactRow> {
    const { data, error } = await this.supabase
      .from('artifacts')
      .insert({
        user_id: this.userId,
        note_id: opts.noteId ?? null,
        title: opts.title,
        html: opts.html,
        css: opts.css ?? '',
        javascript: opts.javascript ?? '',
        status: 'pending',
      })
      .select('id, note_id, title, html, css, javascript, status, created_at, updated_at')
      .single()

    if (error) throw new Error(`artifacts.create failed: ${error.message}`)
    return data as ArtifactRow
  }
}
