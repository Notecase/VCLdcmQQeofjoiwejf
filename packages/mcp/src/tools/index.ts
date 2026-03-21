/**
 * Tool Registration Orchestrator — Registers all 40 tools across 5 groups.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { DbClient } from '../db/client.js'
import { registerNoteTools } from './notes.js'
import { registerSecretaryTools } from './secretary.js'
import { registerContextTools } from './context.js'
import { registerCalendarTools } from './calendar.js'
import { registerSearchTools } from './search.js'

export function registerAllTools(server: McpServer, db: DbClient): void {
  registerNoteTools(server, db) // 12 tools
  registerSecretaryTools(server, db) // 18 tools
  registerContextTools(server, db) // 5 tools
  registerCalendarTools(server, db) // 3 tools
  registerSearchTools(server, db) // 2 tools
}
