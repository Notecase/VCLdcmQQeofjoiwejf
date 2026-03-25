# Inbox Bot Cleanup & Improvements

## Context

The inbox bot was recently refactored from a "classify with Output.object() → execute separately" pipeline to a single `ToolLoopAgent` call. The refactor works — the agent classifies AND executes in one call using the same proven pattern as the Secretary agent.

However, the refactor left behind: dead code from the old pipeline, a UI bug where the inbox badge never shows, no streaming progress during Telegram execution (users wait 10-20s with no feedback), and a misleading task type name. This plan addresses all of these, ordered from most impactful to least.

---

## Step 1 (P0 — Bug Fix): Expose `pendingCount` for Secretary badge

**Problem**: `SecretaryView.vue:130` checks `inboxRef.pendingCount > 0` but `InboxProposals.vue:214` only exposes `{ totalCount, loadProposals }`. The badge **never** appears.

**File**: `apps/web/src/components/secretary/InboxProposals.vue`

- Line 214: Change `defineExpose({ totalCount, loadProposals })` → `defineExpose({ totalCount, pendingCount: uncategorizedCount, loadProposals })`

No changes needed in `SecretaryView.vue` — it already references `pendingCount`.

---

## Step 2 (P1 — Dead Code): Delete `executor.ts`

**Problem**: Zero imports anywhere. All 254 lines are dead since the ToolLoopAgent refactor.

**Actions**:

1. Delete `apps/api/src/channels/executor.ts`
2. Update comment at `inbox-agent.ts:159` from "reuses pattern from executor.ts" to just "File Append Helper"

---

## Step 3 (P1 — Dead Code): Delete `inbox-classifier.ts`

**Problem**: `classifyInboxMessage()` has zero callers. Replaced by the ToolLoopAgent inbox-agent.

**Important**: `inbox-categorizer.ts` IS still used by `proposals.ts:16` for the batch categorize endpoint. Keep it.

**Actions**:

1. Delete `packages/ai/src/agents/inbox-classifier.ts`
2. Remove its export from `packages/ai/package.json` (lines 69-72)

---

## Step 4 (P1 — Cleanup): Remove vestigial `ChannelLinkConfig`

**Problem**: Empty interface with eslint-disable comment in `handler.ts:14-17`. The `_linkId` and `_linkConfig` params in `captureAndExecute` are prefixed with underscore (unused).

**File**: `apps/api/src/channels/handler.ts`

1. Delete the `ChannelLinkConfig` interface (lines 14-17)
2. Simplify `captureAndExecute` signature: remove `_linkId` and `_linkConfig` params
3. Update call site (lines 79-85): `await captureAndExecute(link.user_id, message, reply)`

---

## Step 5 (P2 — Rename): `'inbox-classifier'` → `'inbox-agent'` task type

**Problem**: Misleading name after the ToolLoopAgent refactor.

**File**: `packages/ai/src/providers/model-registry.ts`

- Line 125: `| 'inbox-classifier'` → `| 'inbox-agent'` in `AITaskType` union
- Line 147: `'inbox-classifier'` → `'inbox-agent'` in `TASK_MODEL_MAP`
- Line 166: `'inbox-classifier'` → `'inbox-agent'` in `TASK_FALLBACK_MAP`

**File**: `apps/api/src/channels/inbox-agent.ts`

- Line 209: `getModelsForTask('inbox-classifier')` → `getModelsForTask('inbox-agent')`
- Line 219: `taskType: 'inbox-classifier'` → `taskType: 'inbox-agent'`

_Depends on Step 3 (delete inbox-classifier.ts first so its stale references don't cause type errors)._

---

## Step 6 (P3 — UX): Streaming progress for Telegram

**Problem**: `agent.generate()` blocks silently for up to 45s. Users see nothing between sending a message and receiving the result. The AI SDK v6 `ToolLoopAgent.generate()` supports `onStepFinish` callback (confirmed in source).

**File**: `apps/api/src/channels/inbox-agent.ts`

- Add `onProgress?: (message: string) => void` param to `runInboxAgent()`
- Pass `onStepFinish` to `agent.generate()` that maps tool names to progress labels:
  - `create_note` → "Creating note..."
  - `add_task` → "Adding task..."
  - `add_calendar_event` → "Adding event..."
  - etc.

**File**: `apps/api/src/channels/handler.ts`

- Send initial "Processing..." via `reply.send()` before calling the agent
- Pass `(progress) => reply.edit(progress).catch(() => {})` as `onProgress`
- Change final result delivery from `reply.send()` to `reply.edit()` (message already sent)
- Change timeout fallback from `reply.send()` to `reply.edit()`

_Depends on Steps 4 and 5._

---

## Step 7 (P4 — Telemetry): Log timeout events

**Problem**: 45s timeout in `handler.ts:196` falls back silently to add_thought. Zero visibility.

**File**: `apps/api/src/channels/handler.ts`

- Add before the fallback DB update: `console.warn('[inbox-agent] Timeout after 45s for user=...')`

_Part of the same handler.ts edit as Step 6._

---

## Step 8 (P5 — Safety): Restrict channel enum to `'telegram'`

**Problem**: `routes/channels.ts:38` allows `['telegram', 'discord', 'whatsapp']` but only telegram is implemented. Users could pair a phantom channel.

**File**: `apps/api/src/routes/channels.ts`

- Line 38: `z.enum(['telegram', 'discord', 'whatsapp'])` → `z.enum(['telegram'])`

---

## Execution Order

```
Batch A (parallel, independent):  Steps 1, 2, 3, 8
Batch B (after Step 3):           Step 4, Step 5
Batch C (after Steps 4+5):        Steps 6 + 7 (same file edits)
```

## Verification

After all steps:

```bash
pnpm build && pnpm typecheck && pnpm lint
```

Then deploy and test:

1. Send "buy groceries" via Telegram → see "Processing..." → "Adding task..." → "Added to Today.md"
2. Send "make a note about Newton's laws" → see "Processing..." → "Creating note..." → "Created note 'Newton's Laws'"
3. Check Secretary view in web app → inbox badge should show count if uncategorized items exist
4. Check Railway logs → no 500 errors, timeout events logged with `[inbox-agent]` prefix

## Critical Files

| File                                                   | Steps   | Action                          |
| ------------------------------------------------------ | ------- | ------------------------------- |
| `apps/web/src/components/secretary/InboxProposals.vue` | 1       | Expose pendingCount             |
| `apps/api/src/channels/executor.ts`                    | 2       | DELETE                          |
| `packages/ai/src/agents/inbox-classifier.ts`           | 3       | DELETE                          |
| `packages/ai/package.json`                             | 3       | Remove export                   |
| `packages/ai/src/providers/model-registry.ts`          | 5       | Rename task type                |
| `apps/api/src/channels/handler.ts`                     | 4, 6, 7 | Simplify + progress + telemetry |
| `apps/api/src/channels/inbox-agent.ts`                 | 5, 6    | Rename + onProgress             |
| `apps/api/src/routes/channels.ts`                      | 8       | Restrict enum                   |
