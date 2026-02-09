# Demo Polish Plan — 2026-02-09

## Context

Noteshell's demo experience is the first thing potential users see. It currently works (password gate, in-memory notes, reset on refresh) but needs tightening: three UI spacing/color issues, memory files that silently block edits, pre-completed lessons that don't let users start fresh, and a banner that adds visual noise. Goal: make every demo interaction feel intentional and polished.

---

## Tasks

### A) UI Fixes

#### A1. Tighten memory files sidebar spacing
**File:** `apps/web/src/components/secretary/MemoryFileList.vue`

| Selector | Current | Change to |
|----------|---------|-----------|
| `.memory-file-list` | `gap: 8px` | `gap: 4px` |
| `.file-item` | `padding: 8px 10px` | `padding: 6px 10px` |
| `.file-info` | `gap: 2px` | `gap: 1px` |
| `.history-divider` | `margin: 6px 8px` | `margin: 4px 8px` |

#### A2. Darken timeline connector line
**File:** `apps/web/src/components/course/generator/AgentStepTimeline.vue`

Current pending line (line 214): `background: var(--glass-border, rgba(255, 255, 255, 0.08))`
Change to: `rgba(255, 255, 255, 0.03)` — nearly invisible, blends with dark background.

Also update the gradient endpoint in `.timeline-line.running` (line 226) to match.

#### A3. Compact course button in NavigationDock
**File:** `apps/web/src/components/ui/NavigationDock.vue`

Reference button: CourseView's `.back-btn` uses `ArrowLeft :size="16"`, `padding: 5px 10px`.
The NavigationDock's GraduationCap at `:size="18"` looks visually heavier than other 18px icons due to the cap shape.

Change: Reduce `GraduationCap :size` from `18` to `15` (line 90). This visually aligns with the compact feel of the back-btn without breaking dock item uniformity (hit area stays 28x28).

---

### B) Demo Polish

#### B1. Enable memory file editing in demo mode
**File:** `apps/web/src/stores/secretary.ts`

**Bug:** `updateMemoryFile()` line 266 has `if (isDemoMode()) return` — silently blocks all edits including task status updates (line 315 calls `updateMemoryFile` for Today.md sync).

**Fix:** Replace the early return with in-memory update:
```typescript
async function updateMemoryFile(filename: string, content: string) {
  if (isDemoMode()) {
    const idx = memoryFiles.value.findIndex((f) => f.filename === filename)
    if (idx >= 0) {
      memoryFiles.value[idx] = { ...memoryFiles.value[idx], content, updatedAt: new Date().toISOString() }
    }
    parsePlanData()
    return
  }
  // ... rest unchanged
}
```

This lets users:
- Edit memory file content in the editor and save → updates reactive state
- Toggle task statuses in Today's plan → Today.md updates in-memory
- On page refresh → `initialize()` reloads from static `DEMO_MEMORY_FILES`

#### B2. Reset all demo course lessons to unmarked
**File:** `apps/web/src/data/demo-courses.ts`

Find all instances of `status: 'completed'` and `completedAt: '...'` in lesson objects and change them:
- `status: 'completed'` → `status: 'available'`
- Remove all `completedAt` lines
- Set both course `progress` values to `0`
- Set module `status` from `'completed'`/`'in_progress'` → `'available'`
- Set module `progress` from any non-zero → `0`

Affected locations (from grep): lines 40, 50-51, 120-121, 212-213, 274-275, 341-342.

#### B3. Remove demo banner
**File:** `apps/web/src/App.vue`

Remove the entire `<div v-if="inDemoMode" class="demo-banner">` block (lines 27-32) and its `.demo-banner` CSS styles (lines 61-80).

Also remove the `inDemoMode` computed and `isDemoMode` import if they become unused.

---

### C) Deploy

#### C1. Deploy to Vercel
Use Vercel MCP tools to deploy after all changes are committed.

---

## Implementation Order

1. **A1, A2, A3** — UI fixes (independent, can be done in parallel)
2. **B1, B2, B3** — Demo polish (independent, can be done in parallel)
3. **C1** — Deploy (after commit)

## Process Notes

- Use `/brainstorming` before demo state management changes (B1)
- Use `/superdesign` for UI component changes (A1, A2, A3)
- Keep changes minimal — pure CSS value tweaks for A-tasks, one function body for B1, data resets for B2, element deletion for B3

## Verification

1. `pnpm build && pnpm typecheck` — ensure no regressions
2. Start dev server, navigate to `/demo`, enter password
3. **A1**: Check memory files sidebar — items should be noticeably tighter
4. **A2**: Open course generator — timeline connector lines between pending steps should be nearly invisible
5. **A3**: Check NavigationDock — GraduationCap should feel visually lighter
6. **B1**: Click a memory file → edit content → save → verify content updates. Toggle a task status in Today's plan → verify Today.md reflects change. Refresh page → verify original content restored
7. **B2**: Navigate to Courses → both courses should show 0% progress, all lessons "available"
8. **B3**: Verify no demo banner appears anywhere in the UI
9. **C1**: Deploy via Vercel MCP and verify live site
