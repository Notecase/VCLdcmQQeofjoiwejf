#!/usr/bin/env node

/**
 * Noteshell MCP Server — Entry Point
 *
 * Stdio transport for Claude Code / Codex CLI / OpenClaw integration.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { loadConfig } from './config.js'
import { createDbClient } from './db/client.js'
import { createServer } from './server.js'

async function main(): Promise<void> {
  const config = loadConfig()
  const db = await createDbClient(config)
  const server = createServer(db)

  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err) => {
  console.error('Noteshell MCP server failed to start:', err)
  process.exit(1)
})
