# Fix "Memory fetch failed: 429" Rate Limiting Errors

**Status:** Ready for implementation  
**Impact:** Reduces Secretary session requests from ~45/min to ~18/min (60% reduction)  
**Risk:** Low — all changes are additive guards or dead-code removal; no behavioral changes to user-visible flows

---

## Problem Summary

The Secretary AI frontend makes too many redundant API requests, hitting the in-memory rate limiter (150 req/min default, 60 req/min in `.env.example`). A typical session (open Secretary + send 3 chat messages with plan creation) generates ~45 requests/minute. Seven distinct root causes have been confirmed.

---

## Implementation Steps

### Step 1: Remove `loadHeartbeatState()` from `refreshMemoryFiles()` (DEAD WEIGHT)

**File:** `apps/web/src/stores/secretary.ts`  
**Line:** 370

**What:** Every `refreshMemoryFiles()` call triggers `await loadHeartbeatState()` at line 370, making a `GET /api/settings/heartbeat` request. This doubles every memory refresh (2 requests instead of 1).

**Why it's safe:** `heartbeatState` (declared at line 128) is exported in the store return at line 1552, but is **never consumed by any `.vue` component**. Grep across all `apps/web/src/**/*.vue` confirms zero references. It is only read within the store itself, and `loadHeartbeatState()` is already called during `initialize()` at line 335, which is sufficient.

**Change:** Delete line 370 (`await loadHeartbeatState()`).

The function body (lines 359-375) should become:

```typescript
async function refreshMemoryFiles() {
  if (isDemoMode()) return
  try {
    const res = await authFetch(`${SECRETARY_API}/memory`)
    if (!res.ok) {
      console.warn(`[Secretary] refreshMemoryFiles failed: ${res.status}`)
      return
    }
    const data = await res.json()
    memoryFiles.value = data.files || []
    parsePlanData()
    // loadHeartbeatState() removed — heartbeatState is loaded once during initialize()
    // and is not consumed by any Vue component.
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to refresh memory files'
    console.warn(`[Secretary] ${msg}`)
  }
}
```

**Requests saved:** 1 per `refreshMemoryFiles()` call (called ~6-8 times in a typical session).

---

### Step 2: Remove duplicate `day-transition` call from `initialize()`

**File:** `apps/web/src/stores/secretary.ts`  
**Lines:** 308-316

**What:** `initialize()` fires `POST /secretary/day-transition` at lines 310-313. But `App.vue` (lines 21-29) already fires the exact same request on every page load via `onMounted`. Since `App.vue` is the root component, it always runs before any Secretary page calls `initialize()`. Both are fire-and-forget, so the second is pure waste.

**Why it's safe:** `App.vue` line 24 fires the same endpoint with the same timezone header. The `day-transition` endpoint is idempotent, so even in the unlikely event of a race condition, no harm done. The `App.vue` call is the canonical one (runs for all routes, not just Secretary).

**Change:** Delete the try/catch block at lines 308-316 inside `initialize()`. Replace with a comment.

The code at lines 307-318 should become:

```typescript
    try {
      // Day transition is handled by App.vue on every page load (fire-and-forget).
      // No need to duplicate it here.

      const res = await authFetch(`${SECRETARY_API}/memory`)
```

**Requests saved:** 1 per session.

---

### Step 3: Remove redundant post-chat `refreshMemoryFiles()` at line 945

**File:** `apps/web/src/stores/secretary.ts`  
**Line:** 945

**What:** After `sendChatMessage()` streaming completes, it calls `await refreshMemoryFiles()` at line 945. But during streaming, every `memory_updated` SSE event already triggers `scheduleMemoryRefresh(updatedFiles)` at line 1081, which uses the more efficient `refreshMemoryFilesByName()` to fetch only the specific changed files.

**Why it's safe:** The SSE-based refresh at line 1081 is strictly superior:

- It fires as each file changes (timely)
- It fetches only the changed files by name (efficient)
- It is debounced via `scheduleMemoryRefresh` (no duplicates)

The post-streaming full `refreshMemoryFiles()` is a sledgehammer that re-fetches ALL memory files. By the time streaming finishes, the SSE handler has already updated everything.

