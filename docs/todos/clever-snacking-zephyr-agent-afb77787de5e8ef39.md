# Noteshell Skill Package — Implementation Plan

## Overview

Create a standalone `noteshell-skill/` directory at the monorepo root that follows the SuperDesign pattern exactly. This will be pushed to a separate GitHub repo so users can install it via `npx skills add <repo>`. Additionally, fix several issues in the existing `@noteshell/mcp` npm package.

---

## Part 1: Skill Package — Directory Structure

```
noteshell-skill/
├── .gitignore                          # Contains ".claude"
├── README.md                           # Installation + quickstart
├── .claude/
│   └── commands/
│       ├── plan-my-day.md              # Slash command: /plan-my-day
│       ├── morning-routine.md          # Slash command: /morning-routine
│       ├── evening-reflection.md       # Slash command: /evening-reflection
│       └── weekly-review.md            # Slash command: /weekly-review
└── skills/
    └── noteshell/
        ├── SKILL.md                    # Entry point (~4KB, always loaded)
        ├── SETUP.md                    # MCP setup guide (fetched at runtime)
        ├── MORNING-ROUTINE.md          # Full morning workflow (fetched at runtime)
        ├── EVENING-REFLECTION.md       # Full evening workflow (fetched at runtime)
        ├── WEEKLY-REVIEW.md            # Full weekly review workflow (fetched at runtime)
        ├── STUDY-PLANNING.md           # Study planning workflow (fetched at runtime)
        ├── NOTE-ORGANIZATION.md        # Note org workflow (fetched at runtime)
        ├── RESEARCH-TO-NOTES.md        # Research capture workflow (fetched at runtime)
        └── DAILY-WORKFLOW.md           # Daily activity workflow (fetched at runtime)
```

---

## Part 2: Design Decisions

### Decision 1: MCP Server Detection

**Approach:** SKILL.md will instruct the agent to attempt calling `secretary_today` as a lightweight connectivity check. If the tool is not available (no MCP server connected), the agent should read the SETUP.md file (via GitHub raw URL) and walk the user through setup.

**Rationale:** There is no universal "check MCP status" API across Claude Code, Cursor, Codex, etc. The pragmatic approach is to try a read-only tool call and handle the error. This matches how SuperDesign checks for CLI installation.

### Decision 2: Where Methodology Files Live

**Approach:** Copy methodology files into the skill repo (under `skills/noteshell/`). They will be fetched from the skill repo's GitHub raw URLs, NOT from the MCP npm package repo.

**Rationale:**

- The skill repo is the unit of installation — it should be self-contained
- The MCP npm package repo may be private or in a monorepo (as it is now — `packages/mcp/` in inkdown)
- Raw URLs from a clean standalone repo are simpler and more reliable
- Content can drift between the two — the skill repo is the source of truth for agent instructions

### Decision 3: GitHub Raw URL Placeholder

**Approach:** Use `{{GITHUB_ORG}}/noteshell-skill` as the placeholder. In practice this will be something like `noteshell/noteshell-skill` or `quangnguyen/noteshell-skill`. All raw URLs follow the pattern:

```
https://raw.githubusercontent.com/{{GITHUB_ORG}}/noteshell-skill/main/skills/noteshell/<FILENAME>.md
```

### Decision 4: Multi-Platform Manifests

**Approach:** Keep it simple like SuperDesign. No `.claude-plugin/`, no `.cursor-plugin/`, no `plugin.json`, no hooks, no agents. Purely a skill with slash commands.

**Rationale:** The SuperDesign pattern works across all platforms because it uses the universal `.claude/commands/` and `skills/` directories. Adding platform-specific manifests adds complexity without clear benefit at this stage.

---

## Part 3: File Content Specifications

### 3.1 `.gitignore`

Contents: `.claude` (single line)

### 3.2 `skills/noteshell/SKILL.md` (Entry Point — Always Loaded)

This is the most critical file. It must be small (~4KB), keyword-rich for auto-triggering, and handle the "is MCP connected?" check.

