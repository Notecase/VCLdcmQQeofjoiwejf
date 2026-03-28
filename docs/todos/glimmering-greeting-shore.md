# Delete ChatAgent & NoteAgent — Safe Removal Plan

## Context

The Unified Agent Mesh (Phases 1-4) extracted ChatAgent's RAG pipeline into `notes.search` and NoteAgent's CRUD into `notes.read`/`notes.create` capabilities. API routes for both agents were already removed. However, the agent **class files** remain because NoteAgent has 3 live runtime callers. This plan removes both agent files safely by migrating all callers first.

## Pre-Deletion Analysis

### ChatAgent — ZERO live callers

- No API route (removed in Phase 4)
- No frontend caller
- No runtime import anywhere
- Only blocked by barrel exports in `agents/index.ts`
- **Safe to delete immediately**

### NoteAgent — 3 live callers (all use `action: 'create'` only)

| Caller                      | File                                               | Import Type                      | What It Does                                                            |
| --------------------------- | -------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------- |
| Mission `note_pack`         | `packages/ai/src/services/mission-adapters.ts:287` | Dynamic                          | Creates 1-3 study notes via `noteAgent.stream({action:'create'})`       |
| Research `streamNoteCreate` | `packages/ai/src/agents/research/agent.ts:192`     | Dynamic                          | Creates a note when `RESEARCH_NOTE_DRAFT_ENABLED=false` (fallback path) |
| Inbox `create_note` tool    | `apps/api/src/channels/inbox-agent.ts:64`          | Dynamic via `@inkdown/ai/agents` | Creates a note via `agent.run({action:'create'})`                       |

All 3 callers use NoteAgent **exclusively for `create` action**. The core behavior is: take a prompt → call LLM to generate markdown → insert note to Supabase → return `noteId`.

### Dead code (delete alongside)

- `packages/ai/src/agents/subagents/note.subagent.ts` — nobody calls it (EditorDeep does NOT use it)
- `packages/ai/src/agents/chat.agent.test.ts`
- `packages/ai/src/agents/note.agent.test.ts`

---

## Step 1: Delete ChatAgent (no migration needed)

### Files to delete

- `packages/ai/src/agents/chat.agent.ts`
- `packages/ai/src/agents/chat.agent.test.ts`

### Files to modify

**`packages/ai/src/agents/index.ts`:**

- Remove the ChatAgent export block (lines ~93-101)
- Remove `import { ChatAgent } from './chat.agent'` (line ~216)
- Remove `case 'chat': return new ChatAgent(config)` from `createAgent()`
- Remove `ChatAgent` from the return type union of `createAgent()`
- Remove `'chat'` from `LegacyAgentType`
- Remove `ChatAgentState` interface (dead, defined locally not imported)

**`packages/ai/src/index.ts`:**

- Remove `ChatAgentState` from the type export on line 76

### Optional cleanup (not blocking, cosmetic)

- `packages/shared/src/types/ai.ts:218` — remove `'chat'` from `AgentType` union
- `apps/web/src/stores/ai.ts:25` — remove `'chat'` from `ChatSession.agentType` union
- `apps/web/src/services/ai.service.threading.test.ts:16` — remove `'chat'` from mock type

---

## Step 2: Create standalone `createNoteFromPrompt()` utility

Before deleting NoteAgent, extract its `create` action into a lightweight utility function that all 3 callers can use. This avoids duplicating logic.

### Create `packages/ai/src/utils/note-creator.ts`

The utility replaces NoteAgent's `create` action with direct `generateText` + Supabase insert:

```typescript
// Input: prompt string, supabase client, userId, optional projectId, optional model
// Output: { noteId, title, content } or throws

async function createNoteFromPrompt(opts: {
  prompt: string
  supabase: SupabaseClient
  userId: string
  projectId?: string
  model?: string
}): Promise<{ noteId: string; title: string; content: string }>
```

**Implementation approach:**

- Use `generateText()` with structured output to get `{ title, content }` from the LLM (same pattern NoteAgent uses internally at `note.agent.ts:189-226`)
- Insert the note to Supabase `notes` table
- Return `{ noteId, title, content }`

Also create a streaming variant for callers that need it:

```typescript
async function* streamCreateNote(opts: {
  prompt: string
  supabase: SupabaseClient
  userId: string
  projectId?: string
  model?: string
}): AsyncGenerator<{ type: 'title' | 'text-delta' | 'finish'; data: unknown }>
```

This matches the NoteAgent stream interface that `mission-adapters.ts` and `research/agent.ts` consume.

### Key behavior to preserve from NoteAgent

- Read from `note.agent.ts:189-226` (the `generateNoteContent` method)
- Uses `generateText` with a system prompt for note creation
- Extracts title from first `#` heading or generates one
- Saves to `notes` table with `user_id`, `title`, `content`, `project_id`

---

## Step 3: Migrate 3 NoteAgent callers

### Caller A: `mission-adapters.ts:287`

