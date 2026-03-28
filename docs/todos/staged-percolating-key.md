# Verification, Commit & Deploy Plan

## Context

This session implemented multiple features and fixes across 30+ modified files and 4 new files:

1. **Agent conversation history** — Secretary and Research agents now load multi-turn conversation history (shared windowing utility, history loaders, agent wiring)
2. **429 CONCURRENT_LIMIT fix** — Credit guard SSE counter leak fixed + scoped to AI routes only
3. **Pending roadmap prompt hardening** — Stronger instruction to prevent model hallucinating saves
4. **Plan ID rename migration** — Auto-migrate roadmap files + DB records when plan codename changes
5. **Plan badge CSS fix** — `white-space: nowrap` on `.plan-abbrev` to prevent text wrapping

## Verification Results

### Automated (all passing)

- **Tests**: 369/369 passed (45 test files, 0 failures)
- **Build**: 7/7 packages successful
- **Typecheck**: 10/10 tasks successful
- **Lint**: 0 errors (657 pre-existing warnings, none new)

### Code Review Findings (from review agent)

**Issue 1 — `.or()` string interpolation in SecretaryHistoryService** (security)

- `packages/ai/src/agents/secretary/history.ts:35` — `.or(\`thread_id.eq.${params.threadId},...\`)`
- Pre-existing pattern in `apps/api/src/routes/secretary.ts:421,461` (NOT introduced by us)
- **Fix**: Add UUID validation before the `.or()` call in history.ts (our new code)
- Low real-world risk (threadId comes from API route which already validates), but defense-in-depth

**Issue 2 — Early-return credit counter leak** (bug)

- If `openaiApiKey` is falsy, `/chat` and `/prepare-tomorrow` return 500 before entering `streamSSE`
- Credit counter was already incremented by middleware, never decremented
- **Fix**: Add `c.get('creditDecrement')?.()` on early-return paths
- Low real-world impact (API key always set), but should be fixed

**Issues 1-2 should be fixed before committing.**

---

## Step 1: Fix Review Issues

### Fix 1a — UUID validation in SecretaryHistoryService

**File**: `packages/ai/src/agents/secretary/history.ts`
Add before the `.or()` query:

```typescript
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
if (!UUID_RE.test(params.threadId)) return []
```

### Fix 1b — Credit decrement on early-return paths

**File**: `apps/api/src/routes/secretary.ts`
For `/chat` route (~line 146): after the `openaiApiKey` check, before returning:

```typescript
if (!openaiApiKey) {
  c.get('creditDecrement')?.()
  return c.json({ error: 'OpenAI API key not configured' }, 500)
}
```

Same for `/prepare-tomorrow` route (~line 569).

---

## Step 2: Commit

### Files to commit (modified)

All 30 modified files + 4 new files:

- `packages/ai/src/utils/conversation-history.ts` (NEW)
- `packages/ai/src/utils/conversation-history.test.ts` (NEW)
- `packages/ai/src/agents/secretary/history.ts` (NEW)
- `packages/ai/src/agents/research/history.ts` (NEW)
- `packages/shared/src/secretary/schedule-utils.ts` (NEW)
- `packages/ai/src/agents/automation/` (NEW directory)
- `supabase/migrations/036_automation_cron.sql` (NEW)
- Plus all 30 modified files from `git diff --name-only`
- Plus docs in `docs/` (plan files, specs)

### Files to NOT commit

- `.env` files (already gitignored)

### Commit message

```
feat: multi-turn conversation history for Secretary & Research agents

- Extract shared windowing utility (windowMessages, buildInvocationMessages)
- Add SecretaryHistoryService with thread ID resolution
- Add ResearchHistoryService for research_messages
- Refactor EditorDeep to use shared utility
- Fix 429 CONCURRENT_LIMIT: scope creditGuard to AI routes only,
  explicit SSE stream decrement via context
- Harden pending roadmap save prompt
- Auto-migrate roadmap files on plan codename rename
- Fix plan badge text wrapping in ActivePlansOverview
```

---

## Step 3: Push to GitHub

```bash
git push origin main
```

This triggers the GitHub CI workflow (`.github/workflows/ci.yml`):

- Runs `pnpm install --frozen-lockfile`
- Runs `pnpm build`
- Runs `pnpm typecheck`
- Runs `pnpm test:run`