**Frontmatter:**

```yaml
---
name: noteshell
description: >
  Noteshell — personal knowledge base, daily planner, study scheduler, and
  productivity tracker as MCP tools. Plan your day, morning routine, evening
  reflection, weekly review, note organization, research capture, study
  roadmaps, task management, calendar events, cross-agent context bus.
  43 tools across notes, secretary, context, calendar, and search.
  Works with Claude Code, Codex CLI, Cursor, Gemini CLI.
---
```

**Body content outline (in order):**

1. **One-line description**: "Your Inkdown knowledge base as MCP tools."

2. **MCP Connection Check** — Instructions for the agent:
   - Try calling `secretary_today`. If the tool is not available:
     - The Noteshell MCP server is not connected
     - Fetch setup instructions from the SETUP.md raw URL
     - Walk the user through setup before proceeding
   - If `secretary_today` returns data (or "no plan yet"), the server is connected. Proceed.

3. **Tool Groups Table** (corrected counts):
   - `notes_*` = 11 (note CRUD, search, structure analysis)
   - `artifacts_*` = 1 (interactive HTML/CSS/JS widgets)
   - `projects_*` = 1 (list projects/folders)
   - `secretary_*` = 20 (memory files, plans, daily tasks, analytics)
   - `context_*/soul_*` = 5 (cross-agent context bus, user preferences)
   - `calendar_*` = 3 (calendar events via memory files)
   - `search_*` = 2 (full-text search across notes + memory)
   - **Total: 43 tools**

4. **Quick Recipes** (condensed from existing SKILL.md):
   - "What am I working on?" → `secretary_today` + `secretary_plans_list` + `context_entries`
   - "Create a note" → `projects_list` + `notes_create` + `context_write`
   - "Plan tomorrow" → `secretary_preferences` + `secretary_plans_list` + `secretary_daily_generate`
   - "Find something" → `search_global` + `notes_get`
   - "How am I doing?" → `secretary_analytics` + `soul_read`

5. **Methodology Skills** — table with trigger phrases and GitHub raw URLs for each:
   - Morning Routine, Evening Reflection, Weekly Review, Study Planning, Note Organization, Research to Notes, Daily Workflow

6. **Common Patterns** (condensed):
   - Read Before Write pattern
   - Project-Scoped Operations pattern
   - Memory File Naming conventions (AI.md, Plan.md, Today.md, Tomorrow.md, Recurring.md, Calendar.md, Plans/, History/)

### 3.3 `skills/noteshell/SETUP.md` (Fetched at Runtime)

Content outline:

1. Prerequisites: Node.js >= 18, a Noteshell account at noteshell.app
2. Step 1: Authenticate — Primary: `npx @noteshell/mcp login` / Legacy: `npx @noteshell/mcp setup <email> <password>`
3. Step 2: Add MCP server config for Claude Code, Cursor, Codex CLI (JSON snippet)
4. Step 3: Verify — call `secretary_today` to confirm

### 3.4 Methodology Files (MORNING-ROUTINE.md, etc.)

These are direct copies of the existing files from `packages/mcp/skills/`, with two modifications:

- Remove `platform: universal` from frontmatter (not needed in standalone skill)
- Update any internal cross-references between skill files to use the new UPPER-KEBAB-CASE names

Source → Destination mapping:

- `packages/mcp/skills/morning-routine.md` → `MORNING-ROUTINE.md` (~235 lines)
- `packages/mcp/skills/evening-reflection.md` → `EVENING-REFLECTION.md` (~192 lines)
- `packages/mcp/skills/weekly-review.md` → `WEEKLY-REVIEW.md` (~239 lines)
- `packages/mcp/skills/study-planning.md` → `STUDY-PLANNING.md` (~70 lines)
- `packages/mcp/skills/note-organization.md` → `NOTE-ORGANIZATION.md` (~83 lines)
- `packages/mcp/skills/research-to-notes.md` → `RESEARCH-TO-NOTES.md` (~89 lines)
- `packages/mcp/skills/daily-workflow.md` → `DAILY-WORKFLOW.md` (~88 lines)

