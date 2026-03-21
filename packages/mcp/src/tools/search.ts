/**
 * Search Tools — 2 tools for full-text search
 */

import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { DbClient } from '../db/client.js'
import { SearchDb } from '../db/search.js'
import { ok, err, relativeTime } from '../format/index.js'
import { markdownTable } from '../format/tables.js'

export function registerSearchTools(server: McpServer, db: DbClient): void {
  const search = new SearchDb(db.supabase, db.userId)

  server.tool(
    'search_notes',
    'Search notes by content/title using Postgres full-text search.',
    {
      query: z.string().describe('Search query'),
      project_id: z.string().uuid().optional().describe('Filter by project'),
      limit: z.number().int().min(1).max(50).optional().describe('Max results'),
    },
    async ({ query, project_id, limit }) => {
      try {
        const hits = await search.searchNotes(query, { projectId: project_id, limit })
        if (hits.length === 0) return ok(`No notes found for "${query}"`)
        const header = `## Note Search: "${query}" (${hits.length} results)\n\n`
        const rows = hits.map((h) => [h.title, h.id, h.snippet.slice(0, 60), relativeTime(h.updated_at)])
        return ok(header + markdownTable(['Title', 'ID', 'Snippet', 'Updated'], rows))
      } catch (e) {
        return err((e as Error).message)
      }
    }
  )

  server.tool(
    'search_global',
    'Search across notes AND memory files.',
    {
      query: z.string().describe('Search query'),
      limit: z.number().int().min(1).max(50).optional().describe('Max results'),
    },
    async ({ query, limit }) => {
      try {
        const hits = await search.searchGlobal(query, { limit })
        if (hits.length === 0) return ok(`No results found for "${query}"`)
        const header = `## Global Search: "${query}" (${hits.length} results)\n\n`
        const rows = hits.map((h) => [h.title, h.source, h.snippet.slice(0, 60), relativeTime(h.updated_at)])
        return ok(header + markdownTable(['Title', 'Source', 'Snippet', 'Updated'], rows))
      } catch (e) {
        return err((e as Error).message)
      }
    }
  )
}