**Change:** Delete line 945 (`await refreshMemoryFiles()`). Add a comment explaining why.

Lines 943-946 should become:

```typescript
      }
    }

    // Memory files are already refreshed by memory_updated SSE events during streaming
    // (see handleStreamEvent -> scheduleMemoryRefresh at line ~1081).
  } catch (err) {
```

**Requests saved:** 1 full refresh per chat message. With 3 messages per session, saves 3 full refreshes.

---

### Step 4: Remove double refresh in `submitReflection()` at line 1243

**File:** `apps/web/src/stores/secretary.ts`  
**Line:** 1243

**What:** `submitReflection()` calls `sendChatMessage(...)` at line 1240, which (before step 3) called `refreshMemoryFiles()`. Then `submitReflection()` calls `refreshMemoryFiles()` AGAIN at line 1243. After step 3 removes the `sendChatMessage` refresh, we still get SSE-based refreshes during streaming. The explicit call at line 1243 is therefore still redundant.

**Why it's safe:** `sendChatMessage` streams the response with `memory_updated` SSE events that trigger `scheduleMemoryRefresh`. By the time `sendChatMessage` resolves, memory files are already up to date.

**Change:** Delete line 1243 (`await refreshMemoryFiles()`).

Lines 1239-1244 should become:

```typescript
async function submitReflection(mood: ReflectionMood, text: string) {
  // Memory files are refreshed by SSE memory_updated events during the chat stream.
  await sendChatMessage(
    `Save my daily reflection. My mood is "${mood}". ${text ? `Notes: ${text}` : 'No additional notes.'}`
  )
}
```

**Requests saved:** 1 full refresh per reflection submission.

---

### Step 5: Fix PlanCreationChat.vue to use `scheduleMemoryRefresh` instead of direct `refreshMemoryFiles()`

**File:** `apps/web/src/components/secretary/plan/PlanCreationChat.vue`  
**Line:** 173  
**File:** `apps/web/src/stores/secretary.ts`  
**Lines:** ~1567 (store return block)

**What:** `PlanCreationChat.vue` calls `store.refreshMemoryFiles()` directly at line 173 when it receives a `memory_updated` SSE event. This bypasses the debounce in `scheduleMemoryRefresh`. During plan creation, the secretary store's SSE handler (`handleStreamEvent`) is ALSO processing the same `memory_updated` events via `scheduleMemoryRefresh`. Result: the debounced refresh AND a full immediate refresh run in parallel.