### 3.5 Slash Commands

Each slash command follows the same 3-step pattern: check MCP → fetch full instructions → execute.

**`.claude/commands/plan-my-day.md`**

```yaml
---
name: plan-my-day
description: Plan your day using Noteshell — gathers context, analyzes yesterday, generates today's schedule
---
```

Body: Check MCP connection via `secretary_today` → Fetch MORNING-ROUTINE.md from raw URL → Execute step by step → Present dashboard.

**`.claude/commands/morning-routine.md`**

```yaml
---
name: morning-routine
description: Full morning planning routine — review yesterday, archive, pick focus, generate Today.md
---
```

Body: Same as plan-my-day (intentional alias with different trigger phrase).

**`.claude/commands/evening-reflection.md`**

```yaml
---
name: evening-reflection
description: End-of-day reflection — review completion, capture mood, carry over tasks, prepare tomorrow
---
```

Body: Check MCP → Fetch EVENING-REFLECTION.md → Execute.

**`.claude/commands/weekly-review.md`**

```yaml
---
name: weekly-review
description: Weekly review — analyze 7-day patterns, check plan progress, generate summary, suggest adjustments
---
```

Body: Check MCP → Fetch WEEKLY-REVIEW.md → Execute.

### 3.6 `README.md`

Content outline:

1. **Title + badge**: `noteshell-skill` — Noteshell Skills for Claude Code, Codex, Cursor
2. **What it does**: Adds slash commands and auto-triggered skills for Noteshell productivity workflows
3. **Prerequisites**: A Noteshell account + `@noteshell/mcp` set up as an MCP server
4. **Installation**: `npx skills add {{GITHUB_ORG}}/noteshell-skill`
5. **Available Commands**: /plan-my-day, /morning-routine, /evening-reflection, /weekly-review
6. **Auto-Triggered Skills**: keyword-rich SKILL.md auto-triggers on planning, notes, study, reflection mentions
7. **MCP Setup** (quick version): `npx @noteshell/mcp login` + JSON config
8. **License**: MIT

---

## Part 4: Fixes to `@noteshell/mcp` Package

### Fix 1: package.json — Add `description` field

**File:** `packages/mcp/package.json`
**Action:** Add after `"version"` line:

```json
"description": "Noteshell MCP Server — 43 pure-data tools for notes, tasks, study plans, and cross-agent context. Zero AI calls.",
```

### Fix 2: package.json — Remove generic `mcp` bin

**File:** `packages/mcp/package.json`
**Action:** Remove `"mcp": "scripts/noteshell.mjs"` from the `bin` object. It collides with other packages.

### Fix 3: package.json — Add `engines` field

**File:** `packages/mcp/package.json`
**Action:** Add:

```json
"engines": { "node": ">=18" }
```

### Fix 4: README.md — Show `login` as primary auth

**File:** `packages/mcp/README.md`
**Action:** Replace the setup section (lines 13-17) to show `npx @noteshell/mcp login` as the primary command, with `setup <email> <password>` as "Legacy alternative".

### Fix 5: config.ts — Update error message to reference `noteshell login`

**File:** `packages/mcp/src/config.ts` (lines 55-58)
**Action:** Change error message to start with: `'Missing Noteshell config. Run \`npx @noteshell/mcp login\` to authenticate.'`

### Fix 6: client.ts — Add console.error on silent token refresh failure

**File:** `packages/mcp/src/db/client.ts` (line 71)
**Action:** Change empty `catch {}` to:

