# Implementation Plan: Conversation History for Secretary and Research Agents

## Problem

Secretary and Research agents are stateless per-turn. They send only the current user message to the AI model, so multi-turn conversations fail. For example, the user says "create a math plan", the agent asks clarifying questions, the user replies "yes save it", and the agent has no idea what "it" refers to.

The EditorDeep agent already solves this correctly with `EditorConversationHistoryService`.

## Approach: Shared Utility + Thin Agent Wrappers

Extract the windowing algorithm from EditorDeep into a shared utility. Each agent gets a thin history loader that handles its specific DB schema and thread ID resolution. The agent's `stream()` method is updated to load history and pass it as multi-turn messages.

---

## Critical Architecture Findings

### Secretary Thread ID Resolution (the hardest part)

The `secretary_threads` table has a **dual-ID** design:

- `id` UUID — internal PK (auto-generated)
- `thread_id` TEXT — public thread ID (originally "LangGraph thread ID")
- `secretary_chat_messages.thread_id` is a UUID FK pointing to `secretary_threads.id` (the INTERNAL PK)

The API route (`apps/api/src/routes/secretary.ts` line 148) passes the **public** `thread_id` TEXT value to the agent. When a new thread is created via `ChatPersistenceService.createThread()`, the returned `thread.threadId` is the public TEXT value. The frontend stores and sends back this public value on subsequent turns.

Therefore, the `SecretaryHistoryService` must:

1. Receive the public `threadId` string
2. Look up `secretary_threads` to find the internal `id` UUID
3. Query `secretary_chat_messages` using the internal `id` as `thread_id`

The resolution pattern already exists in `ChatPersistenceService.resolveThread()` (line 32-59 of `chat-persistence.ts`), but it is a **private** method. We will replicate this resolution logic in our history service rather than making it public, to avoid coupling.

### Research Thread ID (simpler)

The `research_threads` table uses a **single-ID** design:

- `id` UUID — both the PK and the value used in the API
- `research_messages.thread_id` is a UUID FK directly to `research_threads.id`

The API route (`apps/api/src/routes/research.ts` line 124) generates `threadId = body.threadId || crypto.randomUUID()` and uses this directly as the `research_threads.id` (upserted at line 155). No resolution needed.

### Schema Differences Affecting Query Design

| Table                     | `user_id` column? | Thread ID type           | Notes                                                   |
| ------------------------- | ----------------- | ------------------------ | ------------------------------------------------------- |
| `editor_messages`         | YES               | UUID (direct FK)         | Filter by `user_id` + `thread_id`                       |
| `secretary_chat_messages` | YES               | UUID (FK to internal PK) | Filter by `user_id` + resolved internal `thread_id`     |
| `research_messages`       | NO                | UUID (direct FK)         | Filter by `thread_id` only (RLS handles user isolation) |

### Existing EditorDeep Pattern (reference implementation)

File: `packages/ai/src/agents/editor-deep/history.ts` (83 lines)

- `EditorConversationHistoryService` class
- Constructor: `(supabase, userId)`
- Method: `loadThreadMessages({ threadId, windowTurns?, maxChars? })`
- Queries `editor_messages` with `user_id` + `thread_id` filter
- Fetches newest-first via `order('created_at', { ascending: false }).limit(limit)`
- Applies character-budget windowing: keeps newest messages that fit budget
- Returns messages in chronological order (oldest first)
- Defaults: 12 turns, 12000 chars

File: `packages/ai/src/agents/editor-deep/agent.ts` (lines 94-154)

- Creates `EditorConversationHistoryService` instance
- Calls `loadThreadMessages()` in parallel with memory loading
- Calls `buildInvocationMessages(historyMessages, input.message)`
- `buildInvocationMessages` deduplicates the current message if it already appears in history
- Passes result to `agent.stream({ messages: invocationMessages })`

---

## Task-by-Task Implementation Plan

### Task 1: Create Shared Windowing Utility

**File:** `packages/ai/src/utils/conversation-history.ts` (NEW)

**Purpose:** Extract the pure windowing algorithm from `EditorConversationHistoryService` into a reusable function. This avoids duplicating the windowing logic in three places.

**Interface:**

