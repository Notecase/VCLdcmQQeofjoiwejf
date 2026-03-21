/**
 * Context & Soul Tools — 5 tools for cross-agent context and user preferences
 */

import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { DbClient } from '../db/client.js'
import { ContextDb } from '../db/context.js'
import { ok, err, relativeTime } from '../format/index.js'
import { markdownTable } from '../format/tables.js'

export function registerContextTools(server: McpServer, db: DbClient): void {
  const ctx = new ContextDb(db.supabase, db.userId)

  server.tool(
    'context_read',
    'Read recent context entries, optionally filtered by type.',
    {
      types: z
        .array(
          z.enum([
            'active_plan',
            'research_done',
            'course_saved',
            'note_created',
            'note_edited',
            'goal_set',
            'soul_updated',
          ])
        )
        .optional()
        .describe('Filter by context type(s)'),
      limit: z.number().int().min(1).max(50).optional().describe('Max entries'),
    },
    async ({ types, limit }) => {
      try {
        const entries = await ctx.readEntries({ types, limit })
        if (entries.length === 0) return ok('No context entries found.')
        const header = `## Context Entries (${entries.length})\n\n`
        const rows = entries.map((e) => [
          e.type,
          e.agent,
          e.summary.slice(0, 60),
          relativeTime(e.created_at),
        ])
        return ok(header + markdownTable(['Type', 'Agent', 'Summary', 'When'], rows))
      } catch (e) {
        return err((e as Error).message)
      }
    }
  )

  server.tool(
    'context_write',
    'Write a new context entry to the shared logbook.',
    {
      agent: z.string().describe('Agent name (e.g. "mcp", "secretary")'),
      type: z
        .enum([
          'active_plan',
          'research_done',
          'course_saved',
          'note_created',
          'note_edited',
          'goal_set',
          'soul_updated',
        ])
        .describe('Entry type'),
      summary: z.string().describe('Human-readable summary'),
      payload: z.record(z.unknown()).optional().describe('Structured data payload'),
    },
    async ({ agent, type, summary, payload }) => {
      try {
        await ctx.writeEntry({ agent, type, summary, payload })
        return ok(`Context entry written: [${type}] ${summary}`)
      } catch (e) {
        return err((e as Error).message)
      }
    }
  )

  server.tool(
    'context_entries',
    'List all recent context entries (unfiltered, last 20).',
    {},
    async () => {
      try {
        const entries = await ctx.readEntries({ limit: 20 })
        if (entries.length === 0) return ok('No context entries yet.')
        const header = `## Recent Context (${entries.length})\n\n`
        const rows = entries.map((e) => [
          e.type,
          e.agent,
          e.summary.slice(0, 60),
          relativeTime(e.created_at),
        ])
        return ok(header + markdownTable(['Type', 'Agent', 'Summary', 'When'], rows))
      } catch (e) {
        return err((e as Error).message)
      }
    }
  )

  server.tool(
    'soul_read',
    "Read user's soul (goals, preferences, learning style).",
    {},
    async () => {
      try {
        const soul = await ctx.readSoul()
        if (!soul) return ok('No soul content set yet.')
        return ok(`## Your Soul\n\n${soul}`)
      } catch (e) {
        return err((e as Error).message)
      }
    }
  )

  server.tool(
    'soul_update',
    "Update user's soul content (goals, preferences, learning style).",
    { content: z.string().describe('Full soul markdown content') },
    async ({ content }) => {
      try {
        await ctx.writeSoul(content)
        return ok('Soul updated.')
      } catch (e) {
        return err((e as Error).message)
      }
    }
  )
}
