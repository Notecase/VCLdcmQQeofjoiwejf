# Fix: Course Generation — Duplicate Batch Calls, 103% Progress, UI Stuck

**Date**: 2026-02-07
**Status**: Ready for implementation

---

## Context

After fixing the `run_deep_research` duplicate bug, the course generation pipeline still has 3 related bugs that compound into the user-visible symptoms: **103% progress bar**, **UI stuck on "Generating Content"**, and **wasted Gemini API calls**.

From the backend logs:
```
[batch_generate_lessons] Starting: 13 lessons      ← 1st call
[batch_generate_lessons] Lessons complete: 12/13    ← 1 error
[batch_generate_lessons] Starting: 13 lessons      ← 2nd call (LLM retried!)
[batch_generate_lessons] Lessons complete: 11/13    ← 2 errors
```

The LLM orchestrator retries `batch_generate_lessons` because the first call returned "12/13 generated. Errors: 1", which the LLM interprets as "incomplete, retry". The shared `completedLessons` counter increments across both runs (12 + 11 + 4 quizzes + 3 slides = 30 total, but `totalLessons` = 20), producing progress of 103%.

---

## 4 Bugs, 3 Files

### Bug 1: Batch tools lack synchronous guards

**Same pattern as the already-fixed `researchStarted`/`indexStarted` flags.** The three batch tool factories (`createLessonWriterTools`, `createQuizWriterTools`, `createSlidesWriterTools`) have no boolean flag to prevent re-execution.

- `course-tools.ts:535` — `createLessonWriterTools`: no guard
- `course-tools.ts:661` — `createQuizWriterTools`: no guard
- `course-tools.ts:784` — `createSlidesWriterTools`: no guard

### Bug 2: Frontend progress exceeds 100%

The `onContentProgress` handler (`course.ts:186-190`) computes:
```typescript
generationProgress.value = 65 + Math.round(((data.lessonIndex + 1) / data.totalLessons) * 25)
```

With double-counted `completedLessons` (30 completed, 20 total):
`65 + Math.round((30/20) * 25) = 65 + 38 = 103%`

Two sub-issues:
- No `Math.min` clamp to prevent exceeding 100
- No `>=` monotonic guard (unlike `onProgress` at line 169), so it can also jump backward

### Bug 3: `onComplete` doesn't finalize UI state

`onComplete` (`course.ts:193-201`) sets `isGenerating = false` but doesn't:
- Set `generationStage = 'complete'` (stays at `'content'`)
- Set `generationProgress = 100` (stays at 103)
- Clear `generationThinking = ''` ("AI is thinking..." stays visible)

### Bug 4: Duplicate `complete` event

- `save_to_supabase` tool emits `complete` (`course-tools.ts:453`)
- Orchestrator also emits `complete` after stream ends (`orchestrator.ts:400`)
- Frontend `onComplete` fires twice, double-fetching course data

---

## Fixes

### Fix 1: Guard flags on batch tools

**File: `packages/ai/src/agents/course/course-tools.ts`**

Add `lessonsStarted`, `quizzesStarted`, `slidesStarted` flags — same pattern as existing `researchStarted` (line 91).

**a) `createLessonWriterTools` (line 535):**
```typescript
export function createLessonWriterTools(ctx: CourseToolContext): StructuredToolInterface[] {
  let lessonsStarted = false                        // NEW
  return [
    tool(
      async () => {
        if (lessonsStarted) {                       // NEW
          console.log('[batch_generate_lessons] SKIPPED — already started')
          return 'Lesson generation already in progress or completed. Do NOT retry. Proceed to quiz generation.'
        }
        lessonsStarted = true                       // NEW
        const outline = ctx.approvedOutline.value
        // ... rest unchanged
```

**b) `createQuizWriterTools` (line 661):**
```typescript
export function createQuizWriterTools(ctx: CourseToolContext): StructuredToolInterface[] {
  let quizzesStarted = false                        // NEW
  return [
    tool(
      async () => {
        if (quizzesStarted) {                       // NEW
          console.log('[batch_generate_quizzes] SKIPPED — already started')
          return 'Quiz generation already in progress or completed. Do NOT retry. Proceed to slides generation.'
        }
        quizzesStarted = true                       // NEW
        const outline = ctx.approvedOutline.value
        // ... rest unchanged
```

