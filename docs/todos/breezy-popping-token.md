# Fix Course List Rendering + Navigation Bugs

**Date:** 2026-02-08

## Context

The course system has three interconnected bugs:

1. `/courses` shows "24 courses" in the header but the grid is **completely empty**
2. Clicking "+ New Course" changes URL to `/courses/generate` but the **view doesn't switch** (requires page refresh)
3. Going back from the generate page to courses shows no courses

All three trace to a **single root cause**: the API returns Supabase rows with **snake_case** column names (`estimated_hours`, `learning_objectives`, etc.), but the frontend TypeScript types and Vue components expect **camelCase** (`estimatedHours`, `learningObjectives`, etc.). There is **no transformation layer** anywhere in the pipeline.

## Root Cause Analysis

### Bug 1: Empty course grid

- `GET /api/course/list` (line 640) SELECTs: `id, title, topic, description, difficulty, estimated_hours, status, progress, created_at, updated_at, generated_at`
- It does **NOT** select `learning_objectives` or `prerequisites`
- `CourseCard.vue` line 69 accesses `course.learningObjectives.length`
- `learningObjectives` is `undefined` (field not in response + snake_case mismatch)
- `undefined.length` throws **TypeError**, crashing each CourseCard's render
- Vue renders crashed components as empty — grid appears blank
- Header shows "24 courses" because `courseStore.courses.length` still works

### Bug 2: Navigation doesn't update UI

- The TypeError crashes from CourseCard during rendering corrupt Vue 3's reactive scheduler
- `router.push()` updates the URL via History API, but the router-view component swap never executes
- Page refresh works because it creates a fresh Vue instance without rendering corruption

### Bug 3: Going back shows no courses

- Same as Bug 1 — cards crash on render after `fetchCourses()` populates the store

## Fix Plan

### Step 1: Add missing columns to `/list` API endpoint

**File:** `apps/api/src/routes/course.ts` (lines 620, 640)

Both `GET /` and `GET /list` handlers have identical SELECTs missing `learning_objectives` and `prerequisites`. Add them:

```
Before: .select('id, title, topic, description, difficulty, estimated_hours, status, progress, created_at, updated_at, generated_at')
After:  .select('id, title, topic, description, difficulty, estimated_hours, learning_objectives, prerequisites, status, progress, created_at, updated_at, generated_at')
```

### Step 2: Add snake_case → camelCase mappers in course service

**File:** `apps/web/src/services/course.service.ts`

Add three mapping functions after the imports (~line 22):

- `mapCourseFromApi(raw)` — maps snake_case Course fields to camelCase with sensible defaults (`learningObjectives ?? []`, `estimatedHours ?? 0`, etc.)
- `mapModuleFromApi(raw)` — maps `course_id` → `courseId`, maps nested `lessons` array
- `mapLessonFromApi(raw)` — maps `module_id` → `moduleId`, `completed_at` → `completedAt`

These are **specific mappers** (not generic recursive snake→camel) to avoid accidentally transforming JSONB blobs like `content` or `settings` that should stay as-is.

Add `Lesson` to the existing type imports from `@inkdown/shared/types`.

### Step 3: Apply mappers in fetch functions

**File:** `apps/web/src/services/course.service.ts`

**`fetchCourses()`** (~line 282): Apply `mapCourseFromApi` to each item:

```typescript
const rawCourses = (result.courses ?? result) as Array<Record<string, unknown>>
return rawCourses.map(mapCourseFromApi)
```

**`fetchCourse()`** (~line 296): Apply mappers to course and modules:

```typescript
const raw = await response.json()
return {
  course: mapCourseFromApi(raw.course),
  modules: (raw.modules ?? []).map(mapModuleFromApi),
}
```

### Step 4: Add defensive null checks in CourseCard

**File:** `apps/web/src/components/course/list/CourseCard.vue`

Belt-and-suspenders safety even though mappers guarantee defaults:

- Line 65: `{{ course.estimatedHours ?? 0 }}h`
- Line 69: `{{ (course.learningObjectives ?? []).length }} objectives`

## Files Changed

| File                                                 | Change                                                               | Impact                 |
| ---------------------------------------------------- | -------------------------------------------------------------------- | ---------------------- |
| `apps/api/src/routes/course.ts`                      | Add `learning_objectives, prerequisites` to SELECT (lines 620, 640)  | 2 lines                |
| `apps/web/src/services/course.service.ts`            | Add mapper functions + apply in `fetchCourses()` and `fetchCourse()` | ~60 new + ~10 modified |
| `apps/web/src/components/course/list/CourseCard.vue` | Defensive null guards (lines 65, 69)                                 | 2 lines                |

## What This Does NOT Change

- **Generation SSE pipeline** — orchestrator already emits camelCase events
- **OutlineReview / OutlineEditor** — receive data from SSE stream (already camelCase)
- **Course types** (`packages/shared/src/types/course.ts`) — no changes needed
- **Store logic** (`apps/web/src/stores/course.ts`) — no changes needed (already uses camelCase)

## Verification

1. Load `/courses` — cards render with correct hours and objective counts
2. Click "+ New Course" — view switches to CourseGeneratorView without requiring refresh
3. Press browser back from generate page — course list re-renders with cards
4. Click a course card — navigates to course viewer, content loads correctly
5. `pnpm typecheck` passes
6. `pnpm build` succeeds
