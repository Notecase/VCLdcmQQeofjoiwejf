# Autonomous Inbox Agent — Phase 2a/2b/2c

## Context

Phase 2 smart classifier shipped and works: Telegram messages are classified into 6 action types with rich payloads. But the flow still requires manual approval in the web UI before anything executes. The user wants to eliminate the approval step — the AI should **classify and execute immediately**, then show results in an activity feed. Additionally, the Telegram bot should stream progress for long operations (NoteAgent) and support multi-turn clarifying questions.

**Inspired by OpenClaw**: Autonomous execution model (act first, inform after), two-tier cost optimization (cheap classify → expensive execute), per-user session isolation, inline clarification within same message thread.

---

## New Message Flow

```
Telegram message arrives
  │
  ├─► Insert raw row (status: 'executing') — data never lost
  │
  ├─► Check for pending clarification session
  │   ├─ YES (within 2min): re-classify with combined context → execute
  │   └─ NO: fresh classification
  │
  ├─► Smart classify (~1-2s, ~$0.003)
  │   ├─ Returns actionType + payload + confidence
  │   ├─ If needs_clarification → ask question, save session, wait
  │   └─ If clear action → execute immediately
  │
  ├─► Execute action:
  │   ├─ create_note → NoteAgent (stream progress to Telegram)
  │   ├─ add_task/calendar/vocab/reading/thought → memory file append
  │   └─ On failure → fallback to add_thought in Inbox.md
  │
  ├─► Update proposal row (status: 'applied'/'failed', execution_result)
  │
  └─► Bot reply: "✅ Created note 'Newton's First Law'" (done, not proposed)
```

---

## Phase 2a: Auto-Execute + Activity Feed

### Step 1: Types & Migration

**File: `packages/shared/src/types/secretary.ts`**

Add new statuses and execution tracking:

```typescript
// Expand ProposalStatus
export type ProposalStatus = 'pending' | 'executing' | 'awaiting_clarification' | 'approved' | 'rejected' | 'applied' | 'failed'

// Add needs_clarification to action types
export type ProposalActionType =
  | 'create_note' | 'add_task' | 'add_calendar_event'
  | 'add_vocabulary' | 'add_reading' | 'add_thought'
  | 'needs_clarification'

// Add to SmartClassificationResult
clarificationQuestion?: string

// Add to InboxProposal
executionResult: ExecutionResultData | null

// New interface
export interface ExecutionResultData {
  noteId?: string
  updatedFile?: string
  error?: string
  durationMs?: number
}
```

**File: `supabase/migrations/035_inbox_autonomous_execution.sql`**

```sql
ALTER TABLE inbox_proposals ADD COLUMN execution_result JSONB DEFAULT NULL;
CREATE INDEX idx_proposals_activity_feed
  ON inbox_proposals(user_id, created_at DESC) WHERE status IN ('applied', 'failed');
```

Note: No status constraint change needed — the `status` column is TEXT without a CHECK constraint.

### Step 2: Create Action Executor Module

**New file: `apps/api/src/channels/executor.ts`**

Extract execution logic from `proposals.ts POST /apply` into a reusable module:

```typescript
export interface ExecutionResult {
  success: boolean
  status: 'applied' | 'failed'
  resultMessage: string // "Created note 'Newton's First Law'"
  noteId?: string
  updatedFile?: string
  error?: string
  durationMs?: number
}

export async function executeAction(
  userId: string,
  classification: SmartClassificationResult
): Promise<ExecutionResult>
```

**Logic per action type:**

- `create_note`: `createNoteAgent({ supabase: getServiceClient(), userId }).run({ action: 'create', input })` — returns noteId, title
- `add_task`/`add_calendar_event`/`add_vocabulary`/`add_reading`/`add_thought`: Read `secretary_memory` for target file → append `proposedContent` → upsert back. **Reuse exact pattern from `proposals.ts` lines 247-265.**
- On any failure: return `{ success: false, status: 'failed', error }`. Never throw.

**Also export a streaming variant for Phase 2b:**

