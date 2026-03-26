# Fix: Secretary Tomorrow→Today Automatic Rollover (Death Spiral Bug)

**Date:** 2026-03-25

## Context

The Secretary dashboard shows "No tasks scheduled for today" even though Tomorrow.md contains an approved plan dated 2026-03-25 (today). The automatic "tomorrow becomes today" transition is broken because `performDayTransition()` has early-return paths that prevent it from ever checking Tomorrow.md when Today.md is empty or has no date — and the function itself writes dateless empty templates, creating a permanent stuck state.

**User impact:** Every morning, the approved tomorrow plan fails to auto-promote. The user sees an empty Today with their plan stuck in Tomorrow.

## Root Cause

`performDayTransition()` in `packages/ai/src/agents/secretary/memory.ts:635-692` has two early-return paths:

1. **Line 639-641**: `if (!todayFile || !todayFile.content.trim()) return` — empty Today.md → never checks Tomorrow.md
2. **Line 645-647**: `if (!dateMatch) return` — dateless Today.md → never checks Tomorrow.md

AND the same function writes dateless templates at lines 676, 679, 684:

```
`# Today's Plan\n\n*No tasks scheduled yet.*\n`  ← NO DATE
```

**Death spiral:** Transition writes dateless template → next transition can't extract date → returns early → Tomorrow.md is stuck forever.

The heartbeat (`supabase/functions/heartbeat/`) has the same two bugs:

- `checks.ts:170`: `if (!dateMatch) return false` — dateless Today.md is never considered stale
- `actions.ts:102-175`: Archives Today.md but NEVER promotes Tomorrow.md and NEVER clears Today.md

## Plan

### Step 1: Fix `performDayTransition()` in memory.ts

**File:** `packages/ai/src/agents/secretary/memory.ts` (lines 635-692)

Restructure to remove the two early returns. New logic:

1. Extract date from Today.md (may be null)
2. If date matches today → return early (correct no-op, only valid early return)
3. If Today.md has content WITH a stale date → archive it normally
4. **ALWAYS check Tomorrow.md for promotion** (the core fix — no longer gated behind Today.md having a date)
5. All empty template writes include the date: `# Today's Plan — ${todayDate}\n\n*No tasks scheduled yet.*\n`

Key change: The Tomorrow.md promotion block (lines 667-685) moves OUTSIDE the "Today.md has a date" guard. The only early return that remains is `todayFileDate === todayDate`.

### Step 2: Add test cases for death spiral scenarios

**File:** `packages/ai/src/agents/secretary/memory.activation.test.ts`

Add 3 tests using the existing `TestableMemoryService` class (line 359):

1. **Empty Today.md + valid Tomorrow.md** → should promote Tomorrow.md to Today.md
2. **Dateless template Today.md + valid Tomorrow.md** → should promote (exact user scenario)
3. **Dateless template Today.md + no Tomorrow.md** → should write dated empty template (breaks the death spiral)

### Step 3: Fix heartbeat `checkStaleTodayMd()`

**File:** `supabase/functions/heartbeat/checks.ts` (lines 155-174)

Change both early returns to return `true` instead of `false`:

- `if (!data?.content) return true` — no content = stale
- `if (!dateMatch) return true` — no date = stale (death spiral state)

### Step 4: Fix heartbeat `archiveStaleTodayMd()`

**File:** `supabase/functions/heartbeat/actions.ts` (lines 102-175)

Two changes:

1. Add Tomorrow.md promotion logic (mirror what `memory.ts` does but via direct Supabase queries)
2. Write Carryover.md instead of appending to Tomorrow.md (prevents corrupting Tomorrow.md before promotion)
3. Handle empty/dateless Today.md without early-returning
4. All empty template writes include date

### Step 5: Validate

```bash
pnpm test:run packages/ai/src/agents/secretary/memory.activation.test.ts
pnpm build && pnpm typecheck && pnpm lint && pnpm test:run
```

Then manually test: open Secretary dashboard and verify Today.md gets populated from Tomorrow.md.

## Files to Modify

| File                                                         | Change                                                                                  |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `packages/ai/src/agents/secretary/memory.ts`                 | Restructure `performDayTransition()` — remove 2 early returns, always check Tomorrow.md |
| `packages/ai/src/agents/secretary/memory.activation.test.ts` | Add 3 death-spiral test cases                                                           |
| `supabase/functions/heartbeat/checks.ts`                     | `checkStaleTodayMd()` returns `true` for empty/dateless                                 |
| `supabase/functions/heartbeat/actions.ts`                    | Add Tomorrow.md promotion, fix carryover target, dated templates                        |

## Existing Utilities to Reuse

- `getTodayDate(timezone)` from `@inkdown/shared/secretary/date-utils.ts` — already used throughout
- `TestableMemoryService` class at `memory.activation.test.ts:359` — for new tests
- `DayTransitionResult` type from `@inkdown/shared/types/secretary.ts:372` — no changes needed (archivedDate is already optional)