**Wait for CI to pass before proceeding.**

---

## Step 4: Railway Deployment (API)

Railway auto-deploys on push to `main` (watch patterns include `apps/api/**`, `packages/ai/**`, `packages/shared/**`).

**Verify after deploy:**

```bash
# Check health endpoint
curl https://api.noteshell.io/health
```

If Railway doesn't auto-deploy, trigger manually:

```bash
railway up
```

---

## Step 5: Vercel Deployment (Web)

Vercel auto-deploys on push to `main` via GitHub integration.

**Verify after deploy:**

- Check Vercel dashboard for deployment status
- Visit the production URL and verify Secretary chat works

---

## Step 6: Post-Deploy Verification

1. **Secretary multi-turn**: Open Secretary → send message → reply → verify context retained
2. **No 429 errors**: Send multiple messages, check that non-AI routes work during streaming
3. **Plan badge**: Check plan cards show codenames on single line
4. **Plan workspace**: Navigate to a plan → verify roadmap loads

---

## Execution Order

```
Step 1 (fix review issues) → Step 2 (commit) → Step 3 (push + CI)
  → Step 4 (Railway auto-deploy) ← verify
  → Step 5 (Vercel auto-deploy)  ← verify
  → Step 6 (post-deploy verification)
```

## Old Plan (Completed)

The original conversation history implementation plan tasks 1-8 are all completed. Details below for reference.

---

## Task 1: Create Shared Windowing Utility

Extract the character-budgeted windowing algorithm from `EditorConversationHistoryService` into a pure, reusable function.

**Create:** `packages/ai/src/utils/conversation-history.ts`
**Create:** `packages/ai/src/utils/conversation-history.test.ts`
**Modify:** `packages/ai/src/utils/index.ts` (add exports)

### Implementation

**`conversation-history.ts`** exports two functions:

1. `windowMessages(messages: ThreadMessage[], options?: WindowOptions): ThreadMessage[]`
   - Takes already-fetched message rows (any table) and returns windowed subset
   - Filters empty messages, sorts chronologically
   - Walks newest-first, accumulating chars until budget exceeded
   - Always includes at least the newest message (even if over budget — truncates from start)
   - Returns in chronological order
   - Defaults: `maxTurns: 20`, `maxChars: 16000`

2. `buildInvocationMessages(history: ThreadMessage[], currentMessage: string): Array<{ role, content }>`
   - Appends current message to windowed history
   - Deduplicates if current message is already the last history entry (handles race where message was persisted before history query)
   - Trims whitespace for comparison

**Types:**

```typescript
interface ThreadMessage {
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}
interface WindowOptions {
  maxTurns?: number
  maxChars?: number
}
```

**Algorithm** (replicated from `editor-deep/history.ts:56-81`):

```
1. Filter: keep only user/assistant roles with non-empty trimmed content
2. Sort: chronological (createdAt ascending)
3. Slice: keep last (maxTurns * 2) messages
4. Walk from end to start:
   - If adding this message exceeds maxChars AND we already have at least 1: stop
   - If first message exceeds maxChars: truncate content from start, keep it, stop
   - Otherwise: keep it, add its length to usedChars
5. Reverse kept array → chronological order
```

**Tests:** Cover empty input, within-budget passthrough, turn limiting, char limiting, single-message-over-budget truncation, empty message filtering, chronological sorting, deduplication.

### Verification

```bash
pnpm test:run packages/ai/src/utils/conversation-history.test.ts
```

---

## Task 2: Create Secretary History Loader

Thin loader that queries `secretary_chat_messages` and feeds rows through the shared windower.

**Create:** `packages/ai/src/agents/secretary/history.ts`
**Create:** `packages/ai/src/agents/secretary/history.test.ts`

### Critical: Thread ID Resolution

`secretary_chat_messages.thread_id` is an FK to `secretary_threads.id` (the **internal UUID PK**), NOT the public `secretary_threads.thread_id` (TEXT). The agent receives the public thread ID. Resolution is required.

**Resolution approach** (same pattern as `apps/api/src/routes/secretary.ts:407`):

```typescript
const { data: threadRow } = await this.supabase
  .from('secretary_threads')
  .select('id')
  .or(`thread_id.eq.${publicThreadId},id.eq.${publicThreadId}`)
  .single()
// threadRow.id is the internal UUID to use for querying messages
```

