# @noteshell/mcp

> Noteshell MCP Server — Access your notes, tasks, and learning plans from Claude Code and any MCP-compatible client. 40 pure-data tools, zero AI calls, 2-minute setup.

## What is Noteshell?

Noteshell is an agent-first learning OS for students, researchers, and lifelong learners. Your notes, study plans, daily tasks, and knowledge base — all accessible to your AI assistant through this MCP server.

## Setup (2 steps)

### 1. Authenticate

```bash
npx @noteshell/mcp setup <your-email> <your-password>
```

This logs you into Noteshell and saves your credentials to `~/.noteshell.json`. No Supabase account needed — you just need a [Noteshell account](https://noteshell.app).

### 2. Add to Claude Code

Add to your `~/.claude.json` or `.mcp.json`:

```json
{
  "mcpServers": {
    "noteshell": {
      "command": "npx",
      "args": ["-y", "@noteshell/mcp"]
    }
  }
}
```

Reload Claude Code — done.

---

## Available Tools (40 total)

| Prefix                 | Count | What it does                                      |
| ---------------------- | ----- | ------------------------------------------------- |
| `notes_*`              | 12    | Create, read, update, search, organize notes      |
| `projects_*`           | 1     | List your projects/folders                        |
| `secretary_*`          | 18    | Daily tasks, study plans, memory files, analytics |
| `context_*` / `soul_*` | 5     | Cross-agent context bus, user goals & preferences |
| `calendar_*`           | 3     | Calendar events                                   |
| `search_*`             | 2     | Full-text search across notes and memory          |

---

## Skills

Noteshell ships with **methodology skills** — step-by-step workflows that tell Claude how to use the tools effectively:

| Skill                 | Purpose                                                  |
| --------------------- | -------------------------------------------------------- |
| **Daily Workflow**    | Morning routines, activity logging, evening reflection   |
| **Study Planning**    | Create roadmaps, break down subjects, track progress     |
| **Note Organization** | Structure projects, enrich notes, convert tasks to notes |
| **Research to Notes** | Capture research findings as structured knowledge        |

Once the MCP server is running, just talk to Claude naturally:

- _"Plan my day"_
- _"What have I been working on?"_
- _"Create a study plan for algorithms"_
- _"Save my research findings as a note"_

---

## How it works

```
Claude Code / Cursor / Codex CLI
        │
        ▼
@noteshell/mcp  (this package — data only, no AI)
        │
        ▼
Your Noteshell data (cloud, secured by your account)
```

No AI runs inside the MCP server. Claude does the thinking; Noteshell provides the data.

---

## License

MIT
