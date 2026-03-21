# Fix Secretary Chat SSE Streaming — Reactivity Bug

**Date**: 2026-03-20
**Status**: Planning

---

## Context

The Secretary chat (sidebar panel at `/api/secretary/chat`) renders nothing during SSE streaming. The backend generates all events correctly (`thinking`, `tool_call`, `tool_result`, `text`, `done` — confirmed via logs). The user sees "SECRETARY" + timestamp but no content, no thinking spinner, nothing. After closing and reopening, the result appears (loaded from DB), proving the backend persists correctly.

**Root cause**: `liveAssistantMsg` in `stores/secretary.ts` (line 145) is a **plain JavaScript variable**, not a Vue ref. All streaming mutations (`liveAssistantMsg.content = ...`, `.toolCalls = ...`, `.thinkingSteps = ...`) are **invisible to Vue's reactivity system**. The component never re-renders during streaming.

**This is a pre-existing bug**, not caused by the DeepAgents streaming upgrade.

---

## Fix

### Step 1: Trigger reactivity on every `handleStreamEvent` mutation

**File**: `apps/web/src/stores/secretary.ts`

The `chatMessages` ref holds the array that components iterate over. When we mutate a property of an object INSIDE a reactive array, Vue CAN track it — **but only if the object was reactive when inserted**. The issue is that `assistantMsg` is created as a plain object (line 832-838) and pushed into `chatMessages.value`. Vue's `ref()` wrapping an array DOES make pushed objects reactive via `reactive()` proxy under the hood.

Wait — actually Vue 3's `ref([])` DOES make pushed objects reactive. Let me re-examine.

The real problem is likely that `liveAssistantMsg` holds a **direct reference** to the object BEFORE Vue wraps it. When we do `chatMessages.value.push(assistantMsg)`, Vue wraps the array entry. But `liveAssistantMsg = assistantMsg` holds the **unwrapped original**. Mutations via `liveAssistantMsg.content = ...` modify the unwrapped object, NOT the reactive proxy.

**Fix**: After pushing to `chatMessages.value`, get the reactive proxy back:

```typescript
chatMessages.value.push(assistantMsg)
// Get the reactive proxy — Vue wraps objects pushed into ref arrays
liveAssistantMsg = chatMessages.value[chatMessages.value.length - 1]
```

This ensures all mutations via `liveAssistantMsg` go through the reactive proxy, triggering Vue's change detection.

### Step 2: Also clean up the diagnostic log

**File**: `apps/api/src/routes/secretary.ts`

Remove the `console.info('[secretary/chat] SSE →', ...)` line added for debugging.

---

## Critical Files

| File | Change |
|------|--------|
| `apps/web/src/stores/secretary.ts` (line ~840) | Get reactive proxy after push |
| `apps/api/src/routes/secretary.ts` (line ~204) | Remove diagnostic log |

---

## Verification

1. `pnpm typecheck` — clean
2. Restart `pnpm dev`
3. Open Secretary panel → "make a plan to learn Rust"
4. Verify: thinking spinner appears immediately, tool call cards stream in, text renders live
5. After completion: content matches what appears after close/reopen (same data)
6. Test EditorDeep (AI sidebar) still works — "add a table about planets"