```typescript
export interface ThreadMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface WindowingOptions {
  windowTurns?: number // max number of turns (1 turn = 1 user + 1 assistant)
  maxChars?: number // character budget
}

/**
 * Apply newest-first windowing to a list of messages.
 * Input: messages in chronological order (oldest first).
 * Output: messages in chronological order, trimmed to fit budget.
 */
export function applyConversationWindow(
  messages: ThreadMessage[],
  options?: WindowingOptions
): ThreadMessage[]

/**
 * Build the final invocation messages array.
 * Appends currentMessage as a user turn unless it already appears
 * as the last message in history.
 */
export function buildInvocationMessages(
  historyMessages: ThreadMessage[],
  currentMessage: string
): Array<{ role: 'user' | 'assistant'; content: string }>
```

**Algorithm (extracted from `editor-deep/history.ts` lines 56-81):**

1. Clamp `windowTurns` to `[1, 50]` range, default 12.
2. Clamp `maxChars` to minimum 1, default 12000.
3. Compute `limit = windowTurns * 2`.
4. Take at most `limit` messages from the end of the input array (they are already chronological).
5. Walk backwards (newest first), accumulating character count:
   - If adding a message would exceed `maxChars` and we already have at least one message, stop.
   - If the very first message exceeds `maxChars`, truncate it from the left (keep the last `maxChars` characters).
6. Reverse the accumulated list to restore chronological order.
7. Return the windowed messages.

**`buildInvocationMessages` logic (extracted from `editor-deep/agent.ts` lines 280-303):**

1. Clean history: trim content, filter empty messages.
2. Check if the last history message is a user message with content matching `currentMessage.trim()`.
3. If yes, return just the cleaned history (current message is already included).
4. If no, append `{ role: 'user', content: currentMessage.trim() }`.

**Why a shared utility:**

- The windowing algorithm is identical across all three agents.
- The `buildInvocationMessages` deduplication logic is identical.
- Only the DB query differs (table name, columns, thread ID resolution).

### Task 2: Create Shared Utility Tests

**File:** `packages/ai/src/utils/conversation-history.test.ts` (NEW)

**Test cases for `applyConversationWindow`:**

1. Returns empty array for empty input.
2. Returns all messages when under budget.
3. Trims oldest messages when character budget is exceeded (same test as `history.test.ts` line 44).
4. Truncates a single oversized message from the left.
5. Respects `windowTurns` limit (e.g., windowTurns=2 keeps last 4 messages).
6. Clamps windowTurns to [1, 50].
7. Handles messages with only whitespace content (filtered out).

**Test cases for `buildInvocationMessages`:**

1. Appends current message when history is empty.
2. Appends current message when last history message is from assistant.
3. Does NOT duplicate when last history message is identical user message.
4. Trims whitespace before comparison.
5. Filters out empty-content messages from history.

### Task 3: Create SecretaryHistoryService

**File:** `packages/ai/src/agents/secretary/history.ts` (NEW)

**Purpose:** Thin loader that queries `secretary_chat_messages` and delegates windowing to the shared utility.

**Critical implementation detail -- thread ID resolution:**

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import { applyConversationWindow, type ThreadMessage } from '../../utils/conversation-history'

interface SecretaryMessageRow {
  role: string
  content: string
  created_at: string
}

export class SecretaryHistoryService {
  private static readonly UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

  constructor(
    private supabase: SupabaseClient,
    private userId: string
  ) {}

  /**
   * Resolve a public thread_id (TEXT) to the internal DB id (UUID).
   * Tries public thread_id first, then falls back to treating the
   * input as an internal UUID (for backward compatibility).
   *
   * This mirrors ChatPersistenceService.resolveThread() but is
   * independent to avoid coupling to that service's private API.
   */
  private async resolveInternalThreadId(threadIdentifier: string): Promise<string | null> {
    // Try by public thread_id first
    const { data: byPublic, error: pubErr } = await this.supabase
      .from('secretary_threads')
      .select('id')
      .eq('thread_id', threadIdentifier)
      .single()

    if (!pubErr && byPublic?.id) return byPublic.id

    // Fall back to internal UUID (for edge cases / backward compat)
    if (!SecretaryHistoryService.UUID_PATTERN.test(threadIdentifier)) return null

    const { data: byInternal, error: intErr } = await this.supabase
      .from('secretary_threads')
      .select('id')
      .eq('id', threadIdentifier)
      .single()

    if (intErr || !byInternal?.id) return null
    return byInternal.id
  }