### Implementation

```typescript
export class SecretaryHistoryService {
  constructor(
    private supabase: SupabaseClient,
    private userId: string
  ) {}

  async loadThreadMessages(params: {
    threadId: string // Public thread ID (or internal ID — both handled)
    windowTurns?: number // Default: 20
    maxChars?: number // Default: 16000
  }): Promise<ThreadMessage[]> {
    // 1. Resolve public threadId → internal DB UUID
    const { data: threadRow } = await this.supabase
      .from('secretary_threads')
      .select('id')
      .or(`thread_id.eq.${params.threadId},id.eq.${params.threadId}`)
      .single()
    if (!threadRow) return []

    // 2. Query messages using internal UUID
    const { data, error } = await this.supabase
      .from('secretary_chat_messages')
      .select('role, content, created_at')
      .eq('thread_id', threadRow.id)
      .eq('user_id', this.userId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error || !data) return []

    // 3. Map to ThreadMessage and window
    return windowMessages(mapped, { maxTurns, maxChars })
  }
}
```

### Verification

```bash
pnpm test:run packages/ai/src/agents/secretary/history.test.ts
```

---

## Task 3: Create Research History Loader

**Create:** `packages/ai/src/agents/research/history.ts`

Simpler than Secretary — `research_messages.thread_id` uses a direct UUID (no resolution needed). Also, `research_messages` has no `user_id` column (RLS handles access control).

```typescript
export class ResearchHistoryService {
  constructor(private supabase: SupabaseClient) {} // No userId needed

  async loadThreadMessages(params: {
    threadId: string
    windowTurns?: number // Default: 16
    maxChars?: number // Default: 14000
  }): Promise<ThreadMessage[]> {
    const { data, error } = await this.supabase
      .from('research_messages')
      .select('role, content, created_at')
      .eq('thread_id', params.threadId)
      .order('created_at', { ascending: false })
      .limit(limit)
    // ... map and window
  }
}
```

---

## Task 4: Wire History Into Secretary Agent

**Modify:** `packages/ai/src/agents/secretary/agent.ts`

### Changes

1. **Add imports** (after line 16):

   ```typescript
   import { SecretaryHistoryService } from './history'
   import { buildInvocationMessages } from '../../utils/conversation-history'
   ```

2. **Load history** (after line 57, after `getFullContext()`):

   ```typescript
   const historyService = new SecretaryHistoryService(this.config.supabase, this.config.userId)
   const historyMessages = input.threadId
     ? await historyService.loadThreadMessages({
         threadId: input.threadId,
         windowTurns: 20,
         maxChars: 16000,
       })
     : []
   ```

3. **Update thinking event** (around line 108, add to contextParts):

   ```typescript
   if (historyMessages.length > 0) contextParts.push(`${historyMessages.length} prior messages`)
   ```

4. **Replace single-message call** (line 148-150):
   ```typescript
   // BEFORE:
   messages: [{ role: 'user', content: input.message }]
   // AFTER:
   messages: buildInvocationMessages(historyMessages, input.message)
   ```

### Why No API Route Changes

The `threadId` is already passed from the route to `agent.stream({ message, threadId })`. The `SecretaryHistoryService` handles resolving it internally. No route modifications needed.

### Verification

```bash
pnpm build && pnpm typecheck
```

Then manual test: Secretary chat → multi-turn conversation → verify agent remembers prior messages.

---

## Task 5: Wire History Into Research Agent

**Modify:** `packages/ai/src/agents/research/agent.ts`

### Changes

1. **Add imports:**

   ```typescript
   import { ResearchHistoryService } from './history'
   import { buildInvocationMessages, type ThreadMessage } from '../../utils/conversation-history'
   ```

2. **Load history in `stream()` method** (after line 108, after `threadId` assignment):

   ```typescript
   const historyService = new ResearchHistoryService(this.config.supabase)
   const historyMessages = input.threadId
     ? await historyService.loadThreadMessages({ threadId: input.threadId })
     : []
   ```

3. **Pass history to `streamSimpleChat`** — add parameter:

   ```typescript
   // Signature change:
   private async *streamSimpleChat(message: string, historyMessages: ThreadMessage[])

   // Inside: change from prompt to messages
   // BEFORE: streamText({ prompt: message, ... })
   // AFTER:  streamText({ messages: buildInvocationMessages(historyMessages, message), ... })
   ```

   Update call site (line 114): `yield* this.streamSimpleChat(input.message, historyMessages)`

