# Demo Polish — UI Fixes, Content Reset, Banner Removal

## Context

The Noteshell demo is the first thing potential users see. It currently works (password gate → in-memory notes → resets on refresh) but has UI rough edges and incomplete demo state. This plan addresses 3 UI fixes, 3 demo behavior fixes, and a Vercel deployment — all minimal, targeted changes.

---

## Task A1: Fix Memory Files Sidebar Spacing

**File:** `apps/web/src/components/secretary/MemoryFileList.vue`

The left-edge spacing between file names and the screen edge is too tight (8–10px). Widen padding on all sidebar elements.

| Selector | Current | New |
|---|---|---|
| `.memory-file-list` | `padding: 8px 0` | `padding: 8px 0 8px 8px` |
| `.list-title` | `padding: 0 8px` | `padding: 0 16px` |
| `.file-item` | `padding: 8px 10px` | `padding: 8px 16px` |
| `.history-divider` | `margin: 6px 8px` | `margin: 6px 16px` |

---

## Task A2: Fix Course Generation Timeline Background

**File:** `apps/web/src/views/CourseGeneratorView.vue`

The `.generator-timeline` panel uses a semi-transparent glass background that's lighter than the main app background. Change to solid dark to match.

| Property | Current | New |
|---|---|---|
| `border-right` | `var(--glass-border, rgba(255,255,255,0.1))` | `var(--border-color, #333338)` |
| `background` | `var(--glass-bg, rgba(30,30,30,0.6))` | `var(--app-bg, #010409)` |
| `backdrop-filter` | `blur(var(--glass-blur, 12px))` | **remove line** |

This makes it match `.generator-content-tree` (line 479–488) which already uses `var(--app-bg)`.

---

## Task A3: Fix "Back to Courses" Button Size

**File:** `apps/web/src/views/CourseGeneratorView.vue`

The `.back-btn` in the generator view is slightly oversized vs the lesson canvas version. Match the compact `CourseView.vue` style.

| Property | Generator (current) | CourseView (target) |
|---|---|---|
| `padding` | `6px 10px` | `5px 10px` |
| `font-size` | `13px` | `12px` |

Change lines 401 and 406 in `CourseGeneratorView.vue`. No changes to `CourseView.vue`.

---

## Task B1: Enable In-Memory Edits for Demo Memory Files

**File:** `apps/web/src/stores/secretary.ts`

**Problem:** `updateMemoryFile()` (line 265) has `if (isDemoMode()) return` which silently drops all edits. Users can't save changes to memory files, and task status changes in the schedule don't reflect in Today.md content.

**Fix:** Replace the early return with an in-memory update:

```typescript
async function updateMemoryFile(filename: string, content: string) {
  if (isDemoMode()) {
    const idx = memoryFiles.value.findIndex((f) => f.filename === filename)
    if (idx >= 0) {
      memoryFiles.value[idx] = {
        ...memoryFiles.value[idx],
        content,
        updatedAt: new Date().toISOString(),
      }
    }
    parsePlanData()
    notifications.success('File saved successfully')
    return
  }
  // ... rest unchanged
```

Edits persist in memory during the session. On refresh, fixtures reload from `demo-secretary.ts`.

---

## Task B2: Add Carryover.md + Keep Existing Content

**File:** `apps/web/src/data/demo-secretary.ts`

Add a `CARRYOVER_MD` constant with realistic carried-over task content and include it in the `DEMO_MEMORY_FILES` array:

```typescript
const CARRYOVER_MD = `# Carryover — Sat 08 Feb 2026

## Incomplete Tasks
- [ ] Finish MDP value iteration coding exercise (RL Day 4)
- [ ] Review OpenClaw installation notes

## Reason
Saturday was a lighter schedule day. MDP coding exercise took longer than expected — the convergence threshold needed tuning. Deferred to Sunday session.

## Action
- MDP exercise rolled into today's first study block
- OpenClaw notes review merged into tomorrow's session
`
```

Add to array: `memoryFile('mem-carryover', 'Carryover.md', CARRYOVER_MD)`. Files sort alphabetically, so Carryover.md will slot between AI.md and Plan.md.

---

## Task B3: Reset Both Demo Courses to 0% Progress

**File:** `apps/web/src/data/demo-courses.ts`

Reset the OpenClaw course (currently 25% complete) so all lessons are unmarked:

- **Course-level:** `progress: 25` → `progress: 0`
- **Module 1 (oc-m1):** `status: 'completed'` → `'available'`, `progress: 100` → `0`
- **Module 1 lessons (oc-m1-l1, l2, l3):** `status: 'completed'` → `'available'`, remove `completedAt`
- **Module 2 (oc-m2):** `status: 'in_progress'` → `'available'`, `progress: 50` → `0`
- **Module 2 lessons (oc-m2-l1, l2):** `status: 'completed'` → `'available'`, remove `completedAt`

Scaling Laws is already at 0%. Course lesson completion already works in demo mode — `completeLesson()` (course.ts:526) toggles status locally without API calls.

---

## Task B4: Remove Demo Banner

**File:** `apps/web/src/App.vue`

Remove entirely:
- **Template:** Delete the `<div v-if="inDemoMode" class="demo-banner">` block (lines 26–32)
- **Script:** Remove `import { isDemoMode } from './utils/demo'` and `const inDemoMode = computed(() => isDemoMode())`
- **Styles:** Delete `.demo-banner` and `.demo-banner a` CSS rules

`isDemoMode` is still used in stores/views — only the App.vue references are removed.

---

## Task C1: Deploy to Vercel

After all changes are verified locally:
1. Use Vercel MCP `list_projects` to find the project
2. Deploy with `deploy_to_vercel`
3. Verify the deployed demo at the production URL

---

## Files Changed Summary

| File | Changes |
|---|---|
| `apps/web/src/components/secretary/MemoryFileList.vue` | Widen sidebar padding (A1) |
| `apps/web/src/views/CourseGeneratorView.vue` | Dark timeline bg (A2) + compact back-btn (A3) |
| `apps/web/src/stores/secretary.ts` | In-memory save for demo mode (B1) |
| `apps/web/src/data/demo-secretary.ts` | Add Carryover.md (B2) |
| `apps/web/src/data/demo-courses.ts` | Reset OpenClaw to 0% (B3) |
| `apps/web/src/App.vue` | Remove demo banner (B4) |

---

## Verification

1. `pnpm dev` → navigate to `/demo` → enter password
2. **No banner** at top of app
3. **Secretary sidebar** (`/calendar`): file names have more breathing room from left edge; Carryover.md appears
4. **Edit a memory file** → changes visible → refresh → content resets to original
5. **Task checkboxes** → check a task in Today → Today.md content reflects the change
6. **Courses** (`/courses`): both courses show 0% progress; click into OpenClaw → all lessons unmarked
7. **Mark a lesson complete** → progress bar updates → refresh → resets to 0%
8. **Course generator** → timeline panel matches dark bg (no glass effect); back button matches compact size
9. `pnpm build && pnpm typecheck && pnpm lint` — no regressions
10. Non-demo mode: navigate normally without demo flag — app works unchanged