  async loadThreadMessages(params: {
    threadId: string
    windowTurns?: number
    maxChars?: number
  }): Promise<ThreadMessage[]> {
    const internalId = await this.resolveInternalThreadId(params.threadId)
    if (!internalId) return []

    const windowTurns = Math.min(Math.max(params.windowTurns ?? 20, 1), 50)
    const limit = windowTurns * 2

    const { data, error } = await this.supabase
      .from('secretary_chat_messages')
      .select('role, content, created_at')
      .eq('thread_id', internalId) // <-- INTERNAL UUID, not public thread_id
      .eq('user_id', this.userId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error || !data) return []

    const valid = (data as SecretaryMessageRow[])
      .filter((row) => row.role === 'user' || row.role === 'assistant')
      .map((row) => ({
        role: row.role as 'user' | 'assistant',
        content: (row.content || '').trim(),
        createdAt: row.created_at,
      }))
      .filter((row) => row.content.length > 0)

    if (valid.length === 0) return []

    const chronological = valid
      .slice()
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map(({ role, content }) => ({ role, content }))

    return applyConversationWindow(chronological, {
      windowTurns: params.windowTurns ?? 20,
      maxChars: params.maxChars ?? 16000,
    })
  }
}
```

**Key differences from EditorConversationHistoryService:**

1. Adds `resolveInternalThreadId()` step before querying messages.
2. Default window: 20 turns / 16K chars (vs Editor's 12/12K).
3. Queries `secretary_chat_messages` table instead of `editor_messages`.
4. Delegates windowing to `applyConversationWindow()` instead of inline code.

### Task 4: Create SecretaryHistoryService Tests

**File:** `packages/ai/src/agents/secretary/history.test.ts` (NEW)

**Test cases:**

1. **Thread resolution -- public thread_id:** Stub supabase so the first `.from('secretary_threads').select('id').eq('thread_id', ...)` call returns `{ id: 'internal-uuid' }`. Verify messages are queried using `'internal-uuid'` as the `thread_id` filter.
2. **Thread resolution -- fallback to internal UUID:** First query returns error/null, second query with `.eq('id', ...)` succeeds.
3. **Thread resolution -- not found:** Both queries fail, returns empty array.
4. **Message loading with windowing:** Verify correct messages are returned in chronological order with budget trimming.
5. **Empty thread:** No messages returns empty array.

**Stub pattern** (follow `editor-deep/history.test.ts` conventions):

```typescript
function createSupabaseStub(
  threadResolution: { id: string } | null,
  messageRows: unknown[]
): SupabaseClient {
  let fromCallCount = 0
  return {
    from: vi.fn((table: string) => {
      if (table === 'secretary_threads') {
        // Thread resolution query
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi
            .fn()
            .mockResolvedValue(
              threadResolution
                ? { data: threadResolution, error: null }
                : { data: null, error: { message: 'not found' } }
            ),
        }
      }
      // secretary_chat_messages query
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: messageRows, error: null }),
      }
    }),
  } as unknown as SupabaseClient
}
```

### Task 5: Wire History into SecretaryAgent.stream()

**File:** `packages/ai/src/agents/secretary/agent.ts` (MODIFY)

**Changes:**

1. **Add imports** at top of file (after existing imports around line 20):

```typescript
import { SecretaryHistoryService } from './history'
import { buildInvocationMessages, type ThreadMessage } from '../../utils/conversation-history'
```

2. **Load history in parallel with existing context** -- modify line 57 of `stream()`:

```typescript
// BEFORE (line 57):
const context = await this.memoryService.getFullContext()

// AFTER:
const historyService = new SecretaryHistoryService(this.config.supabase, this.config.userId)

const [context, historyMessages] = await Promise.all([
  this.memoryService.getFullContext(),
  input.threadId
    ? historyService.loadThreadMessages({
        threadId: input.threadId,
        windowTurns: 20,
        maxChars: 16000,
      })
    : Promise.resolve([] as ThreadMessage[]),
])
```

3. **Add logging and thinking event** -- after the existing context-ready thinking event (around line 111):

```typescript
console.info('secretary_agent.context', {
  threadId,
  historyTurnsLoaded: historyMessages.length,
})
```

4. **Replace single-message invocation** -- change the `agent.stream()` call at line 148-149:

```typescript
// BEFORE (line 148-149):
const result = await agent.stream({
  messages: [{ role: 'user', content: input.message }],
})

