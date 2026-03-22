---
name: noteshell
description: Noteshell MCP Server — Access Inkdown notes, secretary, context, and search from Claude Code / Codex CLI. 40 pure-data tools, zero AI calls.
---

# Noteshell MCP Server

> Your Inkdown knowledge base as MCP tools. Notes, secretary planner, cross-agent context — all accessible from any MCP-compatible client.

## Quick Reference

### Tool Groups

| Prefix                 | Count | Purpose                                        |
| ---------------------- | ----- | ---------------------------------------------- |
| `notes_*`              | 11    | Note CRUD, search, structure analysis          |
| `projects_*`           | 1     | List projects/folders                          |
| `secretary_*`          | 18    | Memory files, plans, daily tasks, analytics    |
| `context_*` / `soul_*` | 5     | Cross-agent context bus, user soul/preferences |
| `calendar_*`           | 3     | Calendar events via memory files               |
| `search_*`             | 2     | Full-text search across notes + memory         |

### Common Patterns

#### Read Before Write

Always read the current state before writing:

```
1. secretary_today → see current plan
2. secretary_task_modify → update a task
```

#### Project-Scoped Operations

Most note tools accept `project_id` for filtering:

```
1. projects_list → find project UUID
2. notes_list { project_id: "..." } → list notes in project
```

#### Memory File Naming

- Root files: `AI.md`, `Plan.md`, `Today.md`, `Tomorrow.md`, `Recurring.md`, `Calendar.md`
- Plans: `Plans/<name>.md` (e.g. `Plans/algo-roadmap.md`)
- History: `History/YYYY-MM-DD.md` (auto-archived daily plans)

---

## Quick Recipes

### 📋 "What am I working on?"

```
1. secretary_today         → today's plan
2. secretary_plans_list    → active roadmaps
3. context_entries         → recent activity across agents
```

### 📝 "Create a note from research"

```
1. projects_list                              → find target project
2. notes_create { title, content, project_id } → create the note
3. context_write { type: "note_created" }      → log in context bus
```

### 🗓️ "Plan tomorrow"

```
1. secretary_preferences      → study hours, break frequency
2. secretary_plans_list       → active plans + schedule
3. secretary_recurring_manage → recurring blocks
4. secretary_daily_generate { target: "Tomorrow.md", content: "..." }
```

### 🔍 "Find something"

```
1. search_global { query: "..." } → search notes + memory
2. notes_get { note_id: "..." }   → read full content
```

### 📊 "How am I doing?"

```
1. secretary_analytics → completion rates, streaks, mood trends
2. soul_read          → goals and preferences
```

---

## Methodology Skills

For deeper workflows, see the specialized skill files:

| Skill              | File                           | When to Use                                                                     |
| ------------------ | ------------------------------ | ------------------------------------------------------------------------------- |
| Morning Routine    | `skills/morning-routine.md`    | Full morning planning: review yesterday, archive, pick focus, generate Today.md |
| Evening Reflection | `skills/evening-reflection.md` | End-of-day review: capture mood, carry over tasks, prepare tomorrow             |
| Weekly Review      | `skills/weekly-review.md`      | Weekly analysis: patterns, plan progress, suggestions, soul updates             |
| Study Planning     | `skills/study-planning.md`     | Creating roadmaps, daily plans, tracking progress                               |
| Note Organization  | `skills/note-organization.md`  | Structuring projects, rich notes, Task→Note conversion                          |
| Research to Notes  | `skills/research-to-notes.md`  | Capturing research findings as structured notes                                 |
| Daily Workflow     | `skills/daily-workflow.md`     | Activity logging, quick task updates during the day                             |

---

## Configuration

### Setup (run once)

```bash
npx @noteshell/mcp setup <email> <password>
```

Writes `~/.noteshell.json` automatically. Requires a Noteshell account at noteshell.app.

### Claude Code MCP config

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
