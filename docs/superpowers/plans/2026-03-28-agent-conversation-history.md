# Agent Conversation History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give all conversational AI agents (Secretary, Research) within-session memory by loading prior chat messages before each model call, using a shared windowing utility extracted from the existing EditorDeep pattern.

**Architecture:** Extract the character-budgeted windowing algorithm from `EditorConversationHistoryService` into a shared utility (`packages/ai/src/utils/conversation-history.ts`). Each agent gets a thin loader that queries its own table and feeds rows into the shared windower. The `ToolLoopAgent` already accepts `messages: ModelMessage[]` — we just need to populate it with history instead of a single message.

**Tech Stack:** TypeScript, AI SDK v6 (`ToolLoopAgent`), Supabase (existing message tables), Vitest

---

## File Map

| Action     | File                                                 | Responsibility                       |
| ---------- | ---------------------------------------------------- | ------------------------------------ |
| **Create** | `packages/ai/src/utils/conversation-history.ts`      | Shared windowing/budgeting algorithm |
| **Create** | `packages/ai/src/utils/conversation-history.test.ts` | Tests for shared utility             |
| **Modify** | `packages/ai/src/agents/editor-deep/history.ts`      | Refactor to use shared utility       |
| **Modify** | `packages/ai/src/agents/secretary/agent.ts`          | Load history before model call       |
| **Create** | `packages/ai/src/agents/secretary/history.ts`        | Secretary-specific history loader    |
| **Create** | `packages/ai/src/agents/secretary/history.test.ts`   | Tests for secretary history loader   |
| **Modify** | `packages/ai/src/agents/research/agent.ts`           | Load history before model call       |
| **Create** | `packages/ai/src/agents/research/history.ts`         | Research-specific history loader     |
| **Modify** | `packages/ai/src/utils/index.ts`                     | Re-export shared utility             |

---

## Context: How It Works Today

### EditorDeep (working pattern to replicate)

```
EditorDeepAgent.stream()
  → EditorConversationHistoryService.loadThreadMessages({ threadId, windowTurns: 12, maxChars: 12000 })
  → buildInvocationMessages(historyMessages, currentMessage)
  → agent.stream({ messages: invocationMessages })   // Full history array
```

### Secretary (broken — no history)

```
SecretaryAgent.stream()
  → memoryService.getFullContext()                    // Loads Plan.md, Today.md etc. (file memory, NOT chat)
  → agent.stream({ messages: [{ role: 'user', content: input.message }] })  // ONLY current message
```

### Research (broken — no history)

```
ResearchAgent.stream()
  → classifyResearchRequest()
  → streamText({ prompt: message })                  // ONLY current message, no history at all
```

### What Changes

After this plan, Secretary and Research will follow the same pattern as EditorDeep:

```
Agent.stream()
  → historyLoader.loadThreadMessages({ threadId, windowTurns, maxChars })
  → buildInvocationMessages(historyMessages, currentMessage)
  → agent.stream({ messages: invocationMessages })   // Full history array
```

---

## Task 1: Create Shared Conversation History Utility

**Files:**

- Create: `packages/ai/src/utils/conversation-history.ts`
- Create: `packages/ai/src/utils/conversation-history.test.ts`
- Modify: `packages/ai/src/utils/index.ts`

This task extracts the windowing algorithm from `EditorConversationHistoryService` into a reusable pure function. The function takes an array of messages (already fetched from any table) and returns a windowed subset that fits within the character budget.

- [ ] **Step 1: Write the failing tests**