```typescript
export async function executeNoteCreationStreaming(
  userId: string,
  classification: SmartClassificationResult,
  onProgress: (message: string) => void
): Promise<ExecutionResult>
```

### Step 3: Upgrade Channel Handler

**File: `apps/api/src/channels/handler.ts`**

Rename `captureToProposals()` → `captureAndExecute()`. New flow:

1. Insert raw row with `status: 'executing'`
2. Classify with 8s timeout (same as now)
3. If classification succeeds → call `executeAction()` → update row with `status: 'applied'` + `execution_result`
4. If classification fails → fallback: append raw text to Inbox.md as `add_thought`, mark `applied`
5. Return result message (not "I'll propose..." but "Done — created...")

**Bot reply changes:**

- Success: `"✅ Added 'Buy groceries' to Today.md"`
- Note created: `"✅ Created note 'Newton's First Law'"`
- Fallback: `"📝 Captured to your Inbox."`
- Error: `"❌ Failed to process. Saved to Inbox."`

### Step 4: Update Frontend — Activity Feed

**File: `apps/web/src/components/secretary/InboxProposals.vue`**

Convert from approval UI to activity feed:

1. **Remove**: Approve/Reject action buttons, "Approve All" button, "Apply" button
2. **Remove**: `approveAll()`, `applyApproved()`, approval-related computed props
3. **Keep**: "Categorize" button (for any legacy unclassified items)
4. **Keep**: Category filters, rich preview cards, source icons
5. **Change default filter**: `statusFilter` default from `'pending'` to `'all'`
6. **Add status badges**: `applied` (green ✅), `failed` (red ❌), `executing` (spinner)
7. **Add execution result display**: Show noteId link, updated file, or error message below each card
8. **Add**: `Undo` button stub (future — just UI placeholder for now)

### Step 5: Clean Up Proposals Routes

**File: `apps/api/src/routes/proposals.ts`**

- Keep: `GET /` (serves the activity feed), `PATCH /:id`, `POST /categorize`
- Deprecate: `POST /approve-all`, `POST /apply` — can keep them as no-ops or remove entirely
- Update `mapProposal()` to include `executionResult`

---

## Phase 2b: Streaming Bot Replies

### Step 6: Channel Reply Handle Pattern

**File: `apps/api/src/channels/types.ts`**

Add a callback interface so the handler can send/edit messages without knowing the channel:

```typescript
export interface ChannelReplyHandle {
  send(text: string, parseMode?: 'Markdown' | 'HTML'): Promise<void>
  edit(text: string, parseMode?: 'Markdown' | 'HTML'): Promise<void>
}
```

### Step 7: Upgrade Telegram Adapter

**File: `apps/api/src/channels/telegram.ts`**

Instead of: `const response = await handleIncomingMessage(message); ctx.reply(response.text)`

Do:

```typescript
let sentMessageId: number | null = null
const replyHandle: ChannelReplyHandle = {
  async send(text, parseMode) {
    const sent = await ctx.reply(text, { parse_mode: parseMode || undefined })
    sentMessageId = sent.message_id
  },
  async edit(text, parseMode) {
    if (sentMessageId) {
      await ctx.api.editMessageText(ctx.chat.id, sentMessageId, text, {
        parse_mode: parseMode || undefined,
      })
    }
  },
}
await handleIncomingMessage(message, replyHandle)
```

### Step 8: Streaming Execution in Handler

**File: `apps/api/src/channels/handler.ts`**

Change signature: `handleIncomingMessage(message, reply: ChannelReplyHandle): Promise<void>`

For `create_note` (takes 10-15s):

1. `reply.send("Creating note about Newton's First Law...")`
2. Call `executeNoteCreationStreaming()` with progress callback
3. Throttle edits to every ~800ms (track `lastEditTime`)
4. On finish: `reply.edit("✅ Created note 'Newton's First Law' — 3 sections")`

For simple appends (< 100ms):

1. Execute instantly
2. `reply.send("✅ Added 'Buy groceries' to Today.md")`

