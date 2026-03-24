# Smart Agentic Inbox (Phase 2)

## Context

Phase 1 (Telegram bot + dumb capture + proposals UI) shipped and works. But the current flow is: message → raw insert → user clicks "Categorize" → batch AI → user reviews → approve → append text to file. This is slow and limited — the AI only classifies text into categories, it can't propose rich actions like "create a note about quantum mechanics."

**Goal**: Upgrade to a smart per-message classifier that instantly detects what the user wants, proposes rich actions (create notes, schedule events, add vocabulary), gives smart bot replies in Telegram, and shows rich previews in the Inbox UI. User still approves everything — nothing auto-executes.

**Inspiration**: OpenClaw's two-tier classification (cheap fast check → full agent only when needed), selective skill injection, and per-peer session isolation. We adopt the cheap-first-classify pattern but keep our approval-based model.

---

## Architecture Overview

### New Message Flow

```
Telegram message arrives
  │
  ├─► Insert raw row into inbox_proposals (instant, no AI)
  │
  ├─► Call smart classifier (single generateText, ~1-2s, ~$0.003)
  │   Returns: actionType, payload, previewText, botReplyText
  │
  ├─► Update proposal row with rich action data
  │
  ├─► Bot replies: "Got it — I'll propose creating a note about quantum mechanics. Review it in your Inbox."
  │
  ▼ (User opens Inbox tab)
  │
  Rich preview cards show exactly what each action will DO
  │
  User approves/rejects each proposal
  │
  ├─► "Apply" dispatches to correct agent:
  │   - create_note → NoteAgent creates Inkdown note
  │   - add_task → append to Today.md / Tomorrow.md
  │   - add_calendar_event → append to Calendar.md
  │   - add_vocabulary → append to Vocabulary.md
  │   - add_reading → append to Reading.md
  │   - add_thought → append to Inbox.md
  └─► Rejected items archived
```

### What Stays Unchanged

- Inbox.md shortcut capture flow (Pipeline B via heartbeat)
- Pairing flow (channels.ts)
- Channel management routes
- Existing proposal statuses (pending/approved/rejected/applied)
- Batch categorizer (kept for "Categorize" button on legacy items)

---

## Step 1: Shared Types Enhancement

**File**: `packages/shared/src/types/secretary.ts`
**Effort**: 30 min

Add to the existing "Inbox Proposal Types" section:

### New Types

```typescript
/** Action types the smart classifier can propose */
export type ProposalActionType =
  | 'create_note'
  | 'add_task'
  | 'add_calendar_event'
  | 'add_vocabulary'
  | 'add_reading'
  | 'add_thought'

/** Typed payloads per action type */
export interface CreateNotePayload {
  title: string
  content: string
  projectId?: string
}
export interface AddTaskPayload {
  taskLine: string
  targetFile: 'Today.md' | 'Tomorrow.md'
  dueDate?: string
}
export interface AddCalendarEventPayload {
  eventTitle: string
  dateTime?: string
  description?: string
}
export interface AddVocabularyPayload {
  word: string
  definition: string
  context?: string
}
export interface AddReadingPayload {
  title: string
  url?: string
  description?: string
}
export interface AddThoughtPayload {
  text: string
}

export type ProposalPayload =
  | CreateNotePayload
  | AddTaskPayload
  | AddCalendarEventPayload
  | AddVocabularyPayload
  | AddReadingPayload
  | AddThoughtPayload
```

### Enhance Existing `InboxProposal`

Add three optional fields (nullable for backward compat with existing rows):

```typescript
actionType: ProposalActionType | null
payload: ProposalPayload | null
previewText: string | null
```

### Enhance `CategorizationResult`

Add fields for per-message classification:

```typescript
actionType: ProposalActionType
payload: Record<string, unknown>
previewText: string
botReplyText: string
```

---

## Step 2: Database Migration

**New file**: `supabase/migrations/033_inbox_proposals_smart_actions.sql`
**Effort**: 15 min

