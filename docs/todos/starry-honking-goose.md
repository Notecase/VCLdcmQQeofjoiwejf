# Noteshell MCP Server — Phase 1 Implementation Plan

**Date:** 2026-03-12
**Status:** Implementation-ready

---

## Context

Building the Noteshell MCP server — a Claude Code/Codex CLI/OpenClaw plugin that exposes the full Inkdown AI system (notes + secretary + context) as ~40 pure data tools. No AI calls inside the MCP server. Claude's own brain does the thinking. SKILL.md files teach it HOW to use the tools effectively.

**Why this approach:** MCP tools cost us $0 (host LLM pays). Full coverage of existing capabilities means Claude Code users get the same power as web app users. SKILL.md methodology files make Claude an expert at study planning, note organization, and daily workflows.

---

## Decisions

- **40 tools** across 5 groups (notes, secretary, context/soul, calendar, search)
- **Pure data access** — zero AI provider calls inside MCP server
- **New package** at `packages/mcp/` with `~/.noteshell.json` config
- **5 SKILL.md files** — root + study-planning + note-organization + research-to-notes + daily-workflow
- **Task→Note** handled via SKILL.md pattern, not a dedicated tool

---

## File Structure

```
packages/mcp/
  package.json
  tsconfig.json
  SKILL.md                        # Root skill (tool catalog + quick patterns)
  skills/
    study-planning.md
    note-organization.md
    research-to-notes.md
    daily-workflow.md
  src/
    index.ts                      # Entry point: stdio server bootstrap (~30 lines)
    config.ts                     # ~/.noteshell.json loader + validation (~60 lines)
    server.ts                     # McpServer instance + tool registration (~40 lines)
    db/
      client.ts                   # Supabase client + user_id extraction (~50 lines)
      notes.ts                    # Notes + projects queries (~120 lines)
      memory.ts                   # Secretary memory CRUD (~100 lines)
      context.ts                  # Context bus + soul queries (~80 lines)
      artifacts.ts                # Artifact queries (~40 lines)
      search.ts                   # Full-text search (~60 lines)
    tools/
      index.ts                    # Registers all tool groups (~20 lines)
      notes.ts                    # 12 notes_* tools (~250 lines)
      secretary.ts                # 18 secretary_* tools (~300 lines)
      context.ts                  # 5 context/soul tools (~100 lines)
      calendar.ts                 # 3 calendar tools (~80 lines)
      search.ts                   # 2 search tools (~60 lines)
    format/
      index.ts                    # Shared formatting utils (~30 lines)
      notes.ts                    # Note → compact markdown (~60 lines)
      memory.ts                   # Memory file formatting (~40 lines)
      tables.ts                   # Tabular data → markdown tables (~40 lines)
```

**Total: ~2000 lines TypeScript + ~1500 lines SKILL.md markdown**

---

## Tool Catalog (40 tools)

### Notes (12 tools)

| Tool | Type | Purpose |
|------|------|---------|
| `notes_list` | read | List notes, filter by project_id |
| `notes_get` | read | Get note by ID (full markdown content) |
| `notes_create` | write | Create note with title + content + project_id |
| `notes_update` | write | Update note title and/or content |
| `notes_delete` | destructive | Soft-delete (set is_deleted=true) |
| `notes_move` | write | Move note to different project |
| `notes_search` | read | Full-text search across note content |
| `notes_organize` | read | Get note structure (headings, sections, word count) |
| `notes_summarize` | read | Get note metadata (word count, headings, links, images) |
| `notes_expand` | read | Get note with project context + related notes |
| `notes_get_artifacts` | read | List artifacts (HTML/CSS/JS widgets) attached to a note |
| `projects_list` | read | List all projects/folders |

### Secretary (18 tools)