4. **Pass history to `streamResearchMode`** — add parameter:

   ```typescript
   // Signature change:
   private async *streamResearchMode(message: string, threadId: string, outputPreference?, historyMessages: ThreadMessage[] = [])

   // Inside at line 558-560:
   // BEFORE: messages: [{ role: 'user', content: message }]
   // AFTER:  messages: buildInvocationMessages(historyMessages, message)
   ```

   Update call site (line 146): pass `historyMessages` as last argument.

5. **Note/markdown modes** — pass history as well for context, same pattern.

### Verification

```bash
pnpm build && pnpm typecheck
```

---

## Task 6: Refactor EditorDeep to Use Shared Utility

**Modify:** `packages/ai/src/agents/editor-deep/history.ts`

Replace the inline windowing algorithm (lines 39-82) with a call to the shared `windowMessages()` function. Keep the same class interface and defaults (12 turns, 12K chars). The `buildInvocationMessages` in `agent.ts:280-303` can also be replaced with the shared version.

### Key: Preserve Existing Behavior

- Same defaults: `windowTurns: 12`, `maxChars: 12000`
- Same query: `editor_messages` filtered by `thread_id` + `user_id`
- Same return type: `EditorThreadMessage[]` (alias for `{ role, content }`)

### Verification

```bash
pnpm test:run packages/ai/
```

All existing editor-deep tests must pass unchanged.

---

## Task 7: Update Barrel Exports

**Modify:** `packages/ai/src/agents/secretary/index.ts` — add:

```typescript
export { SecretaryHistoryService } from './history'
```

**Modify:** `packages/ai/src/agents/index.ts` — add to secretary section:

```typescript
export { SecretaryHistoryService } from './secretary'
```

**Modify:** `packages/ai/src/utils/index.ts` — add:

```typescript
export {
  windowMessages,
  buildInvocationMessages,
  type ThreadMessage,
  type WindowOptions,
} from './conversation-history'
```

No need to export `ResearchHistoryService` — it's only used internally by the research agent.

---

## Task 8: Full Verification

### Automated

```bash
pnpm test:run                    # All tests pass
pnpm build                       # Clean build
pnpm typecheck                   # No type errors
pnpm lint                        # No lint issues
```

### Manual E2E — Secretary (the original bug)

1. `pnpm dev`
2. Open Secretary chat, start new thread
3. Send: "Create a plan for me to learn Further Math for A-level on Tues and Friday, 3 hours/day"
4. Wait for response (should ask clarifying questions)
5. Reply: "3 months"
6. **Verify:** Agent remembers "Further Math" and "Tues/Friday/3hrs" from message 1
7. Reply: "yes, save it"
8. **Verify:** Agent knows what roadmap to save without asking again

### Manual E2E — Research

1. Open Research agent
2. Send: "Research quantum computing advances"
3. Reply: "Focus more on error correction"
4. **Verify:** Agent remembers quantum computing context

### Manual E2E — EditorDeep (regression check)

1. Open a note, start editor chat
2. Have a 3-turn conversation
3. **Verify:** Still works as before (no regression)

---

## Configuration Summary

| Agent      | Window Turns | Max Chars | Table                     | Thread Resolution            |
| ---------- | ------------ | --------- | ------------------------- | ---------------------------- |
| Secretary  | 20           | 16,000    | `secretary_chat_messages` | Yes — public → internal UUID |
| Research   | 16           | 14,000    | `research_messages`       | No — direct UUID             |
| EditorDeep | 12           | 12,000    | `editor_messages`         | No — direct UUID             |

## Execution Order

Tasks 1→2→3 can be partially parallelized (Task 1 must complete before 2-3).
Tasks 4+5 depend on their respective history loaders.
Task 6 depends on Task 1.
Task 7 depends on Tasks 2+3.
Task 8 depends on everything.

```
Task 1 (shared utility)
  ├── Task 2 (secretary loader) ── Task 4 (wire secretary)
  ├── Task 3 (research loader) ─── Task 5 (wire research)
  └── Task 6 (refactor editor-deep)
Task 7 (exports) ← depends on 2, 3
Task 8 (verification) ← depends on all
```