// AFTER:
const invocationMessages = buildInvocationMessages(historyMessages, input.message)
const result = await agent.stream({
  messages: invocationMessages,
})
```

This change is inside the model retry loop, so both primary and fallback models receive the same history.

**What NOT to change:**

- The stream input type `{ message: string; threadId?: string }` stays the same.
- The event format stays the same.
- The persistence logic in the API route stays the same (messages are already persisted there).
- The `chat()` method inherits changes automatically since it delegates to `stream()`.

### Task 6: Create ResearchHistoryService

**File:** `packages/ai/src/agents/research/history.ts` (NEW)

**Purpose:** Thin loader for `research_messages`. Simpler than Secretary because:

- No thread ID resolution needed (direct UUID)
- No `user_id` column on `research_messages` (RLS handles isolation)

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import { applyConversationWindow, type ThreadMessage } from '../../utils/conversation-history'

interface ResearchMessageRow {
  role: string
  content: string
  created_at: string
}

export class ResearchHistoryService {
  constructor(private supabase: SupabaseClient) {}

  async loadThreadMessages(params: {
    threadId: string
    windowTurns?: number
    maxChars?: number
  }): Promise<ThreadMessage[]> {
    const windowTurns = Math.min(Math.max(params.windowTurns ?? 16, 1), 50)
    const limit = windowTurns * 2

    const { data, error } = await this.supabase
      .from('research_messages')
      .select('role, content, created_at')
      .eq('thread_id', params.threadId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error || !data) return []

    const valid = (data as ResearchMessageRow[])
      .filter((row) => row.role === 'user' || row.role === 'assistant')
      .map((row) => ({
        role: row.role as 'user' | 'assistant',
        content: (row.content || '').trim(),
        createdAt: row.created_at,
      }))
      .filter((row) => row.content.length > 0)

    if (valid.length === 0) return []

    const chronological = valid
      .slice()
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map(({ role, content }) => ({ role, content }))

    return applyConversationWindow(chronological, {
      windowTurns: params.windowTurns ?? 16,
      maxChars: params.maxChars ?? 14000,
    })
  }
}
```

**Key differences from Secretary:**

- No `resolveInternalThreadId()` -- direct UUID.
- No `user_id` filter -- `research_messages` has no `user_id` column; RLS policy uses a subquery on `research_threads.user_id`.
- Default window: 16 turns / 14K chars.
- Constructor takes only `supabase` (no `userId`).

### Task 7: Wire History into ResearchAgent.stream()

**File:** `packages/ai/src/agents/research/agent.ts` (MODIFY)

The Research agent has multiple streaming modes. History should be loaded once in the top-level `stream()` method and passed to each handler.

**Changes:**

1. **Add imports** (after existing imports around line 9):

```typescript
import { ResearchHistoryService } from './history'
import { buildInvocationMessages, type ThreadMessage } from '../../utils/conversation-history'
```

2. **Load history once in `stream()`** -- insert after line 108 (`const mode = classifyResearchRequest(...)`):

```typescript
// Load conversation history for multi-turn continuity
const historyService = new ResearchHistoryService(this.config.supabase)
const historyMessages = input.threadId
  ? await historyService.loadThreadMessages({
      threadId: input.threadId,
      windowTurns: 16,
      maxChars: 14000,
    })
  : []
```

3. **Pass historyMessages to mode handlers** -- update the calls inside `stream()`:

```typescript
// line ~114 (chat mode):
yield * this.streamSimpleChat(input.message, historyMessages)

// line ~146 (deep research mode):
yield * this.streamResearchMode(input.message, threadId, input.outputPreference, historyMessages)
```

Note: `streamNoteDraft` and `streamMarkdownFile` are less critical for history (they are typically single-shot generation), but could be updated in a follow-up.

4. **Update `streamSimpleChat` signature and body** (line 157):

```typescript
// BEFORE:
private async *streamSimpleChat(message: string): AsyncGenerator<ResearchStreamEvent> {

// AFTER:
private async *streamSimpleChat(
  message: string,
  historyMessages: ThreadMessage[] = []
): AsyncGenerator<ResearchStreamEvent> {
```

Inside the method, replace the `streamText` call (line 163-170):

