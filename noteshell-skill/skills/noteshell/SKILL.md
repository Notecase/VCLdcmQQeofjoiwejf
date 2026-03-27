---
name: noteshell
description: >
  Noteshell is a personal knowledge and productivity agent for students, researchers,
  and lifelong learners. Use this skill when the user asks to plan their day, review
  their week, create study plans, organize notes, capture research, do a morning routine,
  evening reflection, or manage daily tasks. Common patterns: "plan my day", "what am I
  working on", "create a study plan for X", "morning routine", "evening reflection",
  "weekly review", "organize my notes", "save research as note", "how am I doing",
  "what did I do yesterday", "plan tomorrow", "track my progress".
metadata:
  author: noteshell
  version: '0.1.0'
---

# Noteshell

> Your personal knowledge base and productivity system — notes, study plans, daily tasks, and learning analytics, all accessible through MCP tools.

## MCP Prerequisite

Before using any workflow, verify the Noteshell MCP server is connected. Try calling:

```
secretary_today
```

If the tool is not available, the user needs to set up the MCP server:

```bash
# 1. Authenticate (opens browser)
npx @noteshell/mcp login

# 2. Add to Claude Code (~/.claude.json or .mcp.json)
{
  "mcpServers": {
    "noteshell": {
      "command": "npx",
      "args": ["-y", "@noteshell/mcp"]
    }
  }
}

# 3. Restart Claude Code
```

Once the MCP tools are available, proceed with the workflows below.

---

## Tool Quick Reference (43 tools)

| Prefix                 | Count | Purpose                                        |
| ---------------------- | ----- | ---------------------------------------------- |
| `notes_*`              | 13    | Note CRUD, search, artifacts, structure        |
| `projects_*`           | 1     | List projects/folders                          |
| `secretary_*`          | 20    | Memory files, plans, daily tasks, analytics    |
| `context_*` / `soul_*` | 5     | Cross-agent context bus, user soul/preferences |
| `calendar_*`           | 3     | Calendar events via memory files               |
| `search_*`             | 2     | Full-text search across notes + memory         |

## Common Patterns

### Read Before Write

Always read the current state before writing:

```
1. secretary_today → see current plan
2. secretary_task_modify → update a task
```

### Project-Scoped Operations

Most note tools accept `project_id` for filtering:

```
1. projects_list → find project UUID
2. notes_list { project_id: "..." } → list notes in project
```

### Memory File Naming

- Root files: `AI.md`, `Plan.md`, `Today.md`, `Tomorrow.md`, `Recurring.md`, `Calendar.md`
- Plans: `Plans/<name>.md` (e.g. `Plans/algo-roadmap.md`)
- History: `History/YYYY-MM-DD.md` (auto-archived daily plans)

### Task Markers

- `[ ]` pending, `[x]` done, `[>]` carried over, `[-]` skipped

## Quick Recipes

### "What am I working on?"

```
secretary_today         → today's plan
secretary_plans_list    → active roadmaps
context_entries         → recent activity across agents
```

### "Plan tomorrow"

```
secretary_preferences      → study hours, break frequency
secretary_plans_list       → active plans + schedule
secretary_recurring_manage → recurring blocks
secretary_daily_generate { target: "Tomorrow.md", content: "..." }
```

### "Find something"

```
search_global { query: "..." } → search notes + memory
notes_get { note_id: "..." }   → read full content
```

### "How am I doing?"

```
secretary_analytics → completion rates, streaks, mood trends
soul_read           → goals and preferences
```

---

## Full Methodology

For detailed step-by-step workflows (morning routine, evening reflection, weekly review, study planning, note organization, research capture, daily workflow), fetch the full guide:

MUST MANDATORY Fetch fresh guidelines below:

```
https://raw.githubusercontent.com/Notecase/noteshell-mcp/main/skills/noteshell/NOTESHELL.md
```

Follow the instructions in NOTESHELL.md for the workflow that matches the user's request.