### Step 9: Streaming Executor

**File: `apps/api/src/channels/executor.ts`**

Add `executeNoteCreationStreaming()`:

- Creates NoteAgent, calls `agent.stream({ action: 'create', input })`
- On `title` chunk: `onProgress("Writing 'Newton's First Law'...")`
- On `text-delta` (accumulated): `onProgress("Writing... (section 2/3)")`
- On `finish`: return `ExecutionResult` with noteId, title, word count

---

## Phase 2c: Clarifying Questions + Session State

### Step 10: Classifier Enhancement

**File: `packages/ai/src/agents/inbox-classifier.ts`**

Add `needs_clarification` to actionType enum in Zod schema. Add `clarificationQuestion` field (optional string). Update system prompt with rules:

- Ask clarification when ambiguous (multiple valid interpretations)
- Ask when critical info is missing ("buy groceries" — today or tomorrow?)
- Low confidence (< 0.5) should trigger clarification instead of guessing
- Keep questions short, conversational, offer 2-3 options

### Step 11: Session State in Channel Link Config

**Storage**: Use existing `user_channel_links.config` JSONB column. No new table.

```typescript
interface ChannelSessionState {
  pendingClarification?: {
    proposalId: string
    question: string
    originalText: string
    partialClassification: Partial<SmartClassificationResult>
    expiresAt: string // ISO, 2 minutes from creation
  }
}
```

### Step 12: Handler Clarification Flow

**File: `apps/api/src/channels/handler.ts`**

At the top of `handleIncomingMessage()`, after link lookup:

1. Read `link.config.pendingClarification`
2. If exists AND not expired:
   - This message is a clarification reply
   - Re-classify with enriched input: `"Original: '${original}'\nUser clarified: '${reply}'"`
   - Execute the resulting action
   - Clear `pendingClarification` from config
   - Reply with result
3. If expired: clear it, treat message as fresh
4. If no pending clarification: normal flow
5. If classifier returns `needs_clarification`:
   - Insert proposal with `status: 'awaiting_clarification'`
   - Save `pendingClarification` to `user_channel_links.config`
   - `reply.send("Buy groceries — for today's tasks or tomorrow's?")`

### Step 13: Frontend Clarification Card

**File: `apps/web/src/components/secretary/InboxProposals.vue`**

Add card variant for `awaiting_clarification` status:

- Shows original message + the question asked
- Badge: "Awaiting reply" (yellow) or "Timed out" (gray)

---

## Critical Files Summary

| File                                                     | Action                                                         | Phase      |
| -------------------------------------------------------- | -------------------------------------------------------------- | ---------- |
| `packages/shared/src/types/secretary.ts`                 | MODIFY: new statuses, ExecutionResultData, needs_clarification | 2a, 2c     |
| `supabase/migrations/035_inbox_autonomous_execution.sql` | CREATE: execution_result column, activity feed index           | 2a         |
| `apps/api/src/channels/executor.ts`                      | CREATE: executeAction + executeNoteCreationStreaming           | 2a, 2b     |
| `apps/api/src/channels/handler.ts`                       | MODIFY: captureAndExecute, streaming, clarification            | 2a, 2b, 2c |
| `apps/api/src/channels/types.ts`                         | MODIFY: add ChannelReplyHandle                                 | 2b         |
| `apps/api/src/channels/telegram.ts`                      | MODIFY: reply handle pattern                                   | 2b         |
| `packages/ai/src/agents/inbox-classifier.ts`             | MODIFY: needs_clarification, clarificationQuestion             | 2c         |
| `apps/web/src/components/secretary/InboxProposals.vue`   | MODIFY: activity feed, remove approval, add execution status   | 2a, 2c     |
| `apps/api/src/routes/proposals.ts`                       | MODIFY: deprecate approve/apply, add executionResult to mapper | 2a         |

## Parallel Agent Assignment

**Agent 1 — Types + Migration + Classifier** (no dependencies, runs first):

