/**
 * Notes Tools — 12 tools for note and project management
 */

import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { DbClient } from '../db/client.js'
import { NotesDb } from '../db/notes.js'
import { ArtifactsDb } from '../db/artifacts.js'
import { SearchDb } from '../db/search.js'
import { ok, err } from '../format/index.js'
import {
  formatNoteList,
  formatNote,
  formatNoteSummary,
  formatNoteOrganize,
  formatNoteExpanded,
  formatProjectList,
} from '../format/notes.js'
import { markdownTable } from '../format/tables.js'
import { relativeTime } from '../format/index.js'

export function registerNoteTools(server: McpServer, db: DbClient): void {
  const notes = new NotesDb(db.supabase, db.userId)
  const artifacts = new ArtifactsDb(db.supabase, db.userId)

  server.tool(
    'notes_list',
    'List notes. Filter by project. Returns title, id, word count, updated date.',
    {
      project_id: z.string().uuid().optional().describe('Filter by project UUID'),
      include_deleted: z.boolean().optional().describe('Include soft-deleted notes'),
      limit: z.number().int().min(1).max(100).optional().describe('Max results (default 50)'),
    },
    async ({ project_id, include_deleted, limit }) => {
      try {
        const result = await notes.list({ projectId: project_id, includeDeleted: include_deleted, limit })
        return ok(formatNoteList(result))
      } catch (e) {
        return err((e as Error).message)
      }
    }
  )

  server.tool(
    'notes_get',
    'Get a note by ID with full markdown content.',
    { note_id: z.string().uuid().describe('Note UUID') },
    async ({ note_id }) => {
      try {
        const note = await notes.get(note_id)
        if (!note) return err('Note not found')
        return ok(formatNote(note))
      } catch (e) {
        return err((e as Error).message)
      }
    }
  )

  server.tool(
    'notes_create',
    'Create a new note with title, content, and optional project.',
    {
      title: z.string().describe('Note title'),
      content: z.string().optional().describe('Markdown content'),
      project_id: z.string().uuid().optional().describe('Assign to project'),
    },
    async ({ title, content, project_id }) => {
      try {
        const note = await notes.create({ title, content, projectId: project_id })
        return ok(`Created note: **${note.title}** (${note.id})`)
      } catch (e) {
        return err((e as Error).message)
      }
    }
  )

  server.tool(
    'notes_update',
    'Update a note\'s title and/or content.',
    {
      note_id: z.string().uuid().describe('Note UUID'),
      title: z.string().optional().describe('New title'),
      content: z.string().optional().describe('New markdown content'),
    },
    async ({ note_id, title, content }) => {
      try {
        const note = await notes.update(note_id, { title, content })
        return ok(`Updated note: **${note.title}** (${note.id})`)
      } catch (e) {
        return err((e as Error).message)
      }
    }
  )

  server.tool(
    'notes_delete',
    'Soft-delete a note (sets is_deleted=true, recoverable).',
    { note_id: z.string().uuid().describe('Note UUID') },
    async ({ note_id }) => {
      try {
        await notes.softDelete(note_id)
        return ok(`Deleted note ${note_id}`)
      } catch (e) {
        return err((e as Error).message)
      }
    }
  )

  server.tool(
    'notes_move',
    'Move a note to a different project.',
    {
      note_id: z.string().uuid().describe('Note UUID'),
      project_id: z.string().uuid().nullable().describe('Target project UUID (null to unassign)'),
    },
    async ({ note_id, project_id }) => {
      try {
        await notes.move(note_id, project_id)
        return ok(`Moved note ${note_id} to project ${project_id ?? '(none)'}`)
      } catch (e) {
        return err((e as Error).message)
      }
    }
  )

  server.tool(
    'notes_search',
    'Full-text search across note titles and content.',
    {
      query: z.string().describe('Search query'),
      project_id: z.string().uuid().optional().describe('Filter by project'),
      limit: z.number().int().min(1).max(50).optional().describe('Max results'),
    },
    async ({ query, project_id, limit }) => {
      try {
        const search = new SearchDb(db.supabase, db.userId)
        const hits = await search.searchNotes(query, { projectId: project_id, limit })
        if (hits.length === 0) return ok(`No notes found for "${query}"`)
        const header = `## Search Results for "${query}" (${hits.length})\n\n`
        const rows = hits.map((h) => [h.title, h.id, h.snippet.slice(0, 60)])
        return ok(header + markdownTable(['Title', 'ID', 'Snippet'], rows))
      } catch (e) {
        return err((e as Error).message)
      }
    }
  )

  server.tool(
    'notes_organize',
    'Get note structure: headings, sections, word count.',
    { note_id: z.string().uuid().describe('Note UUID') },
    async ({ note_id }) => {
      try {
        const note = await notes.get(note_id)
        if (!note) return err('Note not found')
        return ok(formatNoteOrganize(note))
      } catch (e) {
        return err((e as Error).message)
      }
    }
  )

  server.tool(
    'notes_summarize',
    'Get note metadata: word count, headings, links, images.',
    { note_id: z.string().uuid().describe('Note UUID') },
    async ({ note_id }) => {
      try {
        const note = await notes.get(note_id)
        if (!note) return err('Note not found')
        return ok(formatNoteSummary(note))
      } catch (e) {
        return err((e as Error).message)
      }
    }
  )

  server.tool(
    'notes_expand',
    'Get note with project context and related notes in the same project.',
    { note_id: z.string().uuid().describe('Note UUID') },
    async ({ note_id }) => {
      try {
        const result = await notes.getWithContext(note_id)
        if (!result) return err('Note not found')
        return ok(formatNoteExpanded(result.note, result.project, result.siblings))
      } catch (e) {
        return err((e as Error).message)
      }
    }
  )

  server.tool(
    'artifacts_create',
    'Create a RENDERED, interactive HTML/CSS/JS widget that appears as a live component inside Noteshell (NOT as a code block). Use this instead of notes_create whenever the user asks for anything interactive: charts, timers, calculators, visualizations, games, dashboards. The artifact renders in an iframe inside the note.',
    {
      title: z.string().describe('Artifact title'),
      html: z.string().describe('Inner HTML markup (no <html>/<body> tags)'),
      css: z.string().optional().describe('CSS styles'),
      javascript: z.string().optional().describe('Vanilla JavaScript'),
      note_id: z.string().uuid().optional().describe('Note UUID to attach artifact to'),
    },
    async ({ title, html, css, javascript, note_id }) => {
      try {
        const artifact = await artifacts.create({ title, html, css, javascript, noteId: note_id })
        return ok(`Created artifact: **${artifact.title}** (${artifact.id})${note_id ? ` attached to note ${note_id}` : ''}`)
      } catch (e) {
        return err((e as Error).message)
      }
    }
  )

  server.tool(
    'notes_get_artifacts',
    'List artifacts (HTML/CSS/JS widgets) attached to a note.',
    { note_id: z.string().uuid().describe('Note UUID') },
    async ({ note_id }) => {
      try {
        const result = await artifacts.listByNote(note_id)
        if (result.length === 0) return ok('No artifacts attached to this note.')
        const header = `## Artifacts (${result.length})\n\n`
        const rows = result.map((a) => [a.title, a.id, a.status, relativeTime(a.created_at)])
        return ok(header + markdownTable(['Title', 'ID', 'Status', 'Created'], rows))
      } catch (e) {
        return err((e as Error).message)
      }
    }
  )

  server.tool(
    'projects_list',
    'List all projects/folders.',
    { include_archived: z.boolean().optional().describe('Include archived projects') },
    async ({ include_archived }) => {
      try {
        const result = await notes.listProjects({ includeArchived: include_archived })
        return ok(formatProjectList(result))
      } catch (e) {
        return err((e as Error).message)
      }
    }
  )
}