Create `packages/ai/src/utils/conversation-history.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { windowMessages, buildInvocationMessages, type ThreadMessage } from './conversation-history'

describe('windowMessages', () => {
  const makeMessages = (count: number, charsPer = 100): ThreadMessage[] =>
    Array.from({ length: count }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `Message ${i}: ${'x'.repeat(charsPer - 15)}`,
      createdAt: new Date(2026, 0, 1, 0, i).toISOString(),
    }))

  it('returns empty array for empty input', () => {
    expect(windowMessages([], {})).toEqual([])
  })

  it('returns all messages when within budget', () => {
    const msgs = makeMessages(4, 50)
    const result = windowMessages(msgs, { maxChars: 10000, maxTurns: 20 })
    expect(result).toHaveLength(4)
    expect(result[0].content).toContain('Message 0')
    expect(result[3].content).toContain('Message 3')
  })

  it('trims oldest messages when exceeding maxTurns', () => {
    const msgs = makeMessages(10, 50)
    const result = windowMessages(msgs, { maxTurns: 3 })
    // 3 turns = 6 messages max, but keeps newest
    expect(result.length).toBeLessThanOrEqual(6)
    expect(result[result.length - 1].content).toContain('Message 9')
  })

  it('trims oldest messages when exceeding maxChars', () => {
    const msgs = makeMessages(10, 200)
    const result = windowMessages(msgs, { maxChars: 500 })
    // Should keep only messages fitting in 500 chars, prioritizing newest
    const totalChars = result.reduce((sum, m) => sum + m.content.length, 0)
    expect(totalChars).toBeLessThanOrEqual(500 + 200) // first message allowed to exceed
  })

  it('always includes at least the newest message even if over budget', () => {
    const msgs: ThreadMessage[] = [
      {
        role: 'user',
        content: 'x'.repeat(5000),
        createdAt: new Date().toISOString(),
      },
    ]
    const result = windowMessages(msgs, { maxChars: 100 })
    expect(result).toHaveLength(1)
  })

  it('filters out empty messages', () => {
    const msgs: ThreadMessage[] = [
      { role: 'user', content: 'hello', createdAt: '2026-01-01T00:00:00Z' },
      { role: 'assistant', content: '', createdAt: '2026-01-01T00:01:00Z' },
      { role: 'user', content: 'world', createdAt: '2026-01-01T00:02:00Z' },
    ]
    const result = windowMessages(msgs, {})
    expect(result).toHaveLength(2)
  })

  it('sorts by createdAt ascending', () => {
    const msgs: ThreadMessage[] = [
      { role: 'user', content: 'second', createdAt: '2026-01-01T00:02:00Z' },
      { role: 'assistant', content: 'first', createdAt: '2026-01-01T00:01:00Z' },
    ]
    const result = windowMessages(msgs, {})
    expect(result[0].content).toBe('first')
    expect(result[1].content).toBe('second')
  })
})

describe('buildInvocationMessages', () => {
  it('appends current message to history', () => {
    const history: ThreadMessage[] = [
      { role: 'user', content: 'hello', createdAt: '2026-01-01T00:00:00Z' },
      { role: 'assistant', content: 'hi there', createdAt: '2026-01-01T00:01:00Z' },
    ]
    const result = buildInvocationMessages(history, 'new question')
    expect(result).toHaveLength(3)
    expect(result[2]).toEqual({ role: 'user', content: 'new question' })
  })

  it('deduplicates if current message already in history', () => {
    const history: ThreadMessage[] = [
      { role: 'user', content: 'hello', createdAt: '2026-01-01T00:00:00Z' },
      { role: 'assistant', content: 'hi there', createdAt: '2026-01-01T00:01:00Z' },
      { role: 'user', content: 'new question', createdAt: '2026-01-01T00:02:00Z' },
    ]
    const result = buildInvocationMessages(history, 'new question')
    expect(result).toHaveLength(3) // not 4
  })

  it('handles empty history', () => {
    const result = buildInvocationMessages([], 'first message')
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ role: 'user', content: 'first message' })
  })

  it('trims whitespace when comparing for dedup', () => {
    const history: ThreadMessage[] = [
      { role: 'user', content: '  hello  ', createdAt: '2026-01-01T00:00:00Z' },
    ]
    const result = buildInvocationMessages(history, 'hello')
    expect(result).toHaveLength(1) // deduped
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:run packages/ai/src/utils/conversation-history.test.ts`
Expected: FAIL — module `./conversation-history` does not exist.

- [ ] **Step 3: Implement the shared utility**

Create `packages/ai/src/utils/conversation-history.ts`:

