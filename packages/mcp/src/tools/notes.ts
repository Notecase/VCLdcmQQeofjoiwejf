/**
 * Notes Tools — 15 tools for note and project management
 *
 * Includes 3 surgical editing tools: edit_note, append_to_note, remove_from_note
 */

import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { DbClient } from '../db/client.js'
import { NotesDb } from '../db/notes.js'
import { ArtifactsDb } from '../db/artifacts.js'
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
import {
  parseMarkdownStructure,
  findBlocksByHeading,
  spliceAtBlockIndex,
} from '@inkdown/shared/utils'

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
        const result = await notes.list({
          projectId: project_id,
          includeDeleted: include_deleted,
          limit,
        })
        return ok(formatNoteList(result))
      } catch (e) {
        return err((e as Error).message)
      }
    }
  )

  server.tool(
    'notes_get',
    'Get a note by ID with full markdown content and optional block structure.',
    {
      note_id: z.string().uuid().describe('Note UUID'),
      include_structure: z
        .boolean()
        .optional()
        .describe('Include numbered block index table (default true)'),
    },
    async ({ note_id, include_structure }) => {
      try {
        const note = await notes.get(note_id)
        if (!note) return err('Note not found')

        let output = formatNote(note)

        if (include_structure !== false && note.content.trim()) {
          const parsed = parseMarkdownStructure(note.content)
          const blockTable = parsed.blocks
            .map(
              (b, i) =>
                `[${i}] ${b.type}${b.metadata?.heading ? `: ${b.metadata.heading}` : ''} (lines ${b.startLine}-${b.endLine})`
            )
            .join('\n')
          output += `\n\n---\n## Block Structure\n\`\`\`\n${blockTable}\n\`\`\``
        }

        return ok(output)
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
    "Update a note's title and/or content.",
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

  // notes_search removed — duplicated by search_notes in search.ts

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
      note_id: z.string().uuid().describe('Note UUID to attach artifact to'),
    },
    async ({ title, html, css, javascript, note_id }) => {
      try {
        const artifact = await artifacts.create({ title, html, css, javascript, noteId: note_id })
        return ok(
          `Created artifact: **${artifact.title}** (${artifact.id})${note_id ? ` attached to note ${note_id}` : ''}`
        )
      } catch (e) {
        return err((e as Error).message)
      }
    }
  )

  server.tool(
    'notes_get_artifacts',
    'List artifacts (HTML/CSS/JS widgets). Pass note_id to filter by note, or omit to list all.',
    { note_id: z.string().uuid().optional().describe('Note UUID (omit to list all artifacts)') },
    async ({ note_id }) => {
      try {
        const result = note_id ? await artifacts.listByNote(note_id) : await artifacts.listAll()
        if (result.length === 0)
          return ok(note_id ? 'No artifacts attached to this note.' : 'No artifacts found.')
        const header = `## Artifacts (${result.length})\n\n`
        const rows = result.map((a) => [a.title, a.id, a.status, relativeTime(a.created_at)])
        return ok(header + markdownTable(['Title', 'ID', 'Status', 'Created'], rows))
      } catch (e) {
        return err((e as Error).message)
      }
    }
  )

  // =========================================================================
  // Surgical Editing Tools
  // =========================================================================

  server.tool(
    'edit_note',
    'Surgically replace text in a note. Finds the exact oldText and replaces with newText. Returns original and proposed content for diff display.',
    {
      note_id: z.string().uuid().describe('Note UUID'),
      old_text: z.string().min(1).describe('Exact text to find and replace'),
      new_text: z.string().describe('Replacement text (empty string to delete)'),
    },
    async ({ note_id, old_text, new_text }) => {
      try {
        const note = await notes.get(note_id)
        if (!note) return err('Note not found')

        const original = note.content
        const occurrences = original.split(old_text).length - 1

        if (occurrences === 0) {
          return err(`Text not found in note. First 200 chars of note:\n${original.slice(0, 200)}`)
        }
        if (occurrences > 1) {
          return err(
            `Found ${occurrences} occurrences of the text. Provide more surrounding context to make the match unique.`
          )
        }

        const proposed = original.replace(old_text, new_text)
        await notes.update(note_id, { content: proposed })

        const editId = crypto.randomUUID()
        return ok(
          JSON.stringify({
            success: true,
            editId,
            noteId: note_id,
            oldText: old_text,
            newText: new_text,
            original,
            proposed,
          })
        )
      } catch (e) {
        return err((e as Error).message)
      }
    }
  )

  server.tool(
    'append_to_note',
    'Append content to a note. Can insert after a heading, after a block index, or at the end.',
    {
      note_id: z.string().uuid().describe('Note UUID'),
      content: z.string().min(1).describe('Markdown content to insert'),
      after_heading: z
        .string()
        .optional()
        .describe('Insert after the section with this heading text'),
      after_block_index: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe(
          'Insert after this block index (0-based). Call notes_get with include_structure first'
        ),
    },
    async ({ note_id, content: newContent, after_heading, after_block_index }) => {
      try {
        const note = await notes.get(note_id)
        if (!note) return err('Note not found')

        const original = note.content

        let targetIndex: number | undefined = after_block_index

        if (after_heading && targetIndex === undefined) {
          const parsed = parseMarkdownStructure(original)
          const matches = findBlocksByHeading(parsed, after_heading)
          if (matches.length > 0) {
            targetIndex = parsed.blocks.indexOf(matches[0])
          }
        }

        const proposed = spliceAtBlockIndex(
          original,
          targetIndex,
          'insert-after',
          newContent.trim()
        )
        await notes.update(note_id, { content: proposed })

        return ok(
          JSON.stringify({
            success: true,
            noteId: note_id,
            original,
            proposed,
          })
        )
      } catch (e) {
        return err((e as Error).message)
      }
    }
  )

  server.tool(
    'remove_from_note',
    'Remove text from a note. Finds exact match and removes it, cleaning up double blank lines.',
    {
      note_id: z.string().uuid().describe('Note UUID'),
      text_to_remove: z.string().min(1).describe('Exact text to remove from the note'),
    },
    async ({ note_id, text_to_remove }) => {
      try {
        const note = await notes.get(note_id)
        if (!note) return err('Note not found')

        const original = note.content

        if (!original.includes(text_to_remove)) {
          return err(`Text not found in note. First 200 chars of note:\n${original.slice(0, 200)}`)
        }

        let proposed = original.replace(text_to_remove, '')
        // Clean up double blank lines left by removal
        proposed = proposed.replace(/\n{3,}/g, '\n\n')

        await notes.update(note_id, { content: proposed })

        return ok(
          JSON.stringify({
            success: true,
            noteId: note_id,
            original,
            proposed,
          })
        )
      } catch (e) {
        return err((e as Error).message)
      }
    }
  )

  // =========================================================================
  // Project Tools
  // =========================================================================

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