| Tool | Type | Purpose |
|------|------|---------|
| `secretary_memory_read` | read | Read any memory file by filename |
| `secretary_memory_write` | write | Write/update memory file (upsert) |
| `secretary_memory_list` | read | List all memory files (optional prefix filter) |
| `secretary_memory_delete` | destructive | Delete a memory file |
| `secretary_today` | read | Shortcut: read Today.md |
| `secretary_tomorrow` | read | Shortcut: read Tomorrow.md |
| `secretary_plans_list` | read | Read Plan.md (master roadmap index) |
| `secretary_plan_create` | write | Create Plans/*.md + update Plan.md index |
| `secretary_plan_activate` | write | Update plan status in Plan.md |
| `secretary_daily_generate` | write | Write structured daily plan to Today/Tomorrow.md |
| `secretary_task_modify` | write | Modify task in Today/Tomorrow (time, status, add, remove) |
| `secretary_bulk_modify` | write | Bulk modify multiple tasks |
| `secretary_carryover` | write | Move incomplete tasks from Today → Tomorrow |
| `secretary_recurring_manage` | write | CRUD recurring blocks in Recurring.md |
| `secretary_log_activity` | write | Append activity entry to Today.md |
| `secretary_reflect` | write | Write reflection to Today.md |
| `secretary_preferences` | read | Read study preferences from AI.md |
| `secretary_analytics` | read | Compute analytics from History/*.md |

### Context & Soul (5 tools)

| Tool | Type | Purpose |
|------|------|---------|
| `context_read` | read | Read recent context entries by type |
| `context_write` | write | Write a new context entry |
| `context_entries` | read | List all recent context entries |
| `soul_read` | read | Read user's soul (goals, preferences, style) |
| `soul_update` | write | Update soul content |

### Calendar (3 tools)

| Tool | Type | Purpose |
|------|------|---------|
| `calendar_events` | read | List events from calendar memory files |
| `calendar_add` | write | Add event to calendar |
| `calendar_update` | write | Update/remove calendar event |

### Search (2 tools)

| Tool | Type | Purpose |
|------|------|---------|
| `search_notes` | read | Search notes by content/title (Postgres FTS) |
| `search_global` | read | Search across notes + memory files |

---

## Implementation Steps (ordered by dependency)

### Step 1: Package Scaffold
- Create `packages/mcp/package.json` (name: `@noteshell/mcp`, bin: `noteshell-mcp`)
- Create `packages/mcp/tsconfig.json` (ES2022, strict, same pattern as `packages/shared/tsconfig.json`)
- Dependencies: `@modelcontextprotocol/sdk`, `@supabase/supabase-js`, `zod`
- Peer dep: `@inkdown/shared` (for types + errors)
- Run `pnpm install` to validate workspace resolution

### Step 2: Config + Supabase Client
- `src/config.ts` — Load `~/.noteshell.json`, validate with zod, fallback to env vars
- `src/db/client.ts` — Create Supabase client with access token auth, extract user_id from JWT

**Config format:**
```json
{
  "supabase_url": "https://xxx.supabase.co",
  "supabase_anon_key": "eyJ...",
  "access_token": "eyJ..."
}
```

### Step 3: Server Bootstrap
- `src/index.ts` — Stdio transport setup with `#!/usr/bin/env node` shebang
- `src/server.ts` — Create `McpServer`, call `registerAllTools(server, db)`
- Verify: server starts, `tools/list` returns empty array

### Step 4: DB Query Layer
- `src/db/notes.ts` — `list()`, `get()`, `create()`, `update()`, `delete()`, `move()`, `getArtifacts()` + project queries
- `src/db/memory.ts` — `read()`, `write()`, `list()`, `delete()` (adapt pattern from `packages/ai/src/agents/secretary/memory.ts`)
- `src/db/context.ts` — `readEntries()`, `writeEntry()`, `readSoul()`, `writeSoul()` (adapt from `packages/ai/src/services/shared-context.service.ts`)
- `src/db/artifacts.ts` — `listByNote()`
- `src/db/search.ts` — `searchNotes()`, `searchGlobal()` (Postgres FTS via `to_tsvector`/`plainto_tsquery`)

### Step 5: Response Formatters
- `src/format/notes.ts` — Note list as markdown table, single note as heading + content
- `src/format/memory.ts` — Memory file as `## filename.md\n[content]`
- `src/format/tables.ts` — Generic tabular data to markdown tables
- `src/format/index.ts` — Shared utils (relative time, truncation)

**Formatting principles:** Compact markdown, not JSON. One line per item in lists. Full content for single-item reads. Truncate to first 200 chars in list views.

### Step 6: Tool Registration — Notes (12 tools)
- `src/tools/notes.ts` — `registerNoteTools(server, db)`
- Each tool: zod schema → db call → formatter → `{ content: [{ type: 'text', text }] }`
- Error handling: try/catch → `{ content: [...], isError: true }`

### Step 7: Tool Registration — Secretary (18 tools)
- `src/tools/secretary.ts` — `registerSecretaryTools(server, db)`
- Memory CRUD tools + shortcut tools (today, tomorrow, plans)
- Plan management tools (create, activate, daily generate)
- Task modification tools (modify, bulk modify, carryover)
- Activity/reflection tools
- Analytics tool (compute from History/*.md files)

### Step 8: Tool Registration — Context, Calendar, Search (10 tools)
- `src/tools/context.ts` — 5 context/soul tools
- `src/tools/calendar.ts` — 3 calendar tools (read/write calendar memory files)
- `src/tools/search.ts` — 2 search tools (FTS, no embeddings)
- `src/tools/index.ts` — Orchestrator that calls all register functions

### Step 9: SKILL.md Files
- `SKILL.md` — Root skill: tool catalog, parameter patterns, 5-6 quick recipes
- `skills/study-planning.md` — Roadmap creation, daily plan generation, plan tracking
- `skills/note-organization.md` — Project hierarchy, rich note creation, Task→Note pattern
- `skills/research-to-notes.md` — Research capture, structured notes, citation linking
- `skills/daily-workflow.md` — Morning/during/evening routines, activity logging, reflection

### Step 10: Build + Integration Test
- `pnpm build` — verify clean build
- `pnpm typecheck` — verify no type errors
- Manual test: start server, connect from Claude Code, call `notes_list`
- SKILL.md test: ask Claude "create a study plan" — verify it follows methodology

---

## Key Patterns

### Tool Implementation Pattern
```typescript
// Each tool file follows this pattern:
export function registerNoteTools(server: McpServer, db: DbClient): void {
  server.tool(
    'notes_list',
    'List notes. Filter by project. Returns title, id, updated date.',
    { project_id: z.string().uuid().optional(), include_deleted: z.boolean().optional() },
    async ({ project_id, include_deleted }) => {
      const notes = await db.notes.list({ projectId: project_id, includeDeleted: include_deleted })
      return { content: [{ type: 'text', text: formatNoteList(notes) }] }
    }
  )
}
```

### Response Format Examples
```markdown
## Notes (12 results)
| Title | ID | Updated |
|---|---|---|
| Optics Ch3 | abc123 | 2h ago |
| React Hooks | def456 | 1d ago |

---

# Optics Chapter 3
**ID:** abc123 | **Project:** Physics | **Words:** 1,247 | **Updated:** 2026-03-12
---
[full markdown content]
```

### Data Flow
```
Claude Code / Codex CLI / OpenClaw
  │ MCP protocol (stdio)
  ▼
Noteshell MCP Server (Node.js, ~2000 lines)
  │ @supabase/supabase-js (direct queries)
  ▼
Supabase (RLS enforces user_id)
  ├── notes, projects
  ├── secretary_memory (Today.md, Plan.md, Plans/*.md, History/*.md, ...)
  ├── user_context_entries, user_soul
  └── artifacts
```

---

## Existing Code to Reuse

| Source File | What to Reuse |
|-------------|--------------|
| `packages/ai/src/agents/secretary/memory.ts` | Memory CRUD query patterns (read, write, list, delete) |
| `packages/ai/src/services/shared-context.service.ts` | Context bus + soul read/write patterns |
| `packages/shared/src/types/secretary.ts` | `MemoryFile`, `LearningRoadmap`, `StudyPreferences`, `ScheduledTask` types |
| `packages/shared/src/types/index.ts` | `Note`, `Project` types |
| `packages/shared/src/types/ai.ts` | `ContextEntry` type |
| `packages/shared/package.json` | Package.json + tsconfig.json structure template |
| `apps/api/src/routes/secretary.ts` | API route patterns, Supabase query patterns |
| `supabase/migrations/009_secretary.sql` | `secretary_memory` table schema |
| `supabase/migrations/001_*.sql` | `notes`, `projects` table schemas |
| `supabase/migrations/017_shared_context_bus.sql` | `user_context_entries`, `user_soul` schemas |

---

## Design Decisions

1. **New DB layer, NOT reusing MemoryService** — MemoryService has lifecycle logic (day transitions, auto-activation) that shouldn't run on every MCP call. Copy query patterns, not the class.

2. **`@inkdown/shared` as only internal dep** — No dependency on `@inkdown/ai`. Keeps the package lightweight and avoids pulling in AI provider SDKs.

3. **Inline zod schemas** — Tool input schemas are simple (UUIDs, booleans, dates). No shared validation module needed.

4. **No caching** — MCP server is a short-lived stdio process. Supabase connection pooling handles efficiency.

5. **No embeddings search** — Phase 1 uses Postgres FTS only. Embedding search would require an AI provider call (violates pure-data constraint).

6. **Calendar via memory files** — Calendar events are stored in secretary_memory files, not a separate table. Calendar tools read/write these files.

---

## Configuration

**Claude Code MCP config** (`~/.claude.json` or project `mcp_servers`):
```json
{
  "mcpServers": {
    "noteshell": {
      "command": "node",
      "args": ["/path/to/packages/mcp/dist/index.js"]
    }
  }
}
```

**Auth config** (`~/.noteshell.json`):
```json
{
  "supabase_url": "https://xxx.supabase.co",
  "supabase_anon_key": "eyJ...",
  "access_token": "eyJ..."
}
```

Auth flow: access_token is a Supabase JWT. RLS policies enforce `auth.uid() = user_id` at DB level.

---

## Known Limitations (Phase 1)

- **Token expiry**: `~/.noteshell.json` access token expires. User must manually refresh. Document clearly.
- **Write conflicts**: If MCP and web app write same memory file simultaneously, last-write-wins. Document as known behavior.
- **No embedding search**: Full-text search only. Semantic search deferred to Phase 2.
- **40 tools in flat list**: Grouped by prefix (`notes_`, `secretary_`, etc.) for discoverability. SKILL.md provides the index.

---

## Post-Implementation Fixes Required

### Fix 1: Schema Mismatch in `src/db/notes.ts` (HIGH)
**Problem:** `NoteRow` declares columns that don't exist in the `notes` table: `reading_time_minutes`, `link_count`, `tags`.
**Actual schema** (from migration 001): `word_count`, `character_count`, `attachment_count`, `is_pinned`, `is_archived`, `is_deleted` — no reading_time, link_count, or tags.
**Fix:** Remove phantom columns from `NoteRow`, `NOTE_COLUMNS`, and `NOTE_LIST_COLUMNS`. Update formatters that reference them.

### Fix 2: SQL Injection Risk in `src/db/search.ts` (HIGH)
**Problem:** Line 38 interpolates user input into `.or()` filter string: `.or(\`title.ilike.%${query}%,content.ilike.%${query}%\`)`. A crafted query could manipulate the filter.
**Fix:** Split into two separate queries (title search + content search) and merge results in JS, OR escape special Supabase filter characters from the query.

### Fix 3: Regex Injection in `src/tools/secretary.ts` (LOW)
**Problem:** `secretary_plan_activate` (line 141) uses `new RegExp()` with user-supplied `plan_id` without escaping. Regex special chars in plan_id will break.
**Fix:** Escape `plan_id` with a regex escape function before using in `new RegExp()`.

### Fix 4: Null project_id filter in `src/db/notes.ts` (LOW)
**Problem:** `getWithContext()` line 179: `.eq('project_id', note.project_id ?? '')` — when null, queries for empty string instead of null.
**Fix:** Use conditional: `if (note.project_id) query.eq('project_id', note.project_id) else query.is('project_id', null)`.

### Fix 5: Unnecessary dynamic import in `src/tools/notes.ts` (MINOR)
**Problem:** `notes_search` tool uses `await import('../db/search.js')` instead of a static import.
**Fix:** Convert to static import at top of file.

---

## Verification

1. `pnpm install` — workspace resolves `packages/mcp`
2. `pnpm build` — MCP package compiles without errors
3. `pnpm typecheck` — no type errors across monorepo
4. `node packages/mcp/dist/index.js` — server starts, responds to `tools/list` (40 tools)
5. Configure `~/.noteshell.json` with real Supabase credentials
6. Claude Code MCP inspector: call `notes_list` → formatted markdown response
7. Claude Code integration: "what are my notes?" → tool call + response
8. SKILL.md test: "create a study plan for algorithms" → Claude follows methodology, calls correct tools in sequence