**Before:** `const { NoteAgent } = await import(...)` → `noteAgent.stream({action:'create', input, projectId})`
**After:** `const { streamCreateNote } = await import('../../utils/note-creator')` → `streamCreateNote({prompt: def.input, supabase, userId, projectId})`

- The loop at lines 355-369 iterates the stream and collects `noteId`/`title` from `finish` event — same interface.

### Caller B: `research/agent.ts:192`

**Before:** `const { NoteAgent } = await import('../note.agent')` → `noteAgent.stream({action:'create', input: message})`
**After:** `const { streamCreateNote } = await import('../../utils/note-creator')` → `streamCreateNote({prompt: message, supabase, userId, model})`

- The `for await` loop at lines 202-218 handles `thinking`, `text-delta`, `finish` — map to same events.

### Caller C: `inbox-agent.ts:64`

**Before:** `const { createNoteAgent } = await import('@inkdown/ai/agents')` → `agent.run({action:'create', input})`
**After:** `const { createNoteFromPrompt } = await import('@inkdown/ai/utils/note-creator')` → `createNoteFromPrompt({prompt, supabase, userId})`

- This uses the non-streaming `.run()` — use `createNoteFromPrompt` (the non-streaming variant).
- Need to add `./utils/note-creator` to `packages/ai/package.json` exports field.

---

## Step 4: Delete NoteAgent

### Files to delete

- `packages/ai/src/agents/note.agent.ts`
- `packages/ai/src/agents/note.agent.test.ts`
- `packages/ai/src/agents/subagents/note.subagent.ts` (dead code)

### Files to modify

**`packages/ai/src/agents/index.ts`:**

- Remove `export { NoteAgent, createNoteAgent, type NoteAgentConfig } from './note.agent'`
- Remove `import { NoteAgent } from './note.agent'`
- Remove `case 'note': return new NoteAgent(config)` from `createAgent()`
- Remove `NoteAgent` from return type union
- Remove `'note'` from `LegacyAgentType`
- Remove `NoteAgentState` interface (dead, locally defined)

**`packages/ai/src/agents/subagents/index.ts`:**

- Remove NoteSubagent re-exports

**`packages/ai/src/index.ts`:**

- Remove `NoteAgentState` from type export
- Add export for new `createNoteFromPrompt` / `streamCreateNote` from `./utils/note-creator`

**`packages/ai/package.json`:**

- Add `"./utils/note-creator"` export mapping (for `inbox-agent.ts` to import)

### Optional cleanup

- `packages/shared/src/types/ai.ts:218` — remove `'note'` from `AgentType`
- Various docs — update NoteAgent references

---

## Step 5: Update documentation

- `CLAUDE.md` — remove NoteAgent/ChatAgent mentions from architecture
- `docs/ARCHITECTURE.md` — remove deprecated agent entries
- `docs/AI-AGENT-SYSTEM.md` — update agent list

---

## Verification

1. `pnpm typecheck` — 0 errors (no dangling imports)
2. `pnpm build` — all packages build
3. `pnpm test:run` — all tests pass (deleted test files won't run)
4. `grep -r "ChatAgent\|NoteAgent\|chat\.agent\|note\.agent" packages/ai/src/ --include="*.ts" | grep -v test | grep -v "\.d\.ts"` — only the new `note-creator.ts` and comments should remain
5. Manual: test mission note_pack workflow, research note creation, inbox create_note

---

## Risk Assessment

| Risk                                        | Likelihood | Impact | Mitigation                                             |
| ------------------------------------------- | ---------- | ------ | ------------------------------------------------------ |
| `streamCreateNote` event interface mismatch | Low        | High   | Match exact `{type, data}` shape from NoteAgent        |
| inbox-agent import path change breaks       | Low        | Medium | Add package.json export entry                          |
| Mission note_pack regression                | Low        | High   | Test with a real mission workflow                      |
| NoteAgent had edge case handling we miss    | Medium     | Low    | Read `note.agent.ts` thoroughly before writing utility |

## Files Summary

| Action     | File                                                           |
| ---------- | -------------------------------------------------------------- |
| **Delete** | `packages/ai/src/agents/chat.agent.ts`                         |
| **Delete** | `packages/ai/src/agents/chat.agent.test.ts`                    |
| **Delete** | `packages/ai/src/agents/note.agent.ts`                         |
| **Delete** | `packages/ai/src/agents/note.agent.test.ts`                    |
| **Delete** | `packages/ai/src/agents/subagents/note.subagent.ts`            |
| **Create** | `packages/ai/src/utils/note-creator.ts`                        |
| **Modify** | `packages/ai/src/agents/index.ts`                              |
| **Modify** | `packages/ai/src/agents/subagents/index.ts`                    |
| **Modify** | `packages/ai/src/index.ts`                                     |
| **Modify** | `packages/ai/package.json`                                     |
| **Modify** | `packages/ai/src/services/mission-adapters.ts`                 |
| **Modify** | `packages/ai/src/agents/research/agent.ts`                     |
| **Modify** | `apps/api/src/channels/inbox-agent.ts`                         |
| **Modify** | `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/AI-AGENT-SYSTEM.md` |
