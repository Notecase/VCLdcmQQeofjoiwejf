# Research: Plugin Architectures, MCP Servers, and AI Platform Integrations

**Date:** 2026-03-12
**Purpose:** Comprehensive research on how AI coding assistants (Claude Code, Codex CLI) integrate with external platforms via plugins, skills, and MCP servers -- informing how Inkdown could expose itself to these tools.

---

## 1. Superdesign Plugin Architecture

### What It Is

Superdesign is an open-source AI design agent that lives inside IDEs (Cursor, Windsurf, Claude Code, VS Code). It generates UI mockups, wireframes, components, logos, and SVG icons from natural language prompts. Created by @jasonzhou1993 and @jackjack_eth.

### Two Distribution Mechanisms

Superdesign ships **two separate packages** for Claude Code integration:

#### A. MCP Server (`jonthebeef/superdesign-mcp-claude-code`)

- A standalone MCP server that registers tools directly into Claude Code
- Operates as a **"design orchestrator"** -- it does NOT generate designs itself. Instead, it translates requests into highly structured specifications and hands them to the IDE's built-in LLM to execute
- **No API key required** -- leverages Claude Code's existing LLM connection
- Exposes 5 tools:
  - `superdesign_generate` -- returns design specifications for the LLM to execute
  - `superdesign_iterate` -- returns iteration instructions to improve existing designs
  - `superdesign_extract_system` -- extracts design systems from existing work
  - `superdesign_list` -- lists all created designs in the workspace
  - `superdesign_gallery` -- generates an interactive HTML gallery
- All designs saved locally in `.superdesign/` directory inside the project

#### B. Claude Code Skill (`superdesigndev/superdesign-skill`)

- A simpler integration using the SKILL.md format
- Located at `skills/superdesign/SKILL.md`
- Contains YAML frontmatter (name, description) + markdown instructions
- Auto-activates when Claude detects design-related conversation context
- Can reference optional scripts/, references/, and assets/ directories

### VS Code Extension Architecture (the core product)

- Source files in `src/tools/`: `read-tool.ts`, `write-tool.ts`, `theme-tool.ts` (9 tools total)
- All tools receive an `ExecutionContext` with working directory path, output channel, abort controller
- Enforces a **four-step gated workflow** requiring user approval between stages
- System prompt (~200 lines) defines workflow + styling guidelines
- `FileSystemWatcher` monitors `design_iterations/` for changes with glob pattern `**/*{html,svg,css}`
- Configuration via VS Code settings commands (`superdesign.configureApiKey`, `superdesign.openSettings`)
- Creates IDE-specific integration files: `.cursor/rules/design.mdc`, `CLAUDE.md`, `.windsurfrules`

### Key Architectural Insight

Superdesign demonstrates the **"orchestrator" pattern**: the MCP server doesn't do the heavy lifting itself. It provides structured context/specifications that the host LLM executes. This is highly relevant for Inkdown -- an MCP server could provide note context, document structure, and editing specifications without duplicating AI logic.

**Sources:**

