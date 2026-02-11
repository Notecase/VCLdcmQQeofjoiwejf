# Fix AI Tool Use Reliability — Make LLM Know When to Use Tools

## Context

The AI system (NoteAgent, EditorAgent, EditorDeepAgent) struggles with **knowing when to use which tool**. GPT-5.2 via API frequently misclassifies user intent and picks wrong tools. Root cause analysis across the entire codebase reveals 5 concrete issues, all fixable with prompt engineering and minor code changes.

### Decisions
- **Scope**: All 5 steps (prompt improvements + confidence fallback routing)
- **Strategy**: Deprecate legacy EditorAgent path — make EditorDeep the default and only runtime
- **Execution**: Team of 2 agents working in parallel

### Root Causes Identified

| # | Root Cause | Impact | Evidence |
|---|-----------|--------|----------|
| 1 | **EditorDeep system prompt is 37 lines** vs Secretary's 520 lines | HIGH — no tool selection guidance, no examples, no "when to use" | `editor-deep/prompts.ts:1-37` |
| 2 | **Tool descriptions are generic one-liners** | HIGH — function calling relies on descriptions to choose tools | `editor-deep/tools.ts` — e.g., "Insert a markdown table into the active note" |
| 3 | **Legacy intent classifier has 0 examples** for 6 of 8 intents | MEDIUM — misclassifies chat vs edit, table vs artifact | `editor.agent.ts:121-148` |
| 4 | **Context starvation** — classifier only sees note title, not content | MEDIUM — can't distinguish "what is X" (chat) vs "write about X" (edit) | `editor.agent.ts:370-371` |
| 5 | **Zod schemas lack `.describe()`** on parameters | LOW — model doesn't know what values to provide | `editor-deep/tools.ts` parameter schemas |

The **Secretary agent** (`secretary/prompts.ts`) is the gold standard — 520 lines with tool grouping, CORRECT/WRONG examples, forbidden tools, and step-by-step workflows. Applying the same patterns to EditorDeep and legacy classifier solves this.

---

## Implementation Plan

### Step 1: Upgrade EditorDeep System Prompt (HIGHEST IMPACT)

**File:** `packages/ai/src/agents/editor-deep/prompts.ts`

Expand `EDITOR_DEEP_SYSTEM_PROMPT` from 37 lines to ~200 lines. Add these sections (modeled on Secretary):

**A. Tool Grouping with When-to-Use Guidance**
Organize 10 tools into 4 groups:
- **Note Reading**: `answer_question_about_note` — USE for Q&A/summarize, NOT for editing
- **Note Editing** (all propose changes for review):
  - `create_note` — USE for brand-new notes, NOT for editing current note
  - `add_paragraph` — USE for inserting NEW content, NOT for rewriting existing
  - `edit_paragraph` — USE for replacing/rewriting existing text
  - `remove_paragraph` — USE only when user explicitly asks to delete
  - `insert_table` — USE for static data tables, NOT for interactive widgets
- **Artifacts**: `create_artifact_from_note` — USE ONLY for interactive JS widgets
- **Database**: `database_action` — USE for existing embedded databases
- **Memory**: `read_memory`, `write_memory`

**B. CORRECT vs WRONG Examples** (8-10 examples covering common confusions):
- "Add a summary" → `add_paragraph` (NOT `edit_paragraph`, NOT `create_note`)
- "Make a table of top 5 birds" → `insert_table` (NOT `create_artifact_from_note`)
- "Create an interactive quiz" → read note first, then `create_artifact_from_note`
- "What's this note about?" → `answer_question_about_note` (NOT guess from memory)

**C. Critical Rules**:
- Always read note before editing
- All editing tools propose for review, NOT applied directly
- Missing context → ask clarification, don't guess
- Prefer most specific tool when multiple could apply

**D. Update subagent prompts** (`QA_SUBAGENT_PROMPT`, `EDIT_SUBAGENT_PROMPT`, `ARTIFACT_SUBAGENT_PROMPT`) with tool-specific disambiguation.

---

### Step 2: Improve Tool Descriptions in EditorDeep Tools

**File:** `packages/ai/src/agents/editor-deep/tools.ts`

Rewrite all 10 tool `description` fields from generic one-liners to explicit guidance:

| Tool | Current | New (summary) |
|------|---------|---------------|
| `answer_question_about_note` | "Read the active note..." | + "Do NOT use for editing — use add/edit/remove_paragraph" |
| `create_note` | "Create a new note..." | + "ONLY for new notes. To edit current, use paragraph tools" |
| `add_paragraph` | "Add a paragraph..." | + "For NEW content. To modify existing, use edit_paragraph" |
| `edit_paragraph` | "Edit a specific paragraph..." | + "Replace/rewrite existing text by index" |
| `remove_paragraph` | "Remove a paragraph..." | + "ONLY when user explicitly asks to delete" |
| `insert_table` | "Insert a markdown table..." | + "For static data. For interactive, use create_artifact" |
| `create_artifact_from_note` | "Persist an artifact..." | + "ONLY for interactive content needing JS" |
| `database_action` | "Run db_* operations..." | + "For EXISTING databases. New table → insert_table" |
| `read_memory` | "Read memory context..." | + "For preferences, plans, context" |
| `write_memory` | "Write memory content..." | + "Store concise facts, not full note bodies" |