```typescript
} catch (e) {
  console.error(
    `[noteshell] Token refresh failed: ${(e as Error).message}. ` +
    `Run \`npx @noteshell/mcp login\` to re-authenticate.`
  )
}
```

### Fix 7: SKILL.md — Correct tool counts

**File:** `packages/mcp/SKILL.md`
**Action:**

- Line 3 description: change "40 pure-data tools" → "43 pure-data tools"
- Line 16: change `notes_*` count from `11` → `11` (keep, since artifacts_create is separate)
- Add row for `artifacts_*` = 1
- Line 18: change `secretary_*` count from `18` → `20`
- Total should reflect 43

**Actual tool counts verified from source:**

- `notes.ts`: 13 `server.tool()` calls = 11 notes*\* + 1 artifacts*_ + 1 projects\__
- `secretary.ts`: 20 `server.tool()` calls
- `context.ts`: 5 `server.tool()` calls
- `calendar.ts`: 3 `server.tool()` calls
- `search.ts`: 2 `server.tool()` calls
- **Grand total: 43**

---

## Part 5: Implementation Order

### Phase 1: Fix Existing Package (30 min)

1. Fix `packages/mcp/package.json` — add description, remove `mcp` bin, add engines
2. Fix `packages/mcp/src/config.ts` — update error message
3. Fix `packages/mcp/src/db/client.ts` — add console.error on refresh failure
4. Fix `packages/mcp/SKILL.md` — correct tool counts
5. Fix `packages/mcp/README.md` — show login as primary auth
6. Run `pnpm --filter @noteshell/mcp build` to verify
7. Run `pnpm --filter @noteshell/mcp test` to verify

### Phase 2: Create Skill Package Structure (20 min)

1. Create `noteshell-skill/` at monorepo root
2. Create `.gitignore`, `skills/noteshell/`, `.claude/commands/`

### Phase 3: Write SKILL.md Entry Point (30 min)

1. Write `skills/noteshell/SKILL.md` with keyword-rich frontmatter, MCP check, tool table, recipes, methodology table

### Phase 4: Write SETUP.md (15 min)

1. Write `skills/noteshell/SETUP.md` with multi-client setup instructions

### Phase 5: Copy and Adapt Methodology Files (30 min)

1. Copy 7 skill files from `packages/mcp/skills/` → `skills/noteshell/`
2. Rename to UPPER-KEBAB-CASE
3. Remove `platform: universal`, update cross-references

### Phase 6: Write Slash Commands (20 min)

1. Write 4 command files in `.claude/commands/`

### Phase 7: Write README.md (15 min)

### Phase 8: Replace URL Placeholders (5 min)

1. Replace `{{GITHUB_ORG}}` once repo URL is decided

---

## Part 6: Testing

### Local Testing

1. Symlink `noteshell-skill/skills/noteshell/` into a project's skills directory → verify SKILL.md loads
2. Symlink `.claude/commands/` → verify `/plan-my-day` appears
3. Test with and without MCP server connected
4. After push to GitHub, verify raw URLs resolve with curl

### Integration Testing

1. `npx skills add {{GITHUB_ORG}}/noteshell-skill` in a fresh project
2. Verify files placed correctly
3. Run `/plan-my-day` end-to-end

---

## Part 7: Publishing

1. `cd noteshell-skill/ && git init && git add . && git commit -m "Initial noteshell skill package"`
2. `gh repo create {{GITHUB_ORG}}/noteshell-skill --public --source=. --push`
3. Replace URL placeholders in all files
4. `git commit -am "Set GitHub org URLs" && git push`
5. Test: `npx skills add {{GITHUB_ORG}}/noteshell-skill`
6. Publish MCP fixes: bump version, `npm publish --access public`

---

## Risks and Mitigations

| Risk                                                      | Mitigation                                                            |
| --------------------------------------------------------- | --------------------------------------------------------------------- |
| `npx skills add` may not support this repo structure      | Verify against SuperDesign repo which uses the same pattern           |
| Raw URL fetching may fail in some environments            | SKILL.md contains enough info for basic usage without fetching        |
| Tool count may change in future MCP versions              | Add a note in SKILL.md: "Tool count may vary by version"              |
| MCP connection check via `secretary_today` may be fragile | Read-only call that returns data or "no plan" — both indicate success |
| GitHub rate limiting on raw URLs                          | Content is small, unlikely to hit limits                              |
