/**
 * Note Formatting — compact markdown for MCP responses
 */

import type { NoteRow, ProjectRow } from '../db/notes.js'
import { relativeTime, formatNumber } from './index.js'
import { markdownTable } from './tables.js'

/**
 * Format a list of notes as a markdown table.
 */
export function formatNoteList(notes: NoteRow[]): string {
  if (notes.length === 0) return 'No notes found.'

  const header = `## Notes (${notes.length} results)\n\n`
  const rows = notes.map((n) => [
    n.title,
    n.id,
    formatNumber(n.word_count) + 'w',
    relativeTime(n.updated_at),
  ])

  return header + markdownTable(['Title', 'ID', 'Words', 'Updated'], rows)
}

/**
 * Format a single note with full content.
 */
export function formatNote(note: NoteRow, projectName?: string): string {
  const parts: string[] = []
  parts.push(`# ${note.title}`)
  parts.push(
    `**ID:** ${note.id} | **Project:** ${projectName ?? 'None'} | **Words:** ${formatNumber(note.word_count)} | **Updated:** ${relativeTime(note.updated_at)}`
  )
  parts.push('---')
  parts.push(note.content)

  return parts.join('\n')
}

/**
 * Format note metadata summary (no content).
 */
export function formatNoteSummary(note: NoteRow): string {
  const headings = extractHeadings(note.content)
  const links = (note.content.match(/\[([^\]]+)\]\([^)]+\)/g) ?? []).length
  const images = (note.content.match(/!\[([^\]]*)\]\([^)]+\)/g) ?? []).length

  const parts: string[] = []
  parts.push(`# ${note.title} — Summary`)
  parts.push(`- **Words:** ${formatNumber(note.word_count)}`)
  parts.push(`- **Headings:** ${headings.length}`)
  parts.push(`- **Links:** ${links}`)
  parts.push(`- **Images:** ${images}`)
  parts.push(`- **Created:** ${relativeTime(note.created_at)}`)
  parts.push(`- **Updated:** ${relativeTime(note.updated_at)}`)

  if (headings.length > 0) {
    parts.push('')
    parts.push('## Structure')
    for (const h of headings) {
      parts.push(`${'  '.repeat(h.level - 1)}- ${h.text}`)
    }
  }

  return parts.join('\n')
}

/**
 * Format note structure (headings, sections).
 */
export function formatNoteOrganize(note: NoteRow): string {
  const headings = extractHeadings(note.content)
  const parts: string[] = []
  parts.push(`# ${note.title} — Structure`)
  parts.push(`**Sections:** ${headings.length} | **Words:** ${formatNumber(note.word_count)}`)
  parts.push('')

  if (headings.length === 0) {
    parts.push('No headings found. Note has flat structure.')
  } else {
    for (const h of headings) {
      const indent = '  '.repeat(h.level - 1)
      parts.push(`${indent}- ${'#'.repeat(h.level)} ${h.text}`)
    }
  }

  return parts.join('\n')
}

/**
 * Format note with expanded context (project + siblings).
 */
export function formatNoteExpanded(
  note: NoteRow,
  project: ProjectRow | null,
  siblings: NoteRow[]
): string {
  const parts: string[] = []
  parts.push(formatNote(note, project?.name))

  if (project) {
    parts.push('')
    parts.push(`## Project: ${project.icon} ${project.name}`)
    if (project.description) parts.push(project.description)
    parts.push(`${project.note_count} notes | ${project.subproject_count} subprojects`)
  }

  if (siblings.length > 0) {
    parts.push('')
    parts.push('## Related Notes in Project')
    for (const s of siblings.slice(0, 5)) {
      parts.push(
        `- **${s.title}** (${s.id}) — ${formatNumber(s.word_count)}w, ${relativeTime(s.updated_at)}`
      )
    }
  }

  return parts.join('\n')
}

/**
 * Format a list of projects.
 */
export function formatProjectList(projects: ProjectRow[]): string {
  if (projects.length === 0) return 'No projects found.'

  const header = `## Projects (${projects.length})\n\n`
  const rows = projects.map((p) => [
    `${p.icon} ${p.name}`,
    p.id,
    String(p.note_count),
    relativeTime(p.updated_at),
  ])

  return header + markdownTable(['Name', 'ID', 'Notes', 'Updated'], rows)
}

// ── Internal helpers ─────────────────────────────

interface Heading {
  level: number
  text: string
}

function extractHeadings(content: string): Heading[] {
  const headings: Heading[] = []
  const lines = content.split('\n')
  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+)/)
    if (match) {
      headings.push({ level: match[1].length, text: match[2].trim() })
    }
  }
  return headings
}