**Problem:** `scheduleMemoryRefresh` is currently a private function (not in the store's return object at lines 1540-1604). It needs to be exposed.

**Changes (two files):**

**(a) Expose `scheduleMemoryRefresh` in the store return:**

In `apps/web/src/stores/secretary.ts`, add `scheduleMemoryRefresh` to the return object. Add it after `refreshMemoryFiles` around line 1567:

```typescript
    refreshMemoryFiles,
    scheduleMemoryRefresh,   // <-- ADD THIS LINE
    updateMemoryFile,
```

**(b) Update PlanCreationChat.vue to use the debounced version:**

In `apps/web/src/components/secretary/plan/PlanCreationChat.vue`, change line 173:

```typescript
// BEFORE (lines 170-175):
    case 'memory_updated':
      planCreated.value = true
      // Refresh secretary store memory
      store.refreshMemoryFiles()
      scrollToBottom()
      break

// AFTER:
    case 'memory_updated':
      planCreated.value = true
      // Use debounced refresh — the secretary store's own SSE handler may also
      // be processing memory_updated events, so we avoid duplicate full fetches.
      store.scheduleMemoryRefresh()
      scrollToBottom()
      break
```

**Requests saved:** During plan creation (3-5 `memory_updated` events), this eliminates 3-5 full undebounced refreshes.

---

### Step 6: Increase debounce window from 120ms to 800ms

**File:** `apps/web/src/stores/secretary.ts`  
**Line:** 419

**What:** The `scheduleMemoryRefresh` debounce is 120ms. Multiple `memory_updated` events spaced 150ms+ apart each trigger separate fetches. Plan creation routinely emits 3-5 events over several seconds. A 120ms window collapses almost nothing.

**Why 800ms:** This is long enough to collapse multiple rapid `memory_updated` events (which often arrive 200-500ms apart during tool execution) but short enough that the user perceives updates as "instant" (well under 1 second after the last event).

**Change:** Change `120` to `800` on line 419.

```typescript
// Line 419, change:
  }, 120)
// to:
  }, 800)
```

**Requests saved:** Collapses 3-5 sequential fetches into 1.

---

### Step 7: Add concurrent request guard to `refreshMemoryFiles()`

**File:** `apps/web/src/stores/secretary.ts`  
**Lines:** ~149 (variable declarations area), 359-375 (function body)

**What:** If `refreshMemoryFiles()` is called while a previous call is still in-flight, both run simultaneously, wasting a request. Add a guard that deduplicates concurrent calls by reusing the in-flight promise.

**Changes:**

**(a) Add a guard variable after line 149 (after `pendingMemoryRefresh` declaration):**

```typescript
let memoryRefreshTimer: ReturnType<typeof setTimeout> | null = null
const pendingMemoryRefresh = new Set<string>()
let refreshMemoryFilesPromise: Promise<void> | null = null // <-- ADD THIS LINE
```

**(b) Wrap `refreshMemoryFiles()` body with the guard:**

```typescript
async function refreshMemoryFiles() {
  if (isDemoMode()) return
  // Deduplicate: if a refresh is already in-flight, reuse its promise
  if (refreshMemoryFilesPromise) return refreshMemoryFilesPromise

  refreshMemoryFilesPromise = (async () => {
    try {
      const res = await authFetch(`${SECRETARY_API}/memory`)
      if (!res.ok) {
        console.warn(`[Secretary] refreshMemoryFiles failed: ${res.status}`)
        return
      }
      const data = await res.json()
      memoryFiles.value = data.files || []
      parsePlanData()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to refresh memory files'
      console.warn(`[Secretary] ${msg}`)
    } finally {
      refreshMemoryFilesPromise = null
    }
  })()

  return refreshMemoryFilesPromise
}
```

**Requests saved:** Eliminates all concurrent duplicate full-refreshes (can save 1-3 per session depending on timing).

---

### Step 8: Bump rate limit default as safety net

**File:** `apps/api/src/config.ts`  
**Line:** 82

**What:** The hardcoded fallback is 150 req/min (line 82), but `.env.example` recommends 60. After all the above fixes, actual usage drops to ~18 req/min. Bump the code default to 200 to provide headroom for edge cases (rapid navigation, retries, multiple tabs).

**Change in config.ts line 82:**

```typescript
// BEFORE:
return parseInt(process.env.RATE_LIMIT_REQUESTS_PER_MINUTE || '150', 10)

// AFTER:
return parseInt(process.env.RATE_LIMIT_REQUESTS_PER_MINUTE || '200', 10)
```

**Change in `apps/api/.env.example` line 58:**

```bash
# BEFORE:
# Requests per minute per user
RATE_LIMIT_REQUESTS_PER_MINUTE=60

# AFTER:
# Requests per minute per user (default: 200 if unset; 100 is safe for normal use)
RATE_LIMIT_REQUESTS_PER_MINUTE=100
```

---

## Implementation Order and Dependencies

```
Step 1 (remove heartbeat from refresh)     -- independent, do first for biggest win
Step 2 (remove duplicate day-transition)   -- independent
Step 3 (remove post-chat refresh)          -- independent
Step 4 (remove double reflection refresh)  -- depends on Step 3 reasoning
Step 5 (PlanCreationChat debounce)         -- independent (modifies store return + .vue)
Step 6 (increase debounce to 800ms)        -- independent
Step 7 (concurrent guard)                  -- independent (apply after Step 1 since Step 1 changes the function body)
Step 8 (bump rate limit default)           -- independent, do last as safety net
```

**Recommended commit grouping:**

1. Steps 1 + 2 + 3 + 4 together (remove redundant calls -- one logical change)
2. Steps 5 + 6 together (debounce improvements)
3. Step 7 alone (concurrent guard -- structural change to function)
4. Step 8 alone (config change)

---

## Request Count Analysis

### Before (typical session: open Secretary + 3 chat messages with plan creation)

| Source                                                             | Requests | Notes                       |
| ------------------------------------------------------------------ | -------- | --------------------------- |
| `initialize()` day-transition                                      | 1        | Duplicate of App.vue        |
| `initialize()` GET /memory                                         | 1        | Needed                      |
| `initialize()` GET /heartbeat                                      | 1        | Needed (keep in initialize) |
| `initialize()` GET /threads                                        | 1        | Needed                      |
| `initialize()` GET /threads/:id                                    | 1        | Needed                      |
| App.vue day-transition                                             | 1        | Canonical                   |
| Per chat (x3): POST /chat                                          | 3        | Needed                      |
| Per chat (x3): refreshMemoryFiles (GET /memory + GET /heartbeat)   | 6        | Redundant                   |
| Per chat (x3): SSE memory_updated scheduleMemoryRefresh (2-3 each) | ~8       | Partially redundant         |
| Per chat (x3): loadThreads                                         | 3        | Needed                      |
| Per chat (x3): PATCH /threads/:id (once)                           | 1        | Needed                      |
| PlanCreationChat direct refreshMemoryFiles (3-5 events)            | ~4       | Bypasses debounce           |
| submitReflection double refresh                                    | 2        | Redundant                   |
| **Total**                                                          | **~45**  |                             |

### After

| Source                                                           | Requests   | Notes             |
| ---------------------------------------------------------------- | ---------- | ----------------- |
| `initialize()` GET /memory                                       | 1          | Kept              |
| `initialize()` GET /heartbeat                                    | 1          | Kept              |
| `initialize()` GET /threads                                      | 1          | Kept              |
| `initialize()` GET /threads/:id                                  | 1          | Kept              |
| App.vue day-transition                                           | 1          | Kept (canonical)  |
| Per chat (x3): POST /chat                                        | 3          | Kept              |
| Per chat (x3): SSE memory_updated debounced (collapsed by 800ms) | ~3         | 1 per message     |
| Per chat (x3): loadThreads                                       | 3          | Kept              |
| Per chat (x3): PATCH /threads/:id (once)                         | 1          | Kept              |
| PlanCreationChat scheduleMemoryRefresh (debounced)               | ~1         | Collapsed from ~4 |
| submitReflection                                                 | 0 extra    | SSE handles it    |
| **Total**                                                        | **~16-18** |                   |

**Net reduction: ~60% fewer requests.**

---

## Functions NOT to touch (legitimate refreshMemoryFiles calls)

These calls are correct and must be preserved:

1. **Line 735 -- `prepareTomorrow()`**: This function's SSE handler only checks for `error` events, not `memory_updated`. The post-stream `refreshMemoryFiles()` is the only way to pick up the new Tomorrow.md file.

2. **Line 756 -- `approveTomorrow()`**: This is a plain POST (no SSE streaming at all). The refresh is the only mechanism to update the UI.

3. **Lines 318-331 -- `initialize()`**: The initial `GET /memory` is the bootstrap fetch. Essential.

---

## Testing Checklist

1. **Open Secretary panel** -- memory files load correctly, no 429 errors
2. **Send a chat message** -- memory files update via SSE events (watch network tab: should see individual file fetches, NOT a full `/memory` fetch after streaming ends)
3. **Send 3 messages rapidly** -- no 429 errors, debounce collapses refreshes
4. **Create a plan via PlanCreationChat** -- plan appears in sidebar after creation, memory files update without 429
5. **Submit a reflection** -- mood/notes saved, memory files update (single pass, not double)
6. **Click "Prepare Tomorrow"** -- tomorrow plan generates and appears (this still uses full refresh, correct)
7. **Click "Approve Tomorrow"** -- plan moves to today (this still uses full refresh, correct)
8. **Open app cold (not on Secretary page)** -- day-transition fires once from App.vue (check network tab)
9. **Navigate to Secretary after cold open** -- day-transition does NOT fire again from initialize()
10. **Stress test: open 2 browser tabs** -- rate limit should not be hit with 200 req/min default
