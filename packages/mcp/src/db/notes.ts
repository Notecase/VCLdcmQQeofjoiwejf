/**
 * Notes & Projects DB Queries
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface NoteRow {
  id: string
  user_id: string
  project_id: string | null
  parent_note_id: string | null
  title: string
  content: string
  word_count: number
  character_count: number
  attachment_count: number
  is_pinned: boolean
  is_archived: boolean
  is_deleted: boolean
  created_at: string
  updated_at: string
}

export interface ProjectRow {
  id: string
  user_id: string
  parent_id: string | null
  name: string
  description: string | null
  icon: string
  color: string
  note_count: number
  subproject_count: number
  is_archived: boolean
  is_deleted: boolean
  created_at: string
  updated_at: string
}

const NOTE_COLUMNS =
  'id, user_id, project_id, parent_note_id, title, content, word_count, character_count, attachment_count, is_pinned, is_archived, is_deleted, created_at, updated_at'

const NOTE_LIST_COLUMNS =
  'id, project_id, parent_note_id, title, word_count, is_pinned, is_archived, is_deleted, created_at, updated_at'

const PROJECT_COLUMNS =
  'id, user_id, parent_id, name, description, icon, color, note_count, subproject_count, is_archived, is_deleted, created_at, updated_at'

export class NotesDb {
  constructor(
    private supabase: SupabaseClient,
    private userId: string
  ) {}

  async list(opts?: {
    projectId?: string
    includeDeleted?: boolean
    limit?: number
  }): Promise<NoteRow[]> {
    let query = this.supabase
      .from('notes')
      .select(NOTE_LIST_COLUMNS)
      .eq('user_id', this.userId)
      .order('updated_at', { ascending: false })
      .limit(opts?.limit ?? 50)

    if (!opts?.includeDeleted) {
      query = query.eq('is_deleted', false)
    }
    if (opts?.projectId) {
      query = query.eq('project_id', opts.projectId)
    }

    const { data, error } = await query
    if (error) throw new Error(`notes.list failed: ${error.message}`)
    return (data ?? []) as NoteRow[]
  }

  async get(noteId: string): Promise<NoteRow | null> {
    const { data, error } = await this.supabase
      .from('notes')
      .select(NOTE_COLUMNS)
      .eq('id', noteId)
      .eq('user_id', this.userId)
      .single()

    if (error || !data) return null
    return data as NoteRow
  }

  async create(opts: {
    title: string
    content?: string
    projectId?: string
  }): Promise<NoteRow> {
    const { data, error } = await this.supabase
      .from('notes')
      .insert({
        user_id: this.userId,
        title: opts.title,
        content: opts.content ?? '',
        project_id: opts.projectId ?? null,
      })
      .select(NOTE_COLUMNS)
      .single()

    if (error) throw new Error(`notes.create failed: ${error.message}`)
    return data as NoteRow
  }

  async update(
    noteId: string,
    opts: { title?: string; content?: string }
  ): Promise<NoteRow> {
    const updates: Record<string, unknown> = {}
    if (opts.title !== undefined) updates.title = opts.title
    if (opts.content !== undefined) updates.content = opts.content

    const { data, error } = await this.supabase
      .from('notes')
      .update(updates)
      .eq('id', noteId)
      .eq('user_id', this.userId)
      .select(NOTE_COLUMNS)
      .single()

    if (error) throw new Error(`notes.update failed: ${error.message}`)
    return data as NoteRow
  }

  async softDelete(noteId: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('notes')
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq('id', noteId)
      .eq('user_id', this.userId)

    if (error) throw new Error(`notes.delete failed: ${error.message}`)
    return true
  }

  async move(noteId: string, projectId: string | null): Promise<boolean> {
    const { error } = await this.supabase
      .from('notes')
      .update({ project_id: projectId })
      .eq('id', noteId)
      .eq('user_id', this.userId)

    if (error) throw new Error(`notes.move failed: ${error.message}`)
    return true
  }

  async getWithContext(noteId: string): Promise<{
    note: NoteRow
    project: ProjectRow | null
    siblings: NoteRow[]
  } | null> {
    const note = await this.get(noteId)
    if (!note) return null

    let project: ProjectRow | null = null
    if (note.project_id) {
      const { data } = await this.supabase
        .from('projects')
        .select(PROJECT_COLUMNS)
        .eq('id', note.project_id)
        .single()
      project = (data as ProjectRow) ?? null
    }

    let siblingQuery = this.supabase
      .from('notes')
      .select(NOTE_LIST_COLUMNS)
      .eq('user_id', this.userId)
      .eq('is_deleted', false)
      .neq('id', noteId)
      .order('updated_at', { ascending: false })
      .limit(10)

    if (note.project_id) {
      siblingQuery = siblingQuery.eq('project_id', note.project_id)
    } else {
      siblingQuery = siblingQuery.is('project_id', null)
    }

    const { data: siblings } = await siblingQuery

    return {
      note,
      project,
      siblings: (siblings ?? []) as NoteRow[],
    }
  }

  async listProjects(opts?: { includeArchived?: boolean }): Promise<ProjectRow[]> {
    let query = this.supabase
      .from('projects')
      .select(PROJECT_COLUMNS)
      .eq('user_id', this.userId)
      .eq('is_deleted', false)
      .order('name')

    if (!opts?.includeArchived) {
      query = query.eq('is_archived', false)
    }

    const { data, error } = await query
    if (error) throw new Error(`projects.list failed: ${error.message}`)
    return (data ?? []) as ProjectRow[]
  }
}
