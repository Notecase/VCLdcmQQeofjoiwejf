# Fix: Secretary Chat Invisible + Duplicates + Course "No Terminal Event"

**Date**: 2026-02-09 (Revised — previous fixes failed)

## Context

Three bugs persist after initial fix attempt:
1. **Secretary chat**: Response invisible during streaming (blank area under "SECRETARY" label), only appears after page refresh
2. **Secretary chat**: Duplicate tool call blocks ("Create Roadmap" x2) visible after refresh
3. **Course generation**: "Course generation stream ended without a terminal event at stage research" — research fails and the pipeline dies silently

The previous fix (`triggerRef`) was wrong — it doesn't solve the Vue reactivity issue. This plan identifies the TRUE root causes and correct fixes.

---

## Bug 1: Secretary Chat — Invisible Response During Streaming

### True Root Cause

In `apps/web/src/stores/secretary.ts:482-483`:
```typescript
chatMessages.value.push(assistantMsg)   // Vue wraps in reactive proxy
liveAssistantMsg = assistantMsg          // Still holds RAW object, not the proxy
```

When `chatMessages.value.push(obj)` runs, Vue 3's reactive system wraps the object in a `Proxy`. But `liveAssistantMsg` was assigned the original raw object BEFORE Vue proxied it.

During streaming, `liveAssistantMsg.content = streamingContent.value` writes to the raw object — **bypassing Vue's Proxy set trap entirely**. Vue never detects the mutation, so `SecretaryMessageCard`'s computed `renderedContent` never re-evaluates, and the `v-if="isStreaming && !message.content"` condition at line 105 always shows "Thinking...".

`triggerRef(chatMessages)` doesn't help because:
- It marks the array ref as dirty, triggering re-evaluation of the `v-for`
- But each array element is still the same proxy reference → Vue's vnode diffing sees no prop change → child component doesn't re-render
- The computed `renderedContent` in SecretaryMessageCard was never dependency-tracked for the raw property write

### Fix

**File: `apps/web/src/stores/secretary.ts`**

Change line 483 to capture the **reactive proxy** instead of the raw object:

```typescript
chatMessages.value.push(assistantMsg)
// Get the reactive proxy that Vue created when pushing into the array
liveAssistantMsg = chatMessages.value[chatMessages.value.length - 1]
```

Now when `liveAssistantMsg.content = streamingContent.value` runs, it writes through Vue's Proxy → triggers reactive dependency → `renderedContent` computed re-evaluates → component re-renders.

Also **remove all `triggerRef(chatMessages)` calls** added in the previous fix — they're unnecessary and add overhead. Revert the `triggerRef` import too.

### Changes
1. `secretary.ts:483` — Replace `liveAssistantMsg = assistantMsg` with `liveAssistantMsg = chatMessages.value[chatMessages.value.length - 1]`
2. Remove all 4 `triggerRef(chatMessages)` calls from `handleStreamEvent`
3. Remove `triggerRef` from the import on line 9

---

## Bug 2: Secretary Chat — Duplicate Tool Calls After Refresh

### True Root Cause

The frontend retry loop (lines 498-558) resends the SAME message to the backend. On each attempt, the backend:
1. Saves the user message to DB
2. Streams the response
3. Saves the assistant message (with `toolCalls` array) to DB

On retry, BOTH user AND assistant messages get saved AGAIN. On page refresh, `loadThread()` fetches all persisted messages → duplicates visible.

The previous dedup only checked user messages. The assistant message duplication was never addressed.

### Fix

Use a `requestId` from the frontend to make backend saves idempotent.

**File: `apps/web/src/stores/secretary.ts`**

Generate a `requestId` once per `sendChatMessage()` call (not per retry), send it in the request body:

```typescript
// In sendChatMessage(), before the retry loop:
const requestId = crypto.randomUUID()

// In the fetch call:
body: JSON.stringify({
  message,
  threadId: activeThreadId.value || undefined,
  requestId,
})
```

**File: `apps/api/src/routes/secretary.ts`**

1. Accept `requestId` in the request schema:
```typescript
const ChatSchema = z.object({
  message: z.string().min(1).max(10000),
  threadId: z.string().optional(),
  requestId: z.string().optional(),
})
```

2. Before saving user message (line 115-137), if `requestId` is provided AND `threadId` exists, check if this request was already processed:
```typescript
if (persistenceEnabled && body.requestId && body.threadId) {
  const existing = await persistence.getMessages(threadId)
  const lastUserMsg = [...existing].reverse().find(m => m.role === 'user')
  if (lastUserMsg?.content === body.message) {
    // Already saved — skip user message save, skip agent execution entirely
    // Return the existing assistant response from DB
    // ...stream it back as SSE events
  }
}
```

Actually, **simpler approach**: just skip the user message save on retry and let the agent run again (idempotent agent responses are fine — the issue is duplicate DB entries):