```typescript
// BEFORE:
const result = streamText({
  model: modelOption.model,
  system: buildSystemPrompt(
    'You are a concise and helpful assistant for note-taking and learning.'
  ),
  prompt: message,
  temperature: 0.5,
  maxOutputTokens: 4000,
  providerOptions: getGoogleProviderOptions(),
  onFinish: trackAISDKUsage({ model: modelOption.entry.id, taskType: 'research' }),
})

// AFTER:
const invocationMessages = buildInvocationMessages(historyMessages, message)
const result = streamText({
  model: modelOption.model,
  system: buildSystemPrompt(
    'You are a concise and helpful assistant for note-taking and learning.'
  ),
  messages: invocationMessages,
  temperature: 0.5,
  maxOutputTokens: 4000,
  providerOptions: getGoogleProviderOptions(),
  onFinish: trackAISDKUsage({ model: modelOption.entry.id, taskType: 'research' }),
})
```

Note: `prompt` and `messages` are mutually exclusive in AI SDK's `streamText`. Switching from `prompt` to `messages` is the correct approach for multi-turn.

5. **Update `streamResearchMode` signature and body** (line 503):

```typescript
// BEFORE:
private async *streamResearchMode(
  message: string,
  threadId: string,
  outputPreference?: ResearchOutputPreference
): AsyncGenerator<ResearchStreamEvent> {

// AFTER:
private async *streamResearchMode(
  message: string,
  threadId: string,
  outputPreference?: ResearchOutputPreference,
  historyMessages: ThreadMessage[] = []
): AsyncGenerator<ResearchStreamEvent> {
```

Inside the method, replace the agent invocation (line 558-559):

```typescript
// BEFORE:
result = await agent.stream({
  messages: [{ role: 'user', content: message }],
})

// AFTER:
const invocationMessages = buildInvocationMessages(historyMessages, message)
result = await agent.stream({
  messages: invocationMessages,
})
```

### Task 8: Refactor EditorDeep to Use Shared Utility

**File:** `packages/ai/src/agents/editor-deep/history.ts` (MODIFY)

**Purpose:** Replace the inline windowing algorithm with a call to `applyConversationWindow`, reducing duplication. The public API remains identical.

**Changes:**

1. Add import at top:

```typescript
import { applyConversationWindow } from '../../utils/conversation-history'
```

2. Replace lines 56-81 (the windowing algorithm) with:

```typescript
return applyConversationWindow(chronological, {
  windowTurns: params.windowTurns ?? 12,
  maxChars: params.maxChars ?? 12000,
})
```

3. Keep the DB query and parsing logic (lines 29-54) as-is since it is table-specific.

4. Keep the `EditorThreadMessage` interface export for backward compatibility.

**File:** `packages/ai/src/agents/editor-deep/agent.ts` (MODIFY)

1. Add import:

```typescript
import { buildInvocationMessages as buildMessages } from '../../utils/conversation-history'
```

2. Remove the private `buildInvocationMessages` method (lines 280-303).

3. Update the call at line 154:

```typescript
const invocationMessages = buildMessages(historyMessages, input.message)
```

Note: The `EditorThreadMessage` type is structurally identical to `ThreadMessage`, so `buildMessages` accepts it without issue (TypeScript structural typing).

**Verification:** Run existing `history.test.ts` to confirm no regression:

```bash
npx vitest run packages/ai/src/agents/editor-deep/history.test.ts
```

### Task 9: Update Barrel Exports

**File:** `packages/ai/src/agents/secretary/index.ts` (MODIFY)

Add line:

```typescript
export { SecretaryHistoryService } from './history'
```

**File:** `packages/ai/src/agents/research/index.ts` (MODIFY)

Add line:

```typescript
export { ResearchHistoryService } from './history'
```

**File:** `packages/ai/src/utils/index.ts` (MODIFY)

Add at bottom:

```typescript
// Conversation History Windowing
export {
  applyConversationWindow,
  buildInvocationMessages,
  type ThreadMessage,
  type WindowingOptions,
} from './conversation-history'
```

**File:** `packages/ai/src/agents/index.ts` (MODIFY)

Update Secretary exports block (around line 99-106) to add `SecretaryHistoryService`:

```typescript
export {
  SecretaryAgent,
  createSecretaryAgent,
  MemoryService,
  ChatPersistenceService,
  SecretaryHistoryService,
  type SecretaryAgentConfig,
  type MemoryContext,
} from './secretary'
```

Update Research exports block (around line 112-117) to add `ResearchHistoryService`:

```typescript
export {
  ResearchAgent,
  createResearchAgent,
  ResearchHistoryService,
  type ResearchAgentConfig,
  type ResearchThreadState,
} from './research'
```

---

## Implementation Sequence