```typescript
/**
 * Shared conversation history windowing utility.
 *
 * Extracts the windowing algorithm from EditorConversationHistoryService
 * so all agents can reuse it. This is a pure function — it takes already-fetched
 * message rows and returns a character-budgeted, chronologically-ordered window.
 */

export interface ThreadMessage {
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

export interface WindowOptions {
  /** Max conversation turns (1 turn = 1 user + 1 assistant). Default: 20 */
  maxTurns?: number
  /** Max total characters across all messages. Default: 16000 */
  maxChars?: number
}

/**
 * Window a chronological list of messages to fit within turn and character budgets.
 * Prioritizes newest messages — trims from the oldest end.
 *
 * Algorithm (same as EditorConversationHistoryService):
 * 1. Filter out empty messages
 * 2. Sort chronologically
 * 3. Limit to maxTurns * 2 messages
 * 4. Walk from newest to oldest, accumulating chars until budget exceeded
 * 5. Return kept messages in chronological order
 */
export function windowMessages(
  messages: ThreadMessage[],
  options: WindowOptions = {}
): ThreadMessage[] {
  const maxTurns = Math.min(Math.max(options.maxTurns ?? 20, 1), 50)
  const maxChars = Math.max(options.maxChars ?? 16000, 1)
  const limit = maxTurns * 2

  // Filter invalid, sort chronologically, limit by turns
  const valid = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .filter((m) => (m.content || '').trim().length > 0)
    .map((m) => ({ ...m, content: m.content.trim() }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(-limit) // Keep newest `limit` messages

  if (valid.length === 0) return []

  // Walk newest-first, keep messages that fit in char budget
  const kept: ThreadMessage[] = []
  let usedChars = 0

  for (let i = valid.length - 1; i >= 0; i--) {
    const msg = valid[i]
    const msgChars = msg.content.length

    // Always include at least the newest message, even if over budget
    if (kept.length > 0 && usedChars + msgChars > maxChars) break

    // If single message exceeds budget, truncate from the start
    if (kept.length === 0 && msgChars > maxChars) {
      kept.push({
        role: msg.role,
        content: msg.content.slice(msgChars - maxChars),
        createdAt: msg.createdAt,
      })
      usedChars = maxChars
      break
    }

    kept.push(msg)
    usedChars += msgChars
  }

  // Return in chronological order
  return kept.reverse()
}

/**
 * Build the final messages array for the AI model.
 * Appends currentMessage to windowed history, deduplicating if already present.
 */
export function buildInvocationMessages(
  history: ThreadMessage[],
  currentMessage: string
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const cleaned = history
    .map((m) => ({ role: m.role, content: m.content.trim() }))
    .filter((m) => m.content.length > 0)

  const normalized = currentMessage.trim()
  const last = cleaned[cleaned.length - 1]
  const isDuplicate = last && last.role === 'user' && last.content === normalized

  if (isDuplicate) return cleaned
  return [...cleaned, { role: 'user' as const, content: normalized }]
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:run packages/ai/src/utils/conversation-history.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Export from utils index**

Add to `packages/ai/src/utils/index.ts`:

```typescript
export {
  windowMessages,
  buildInvocationMessages,
  type ThreadMessage,
  type WindowOptions,
} from './conversation-history'
```

- [ ] **Step 6: Commit**

```bash
git add packages/ai/src/utils/conversation-history.ts packages/ai/src/utils/conversation-history.test.ts packages/ai/src/utils/index.ts
git commit -m "feat: add shared conversation history windowing utility

Extract the character-budgeted windowing algorithm from EditorDeep
into a reusable utility for all agents."
```

---

## Task 2: Create Secretary History Loader

**Files:**

- Create: `packages/ai/src/agents/secretary/history.ts`
- Create: `packages/ai/src/agents/secretary/history.test.ts`

A thin loader that queries `secretary_chat_messages` and feeds rows through the shared windower. Uses the existing `ChatPersistenceService.resolveThread()` pattern for thread ID resolution.

- [ ] **Step 1: Write the failing tests**

Create `packages/ai/src/agents/secretary/history.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { SecretaryHistoryService } from './history'

// Mock supabase client
function mockSupabase(rows: Array<{ role: string; content: string; created_at: string }>) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: rows, error: null }),
  }
  return {
    from: vi.fn().mockReturnValue(chain),
    chain,
  }
}

