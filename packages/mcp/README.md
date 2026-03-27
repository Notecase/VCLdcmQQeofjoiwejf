# @noteshell/mcp

> Noteshell MCP Server — Access your notes, tasks, and learning plans from Claude Code and any MCP-compatible client. 43 pure-data tools, zero AI calls, 2-minute setup.

## What is Noteshell?

Noteshell is an agent-first learning OS for students, researchers, and lifelong learners. Your notes, study plans, daily tasks, and knowledge base — all accessible to your AI assistant through this MCP server.

## Setup (2 steps)

### 1. Authenticate

```bash
# Recommended: browser-based login
npx @noteshell/mcp login

# Legacy alternative: email/password
npx @noteshell/mcp setup <your-email> <your-password>
```

This logs you into Noteshell and saves your credentials to `~/.noteshell.json`. You need a [Noteshell account](https://noteshell.app).

### 2. Add to your AI coding tool

Add to your `~/.claude.json`, `.mcp.json`, or equivalent MCP config:

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

Reload your AI coding tool — done. Works with Claude Code, Cursor, Codex CLI, and any MCP-compatible client.

---

## Available Tools (43 total)

| Prefix                 | Count | What it does                                      |
| ---------------------- | ----- | ------------------------------------------------- |
| `notes_*`              | 13    | Create, read, update, search, organize notes      |
| `projects_*`           | 1     | List your projects/folders                        |
| `secretary_*`          | 20    | Daily tasks, study plans, memory files, analytics |
| `context_*` / `soul_*` | 5     | Cross-agent context bus, user goals & preferences |
| `calendar_*`           | 3     | Calendar events                                   |
| `search_*`             | 2     | Full-text search across notes and memory          |

---

## Skills

Noteshell ships with **7 methodology skills** — step-by-step workflows that teach your AI agent how to use the tools effectively:

| Skill                  | Purpose                                                |
| ---------------------- | ------------------------------------------------------ |
| **Morning Routine**    | Review yesterday, archive, pick focus, generate plan   |
| **Evening Reflection** | Capture mood, carry over tasks, prepare tomorrow       |
| **Weekly Review**      | 7-day analytics, plan progress, mood trends            |
| **Study Planning**     | Create roadmaps, break down subjects, track progress   |
| **Note Organization**  | Structure projects, enrich notes, task-to-note pattern |
| **Research to Notes**  | Capture research findings as structured knowledge      |
| **Daily Workflow**     | Activity logging, quick task updates during the day    |

Once the MCP server is running, just talk to your AI agent naturally:

- _"Plan my day"_
- _"What have I been working on?"_
- _"Create a study plan for algorithms"_
- _"How am I doing this week?"_

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

## Skill (Methodology Workflows)

For structured workflows (morning routine, evening reflection, weekly review, study planning), install the companion skill:

```bash
npx skills add Notecase/noteshell-mcp
```

This teaches your AI agent **how** to use the MCP tools effectively — slash commands like `/plan-my-day`, `/morning-routine`, `/evening-reflection`, `/weekly-review`.

---

## License

MIT