```sql
ALTER TABLE inbox_proposals
  ADD COLUMN action_type TEXT,
  ADD COLUMN payload JSONB DEFAULT '{}',
  ADD COLUMN preview_text TEXT;

CREATE INDEX idx_proposals_action_type
  ON inbox_proposals(user_id, action_type) WHERE status = 'pending';
```

Why `payload` separate from `metadata`: `metadata` holds channel-level info (displayName, timestamp); `payload` holds AI-classified action data. Clean separation.

---

## Step 3: Smart Classifier Agent

**New file**: `packages/ai/src/agents/inbox-classifier.ts`
**Effort**: 1 hour

### Design

Single `generateText` + `Output.object()` call per message. No ToolLoopAgent, no multi-step reasoning. This is the cheapest possible AI call.

### Model Selection

- Register `'inbox-classifier'` in model registry (`packages/ai/src/providers/model-registry.ts`)
- Primary: `gemini-3-flash-preview` (~$0.003 per classification)
- Fallback: `gemini-2.5-pro`
- Reversed from other tasks (flash primary, pro fallback) because cost matters most

### Output Schema (Zod)

```typescript
z.object({
  actionType: z.enum([
    'create_note',
    'add_task',
    'add_calendar_event',
    'add_vocabulary',
    'add_reading',
    'add_thought',
  ]),
  category: z.enum(['task', 'vocabulary', 'calendar', 'note', 'reading', 'thought']),
  targetFile: z.string(),
  payload: z.record(z.unknown()),
  proposedContent: z.string(),
  previewText: z.string(),
  confidence: z.number().min(0).max(1),
  botReplyText: z.string(),
})
```

### System Prompt

Defines the 6 action types with examples:

- `create_note`: "create a note about X", "write about X" → generates title + content outline
- `add_task`: "buy groceries", "remind me to X" → formats as `- [ ] task`
- `add_calendar_event`: "meeting with John tomorrow 3pm" → extracts event details
- `add_vocabulary`: "ephemeral - lasting briefly" → formats word + definition
- `add_reading`: URLs or "read about X" → formats as reading list entry
- `add_thought`: anything else → captures as thought

Bot reply template: `Got it — I'll propose [action]. Review it in your Inbox.`

### Context

Minimal — only the list of existing memory filenames (same as current categorizer). No Plan.md, no AI.md, no full context loading. Speed > intelligence for classification.

### Fallback

3-second timeout. If AI call fails → fall back to inserting raw proposal with `action_type: null`, reply "Captured." Data is never lost.

### Reuse

- `resolveModelsForTask()` + `isTransientError()` from `ai-sdk-factory.ts`
- `recordAISDKUsage()` from `ai-sdk-usage.ts`
- `selectModel()` from `model-registry.ts`
- Same `generateText` + `Output.object()` pattern as `planner.agent.ts` line 475-481

### Export

Add `"./agents/inbox-classifier"` export to `packages/ai/package.json`

---

## Step 4: Channel Handler & Routes Upgrade

**Effort**: 1.5 hours

### 4a. Upgrade `handleIncomingMessage()` in `apps/api/src/channels/handler.ts`

Replace `captureToProposals()` (lines 119-142):

**New flow:**

1. Insert raw proposal immediately (`status: 'pending'`, `action_type: null`)
2. Call `classifyInboxMessage()` with 3-second timeout
3. On success: update proposal row with `action_type`, `payload`, `category`, `target_file`, `proposed_content`, `preview_text`, `confidence`
4. Return `ChannelResponse` with `result.botReplyText`
5. On failure/timeout: return `{ text: 'Captured.' }` (existing behavior)

### 4b. Upgrade apply logic in `apps/api/src/routes/proposals.ts`

Replace the `POST /apply` handler (lines 182-245) with action-aware dispatch:

```
for each approved proposal:
  switch (proposal.action_type):
    'create_note':
      → Import NoteAgent, call agent.run({ action: 'create', ... })
      → Store resulting noteId in proposal metadata
    'add_task' | 'add_calendar_event' | 'add_vocabulary' | 'add_reading' | 'add_thought':
      → Append proposed_content to target_file (existing upsert pattern)
    null (legacy):
      → Fall through to existing append behavior
```