describe('SecretaryHistoryService', () => {
  it('loads and windows messages from secretary_chat_messages', async () => {
    const rows = [
      { role: 'user', content: 'create a plan for math', created_at: '2026-01-01T00:00:00Z' },
      { role: 'assistant', content: 'Sure! Which exam board?', created_at: '2026-01-01T00:01:00Z' },
      { role: 'user', content: 'Cambridge', created_at: '2026-01-01T00:02:00Z' },
    ]
    const sb = mockSupabase(rows)
    const service = new SecretaryHistoryService(sb as any, 'user-123')

    const result = await service.loadThreadMessages({ threadId: 'thread-1' })

    expect(result).toHaveLength(3)
    expect(result[0].role).toBe('user')
    expect(result[0].content).toBe('create a plan for math')
    expect(result[2].content).toBe('Cambridge')
    expect(sb.from).toHaveBeenCalledWith('secretary_chat_messages')
  })

  it('returns empty array on error', async () => {
    const sb = mockSupabase([])
    sb.chain.limit.mockResolvedValue({ data: null, error: { message: 'db error' } })
    const service = new SecretaryHistoryService(sb as any, 'user-123')

    const result = await service.loadThreadMessages({ threadId: 'thread-1' })
    expect(result).toEqual([])
  })

  it('respects custom window settings', async () => {
    // 20 messages, each 200 chars
    const rows = Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Msg ${i}: ${'a'.repeat(180)}`,
      created_at: new Date(2026, 0, 1, 0, i).toISOString(),
    }))
    const sb = mockSupabase(rows)
    const service = new SecretaryHistoryService(sb as any, 'user-123')

    const result = await service.loadThreadMessages({
      threadId: 'thread-1',
      windowTurns: 3,
      maxChars: 1000,
    })

    // Should be capped by either turns or chars
    expect(result.length).toBeLessThanOrEqual(6)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:run packages/ai/src/agents/secretary/history.test.ts`
Expected: FAIL — module `./history` does not exist.

- [ ] **Step 3: Implement the secretary history loader**

Create `packages/ai/src/agents/secretary/history.ts`:

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import { windowMessages, type ThreadMessage } from '../../utils/conversation-history'

interface SecretaryMessageRow {
  role: string
  content: string
  created_at: string
}

export class SecretaryHistoryService {
  constructor(
    private supabase: SupabaseClient,
    private userId: string
  ) {}

  async loadThreadMessages(params: {
    threadId: string
    windowTurns?: number
    maxChars?: number
  }): Promise<ThreadMessage[]> {
    const windowTurns = params.windowTurns ?? 20
    const maxChars = params.maxChars ?? 16000
    const limit = Math.min(Math.max(windowTurns, 1), 50) * 2

    const { data, error } = await this.supabase
      .from('secretary_chat_messages')
      .select('role, content, created_at')
      .eq('thread_id', params.threadId)
      .eq('user_id', this.userId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error || !data) return []

    const messages: ThreadMessage[] = (data as SecretaryMessageRow[]).map((row) => ({
      role: row.role as 'user' | 'assistant',
      content: row.content || '',
      createdAt: row.created_at,
    }))

    return windowMessages(messages, { maxTurns: windowTurns, maxChars })
  }
}
```

**Important note on `thread_id`:** The `secretary_chat_messages` table stores `thread_id` as the **internal DB UUID** from `secretary_threads.id` (not the public `thread_id` text field). The API route resolves public thread IDs to internal IDs via `ChatPersistenceService.resolveThread()` before persisting messages. So by the time we query `secretary_chat_messages`, we need the internal DB ID. The agent receives the resolved `threadId` from the route — but we need to verify which ID format is actually stored. See Task 4 Step 2 for the integration point where we handle this.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:run packages/ai/src/agents/secretary/history.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/agents/secretary/history.ts packages/ai/src/agents/secretary/history.test.ts
git commit -m "feat: add secretary conversation history loader

Queries secretary_chat_messages and windows via shared utility.
Default: 20 turns, 16K chars."
```

---

## Task 3: Create Research History Loader

**Files:**

- Create: `packages/ai/src/agents/research/history.ts`

Same pattern as secretary, but queries `research_messages` table. Research messages don't have a `user_id` column — access is controlled via thread membership, so we filter by `thread_id` only.

- [ ] **Step 1: Implement the research history loader**

Create `packages/ai/src/agents/research/history.ts`:

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import { windowMessages, type ThreadMessage } from '../../utils/conversation-history'

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
    const windowTurns = params.windowTurns ?? 16
    const maxChars = params.maxChars ?? 14000
    const limit = Math.min(Math.max(windowTurns, 1), 50) * 2

    const { data, error } = await this.supabase
      .from('research_messages')
      .select('role, content, created_at')
      .eq('thread_id', params.threadId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error || !data) return []

    const messages: ThreadMessage[] = (data as ResearchMessageRow[]).map((row) => ({
      role: row.role as 'user' | 'assistant',
      content: row.content || '',
      createdAt: row.created_at,
    }))

    return windowMessages(messages, { maxTurns: windowTurns, maxChars })
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/ai/src/agents/research/history.ts
git commit -m "feat: add research conversation history loader

Queries research_messages and windows via shared utility.
Default: 16 turns, 14K chars."
```

---

## Task 4: Wire History Into Secretary Agent

**Files:**

- Modify: `packages/ai/src/agents/secretary/agent.ts:50-151`

This is the critical integration task. We modify `SecretaryAgent.stream()` to load conversation history and pass it to the `ToolLoopAgent` instead of a single message.

**Key challenge — thread ID resolution:** The `secretary_chat_messages` table uses the **internal DB ID** from `secretary_threads.id` as its `thread_id` foreign key. But the agent receives the **public** `thread_id` (a TEXT field). We need to resolve the public ID to the internal ID before querying messages. The `ChatPersistenceService.resolveThread()` already does this — but `SecretaryHistoryService` doesn't have access to it.

**Solution:** Pass the already-resolved internal thread ID from the API route. The route already resolves and persists with the internal ID — we just need to pass it to the agent. OR we query by `user_id` which is available in both `secretary_chat_messages` and the agent config. Looking at the table schema, `secretary_chat_messages` has both `thread_id` (FK to secretary_threads.id) and `user_id`. The simplest path: the API route resolves the thread and we pass the resolved internal ID to the agent as a new `resolvedThreadId` field.

- [ ] **Step 1: Modify SecretaryAgent to accept and use history**

Edit `packages/ai/src/agents/secretary/agent.ts`:

Add import at top (after line 16):

```typescript
import { SecretaryHistoryService } from './history'
import { buildInvocationMessages } from '../../utils/conversation-history'
```

Add `resolvedDbThreadId` to the stream input type (line 50-53):

```typescript
  async *stream(input: {
    message: string
    threadId?: string
    resolvedDbThreadId?: string  // Internal DB UUID for querying messages
  }): AsyncGenerator<SecretaryStreamEvent> {
```

After the context loading block (after line 58, before the tools creation), add history loading:

```typescript
// Load conversation history in parallel with context (already loaded above)
const historyService = new SecretaryHistoryService(this.config.supabase, this.config.userId)
const dbThreadId = input.resolvedDbThreadId || input.threadId
const historyMessages = dbThreadId
  ? await historyService.loadThreadMessages({
      threadId: dbThreadId,
      windowTurns: 20,
      maxChars: 16000,
    })
  : []
```

Replace the single-message model call (line 148-150):

**Before:**

```typescript
const result = await agent.stream({
  messages: [{ role: 'user', content: input.message }],
})
```

**After:**

```typescript
const invocationMessages = buildInvocationMessages(historyMessages, input.message)
const result = await agent.stream({
  messages: invocationMessages,
})
```

Update the thinking event to include history count (after the context parts yield, around line 111):

```typescript
if (historyMessages.length > 0) contextParts.push(`${historyMessages.length} prior messages`)
```

- [ ] **Step 2: Pass resolved DB thread ID from API route**

Edit `apps/api/src/routes/secretary.ts`.

The route already resolves threads via `ChatPersistenceService`. We need to track the internal DB ID and pass it to the agent. Look at lines 147-188 where thread resolution happens.

After the thread resolution block (around line 162), track the resolved DB ID:

```typescript
let resolvedDbThreadId: string | undefined
```

After `persistence.createThread()` (line 153), capture it:

```typescript
resolvedDbThreadId = thread.id // Internal DB UUID
```

When the threadId comes from `body.threadId`, resolve it to get the internal ID. After the existing thread block, add:

```typescript
if (body.threadId && !resolvedDbThreadId) {
  try {
    const messages = await persistence.getMessages(body.threadId)
    // If getMessages succeeded, the thread was found — we need the DB id
    // The resolveThread is private, so we use a different approach:
    // Query the thread table directly
    const { data: threadRow } = await auth.supabase
      .from('secretary_threads')
      .select('id')
      .or(`thread_id.eq.${body.threadId},id.eq.${body.threadId}`)
      .single()
    if (threadRow) resolvedDbThreadId = threadRow.id
  } catch {
    // Thread doesn't exist yet — no history to load
  }
}
```

Pass it to the agent stream call (line 206):

**Before:**

```typescript
      for await (const event of agent.stream({
        message: body.message,
        threadId,
      })) {
```

**After:**

```typescript
      for await (const event of agent.stream({
        message: body.message,
        threadId,
        resolvedDbThreadId,
      })) {
```

- [ ] **Step 3: Verify manually**

Run: `pnpm build && pnpm typecheck`
Expected: No errors.

Then test the full flow:

1. Start dev server: `pnpm dev`
2. Open the Secretary chat
3. Send a message: "I want to learn Python in 2 months"
4. When the agent responds, send: "yes, sounds good"
5. Verify the agent remembers the Python context from the previous message

- [ ] **Step 4: Commit**

```bash
git add packages/ai/src/agents/secretary/agent.ts apps/api/src/routes/secretary.ts
git commit -m "feat: wire conversation history into Secretary agent

Secretary now loads up to 20 turns (16K chars) of prior messages
before each model call. The agent resolves the DB thread ID and
passes full history to ToolLoopAgent instead of a single message."
```

---

## Task 5: Wire History Into Research Agent

**Files:**

- Modify: `packages/ai/src/agents/research/agent.ts:100-155`
- Modify: `apps/api/src/routes/research.ts` (the POST /chat handler)

Research agent has multiple modes (chat, note, markdown, research). History is most important for the `chat` and `research` modes. The `note` and `markdown` modes are typically single-shot — the user asks for a deliverable and gets it. But even these benefit from knowing what was discussed earlier.

- [ ] **Step 1: Add history loading to ResearchAgent**

Edit `packages/ai/src/agents/research/agent.ts`:

Add imports near top:

```typescript
import { ResearchHistoryService } from './history'
import { buildInvocationMessages } from '../../utils/conversation-history'
```

Add `supabase` to the stream input (the config already has it). Modify the `stream()` method to load history before mode routing.

After line 108 (`const threadId = ...`), before mode classification, add:

```typescript
// Load conversation history for context
const historyService = new ResearchHistoryService(this.config.supabase)
const historyMessages = input.threadId
  ? await historyService.loadThreadMessages({
      threadId: input.threadId,
      windowTurns: 16,
      maxChars: 14000,
    })
  : []
```

For `streamSimpleChat` mode (line 157), change from single `prompt` to `messages` array:

**Before (line 163-167):**

```typescript
        const result = streamText({
          model: modelOption.model,
          system: buildSystemPrompt(...),
          prompt: message,
          ...
        })
```

**After:**

```typescript
        const invocationMessages = buildInvocationMessages(historyMessages, message)
        const result = streamText({
          model: modelOption.model,
          system: buildSystemPrompt(...),
          messages: invocationMessages,
          ...
        })
```

Note: `streamText` accepts either `prompt` (single string) or `messages` (array). Using `messages` enables conversation history.

**Pass historyMessages to streamSimpleChat:** The method needs access to history, so add it as a parameter:

```typescript
  private async *streamSimpleChat(
    message: string,
    historyMessages: ThreadMessage[]
  ): AsyncGenerator<ResearchStreamEvent>
```

Update the call site (around line 114):

```typescript
yield * this.streamSimpleChat(input.message, historyMessages)
```

Similarly for `streamResearchMode` (the ToolLoopAgent mode), pass history and use `buildInvocationMessages` instead of single-message array. The ToolLoopAgent call inside `streamResearchMode` will need its `messages` parameter updated.

For `streamNoteDraft` and `streamMarkdownFile` — these are deliverable modes. Pass history as context but only for the system prompt (e.g., "Based on our discussion about X, create a note..."). This is optional and can be done as a follow-up.

- [ ] **Step 2: Verify build**

Run: `pnpm build && pnpm typecheck`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add packages/ai/src/agents/research/agent.ts
git commit -m "feat: wire conversation history into Research agent

Research chat and research modes now load up to 16 turns (14K chars)
of prior messages. Enables multi-turn research conversations."
```

---

## Task 6: Refactor EditorDeep to Use Shared Utility

**Files:**

- Modify: `packages/ai/src/agents/editor-deep/history.ts`

Refactor the existing `EditorConversationHistoryService` to use the shared `windowMessages` function instead of its own inline algorithm. This ensures all agents use the same windowing logic.

- [ ] **Step 1: Refactor history.ts to use shared utility**

Edit `packages/ai/src/agents/editor-deep/history.ts`:

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import { windowMessages, type ThreadMessage } from '../../utils/conversation-history'

interface EditorMessageRow {
  role: string
  content: string
  created_at: string
}

export type EditorThreadMessage = {
  role: 'user' | 'assistant'
  content: string
}

export class EditorConversationHistoryService {
  constructor(
    private supabase: SupabaseClient,
    private userId: string
  ) {}

  async loadThreadMessages(params: {
    threadId: string
    windowTurns?: number
    maxChars?: number
  }): Promise<EditorThreadMessage[]> {
    const windowTurns = params.windowTurns ?? 12
    const maxChars = params.maxChars ?? 12000
    const limit = Math.min(Math.max(windowTurns, 1), 50) * 2

    const { data, error } = await this.supabase
      .from('editor_messages')
      .select('role, content, created_at')
      .eq('thread_id', params.threadId)
      .eq('user_id', this.userId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error || !data) return []

    const messages: ThreadMessage[] = (data as EditorMessageRow[]).map((row) => ({
      role: row.role as 'user' | 'assistant',
      content: row.content || '',
      createdAt: row.created_at,
    }))

    return windowMessages(messages, { maxTurns: windowTurns, maxChars })
  }
}
```

- [ ] **Step 2: Run existing EditorDeep tests to verify no regression**

Run: `pnpm test:run packages/ai/`
Expected: All existing tests PASS.

- [ ] **Step 3: Verify build**

Run: `pnpm build && pnpm typecheck`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add packages/ai/src/agents/editor-deep/history.ts
git commit -m "refactor: EditorDeep history uses shared windowing utility

Replace inline windowing algorithm with shared windowMessages().
Behavior is identical — same defaults (12 turns, 12K chars)."
```

---

## Task 7: End-to-End Verification

**Files:** None (verification only)

- [ ] **Step 1: Run all tests**

Run: `pnpm test:run`
Expected: All tests PASS.

- [ ] **Step 2: Run typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: No errors.

- [ ] **Step 3: Build all packages**

Run: `pnpm build`
Expected: Clean build, no errors.

- [ ] **Step 4: Manual E2E test — Secretary**

1. `pnpm dev`
2. Open Secretary chat, start a new thread
3. Send: "Create a plan for me to learn Further Math for A-level on Tues and Friday, 3 hours/day"
4. Wait for response (should ask clarifying questions)
5. Reply: "3 months"
6. **Verify:** Agent remembers "Further Math" and "Tues/Friday/3hrs" from message 1
7. Reply: "yes, save it"
8. **Verify:** Agent knows what to save without asking again

- [ ] **Step 5: Manual E2E test — Research**

1. Open Research agent
2. Send: "Research the latest advances in quantum computing"
3. Wait for response
4. Reply: "Can you focus more on error correction?"
5. **Verify:** Agent remembers the quantum computing context

- [ ] **Step 6: Final commit (if any test fixes needed)**

```bash
git add -A
git commit -m "fix: address issues found during E2E verification"
```

---

## Configuration Summary

| Agent          | Window Turns | Max Chars | Rationale                                                                                  |
| -------------- | ------------ | --------- | ------------------------------------------------------------------------------------------ |
| **Secretary**  | 20           | 16,000    | Planning dialogues are verbose, multi-step; needs ~5-10 turns of context for plan creation |
| **EditorDeep** | 12           | 12,000    | Existing proven config; editor interactions are shorter                                    |
| **Research**   | 16           | 14,000    | Research is iterative but responses can be long; balance between context and token budget  |

## Risk Assessment

| Risk                              | Mitigation                                                                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Increased latency from DB query   | History loading adds ~50-100ms (single indexed query). Negligible vs. model inference time.                                                      |
| Larger prompt → higher token cost | Window defaults are conservative. 16K chars ≈ 4K tokens. Models handle 128K+ context.                                                            |
| Thread ID resolution mismatch     | Secretary uses internal DB IDs for messages; we resolve before querying. EditorDeep and Research use direct thread UUIDs — no resolution needed. |
| Stale messages in history         | Messages are persisted before streaming, so history is always up to date when the next message arrives.                                          |
