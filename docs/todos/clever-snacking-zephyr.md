# Plan: Noteshell Skill Repo + MCP Package Fixes

## Context

Noteshell has a working MCP server (`@noteshell/mcp`) with 43 tools and 7 methodology skill files. However, the skills are invisible to every AI coding tool's skill discovery system. Following the SuperDesign pattern (the industry standard for Agent Skills), we need to create a proper skill package that works across Claude Code, Codex, Cursor, Gemini CLI, and 30+ other tools via the Agent Skills open standard.

Additionally, the MCP npm package has several issues that need fixing before broader public use.

---

## Workstream A: Create `noteshell-skill/` Directory

### Target Structure

```
noteshell-skill/
├── .gitignore                              # ".claude"
├── README.md                               # Installation + quickstart
├── skills/
│   └── noteshell/
│       ├── SKILL.md                        # Entry point (~4KB, always loaded)
│       └── NOTESHELL.md                    # Full methodology reference (~10KB, fetched on demand)
└── .claude/
    └── commands/
        ├── plan-my-day.md                  # /plan-my-day slash command
        ├── morning-routine.md              # /morning-routine slash command
        ├── evening-reflection.md           # /evening-reflection slash command
        └── weekly-review.md               # /weekly-review slash command
```

### Step A1: Create directory structure

Create `noteshell-skill/` at monorepo root with all subdirectories.

### Step A2: Write `skills/noteshell/SKILL.md`

The entry point. Must be small (~4KB) and always loaded into context. Contains:

**Frontmatter:**

```yaml
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
```

**Body content (concise, ~4KB):**

1. **MCP Prerequisite Check** — instruct Claude to verify MCP tools are available (try calling `secretary_today`). If not, guide setup:
   ```
   npx @noteshell/mcp login
   # Then add to MCP config...
   ```
2. **Tool Quick Reference** — the 5 tool groups with corrected counts (13 notes, 20 secretary, 5 context, 3 calendar, 2 search = 43 total)
3. **Common Patterns** — read-before-write, project-scoped ops, memory file naming
4. **Fetch instruction** — point to NOTESHELL.md on GitHub raw URL for full methodology:
   ```
   MUST MANDATORY Fetch fresh guidelines below:
   https://raw.githubusercontent.com/noteshell/noteshell-skill/main/skills/noteshell/NOTESHELL.md
   ```

### Step A3: Write `skills/noteshell/NOTESHELL.md`

The full methodology reference (~10KB), fetched on demand. Consolidates all 7 skill workflows into one document with clear sections:

1. **Morning Routine** — from `morning-routine.md`
2. **Evening Reflection** — from `evening-reflection.md`
3. **Weekly Review** — from `weekly-review.md`
4. **Study Planning** — from `study-planning.md`
5. **Note Organization** — from `note-organization.md`
6. **Research to Notes** — from `research-to-notes.md`
7. **Daily Workflow** — from `daily-workflow.md`

Each section includes: purpose, step-by-step tools to call, guardrails, output format.

Source files to consolidate from: `packages/mcp/skills/*.md` (all 7 files)

### Step A4: Write slash commands

Each command in `.claude/commands/` has this pattern:

**`.claude/commands/plan-my-day.md`:**

```yaml
---
description: Plan your day using Noteshell — review yesterday, pick focus, generate today's schedule
---
```

Body: Invoke the noteshell skill, then follow the Morning Routine workflow from NOTESHELL.md. Call secretary_today, secretary_preferences, secretary_plans_list, etc.

**`.claude/commands/morning-routine.md`:**

```yaml
---
description: Full morning routine — archive yesterday, analyze patterns, generate Today.md with time blocks
---
```

Body: Full morning routine prompt referencing the methodology.

**`.claude/commands/evening-reflection.md`:**

```yaml
---
description: End-of-day reflection — capture mood, carry over tasks, prepare tomorrow
---
```

**`.claude/commands/weekly-review.md`:**

```yaml
---
description: Analyze past 7 days — completion trends, plan progress, mood patterns, suggestions
---
```

### Step A5: Write `.gitignore`

```
.claude
```

### Step A6: Write `README.md`

Content:

