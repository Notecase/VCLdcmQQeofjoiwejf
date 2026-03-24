# Fix: Secretary Tomorrow Plan Not Transitioning to Today

## Context

When a user generates and approves a plan for tomorrow via the secretary system, the plan stays in Tomorrow.md and does **not** automatically become Today.md when the next day arrives. The user expects that an approved tomorrow plan becomes their active today plan the following morning.

## Root Cause Analysis

The day transition logic in `performDayTransition()` (`packages/ai/src/agents/secretary/memory.ts:635-689`) works correctly **in principle**, but has two issues preventing reliable transition:

### Issue 1: Transition Only Runs on User Interaction (Primary)

`performDayTransition()` is called in only two places:

1. **Frontend store mount** — `apps/web/src/stores/secretary.ts:310` calls `POST /day-transition` when the secretary store initializes
2. **Agent context load** — `memory.ts:324` calls it inside `getFullContext()` when the secretary agent runs

**No background job exists.** If the user doesn't open the calendar page or interact with the secretary after midnight, the transition never fires. The heartbeat infrastructure (`supabase/migrations/021_heartbeat.sql`) has tables but no deployed edge function or cron job.

### Issue 2: Timezone Mismatch Risk (Secondary)

The transition compares dates using the timezone from:

- **Frontend**: `X-Timezone` header from the browser (e.g., `Asia/Ho_Chi_Minh`)
- **Default fallback**: `America/New_York` in the date utility

If the timezone isn't passed correctly (e.g., missing header), the date comparison `tomorrowDateMatch[1] === todayDate` at line 669 could fail because:

- Tomorrow.md was generated with `Asia/Ho_Chi_Minh` date (e.g., "2026-03-25")
- But `getTodayDate()` falls back to `America/New_York` (where it's still "2026-03-24")

### The Transition Logic (for reference)

```
performDayTransition():
1. todayDate = getTodayDate(timezone)
2. Read Today.md, extract embedded date
3. If Today.md date === todayDate → no-op (already current)
4. If Today.md date ≠ todayDate:
   a. Archive Today.md → History/<old-date>.md
   b. Save incomplete tasks → Carryover.md
   c. Read Tomorrow.md, extract embedded date
   d. If Tomorrow.md date === todayDate → promote to Today.md ✅
   e. If Tomorrow.md date ≠ todayDate → clear both, blank Today.md ❌
```

Step 4e is the critical failure path — if there's a timezone mismatch or if Tomorrow.md contains a date that's **not today** (e.g., it was generated 2 days ago for a date that has now passed), the plan is **discarded** instead of promoted.

## Fix Plan

### Step 1: Ensure day-transition runs on every app load (not just secretary page)

**File**: `apps/web/src/App.vue` or a global initialization composable

Currently, day-transition only runs when the secretary store mounts (only on `/calendar` page). Move it to run on app startup so any page load triggers the transition.

**Change**: In the secretary store's `initialize()`, make the day-transition call happen eagerly. Or better — add a lightweight global check that runs on app mount.

### Step 2: Fix the timezone propagation

**File**: `apps/web/src/stores/secretary.ts`

Verify that `TIMEZONE_HEADERS` is correctly constructed and always passes the browser's timezone:

```ts
const TIMEZONE_HEADERS = { 'X-Timezone': Intl.DateTimeFormat().resolvedOptions().timeZone }
```

**File**: `packages/ai/src/agents/secretary/memory.ts`

In `performDayTransition()`, log the timezone and dates being compared for debugging.

### Step 3: Make promotion more lenient (key fix)

**File**: `packages/ai/src/agents/secretary/memory.ts` — `performDayTransition()` (line 667-678)

Current logic at line 669 requires an **exact date match** between Tomorrow.md's embedded date and today's date. This fails if:

- The plan was generated 2+ days ago for a date that has now passed
- There's any timezone-related date drift

**Change**: Instead of requiring `tomorrowDateMatch[1] === todayDate`, use a more lenient check:

- If Tomorrow.md's date ≤ todayDate AND the plan is marked "Approved" → promote it
- If Tomorrow.md's date > todayDate → keep it (it's for a future date)

```ts
// Current (strict — fails on date drift):
if (tomorrowDateMatch && tomorrowDateMatch[1] === todayDate) {

// Proposed (lenient — promotes any ready plan for today or past):
if (tomorrowDateMatch && tomorrowDateMatch[1] <= todayDate) {
```

This string comparison works because dates are in YYYY-MM-DD format (lexicographic ordering matches chronological ordering).

### Step 4: Add a cron-based day transition (optional but recommended)

**File**: `vercel.json` or Railway cron — or Supabase edge function

Create a lightweight cron job that calls `POST /api/secretary/day-transition` for all users with active plans. This ensures plans transition even if the user doesn't open the app.

This is a larger change and can be done as a follow-up.

## Critical Files

| File                                                         | Change                                                                |
| ------------------------------------------------------------ | --------------------------------------------------------------------- |
| `packages/ai/src/agents/secretary/memory.ts`                 | Fix promotion logic in `performDayTransition()` (line 669)            |
| `apps/web/src/stores/secretary.ts`                           | Verify timezone headers, consider running transition on any page load |
| `packages/ai/src/agents/secretary/memory.activation.test.ts` | Add/update tests for day transition edge cases                        |

## Verification

1. **Unit test**: Create a test in `memory.activation.test.ts` that:
   - Sets Today.md with yesterday's date
   - Sets Tomorrow.md with today's date + "Approved" status
   - Calls `performDayTransition()`
   - Asserts Today.md now contains Tomorrow.md's content
   - Asserts Tomorrow.md is cleared

2. **Unit test for date drift**: Test where Tomorrow.md has a date that's 2 days old (user didn't open app for 2 days) → should still promote

3. **Manual test**: Generate tomorrow plan → approve it → wait for next day (or modify system time) → open app → verify today plan shows the promoted content

## Existing Utilities to Reuse

- `getTodayDate(timezone)` / `getTomorrowDate(timezone)` — `packages/shared/src/secretary/date-utils.ts`
- `parseDailyPlanMarkdown()` — existing parser
- `MemoryService.readFile()` / `writeFile()` — existing CRUD
- `memory.activation.test.ts` — existing test file with `FakeMemoryService` helper