- `packages/shared/src/types/secretary.ts`
- `supabase/migrations/035_inbox_autonomous_execution.sql`
- `packages/ai/src/agents/inbox-classifier.ts`

**Agent 2 — Backend Core** (depends on Agent 1 types):

- `apps/api/src/channels/executor.ts` (CREATE)
- `apps/api/src/channels/handler.ts` (MODIFY)
- `apps/api/src/channels/types.ts` (MODIFY)
- `apps/api/src/channels/telegram.ts` (MODIFY)

**Agent 3 — Frontend + Routes** (depends on Agent 1 types):

- `apps/web/src/components/secretary/InboxProposals.vue`
- `apps/api/src/routes/proposals.ts`

**Execution order**: Agent 1 first, then Agent 2 + Agent 3 in parallel.

---

## Patterns to Reuse

| Pattern                            | Source                   | Reuse In                                |
| ---------------------------------- | ------------------------ | --------------------------------------- |
| Memory file append                 | `proposals.ts:247-265`   | `executor.ts`                           |
| NoteAgent create                   | `proposals.ts:215-235`   | `executor.ts`                           |
| NoteAgent streaming                | `note.agent.ts:stream()` | `executor.ts` streaming variant         |
| `getServiceClient()`               | `lib/supabase.ts`        | `executor.ts` (already used in handler) |
| `classifyInboxMessage()`           | `inbox-classifier.ts`    | handler (unchanged)                     |
| Grammy `ctx.api.editMessageText()` | Grammy API               | `telegram.ts` reply handle              |

---

## Cost Analysis

| Action                                  | Classification | Execution             | Total   |
| --------------------------------------- | -------------- | --------------------- | ------- |
| create_note                             | ~$0.003        | ~$0.02 (NoteAgent)    | ~$0.023 |
| add_task/calendar/vocab/reading/thought | ~$0.003        | $0 (DB upsert)        | ~$0.003 |
| needs_clarification                     | ~$0.003        | ~$0.003 (re-classify) | ~$0.006 |

Daily cap: 100 messages/day = max ~$0.60/day worst case.

---

## Risks & Mitigations

1. **Telegram webhook timeout (60s)**: NoteAgent takes 10-15s — well within limit.
2. **Double execution on Telegram retry**: Add idempotency check — match `raw_text + externalUserId + timestamp` within 1-minute window before inserting.
3. **NoteAgent failure mid-stream**: Raw row already saved. Mark `failed`, edit message to show error, fallback to saving as thought in Inbox.md.
4. **Wrong classification executed**: Activity feed shows everything. Future: add "Undo" button per card.
5. **Telegram edit rate limits (~30/sec)**: Throttle to 1 edit per 800ms.

---

## Verification

### Build

- [ ] `pnpm build && pnpm typecheck && pnpm lint` pass

### Phase 2a: Auto-Execute

- [ ] Send "buy groceries" via Telegram → bot replies "✅ Added to Today.md" → Today.md has new task line
- [ ] Send "create a note about quantum mechanics" → bot replies "✅ Created note..." → note exists in Inkdown
- [ ] Send garbled text → bot replies "📝 Captured to Inbox" → Inbox.md has the text
- [ ] Web Inbox shows activity feed with green ✅ badges, no approve/reject buttons
- [ ] Old unclassified proposals still render with fallback UI

### Phase 2b: Streaming

- [ ] Send "create a note about Newton's laws" → bot shows "Creating note..." → edits to "Writing 'Newton's Laws'..." → final "✅ Created note..."
- [ ] Simple appends (tasks, vocab) → instant single reply, no streaming

### Phase 2c: Clarification

- [ ] Send "meeting" → bot asks "Is this a calendar event or a task?" → reply "calendar" → bot creates calendar entry
- [ ] Send "buy groceries" → bot asks "For today or tomorrow?" → wait 3 min → send new message → treated as fresh capture, stale clarification shown as "timed out" in UI

### Backward Compatibility

- [ ] Existing Inbox.md shortcut captures unaffected
- [ ] Heartbeat evening processing still works
- [ ] Pairing flow unchanged