Only `create_note` needs a full agent call. Everything else is the same memory file append we already have.

### 4c. Update PATCH schema

Add `actionType` and `payload` to `UpdateProposalSchema` (line 123 of proposals.ts).

### 4d. Update `mapProposal()` helper

Add `actionType: row.action_type`, `payload: row.payload`, `previewText: row.preview_text` to output mapping.

---

## Step 5: Frontend Inbox UI Enhancement

**File**: `apps/web/src/components/secretary/InboxProposals.vue`
**Effort**: 1.5-2 hours

### Rich Preview Cards

Each proposal card now shows action-specific previews:

| Action Type          | Preview                                                          |
| -------------------- | ---------------------------------------------------------------- |
| `create_note`        | Title in bold + first 3 lines of content, FileText icon          |
| `add_task`           | Formatted `- [ ] task` line, target file badge, CheckSquare icon |
| `add_calendar_event` | Event title + date/time in mini calendar card, Calendar icon     |
| `add_vocabulary`     | Word in bold + definition in italic, BookOpen icon               |
| `add_reading`        | Linked title + description, Link icon                            |
| `add_thought`        | Thought text (same as current), MessageCircle icon               |
| `null` (legacy)      | Current raw text + proposed content layout (fallback)            |

### Template Changes

Replace the proposal card body section with conditional rendering based on `proposal.actionType`:

```html
<!-- Rich preview based on action type -->
<div v-if="proposal.actionType === 'create_note'" class="preview-note">
  <FileText :size="14" />
  <strong>{{ proposal.payload?.title }}</strong>
  <p>{{ truncate(proposal.payload?.content, 120) }}</p>
</div>
<!-- ... similar blocks for each action type ... -->
<!-- Fallback for legacy unclassified -->
<div v-else class="preview-raw">
  <p>{{ proposal.rawText }}</p>
</div>
```

### New Helpers

- `actionTypeLabel(type)` — maps `'create_note'` → `'Create Note'`
- `actionTypeIcon(type)` — maps to Lucide icon component
- `truncate(text, maxLength)` — truncates preview content

### No New Components

All rendering stays inline in InboxProposals.vue, consistent with current pattern.

---

## Step 6: Bot Reply Enhancement

**Effort**: 30 min (mostly handled by Steps 3 + 4)

### 6a. Telegram parse mode

Update `apps/api/src/channels/telegram.ts` line 35:

```typescript
await ctx.reply(response.text, { parse_mode: response.parseMode || undefined })
```

The `ChannelResponse.parseMode` already exists in the type. The classifier returns `parseMode: 'Markdown'`.

### 6b. Reply examples

The classifier prompt teaches the AI to generate replies like:

- "Got it — I'll propose creating a note about quantum mechanics. Review it in your Inbox."
- "Got it — I'll propose adding 'Buy groceries' to your Today tasks."
- "Got it — I'll propose adding 'serendipity' to your vocabulary."
- "Got it — I'll propose scheduling 'Meeting with John' for tomorrow 3pm."

---

## Critical Files

| File                                                        | Action                                                                   |
| ----------------------------------------------------------- | ------------------------------------------------------------------------ |
| `packages/shared/src/types/secretary.ts`                    | Extend: add `ProposalActionType`, payload types, enhance `InboxProposal` |
| `supabase/migrations/033_inbox_proposals_smart_actions.sql` | New: add `action_type`, `payload`, `preview_text` columns                |
| `packages/ai/src/agents/inbox-classifier.ts`                | New: smart per-message classifier                                        |
| `packages/ai/src/providers/model-registry.ts`               | Modify: add `'inbox-classifier'` task type                               |
| `packages/ai/package.json`                                  | Modify: add `./agents/inbox-classifier` export                           |
| `apps/api/src/channels/handler.ts`                          | Modify: upgrade `captureToProposals()` to classify-then-insert           |
| `apps/api/src/routes/proposals.ts`                          | Modify: action-aware apply dispatch, update PATCH schema, update mapper  |
| `apps/web/src/components/secretary/InboxProposals.vue`      | Modify: rich preview cards per action type                               |