```
Task 1 ──> Task 2 (shared utility + tests, no dependencies)
     │
     ├──> Task 3 ──> Task 4 (secretary history + tests)
     │
     ├──> Task 6 (research history)
     │
     └──> Task 8 (refactor EditorDeep)
              │
Task 3 + Task 1 ──> Task 5 (wire secretary agent)
Task 6 + Task 1 ──> Task 7 (wire research agent)
              │
All above ────> Task 9 (barrel exports)
```

Parallelizable groups:

- **Group A (no deps):** Tasks 1, 2
- **Group B (depends on A):** Tasks 3, 4, 6, 8
- **Group C (depends on B):** Tasks 5, 7
- **Group D (depends on all):** Task 9

---

## Verification Plan

### Unit Tests

```bash
# Run all new and existing tests
npx vitest run packages/ai/src/utils/conversation-history.test.ts
npx vitest run packages/ai/src/agents/secretary/history.test.ts
npx vitest run packages/ai/src/agents/editor-deep/history.test.ts  # regression
```

### Type Check

```bash
cd packages/ai && npx tsc --noEmit
```

### Manual Smoke Test (Secretary)

1. Open Secretary chat.
2. Send: "Create a study plan for linear algebra"
3. Agent should ask clarifying questions.
4. Reply: "Yes, save that" -- agent should understand "that" refers to the plan.
5. Check server logs for `secretary_agent.context` with `historyTurnsLoaded > 0`.

### Manual Smoke Test (Research)

1. Open Research chat.
2. Send: "Research the benefits of spaced repetition"
3. Agent responds with research.
4. Reply: "Now make a note about that" -- agent should know "that" = spaced repetition.
5. Check that the research thread shows continuity.

### Edge Cases to Verify

1. **New conversation (no threadId):** History loading should gracefully return empty array, not error.
2. **Thread with 0 messages:** Returns empty, agent works with just the current message.
3. **Very long thread:** Window should trim to budget (20 turns / 16K for secretary).
4. **Secretary thread ID edge case:** If a threadId is passed that is neither a valid public thread_id nor a valid internal UUID, `resolveInternalThreadId` returns null and history is empty (graceful degradation).

---

## Risk Assessment

| Risk                                                   | Likelihood | Impact | Mitigation                                                                                                                          |
| ------------------------------------------------------ | ---------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Secretary thread resolution fails silently             | Low        | Medium | Returns empty history = graceful degradation, same as pre-change behavior                                                           |
| Research messages include stale context                | Low        | Low    | Window limits prevent excessive context; newest messages prioritized                                                                |
| Breaking EditorDeep regression                         | Low        | High   | Existing `history.test.ts` tests cover the windowing algorithm; refactor is mechanical                                              |
| `streamText` API incompatibility with `messages` param | Low        | Medium | AI SDK v6 `streamText` supports both `prompt` and `messages` params; verified in codebase                                           |
| Increased latency from extra DB query                  | Low        | Low    | Secretary adds 1 extra query (thread resolution + messages); Research adds 1 query. Both parallelized with existing context loading |

---

## Files Summary

### New Files (6)

1. `packages/ai/src/utils/conversation-history.ts` -- shared windowing + message building
2. `packages/ai/src/utils/conversation-history.test.ts` -- unit tests for shared utility
3. `packages/ai/src/agents/secretary/history.ts` -- secretary history loader with thread resolution
4. `packages/ai/src/agents/secretary/history.test.ts` -- unit tests for secretary history
5. `packages/ai/src/agents/research/history.ts` -- research history loader
6. `packages/ai/src/agents/research/history.test.ts` -- unit tests for research history (optional)

### Modified Files (7)

7. `packages/ai/src/agents/secretary/agent.ts` -- wire history into stream()
8. `packages/ai/src/agents/research/agent.ts` -- wire history into stream()/streamSimpleChat()/streamResearchMode()
9. `packages/ai/src/agents/editor-deep/history.ts` -- refactor to use shared utility
10. `packages/ai/src/agents/editor-deep/agent.ts` -- replace private buildInvocationMessages with shared import
11. `packages/ai/src/utils/index.ts` -- export shared utility
12. `packages/ai/src/agents/secretary/index.ts` -- export SecretaryHistoryService
13. `packages/ai/src/agents/research/index.ts` -- export ResearchHistoryService
14. `packages/ai/src/agents/index.ts` -- re-export new services

### NOT Modified

- No database migrations (tables already exist with correct schemas)
- No API route changes (message persistence already happens in routes)
- No frontend changes (same SSE event format)
- No package.json changes (no new dependencies)
