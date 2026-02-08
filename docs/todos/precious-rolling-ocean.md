# Fix: Course Generation "Connection Lost" at 99%

## Context

After implementing SSE heartbeat + `extractJSON()` fixes, course generation now reaches 99% (all content generated, assembly done), but the frontend shows **"Connection lost. Generation may still be running."** even though the backend completes successfully.

The user's logs show all 18 lessons, 5 quizzes, 4 slides generated, then `save_to_supabase` starts (`[saveCourseToSupabase] Updating course d23871cf...`) but the "updated successfully" / "saved successfully" logs never appear before a status poll arrives — proving the SSE stream dropped during the save operation.

## Root Cause Analysis

### Issue 1 (PRIMARY): No data flows during `saveCourseToSupabase`

`save_to_supabase` emits progress at 99%, then calls `saveCourseToSupabase()` which does **30+ sequential Supabase inserts** (1 course update + N modules + M lessons) over 5-30 seconds. During this time, **zero events** are pushed to the SSE event queue. The 15-second heartbeat is the only keepalive, which may not be sufficient to prevent connection drops.

**Evidence**: Backend log shows `[saveCourseToSupabase] Updating course...` followed immediately by a status poll — meaning the frontend already detected the disconnect.

### Issue 2: `onError` fires before `onDone`, corrupting recovery

When the stream ends without a terminal event (`course.service.ts:221-225`):
1. `onError({ message: 'Connection lost...', stage: 'research' })` fires — sets `generationError`, `isGenerating = false`
2. `onDone()` fires — polls thread status for recovery

But `onError` already set the error state. Even if `onDone` successfully recovers (finds `progress >= 99`), it **never clears `generationError`** — so the error banner stays visible.

### Issue 3: `onDone` polls once with no retry delay

The store's `onDone` fallback (`course.ts:265-307`) polls `getThreadStatus()` **once, immediately**. If the backend hasn't finished saving and committed the `progress = 99` DB update, the poll returns stale data (`progress < 99`), and recovery fails.

### Issue 4: Hardcoded `stage: 'research'` in connection-loss error

`course.service.ts:223` sends `stage: 'research'` for the connection-loss error. The actual stage at 99% is `'saving'`.

## Plan

### Step 1: Emit progress during `saveCourseToSupabase`

**File:** `packages/ai/src/agents/course/tools.ts` (lines 119-184)

Add an optional `onProgress` callback parameter:

```typescript
export async function saveCourseToSupabase(
  course: Course,
  modules: CourseModule[],
  supabase: any,
  onProgress?: (info: { modulesCompleted: number; totalModules: number }) => void,
): Promise<void> {
```

Add counter and call after each module+lessons batch:

```typescript
let modulesCompleted = 0
for (const mod of modules) {
  // ... existing module insert ...
  for (const lesson of mod.lessons) {
    // ... existing lesson insert ...
  }
  modulesCompleted++
  onProgress?.({ modulesCompleted, totalModules: modules.length })
}
```

### Step 2: Wire progress callback in `save_to_supabase` tool

**File:** `packages/ai/src/agents/course/course-tools.ts` (lines 497-498)

Pass `onProgress` to emit SSE events during the save:

```typescript
await saveCourseToSupabase(
  ctx.assembledCourse.value,
  ctx.generatedModules.value,
  ctx.supabase,
  ({ modulesCompleted, totalModules }) => {
    ctx.emitEvent({
      type: 'thinking',
      data: `Saving module ${modulesCompleted}/${totalModules} to database...`,
    })
  },
)
```

### Step 3: Backend sends explicit `done` after `for await` loop

**File:** `apps/api/src/routes/course.ts` (after line 312, before catch)

After the loop exits normally, write a `done` event as defense-in-depth:

```typescript
// After the for-await loop closes (line 312)
try {
  await stream.writeSSE({ event: 'done', data: JSON.stringify({ event: 'done' }) })
} catch {
  // Stream may already be closed
}
```

### Step 4: Fix frontend connection-loss handling

**File:** `apps/web/src/services/course.service.ts` (lines 220-225)

Remove `onError` call for connection loss. Let `onDone` handle recovery:

```typescript
if (!receivedTerminalEvent) {
  console.warn('[Course Service] SSE stream ended without terminal event — delegating to onDone')
  callbacks.onDone?.()
}
```

### Step 5: Improve `onDone` fallback with retry polling

**File:** `apps/web/src/stores/course.ts` (lines 265-307)

Replace the single-poll `onDone` with retry logic:
- Initial 2-second delay (gives backend time to commit)
- Up to 3 poll attempts, 3 seconds apart
- Clear `generationError` on successful recovery
- Check for `status === 'error'` to report backend errors immediately

### Step 6: Add `'saving'` and `'assembly'` to `GenerationStageType`

**File:** `packages/shared/src/types/course.ts` (line 107-116)

The backend already emits `stage: 'saving'` and `stage: 'assembly'` but these aren't in the union type. Add them:

```typescript
export type GenerationStageType =
  | 'research'
  | 'indexing'
  | 'analysis'
  | 'planning'
  | 'approval'
  | 'content'
  | 'multimedia'
  | 'saving'
  | 'assembly'
  | 'review'
  | 'complete'
```

### Step 7: Track `lastKnownStage` in route handler

**File:** `apps/api/src/routes/course.ts` (line 247 and 319)

Add `let lastKnownStage = 'research'` before the `for await` loop. Update it from progress events. Use it in the catch block instead of hardcoded `'research'`.

## Files to Modify

| # | File | Change |
|---|------|--------|
| 1 | `packages/shared/src/types/course.ts` | Add `'saving'` and `'assembly'` to `GenerationStageType` |
| 2 | `packages/ai/src/agents/course/tools.ts` | Add `onProgress` callback to `saveCourseToSupabase` |
| 3 | `packages/ai/src/agents/course/course-tools.ts` | Wire `onProgress` to emit thinking events during save |
| 4 | `apps/api/src/routes/course.ts` | Track `lastKnownStage`, send explicit `done`, fix stage in catch |
| 5 | `apps/web/src/services/course.service.ts` | Remove `onError` from connection-loss, call only `onDone` |
| 6 | `apps/web/src/stores/course.ts` | Retry polling in `onDone`, clear error on recovery |

## Verification

1. Generate a course (e.g., "Beginner Python") — should complete end-to-end without "Connection lost"
2. Console should show `Saving module X/Y...` thinking events during the save phase
3. If the stream drops (kill the SSE tab), the fallback should recover after 2-11 seconds (retry polling)
4. The progress bar should not get stuck — it should reach 100% and show the completed course
5. No stale error banners after successful recovery
