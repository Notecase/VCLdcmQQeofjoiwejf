# Fix "Memory fetch failed: 429" Rate Limiting Errors

## Context

The Secretary feature shows "Memory fetch failed: 429" errors because the frontend makes too many redundant API requests, exhausting the in-memory rate limiter (150 req/min). A typical session (open Secretary + send 3 chat messages during plan creation) generates ~45 requests/minute. The problem compounds because:

1. `refreshMemoryFiles()` secretly fires an extra `GET /heartbeat` request every time (for data nothing renders)
2. Multiple code paths call `refreshMemoryFiles()` redundantly after operations where SSE `memory_updated` events already handle the refresh
3. A duplicate `day-transition` call fires on every Secretary page load
4. The debounce window (120ms) is too short to coalesce bursts from plan creation tool calls

**Goal:** Reduce request volume by ~60% (from ~45 to ~18 req/min) by eliminating redundant calls and improving coalescing.

---

## Implementation Steps

### Step 1: Remove `loadHeartbeatState()` from `refreshMemoryFiles()`

**File:** `apps/web/src/stores/secretary.ts` ~line 370

`heartbeatState` is fetched but rendered in zero Vue components. No computed property or watcher depends on it. Remove the call from `refreshMemoryFiles()` but keep the single load in `initialize()` (line 335) for future use.

**Change:** Delete `await loadHeartbeatState()` from inside `refreshMemoryFiles()`.

**Impact:** -1 request per every memory refresh (cuts each refresh cost in half).

---

### Step 2: Remove duplicate day-transition from `initialize()`

**File:** `apps/web/src/stores/secretary.ts` ~lines 308-316

`App.vue:24` already fires `POST /day-transition` on every page load (fire-and-forget). The same call in `initialize()` is a duplicate.

**Change:** Remove the `try/catch` block around the `authFetch` day-transition call in `initialize()`.

**Impact:** -1 request per Secretary page load.

---

### Step 3: Remove post-chat `refreshMemoryFiles()` in `sendChatMessage()`

**File:** `apps/web/src/stores/secretary.ts` ~line 945

During chat streaming, every memory-modifying tool call emits a `memory_updated` SSE event, which triggers `scheduleMemoryRefresh()` (line 1081). This is the **correct** pattern — it's debounced and uses `refreshMemoryFilesByName()` for targeted updates. The explicit `refreshMemoryFiles()` after streaming completes is redundant (and less efficient since it fetches ALL files).

**Change:** Delete `await refreshMemoryFiles()` at line 945.

**Impact:** -1 request per chat message.

---

### Step 4: Remove double refresh in `submitReflection()`

**File:** `apps/web/src/stores/secretary.ts` ~line 1243

`submitReflection()` calls `sendChatMessage()` (which triggers SSE `memory_updated` events → `scheduleMemoryRefresh()`), then calls `refreshMemoryFiles()` again. Double refresh.

**Change:** Delete `await refreshMemoryFiles()` at line 1243.

**Impact:** -1 request per reflection submission.

---

### Step 5: Fix PlanCreationChat.vue to use `scheduleMemoryRefresh`

**File:** `apps/web/src/components/secretary/plan/PlanCreationChat.vue` ~line 173
**File:** `apps/web/src/stores/secretary.ts` (store exports)

`PlanCreationChat.vue` calls `store.refreshMemoryFiles()` directly on `memory_updated`, bypassing the debounce. During plan creation (multiple tool calls), this fires multiple full refreshes.

**Changes:**

1. Expose `scheduleMemoryRefresh` from the secretary store's return object
2. In `PlanCreationChat.vue`, change `store.refreshMemoryFiles()` to `store.scheduleMemoryRefresh()`

**Impact:** Coalesces plan creation refreshes into debounced batches.

---

### Step 6: Increase debounce window from 120ms to 800ms

**File:** `apps/web/src/stores/secretary.ts` ~line 419

120ms is too short — tool call results from the AI arrive ~200-500ms apart, so each triggers a separate fetch. 800ms is long enough to batch a full round of tool calls but short enough that the UI feels responsive.

**Change:** Change `}, 120)` to `}, 800)` in `scheduleMemoryRefresh`.

**Impact:** Coalesces 3-5 rapid events into 1 fetch instead of 3-5.

---

### Step 7: Add concurrent request guard to `refreshMemoryFiles()`

**File:** `apps/web/src/stores/secretary.ts` ~line 359

If `refreshMemoryFiles()` is called while another instance is in-flight, both execute. Add a guard that reuses the in-flight promise.

**Change:**

```typescript
let refreshMemoryPromise: Promise<void> | null = null

async function refreshMemoryFiles() {
  if (refreshMemoryPromise) return refreshMemoryPromise
  refreshMemoryPromise = _refreshMemoryFilesImpl()
  try {
    await refreshMemoryPromise
  } finally {
    refreshMemoryPromise = null
  }
}

async function _refreshMemoryFilesImpl() {
  // existing implementation (without loadHeartbeatState)
}
```

**Impact:** Prevents duplicate concurrent fetches.

---

### Step 8: Bump rate limit default as safety net

**File:** `apps/api/src/config.ts` ~line 82
**File:** `.env.example`

The rate limiter protects against abuse, not normal usage. Bump the default to give more headroom.

**Changes:**

- `config.ts`: Change default from `'150'` to `'200'`
- `.env.example`: Update recommended value from `60` to `150`

**Impact:** Safety net — normal usage should never approach this after the other fixes.

---

## What We're NOT Changing (and why)

| Call site                                         | Reason to keep                                                                                   |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `prepareTomorrow()` line 735                      | Its SSE handler only checks for `error` events, doesn't process `memory_updated`                 |
| `approveTomorrow()` line 756                      | Plain POST with no SSE streaming — needs explicit refresh                                        |
| `missions.ts` line 423                            | Only fires on daily_plan mission completion (rare), no SSE events. Disabled in production anyway |
| `loadHeartbeatState()` in `initialize()` line 335 | Keep single canonical load for future heartbeat settings UI                                      |

---

## Verification

1. **Build check:** `pnpm build && pnpm typecheck` — ensure no compile errors
2. **Manual test flow:**
   - Open Secretary dashboard → verify no 429 error banner
   - Send a chat message asking to create a plan → verify memory files update in sidebar
   - Send 3-4 rapid chat messages → verify no 429 errors
   - Click "Prepare Tomorrow" → verify Tomorrow.md updates
   - Click "Approve Tomorrow" → verify plan moves to Today
   - Submit a reflection → verify Today.md updates
   - Create a plan in PlanCreationChat → verify plan appears
3. **Network tab check:** Open browser DevTools Network tab, filter by `/api/secretary/`. During a chat message, should see:
   - 1 POST to `/chat`
   - 1-2 targeted GET to `/memory/Today.md` (or similar) from debounced SSE events
   - NOT a full GET to `/memory` after streaming completes
4. **Rate limit headroom:** With 200 req/min limit and ~18 req/min normal usage, there's >10x headroom

---

## Expected Impact

| Metric                                     | Before        | After        |
| ------------------------------------------ | ------------- | ------------ |
| Requests per Secretary page load           | 8             | 6            |
| Requests per chat message                  | 6-8           | 2-3          |
| Requests per reflection                    | 8-10          | 2-3          |
| Total for typical session (open + 3 chats) | ~45/min       | ~16-18/min   |
| Rate limit headroom                        | 3.3x (150/45) | 11x (200/18) |
