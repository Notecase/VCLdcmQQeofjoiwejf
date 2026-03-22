/**
 * Noteshell MCP Server — McpServer instance + tool registration
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { DbClient } from './db/client.js'
import { registerAllTools } from './tools/index.js'

/**
 * Create and configure the McpServer with all tools registered.
 */
export function createServer(db: DbClient): McpServer {
  const server = new McpServer({
    name: 'noteshell',
    version: '0.1.0',
  })

  registerAllTools(server, db)

  return server
}