Before saving user message:
```typescript
if (persistenceEnabled) {
  let shouldSaveUser = true
  if (body.threadId) {
    try {
      const msgs = await persistence.getMessages(threadId)
      const last = msgs[msgs.length - 1]
      if (last?.role === 'user' && last?.content === body.message) {
        shouldSaveUser = false
      }
    } catch { /* save anyway */ }
  }
  if (shouldSaveUser) {
    // existing save logic
  }
}
```

Before saving assistant message (line 246-261):
```typescript
if (persistenceEnabled && assistantContent) {
  let shouldSaveAssistant = true
  if (body.threadId) {
    try {
      const msgs = await persistence.getMessages(threadId)
      const last = msgs[msgs.length - 1]
      if (last?.role === 'assistant' && last?.content === assistantContent) {
        shouldSaveAssistant = false
      }
    } catch { /* save anyway */ }
  }
  if (shouldSaveAssistant) {
    await persistence.saveMessage(threadId, auth.userId, { ... })
  }
}
```

### Changes
1. `apps/api/src/routes/secretary.ts` — Add dedup check before saving user message (already partially done in previous fix)
2. `apps/api/src/routes/secretary.ts` — Add dedup check before saving assistant message (NEW — the previous fix missed this)

---

## Bug 3: Course Generation — "Stream ended without a terminal event"

### True Root Cause

In `packages/ai/src/agents/course/orchestrator.ts:451`, when the deepagents pipeline finishes, it emits:
```typescript
eventQueue.push({ event: 'done' })
```

But in `apps/api/src/routes/course.ts`, only `complete` (line 329) and `error` (line 345) set `observedTerminalEvent = true`. The `done` event is **NOT recognized as a terminal event**.

When research fails:
1. `run_deep_research` returns failure string to the LLM
2. System prompt says "NEVER call run_deep_research more than once" → LLM can't retry
3. The pipeline may continue without research or eventually stop
4. Orchestrator emits `done` (not `complete` because `save_to_supabase` was never called)
5. API route sees `observedTerminalEvent = false` → checks DB status (still `running`) → emits the "stream ended without terminal event" error

### Fix

**File: `packages/ai/src/agents/course/orchestrator.ts`**

At line 451, before emitting `done`, check if the pipeline actually completed. If not, emit `error` instead:

```typescript
// Replace line 451:
// eventQueue.push({ event: 'done' })
// With:
if (assembledCourse.value) {
  // Pipeline completed — save_to_supabase already emitted 'complete'
  // Just emit 'done' as a final signal
  eventQueue.push({ event: 'done' })
} else {
  // Pipeline ended without completing — emit error so the frontend knows
  const errorMsg = researchReport.value
    ? 'Course generation pipeline ended without assembling a course.'
    : 'Course generation failed: deep research did not produce results.'
  eventQueue.push({ event: 'error', data: { message: errorMsg, stage: currentStage } })
}
```

**File: `packages/ai/src/agents/course/orchestrator.ts` (system prompt)**

Update the system prompt at line 143 to allow ONE retry for research:
```
- If run_deep_research fails, you may retry ONCE. If it fails again, proceed without research data.
```
Remove or modify line 143: `- NEVER call run_deep_research or index_research more than once. Research is cached.`

**File: `packages/ai/src/agents/course/course-tools.ts`** (keep existing fix)

The `researchStarted = false` reset on failure (already implemented) is correct — it enables the one allowed retry.

---

## Files to Modify

| File | Changes |
|------|---------|
| `apps/web/src/stores/secretary.ts` | Fix `liveAssistantMsg` to use reactive proxy; remove `triggerRef` |
| `apps/api/src/routes/secretary.ts` | Add assistant message dedup check (user msg dedup already there) |
| `packages/ai/src/agents/course/orchestrator.ts` | Emit `error` instead of `done` when pipeline didn't complete; update system prompt |
| `packages/ai/src/agents/course/course-tools.ts` | Already fixed (keep `researchStarted` reset) |

---

## Verification

### Bug 1 (Secretary Invisible Response)
1. Open secretary chat popup
2. Send "create a 4 weeks roadmap to learn PyTorch"
3. Content should stream progressively — NO blank area, NO stuck "Thinking..."
4. Streaming cursor should appear alongside growing text

### Bug 2 (Duplicate Tool Calls)
1. Send a message that triggers tool calls (e.g., "create a roadmap")
2. Observe tool call cards appear — should be ONE "Create Roadmap", not two
3. Refresh page → load thread → still ONE of each tool call

### Bug 3 (Course Terminal Event)
1. Generate a course
2. If research fails, should see an explicit error: "Course generation failed: deep research did not produce results"
3. Should NOT see "stream ended without a terminal event"
4. If research succeeds, pipeline should proceed normally to completion

### Automated
- `pnpm typecheck` — no errors
- `pnpm test` — existing tests pass