---

### Step 3: Enrich Legacy Intent Classification

**File:** `packages/ai/src/agents/editor.agent.ts`

**A. Expand `INTENT_CLASSIFICATION_PROMPT`** (lines 121-148):
- Add 2-3 examples per intent (currently 0 for 6 of 8)
- Add disambiguation blocks: chat vs edit, chat vs open_note, table vs artifact
- ~80-90 lines total (from 28)

**B. Add note content context to classifier** (lines 367-371):
```typescript
// Include first 500 chars of note content, not just title
contextInfo += `\n[Note preview: "${contentSnippet}..."]`
```

**C. Add conversation history to classifier** (lines 374-376):
```typescript
// Include last 2 turns, not just count
const recentMessages = this.state.messages.slice(-4)
const historySnippet = recentMessages
  .map(m => `${m.role}: ${m.content.slice(0, 100)}`).join('\n')
```

---

### Step 4: Add Zod `.describe()` to Tool Parameters

**File:** `packages/ai/src/agents/editor-deep/tools.ts`

Add `.describe()` annotations to all parameter fields that lack them. Key additions:
- `question` → "The question the user is asking about the note"
- `paragraph` → "Full markdown content of the new paragraph to add"
- `afterBlockIndex` → "Insert after this paragraph index. Omit to append at end"
- `headers` → "Column header names, e.g. ['Name', 'Speed', 'Habitat']"
- `rows` → "Table rows, each an array of cell values matching headers"
- `html/css/javascript` → Sandbox constraints inline

---

### Step 5: Force EditorDeep as Default + Deprecate Legacy Path

**File:** `apps/api/src/routes/agent.ts`

Make EditorDeep the only runtime path by changing `shouldUseEditorDeepRuntime()`:

**A. Change default to always-on** (line 57-72):
```typescript
function shouldUseEditorDeepRuntime(userId: string, requestedRuntime?: 'legacy' | 'editor-deep') {
  const killSwitch = readBooleanEnv('EDITOR_DEEP_AGENT_KILL_SWITCH', false)
  if (killSwitch) return false
  // Legacy path only if EXPLICITLY requested — EditorDeep is now the default for ALL users
  if (requestedRuntime === 'legacy') return false
  return true  // Always use EditorDeep
}
```

**B. Add deprecation log** when legacy path is explicitly requested:
```typescript
if (requestedRuntime === 'legacy') {
  console.warn('[agent] Legacy EditorAgent runtime is deprecated. Use editor-deep instead.')
  return false
}
```

**C. Still improve legacy classifier** (Step 3) as maintenance — legacy path remains for emergency fallback via `runtime: "legacy"`.

---

## Files to Modify

| File | Changes | Agent |
|------|---------|-------|
| `packages/ai/src/agents/editor-deep/prompts.ts` | Expand system prompt 37→~200 lines, update subagent prompts | Agent 1 |
| `packages/ai/src/agents/editor-deep/tools.ts` | Rewrite 10 tool descriptions, add Zod `.describe()` to params | Agent 1 |
| `packages/ai/src/agents/editor.agent.ts` | Expand intent prompt 28→~80 lines, add note content context + conversation history | Agent 2 |
| `apps/api/src/routes/agent.ts` | Force EditorDeep as default, deprecate legacy | Agent 2 |

## Implementation Order

```
┌─────────────────────────────────────────────────────────────┐
│  AGENT 1 (EditorDeep focus)          AGENT 2 (Legacy + API) │
│                                                              │
│  Step 1: EditorDeep prompt           Step 3: Legacy intent   │
│     prompts.ts (37→200 lines)           classifier prompt    │
│                                         editor.agent.ts      │
│  Step 2: Tool descriptions                                   │
│     tools.ts (10 descriptions)       Step 5: Force default   │
│                                         agent.ts routing     │
│  Step 4: Zod .describe()                                     │
│     tools.ts (parameter schemas)                             │
│                                                              │
│  ──── both run in parallel ────                              │
└─────────────────────────────────────────────────────────────┘
```

## Verification

1. `pnpm test:run packages/ai/src/agents/editor-deep/` — existing tests pass with prompt changes
2. `pnpm typecheck` — no type errors
3. `pnpm build` — builds successfully
4. **Manual testing** (most important):
   - Send "make a table of top 5 fastest animals" → should use `insert_table` (not `create_artifact`)
   - Send "create an interactive timer" → should use `create_artifact_from_note` (not `insert_table`)
   - Send "add a paragraph about conclusions" → should use `add_paragraph` (not `edit_paragraph`)
   - Send "what is this note about?" → should use `answer_question_about_note`
   - Send "rewrite the introduction" → should use `edit_paragraph`
   - Send "write about quantum computing" → should classify as `edit_note` (not `chat`)
5. Verify EditorDeep is always used: check logs for `editor_deep_agent.context` (not legacy flow)