1. What is Noteshell (1 paragraph)
2. Prerequisites: `npx @noteshell/mcp login` + MCP config setup
3. Installation: `npx skills add noteshell/noteshell-skill`
4. Available commands: /plan-my-day, /morning-routine, /evening-reflection, /weekly-review
5. What happens: skill teaches Claude HOW to use your 43 MCP tools effectively
6. Methodology overview (the 7 workflows)
7. Links to noteshell.app and @noteshell/mcp on npm

---

## Workstream B: Fix `@noteshell/mcp` Package Issues

### Step B1: Fix `package.json`

File: `packages/mcp/package.json`

Changes:

- Add `"description": "Noteshell MCP Server — 43 pure-data tools for notes, planning, and learning. Zero AI calls."`
- Remove `"mcp"` bin entry (too generic, collides with other packages)
- Add `"engines": { "node": ">=18.0.0" }`

### Step B2: Update tool counts in SKILL.md

File: `packages/mcp/SKILL.md`

Fix tool counts:

- `notes_*`: 11 → 13
- `secretary_*`: 18 → 20
- Total in README: 40 → 43

### Step B3: Update README.md

File: `packages/mcp/README.md`

Changes:

- Primary auth: `npx @noteshell/mcp login` (browser OAuth)
- Legacy fallback: `npx @noteshell/mcp setup <email> <password>`
- Fix tool count: 40 → 43
- Add reference to the skill repo for methodology workflows

### Step B4: Fix config.ts error message

File: `packages/mcp/src/config.ts` (lines 55-58)

Change error message from manual JSON instructions to:

```
'Missing Noteshell config. Run `npx @noteshell/mcp login` to authenticate, ' +
'or set SUPABASE_URL + SUPABASE_ANON_KEY + NOTESHELL_ACCESS_TOKEN env vars.'
```

### Step B5: Add warning on token refresh failure

File: `packages/mcp/src/db/client.ts` (line 71)

Change bare `catch {}` to:

```typescript
catch (refreshErr) {
  console.error('Noteshell: token refresh failed — run `npx @noteshell/mcp login` to re-authenticate')
}
```

### Step B6: Fix server.ts version

File: `packages/mcp/src/server.ts`

The server reports version "0.1.0" but package.json is "0.2.0". Sync them.

---

## Implementation Order

1. **A1-A2**: Create skill directory + SKILL.md (the entry point — most critical)
2. **A3**: Write NOTESHELL.md (consolidate 7 methodology files)
3. **A4**: Write 4 slash commands
4. **A5-A6**: Write .gitignore + README
5. **B1-B6**: Fix MCP package issues (independent of skill work)

---

## Verification

### Test skill locally (before GitHub push)

```bash
# Test with Claude Code's plugin testing mode
claude --plugin-dir ./noteshell-skill

# Verify:
# 1. Skill appears in /skills list
# 2. /plan-my-day command works
# 3. /morning-routine command works
# 4. SKILL.md auto-triggers when saying "plan my day"
# 5. NOTESHELL.md fetch works (after pushing to GitHub)
```

### Test MCP package fixes

```bash
cd packages/mcp
pnpm build && pnpm typecheck    # Build succeeds
node dist/index.js              # Starts without error (will fail without config, but should show clear error message)
```

### Pre-publish checklist

- [ ] SKILL.md frontmatter valid (name, description, metadata)
- [ ] All 4 slash commands have valid frontmatter (description field)
- [ ] NOTESHELL.md contains all 7 methodologies
- [ ] README has correct install instructions
- [ ] .gitignore contains ".claude"
- [ ] package.json has description, engines, no generic "mcp" bin
- [ ] Tool counts are correct (43 total) in SKILL.md and README
- [ ] Config error message references `noteshell login`
- [ ] Token refresh logs warning on failure
- [ ] `noteshell` placeholders replaced with actual org name

### Publishing

1. Push `noteshell-skill/` to a new GitHub repo (e.g., `noteshell/noteshell-skill`)
2. Replace `noteshell` with actual org in SKILL.md
3. Test: `npx skills add noteshell/noteshell-skill`
4. Test: verify skill appears and commands work
5. Bump `@noteshell/mcp` version to 0.3.0, `npm publish`