## Patterns to Reuse

| Pattern                             | Source                     | Reuse In                                        |
| ----------------------------------- | -------------------------- | ----------------------------------------------- |
| `generateText` + `Output.object()`  | `planner.agent.ts:475-481` | inbox-classifier.ts                             |
| `resolveModelsForTask()` + fallback | `planner.agent.ts:469`     | inbox-classifier.ts                             |
| `recordAISDKUsage()`                | `planner.agent.ts:483-486` | inbox-classifier.ts                             |
| Memory upsert                       | `proposals.ts:212-233`     | Apply dispatch (unchanged for non-note actions) |
| NoteAgent.run()                     | `note.agent.ts`            | Apply dispatch for `create_note`                |
| `getServiceClient()`                | `lib/supabase.ts`          | Channel handler (already used)                  |

## Dependency Graph

```
Step 1 (Types) ──┬──→ Step 3 (Classifier) ──→ Step 4 (Handler + Routes)
                 │                                      │
Step 2 (Migration)┘                                     ↓
                                               Step 5 (Frontend UI)
                                                        │
                                                        ↓
                                               Step 6 (Bot Reply polish)
```

Steps 1+2 in parallel. Step 3 depends on 1. Step 4 depends on 2+3. Step 5 depends on 1+4. Step 6 is a polish pass.

---

## Cost & Performance

- **Per-message cost**: ~$0.003-0.006 (Gemini Flash, ~200 tokens input)
- **Daily cap**: 100 messages/day (already enforced) = max $0.60/day
- **Classification latency**: 1-2 seconds, 3-second timeout with fallback
- **Apply latency**: <1s for memory append, 3-5s for NoteAgent create
- **No cost increase for Inbox UI**: frontend reads from DB, no AI calls

---

## Verification

### Build

- [ ] `pnpm build && pnpm typecheck && pnpm lint` pass

### Smart Classification

- [ ] Send "create a note about quantum mechanics" → bot replies with note proposal, Inbox shows "Create Note" card with title + content preview
- [ ] Send "buy groceries" → bot replies with task proposal, Inbox shows "Add Task" card with `- [ ] Buy groceries`
- [ ] Send "meeting with John tomorrow 3pm" → bot replies with calendar proposal, Inbox shows event details
- [ ] Send "ephemeral - lasting briefly" → bot replies with vocabulary proposal
- [ ] Send "https://arxiv.org/abs/..." → bot replies with reading proposal
- [ ] AI failure → bot falls back to "Captured.", proposal has `action_type: null`

### Apply Actions

- [ ] Approve note proposal → Apply → NoteAgent creates Inkdown note
- [ ] Approve task → Apply → appended to Today.md
- [ ] Approve calendar → Apply → appended to Calendar.md
- [ ] Approve vocabulary → Apply → appended to Vocabulary.md
- [ ] Legacy unclassified proposals still work with "Categorize" button

### Backward Compatibility

- [ ] Existing Inbox.md shortcut captures unaffected
- [ ] Heartbeat evening processing still works
- [ ] Old proposals (no action_type) render correctly with fallback UI

---

## Implementation Order

| Step | What                                                               | Effort      |
| ---- | ------------------------------------------------------------------ | ----------- |
| 1    | Shared types (ProposalActionType, payloads, enhance InboxProposal) | 30 min      |
| 2    | Migration 033 (action_type, payload, preview_text columns)         | 15 min      |
| 3    | Smart classifier agent + model registry entry + package export     | 1 hour      |
| 4    | Handler upgrade + apply dispatch + route updates                   | 1.5 hours   |
| 5    | Frontend rich preview cards                                        | 1.5-2 hours |
| 6    | Bot reply polish (parse mode, prompt tuning)                       | 30 min      |

**Total**: ~5-6 hours