**c) `createSlidesWriterTools` (line 784):**
```typescript
export function createSlidesWriterTools(ctx: CourseToolContext): StructuredToolInterface[] {
  let slidesStarted = false                         // NEW
  return [
    tool(
      async () => {
        if (slidesStarted) {                        // NEW
          console.log('[batch_generate_slides] SKIPPED — already started')
          return 'Slides generation already in progress or completed. Do NOT retry. Proceed to video matching and assembly.'
        }
        slidesStarted = true                        // NEW
        const outline = ctx.approvedOutline.value
        // ... rest unchanged
```

### Fix 2: Clamp frontend progress

**File: `apps/web/src/stores/course.ts`**

**a) `onProgress` handler (line 166-172) — add `Math.min` clamp:**
```typescript
onProgress: (progress) => {
  generationStage.value = progress.stage
  const clamped = Math.min(progress.overallProgress, 100)
  if (clamped >= generationProgress.value) {
    generationProgress.value = clamped
  }
  generationThinking.value = progress.thinkingOutput
},
```

**b) `onContentProgress` handler (line 186-190) — add clamp + monotonic guard:**
```typescript
onContentProgress: (data) => {
  generationStage.value = 'content'
  if (data.totalLessons > 0) {
    const progress = Math.min(65 + Math.round(((data.lessonIndex + 1) / data.totalLessons) * 25), 90)
    if (progress >= generationProgress.value) {
      generationProgress.value = progress
    }
  }
},
```

Clamped to 90 (not 100) because the content phase maps to 65-90%, leaving room for assembly/save stages.

### Fix 3: Finalize UI state in `onComplete`

**File: `apps/web/src/stores/course.ts`** (line 193-201)

```typescript
onComplete: async (data) => {
  generationCourseId.value = data.courseId
  generationStage.value = 'complete'       // NEW
  generationProgress.value = 100           // NEW
  generationThinking.value = ''            // NEW
  isGenerating.value = false
  isAwaitingApproval.value = false
  await fetchCourse(data.courseId)
  await fetchCourses()
},
```

Order matters: set stage/progress/thinking BEFORE `isGenerating = false` so any reactive renders between these lines show "Complete" at 100%.

### Fix 4: Remove duplicate `complete` event

**File: `packages/ai/src/agents/course/orchestrator.ts`** (line 400)

```typescript
// BEFORE (lines 400-401):
eventQueue.push({ event: 'complete', data: { courseId: input.courseId } })
eventQueue.push({ event: 'done' })

// AFTER:
eventQueue.push({ event: 'done' })
```

The `save_to_supabase` tool's `complete` event is the authoritative one (fires when the save succeeds). The orchestrator's `done` event signals end-of-stream. Removing the duplicate prevents `onComplete` from firing twice.

---

## Files Summary

| File | Changes |
|------|---------|
| `packages/ai/src/agents/course/course-tools.ts` | Add 3 guard flags: `lessonsStarted`, `quizzesStarted`, `slidesStarted` |
| `apps/web/src/stores/course.ts` | Clamp progress, add monotonic guard, finalize state in `onComplete` |
| `packages/ai/src/agents/course/orchestrator.ts` | Remove duplicate `complete` event (line 400) |

**No changes to:** `deep-research.ts`, `course.service.ts`, `CourseGeneratorView.vue`, prompts, types, DB schema

---

## Verification

1. `pnpm build && pnpm typecheck` — must pass
2. Run course generation end-to-end
3. Confirm only ONE `[batch_generate_lessons] Starting:` log (no duplicates)
4. Confirm progress bar never exceeds 100%
5. Confirm pipeline sidebar reaches "Complete" stage
6. Confirm "AI is thinking..." clears on completion
7. Confirm network tab shows only one `fetchCourse` call after completion