- [Superdesign GitHub](https://github.com/superdesigndev/superdesign)
- [Superdesign Skill GitHub](https://github.com/superdesigndev/superdesign-skill)
- [Superdesign MCP Server](https://github.com/jonthebeef/superdesign-mcp-claude-code)
- [DeepWiki Analysis](https://deepwiki.com/superdesigndev/superdesign)
- [MCPMarket Listing](https://mcpmarket.com/server/superdesign)

---

## 2. Claude Code Plugin/Skill System

### Plugin Architecture

A Claude Code plugin is a directory containing a manifest and optional skills, agents, hooks, and MCP servers. Plugins launched in public beta October 2025 and are now stable.

#### Directory Layout

```
my-plugin/
  .claude-plugin/
    plugin.json          # Manifest (ONLY file inside .claude-plugin/)
  commands/              # Slash command definitions
  agents/                # Agent definitions (Markdown files)
  skills/                # Skill directories, each with SKILL.md
  hooks/
    hooks.json           # Hook configurations
  scripts/               # Hook and utility scripts
  .mcp.json              # MCP server definitions
  LICENSE
  CHANGELOG.md
```

**Critical rule:** Components (commands, agents, hooks, skills) must be at the plugin root level, NOT inside `.claude-plugin/`. Only `plugin.json` belongs in `.claude-plugin/`.

#### plugin.json Format

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "What this plugin does",
  "author": "author-name",
  "repository": "https://github.com/...",
  "license": "MIT",
  "keywords": ["design", "ui"]
}
```

Required fields: `name`, `version`, `description`.

### Skills System (SKILL.md)

Skills are the primary extension point for Claude Code. Each skill is a directory containing a `SKILL.md` file.

#### SKILL.md Format

```markdown
---
name: my-skill
description: 'What this skill does and WHEN Claude should use it. This is the discovery mechanism.'
disable-model-invocation: false
allowed-tools:
  - Bash
  - Read
  - Write
---

# Instructions

[Markdown instructions that Claude follows when the skill is activated]
```

#### Frontmatter Fields

| Field                      | Required    | Purpose                                                                                                |
| -------------------------- | ----------- | ------------------------------------------------------------------------------------------------------ |
| `name`                     | Recommended | Max 64 chars, lowercase letters/numbers/hyphens only                                                   |
| `description`              | Recommended | Max 1024 chars. THE key field -- Claude matches this to decide when to activate                        |
| `disable-model-invocation` | Optional    | `true` = only user can invoke (via slash command). Use for side-effect workflows like /commit, /deploy |
| `user-invocable`           | Optional    | `false` = only Claude can invoke (background knowledge, not a command)                                 |
| `allowed-tools`            | Optional    | Tools Claude can use without per-use approval when skill is active. CLI-only feature, not SDK          |

#### How Auto-Activation Works (Progressive Disclosure)

1. **Startup**: Claude pre-loads ONLY the `name` + `description` of every installed skill into its system prompt. Lightweight -- many skills, minimal context cost.
2. **Matching**: When user request matches a skill's description, Claude decides to activate it.
3. **Loading**: Claude reads the full SKILL.md from the filesystem via bash, bringing full instructions into context.
4. **Execution**: Claude follows the instructions in the markdown body.

This is a two-tier system: cheap metadata for discovery, full instructions loaded on demand.

### Hooks System

Claude Code provides 12 lifecycle events for hooks:

| Event               | Purpose                                                     |
| ------------------- | ----------------------------------------------------------- |
| `PreToolUse`        | Before any tool execution. Can approve/deny/modify          |
| `PostToolUse`       | After tool execution. Can check/format results              |
| `PermissionRequest` | When Claude needs permission                                |
| `UserPromptSubmit`  | Validate/enrich prompts before Claude processes             |
| `SessionStart`      | Set up environment, load context                            |
| `SessionEnd`        | Clean up, log                                               |
| `Notification`      | Alert events (permission_prompt, idle_prompt, auth_success) |
| `Stop`              | End-of-response control                                     |
| `SubagentStop`      | Subagent completion                                         |
| `PreCompact`        | Before context compaction                                   |

MCP server tools appear as regular tools in tool events (PreToolUse, PostToolUse, etc.), so hooks can intercept MCP tool calls the same way.

### MCP Configuration in Plugins

Plugins configure MCP servers in `.mcp.json` at the plugin root:

```json
{
  "mcpServers": {
    "my-server": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/dist/server.js"],
      "env": {
        "API_KEY": "${MY_API_KEY}"
      }
    }
  }
}
```

- `${CLAUDE_PLUGIN_ROOT}` resolves to the plugin directory
- Servers auto-start when the plugin enables
- Must restart Claude Code to apply MCP server changes
- Supports stdio, SSE, and HTTP transports

### Distribution

- Install via `/plugin` command or configure in `.claude/settings.json`
- Organization-level skills deployed workspace-wide (shipped Dec 18, 2025)
- Official plugin directory at `anthropics/claude-plugins-official`
- Community marketplaces (SkillsMP, etc.)

**Sources:**

- [Create Plugins - Claude Code Docs](https://code.claude.com/docs/en/plugins)
- [Plugins Reference](https://code.claude.com/docs/en/plugins-reference)
- [Extend Claude with Skills](https://code.claude.com/docs/en/skills)
- [Hooks Reference](https://code.claude.com/docs/en/hooks)
- [Claude Code Plugins README](https://github.com/anthropics/claude-code/blob/main/plugins/README.md)
- [Official Plugins Repository](https://github.com/anthropics/claude-plugins-official)
- [Anthropic Skills Repository](https://github.com/anthropics/skills)
- [Agent Skills Overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)
- [Skill Best Practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- [DataCamp Plugin Guide](https://www.datacamp.com/tutorial/how-to-build-claude-code-plugins)

---

## 3. MCP (Model Context Protocol) Server Architecture

### Protocol Fundamentals

MCP is an open protocol (by Anthropic, now widely adopted) that standardizes how LLM applications connect to external data sources and tools. Current stable spec: **2025-11-25**.

#### Client-Server Architecture

```
AI Application (Host)
  |
  MCP Client (within host)
  |  JSON-RPC 2.0
  |
  MCP Server (exposes tools, resources, prompts)
  |
  External Data/Services
```

- **Host**: The AI application (Claude Code, Cursor, ChatGPT, etc.)
- **Client**: Lives within the host, translates requests to JSON-RPC
- **Server**: Exposes capabilities (tools, resources, prompts) via JSON-RPC 2.0
- Communication is always Client -> Server (through the host)

### Three Core Primitives

#### Tools (function calling)

- Function-like interface with structured input/output
- AI decides WHEN to call tools based on context
- Each tool has: unique name, parameter schema (Zod/JSON Schema), handler function
- Returns structured responses with content arrays (text, image, resource blocks)
- Tool annotations (spec 2025-03-26): `title`, `readOnlyHint`, `openWorldHint` for UI/LLM hints

#### Resources (data access)

- Represent any data: files, database records, API responses, computed values
- Clients discover available resources, then request specific content
- URI-based addressing
- Supports subscriptions for live updates

#### Prompts (templates)

- Servers expose reusable prompt templates
- Clients discover available prompts and provide arguments to customize
- Useful for complex multi-step workflows

### JSON-RPC Message Flow

```
// 1. Client initializes
{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {
  "protocolVersion": "2025-11-25",
  "capabilities": {"tools": {}, "resources": {}, "prompts": {}},
  "clientInfo": {"name": "ExampleClient", "version": "1.0.0"}
}}

// 2. Server responds with its capabilities
{"jsonrpc": "2.0", "id": 1, "result": {
  "protocolVersion": "2025-11-25",
  "capabilities": {"tools": {}, "resources": {"subscribe": true}, "prompts": {}},
  "serverInfo": {"name": "MyServer", "version": "1.0.0"}
}}

// 3. Client calls a tool
{"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {
  "name": "query_database",
  "arguments": {"sql": "SELECT * FROM notes LIMIT 10"}
}}

// 4. Server returns result
{"jsonrpc": "2.0", "id": 2, "result": {
  "content": [{"type": "text", "text": "...results..."}]
}}
```

Three message types: **requests** (expect response), **responses** (to requests), **notifications** (fire-and-forget).

### Transport Options

- **stdio**: Local process communication (most common for CLI tools)
- **Streamable HTTP**: Remote services, supports stateless horizontal scaling (introduced 2025-06-18 spec)
- **SSE** (Server-Sent Events): Legacy, being phased out in favor of Streamable HTTP

### TypeScript SDK Implementation

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

const server = new McpServer({
  name: 'my-server',
  version: '1.0.0',
})

// Register a tool
server.tool(
  'search_notes',
  "Search through user's notes by keyword",
  { query: z.string().describe('Search query'), limit: z.number().optional() },
  async ({ query, limit }) => {
    const results = await searchNotes(query, limit)
    return {
      content: [{ type: 'text', text: JSON.stringify(results) }],
    }
  }
)

// Connect via stdio
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
const transport = new StdioServerTransport()
await server.connect(transport)
```

### Security Considerations (2025-11-25 Spec)

- OAuth 2.1 authorization framework for remote servers
- 43% of early MCP servers had command injection vulnerabilities (2025 Invariant Labs audit)
- Best practices: input validation, rate limiting, health checks, structured logging, graceful shutdown
- Use environment variables for sensitive configuration
- For HTTP servers, allow clients to supply keys via headers

### 2026 Roadmap Priorities

- Better horizontal scaling for Streamable HTTP
- Server discovery/registry standards
- Improved stateful session handling with load balancers

**Sources:**

- [MCP Specification 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25)
- [MCP 2026 Roadmap](http://blog.modelcontextprotocol.io/posts/2026-mcp-roadmap/)
- [TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP JSON-RPC Reference](https://portkey.ai/blog/mcp-message-types-complete-json-rpc-reference-guide/)
- [MCP Server Development Guide](https://github.com/cyanheads/model-context-protocol-resources/blob/main/guides/mcp-server-development-guide.md)
- [IBM: What is MCP](https://www.ibm.com/think/topics/model-context-protocol)
- [MCP Wikipedia](https://en.wikipedia.org/wiki/Model_Context_Protocol)
- [FastMCP Framework](https://github.com/punkpeye/fastmcp)

---

## 4. Codex CLI (OpenAI) Plugin/Extension System

### Overview

OpenAI's Codex is an open-source coding agent that runs in the terminal (CLI) and also as a VS Code extension. It shares configuration between both surfaces.

### Configuration Architecture

- Config file: `~/.codex/config.toml` (global) or `.codex/config.toml` (project-scoped, trusted projects only)
- Shared between CLI and IDE extension

### MCP Integration

Codex has first-class MCP support:

```toml
[mcp_servers.context7]
command = "npx"
args = ["-y", "@upstash/context7-mcp"]

[mcp_servers.my-server]
command = "node"
args = ["./server.js"]
bearer_token_env_var = "MY_API_KEY"
startup_timeout_sec = 30
tool_timeout_sec = 60
enabled = true
```

CLI management: `codex mcp add <name> -- <command> [args...]`

Codex launches MCP servers automatically at session start and exposes their tools alongside built-ins.

### Skills System (SKILL.md -- Universal Format)

Codex adopted the same `SKILL.md` format as Claude Code, making skills **cross-compatible**:

- A skill = directory with `SKILL.md` + optional `scripts/`, `references/`, `assets/`
- SKILL.md has YAML frontmatter (`name`, `description`) + markdown instructions
- Same progressive disclosure: metadata loaded at startup, full instructions loaded on demand
- Skills auto-activate based on conversation context
- OpenAI maintains `openai/skills` catalog on GitHub

### Plugin System

- Plugin marketplace with metadata
- Codex tells the model which plugins are enabled at session start
- Per-skill enablement overrides in `config.toml`
- Prompting and auto-installing missing MCP dependencies for skills (stable, on by default)

### AGENTS.md

Codex also supports `AGENTS.md` for custom instructions (analogous to Claude's `CLAUDE.md`), providing project-level context and rules.

### Key Differences from Claude Code

| Feature              | Claude Code                     | Codex CLI             |
| -------------------- | ------------------------------- | --------------------- |
| Config format        | JSON (settings.json, .mcp.json) | TOML (config.toml)    |
| Plugin manifest      | plugin.json                     | Via config.toml       |
| Skill format         | SKILL.md                        | SKILL.md (compatible) |
| Project instructions | CLAUDE.md                       | AGENTS.md             |
| MCP management       | `claude mcp add`                | `codex mcp add`       |
| Hook system          | 12 lifecycle events             | Not documented        |

**Sources:**

- [Codex MCP Docs](https://developers.openai.com/codex/mcp/)
- [Codex Config Reference](https://developers.openai.com/codex/config-reference/)
- [Codex CLI Features](https://developers.openai.com/codex/cli/features/)
- [Codex GitHub](https://github.com/openai/codex)
- [OpenAI Skills Catalog](https://github.com/openai/skills)
- [Codex Skills Docs](https://developers.openai.com/codex/skills/)
- [AGENTS.md Guide](https://developers.openai.com/codex/guides/agents-md/)
- [Porting Skills to Codex](https://blog.fsck.com/2025/10/27/skills-for-openai-codex/)

---

## 5. Similar Products/Concepts

### A. OpenAI Prism

**What:** A free, cloud-based LaTeX workspace for scientific writing with GPT-5.2 integrated directly into the authoring workflow. Launched January 2026.

**Architecture -- Context-Aware AI:**

- GPT-5.2 has access to FULL document context: equations, figures, citations, text structure, prior revisions
- NOT a separate chat interface -- AI is inline in the document workflow
- Can highlight text and ask for specific actions (formalize, expand, revise)
- Searches and incorporates literature (e.g., arXiv) in context of current manuscript
- Real-time collaboration with multiple authors
- No local installation -- runs entirely in browser

**Key Insight for Inkdown:** Prism demonstrates the **"context-aware AI in document"** paradigm. The AI doesn't just answer questions -- it operates within the full document structure. Inkdown already does this with its editor agents. The difference is Prism is a standalone web app, while Inkdown could expose this capability to external AI assistants via MCP.

**Sources:**

- [Prism by OpenAI](https://openai.com/prism/)
- [Introducing Prism](https://openai.com/index/introducing-prism/)
- [InfoQ Coverage](https://www.infoq.com/news/2026/01/openai-prism/)

### B. Notion MCP Server (Official)

**What:** Official hosted MCP server that gives AI tools secure access to Notion workspaces.

**Architecture:**

- Hosted by Notion (not self-hosted, though open-source option exists)
- Markdown-based API optimized for token efficiency with LLMs
- OAuth-based authentication per user
- Works with ChatGPT, Claude Code, Cursor, VS Code

**Tools Exposed:**

- `notion-search` / `notion-fetch` -- search workspace and fetch page content
- `create pages` -- create one or more pages with properties and content, supports database templates
- `create database` -- create databases with initial properties and views
- `create view` -- table, board, list, calendar, timeline, gallery, dashboard views
- Page updates with template application

**Limitations:**

- Rate limited: 180 requests/minute average, search operations more restricted
- V2.0.0 migrated to data sources as primary abstraction (API 2025-09-03)
- Prefix handling: OpenAI clients auto-strip `notion-` prefix

**Sources:**

- [Notion MCP Docs](https://developers.notion.com/docs/mcp)
- [Notion MCP Tools](https://developers.notion.com/docs/mcp-supported-tools)
- [Notion MCP Server GitHub](https://github.com/makenotion/notion-mcp-server)

### C. Obsidian MCP Server (Community)

**What:** Community-built MCP servers that expose Obsidian vaults to AI assistants.

**Architecture:**

- Runs locally (no cloud sync required)
- Connects via Obsidian Local REST API plugin
- Multiple implementations available (cyanheads, jacksteamdev, tokidoo)

**Tools Exposed:**

- Read/write notes
- Search across vault
- Manage frontmatter and tags
- Update content
- Support for `.base` and `.canvas` files (v0.8.2, March 2026)
- Semantic search (via jacksteamdev implementation)

**Key Pattern:** Obsidian MCP demonstrates how a **local-first note-taking app** can expose itself to AI assistants while keeping data on the user's machine. Highly relevant to Inkdown.

**Sources:**

- [MCP-Obsidian](https://mcp-obsidian.org/)
- [Obsidian MCP Server GitHub](https://github.com/cyanheads/obsidian-mcp-server)
- [Obsidian MCP Tools GitHub](https://github.com/jacksteamdev/obsidian-mcp-tools)

---

## 6. Real-World MCP Server Examples

### A. Supabase MCP Server

**Architecture:** Stateless middleware layer enabling horizontal scaling.

**Tool Groups (all enabled by default except Storage):**
| Group | Tools |
|-------|-------|
| SQL | `execute_sql`, query with read/write/destructive categorization |
| Migration | Auto-generate ALTER statements, version migrations |
| Auth | User management, role/permission management |
| Storage | File operations (in development) |
| Tables | `list_tables`, `create_table`, `drop_table`, `rename_table` |
| Columns | `add_column`, `drop_column`, `alter_column` |
| Records | `fetch_records`, `create_record`, `update_record`, `delete_record` |
| Indexes | `list_indexes`, `create_index`, `delete_index` |
| Config | Project management, branch management |
| Logs | Debugging access |

**Safety Pattern:** Queries categorized as safe (read-only), write (requires write mode), destructive (requires write mode + 2-step confirmation). Feature flags to restrict tool groups.

**Sources:**

- [Supabase MCP Docs](https://supabase.com/docs/guides/getting-started/mcp)
- [Supabase MCP GitHub](https://github.com/supabase-community/supabase-mcp)

### B. Linear MCP Server

**Architecture:** Authenticated remote MCP server (centrally hosted by Linear) built on top of Linear's GraphQL API.

**Tools:**

- Find, create, update issues
- Manage projects and comments
- Team operations
- Native connections in Claude, Cursor

**Key Pattern:** Linear demonstrates the **"remote hosted MCP"** approach -- the server runs on Linear's infrastructure, not locally. Authentication via OAuth. Contrasts with Obsidian's local-first approach.

**Sources:**

- [Linear MCP Docs](https://linear.app/docs/mcp)
- [Linear MCP GitHub](https://github.com/tacticlaunch/mcp-linear)

### C. GitHub MCP Server

- Official GitHub MCP server for repository management
- Tools for issues, PRs, code search, file operations
- Widely used as reference implementation

### D. JetBrains IDE MCP Server

- Starting v2025.2, JetBrains IDEs include a built-in MCP server
- Exposes IDE context to external AI clients (Claude, Cursor, Codex)
- One-click setup

---

## Cross-Cutting Patterns & Insights for Inkdown

### Pattern 1: The Orchestrator Model (Superdesign)

Don't duplicate AI logic. Provide structured context/specifications that the HOST LLM executes. Inkdown MCP server could provide note content, project structure, and editing specifications without running its own AI inference.

### Pattern 2: Progressive Disclosure (Claude/Codex Skills)

Two-tier system: lightweight metadata for discovery (loaded at startup), full instructions loaded on demand. Keeps context costs low while supporting many capabilities.

### Pattern 3: Tool Group Organization (Supabase)

Organize tools into logical groups with feature flags. Allow users to enable/disable groups to reduce attack surface and limit LLM actions.

### Pattern 4: Safety Categorization (Supabase)

Categorize operations as read-only, write, or destructive. Require escalating confirmation for dangerous operations.

### Pattern 5: Local-First Data (Obsidian)

Keep user data on their machine. MCP server runs locally, connects to local data. No cloud dependency for core functionality.

### Pattern 6: Token-Efficient Responses (Notion)

Use Markdown-based responses optimized for LLM token consumption. Notion specifically designed their MCP API to be more token-efficient than their REST API.

### Pattern 7: Universal Skill Format (SKILL.md)

The SKILL.md format is now a universal standard across Claude Code, Codex CLI, and others. Building a skill in this format gives maximum reach.

### Pattern 8: Dual Distribution (Superdesign)

Ship both an MCP server (for tool integration) AND a SKILL.md (for instruction-based integration). The MCP server provides tools; the skill provides context and workflow guidance.
