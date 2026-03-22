/**
 * Calendar Tools — 3 tools for calendar events stored in memory files
 */

import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { DbClient } from '../db/client.js'
import { MemoryDb } from '../db/memory.js'
import { ok, err } from '../format/index.js'
import { formatMemoryFile } from '../format/memory.js'

const CALENDAR_FILE = 'Calendar.md'

export function registerCalendarTools(server: McpServer, db: DbClient): void {
  const memory = new MemoryDb(db.supabase, db.userId)

  server.tool(
    'calendar_events',
    'List events from Calendar.md memory file. Optional date range filtering.',
    {
      date_from: z.string().optional().describe('Filter events from this date (YYYY-MM-DD)'),
      date_to: z.string().optional().describe('Filter events up to this date (YYYY-MM-DD)'),
    },
    async ({ date_from, date_to }) => {
      try {
        const file = await memory.read(CALENDAR_FILE)
        if (!file || !file.content.trim()) return ok('No calendar events found.')

        // If no date filter, return everything
        if (!date_from && !date_to) {
          return ok(formatMemoryFile(file))
        }

        // Filter lines by date range
        const lines = file.content.split('\n')
        const datePattern = /(\d{4}-\d{2}-\d{2})/
        const filtered = lines.filter((line) => {
          const match = line.match(datePattern)
          if (!match) return true // Keep non-event lines (headers, empty lines)
          const date = match[1]
          if (date_from && date < date_from) return false
          if (date_to && date > date_to) return false
          return true
        })

        const result = filtered.join('\n').trim()
        if (!result || result === '# Calendar')
          return ok('No calendar events in the specified range.')
        return ok(result)
      } catch (e) {
        return err((e as Error).message)
      }
    }
  )

  server.tool(
    'calendar_add',
    'Add an event to Calendar.md.',
    {
      date: z.string().describe('Date (YYYY-MM-DD)'),
      time: z.string().optional().describe('Time (HH:MM)'),
      title: z.string().describe('Event title'),
      description: z.string().optional().describe('Event details'),
    },
    async ({ date, time, title, description }) => {
      try {
        const file = await memory.read(CALENDAR_FILE)
        const content = file?.content ?? '# Calendar\n'
        const timeStr = time ? ` ${time}` : ''
        const descStr = description ? `\n  ${description}` : ''
        const entry = `\n- **${date}${timeStr}** — ${title}${descStr}`
        await memory.write(CALENDAR_FILE, content + entry)
        return ok(`Added event: ${date}${timeStr} — ${title}`)
      } catch (e) {
        return err((e as Error).message)
      }
    }
  )

  server.tool(
    'calendar_update',
    'Update or remove a calendar event by rewriting Calendar.md.',
    {
      action: z.enum(['update', 'remove']).describe('Update or remove the event'),
      event_pattern: z.string().describe('Text pattern to find the event'),
      replacement: z.string().optional().describe('Replacement text (for update action)'),
    },
    async ({ action, event_pattern, replacement }) => {
      try {
        const file = await memory.read(CALENDAR_FILE)
        if (!file) return err('Calendar.md not found')
        let updated: string
        if (action === 'remove') {
          const lines = file.content.split('\n').filter((l) => !l.includes(event_pattern))
          updated = lines.join('\n')
        } else {
          if (!replacement) return err('Replacement text required for update action')
          updated = file.content.replace(event_pattern, replacement)
        }
        await memory.write(CALENDAR_FILE, updated)
        return ok(`Calendar event ${action}d`)
      } catch (e) {
        return err((e as Error).message)
      }
    }
  )
}
