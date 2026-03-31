# Neon Color Remediation: Replace Hardcoded Colors with CSS Variable References

## Goal

Replace ALL hardcoded neon green and amber hex/rgba values across ~75 Vue component and CSS files with CSS variable references (`var(--sec-primary, ...)`, `var(--sec-accent, ...)`, etc.) so that colors automatically adapt between light and dark themes.

- **Light theme**: warm, desaturated colors (sage green `#3b7d68`, muted amber `#b4883a`)
- **Dark theme**: keep current neon colors (`#10b981`, `#f59e0b`, etc.) -- they look great on dark backgrounds
- **Mechanism**: CSS variables in `variables.css` already define per-theme values. Components just need to reference them.

## Current State

### Already Done

- `variables.css` (lines 226-234 dark, 545-553 light) already defines all `--sec-primary`, `--sec-accent`, `--sec-primary-light`, `--sec-primary-bg`, `--sec-primary-border`, `--sec-accent-bg`, `--sec-accent-border`, `--sec-accent-light`, `--sec-accent-dark` per theme.
- `ProgressBar.vue` default color prop already updated to `#b4883a`.
- `CourseGeneratorView.vue` and `SecretaryView.vue` already have zero hardcoded neon colors.
- `CourseView.vue` already uses `getComputedStyle` pattern for its ProgressBar color prop.
- Many secretary components (TodayPlan, TomorrowPlan, ActivePlansOverview, PlanHeader, etc.) already use `var(--sec-primary, #10b981)` pattern -- these are CORRECT and need NO changes (the fallback is the dark theme default; the CSS variable overrides in light theme).

### Not Yet Done

- **166 hardcoded hex neon instances** across 64 files (not in `var()`, not in deprecated, not in `variables.css`)
- **99 hardcoded rgba neon instances** across 38 files (not in `var()`)
- `glass-design.css` has theme-unaware `:root` block with `--status-completed`, `--status-running`, `--shadow-glow-green`, `--shadow-glow-amber`, and `pulse-glow` keyframes
- ~14 JavaScript computed properties returning hardcoded hex colors

## Neon Colors Being Targeted

### Green family (replace with `--sec-primary` variants)

| Hardcoded Value         | CSS Variable Replacement                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| `#10b981`               | `var(--sec-primary, #10b981)`                                                                        |
| `#059669`               | `var(--sec-primary, #10b981)`                                                                        |
| `#22c55e`               | `var(--status-completed, #22c55e)`                                                                   |
| `#3fb950`               | `var(--sec-primary, #10b981)` (GitHub-flavored green)                                                |
| `#238636`               | `var(--primary-gradient)` or `var(--sec-primary, #10b981)`                                           |
| `#16a34a`               | `var(--sec-primary, #10b981)`                                                                        |
| `#34d399`               | `var(--sec-primary-light, #34d399)`                                                                  |
| `#6ee7b7`               | `var(--sec-primary-light, #34d399)`                                                                  |
| `#aaf2d2`               | `var(--sec-primary-light, #34d399)`                                                                  |
| `rgba(16, 185, 129, X)` | `var(--sec-primary-bg)` / `var(--sec-primary-border)` or keep as hardcoded with updated light values |
| `rgba(34, 197, 94, X)`  | same pattern                                                                                         |

### Amber family (replace with `--sec-accent` variants)

| Hardcoded Value         | CSS Variable Replacement                                                                  |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| `#f59e0b`               | `var(--sec-accent, #f59e0b)`                                                              |
| `#fbbf24`               | `var(--sec-accent-light, #fbbf24)`                                                        |
| `#d97706`               | `var(--sec-accent-dark, #d97706)`                                                         |
| `rgba(245, 158, 11, X)` | `var(--sec-accent-bg)` / `var(--sec-accent-border)` or hardcode with updated light values |

## Replacement Strategy

### Pattern A: CSS properties (majority of cases)

```css
/* Before */
color: #10b981;
/* After */
color: var(--sec-primary, #10b981);
```

The fallback value is the dark theme default. The CSS variable provides the correct value per theme.

### Pattern B: CSS rgba values

For `background` and `border` with rgba neon values, use the pre-defined bg/border variables:

```css
/* Before */
background: rgba(16, 185, 129, 0.12);
/* After -- when opacity matches an existing variable */
background: var(--sec-primary-bg, rgba(16, 185, 129, 0.12));
```

For rgba values in `box-shadow` or `@keyframes` where `var()` works fine in modern CSS:

```css
box-shadow: 0 0 12px var(--shadow-glow-green, rgba(34, 197, 94, 0.3));
```

### Pattern C: JavaScript computed colors

Use `getComputedStyle` to read CSS variables at runtime:

```typescript
// Before
if (difficulty === 'easy') return '#10b981'
// After
if (difficulty === 'easy') {
  return (
    getComputedStyle(document.documentElement).getPropertyValue('--sec-primary').trim() || '#10b981'
  )
}
```

Alternatively, create a shared utility composable (recommended for the ~14 JS instances).

### Pattern D: Template props with hardcoded colors

```vue
<!-- Before -->
<ProgressBar color="#f59e0b" />
<!-- After -- use a computed that reads the CSS var -->
<ProgressBar :color="accentColor" />
```

### Pattern E: JS data arrays with colors

```typescript
// Before
{ value: 'note', label: 'Notes', color: '#10b981' }
// After -- use getComputedStyle or a reactive helper
{ value: 'note', label: 'Notes', color: getCssVar('--sec-primary', '#10b981') }
```

## What NOT to Change

1. **NavigationDock.vue** semantic icon colors (`#3fb950` for home) -- role identifiers, not accent colors. SKIP.
2. **Error/warning semantic colors** -- red (`#ef4444`, `#f85149`), blue info (`#58a6ff`, `#60a5fa`), purple (`#a78bfa`, `#a371f7`), pink (`#f472b6`), cyan (`#22d3ee`). SKIP.
3. **Deprecated components** (4 files in `_deprecated/`) -- not worth maintaining. SKIP.
4. **`variables.css`** itself -- already correct. SKIP.
5. **Components already using `var(--sec-*, <fallback>)`** -- these are already correct. SKIP those specific lines.
6. **AuthView.vue** -- uses green/amber for auth state indicators which are a separate concern. LOW PRIORITY, can skip initial pass.

---

## Phase 0: Foundation -- New CSS Variables + Utility Composable

### Step 0.1: Add theme-scoped status variables to `variables.css`

The `glass-design.css` file defines `--status-completed: #22c55e` and `--status-running: #f59e0b` in a single `:root` block with no theme awareness. These are consumed by course generator components.

**Action**: Add theme-scoped overrides to `variables.css`:

In the **dark theme block** (around line 300, after existing sec- variables):

```css
/* Status colors (theme-aware overrides for glass-design.css defaults) */
--status-completed: #22c55e;
--status-running: #f59e0b;
--shadow-glow-green: 0 0 12px rgba(34, 197, 94, 0.3);
--shadow-glow-amber: 0 0 12px rgba(245, 158, 11, 0.3);
```

In the **light theme block** (around line 610, after existing sec- variables):

```css
/* Status colors (theme-aware overrides for glass-design.css defaults) */
--status-completed: #3b7d68;
--status-running: #b4883a;
--shadow-glow-green: 0 0 12px rgba(59, 125, 104, 0.3);
--shadow-glow-amber: 0 0 12px rgba(180, 136, 58, 0.3);
```

The `:root` definitions in `glass-design.css` remain as fallbacks. The `[data-theme]` selectors in `variables.css` have higher specificity and will override.

### Step 0.2: Fix `glass-design.css` pulse animation

The `@keyframes pulse-glow` (lines 84-92) hardcodes `rgba(245, 158, 11, ...)`. CSS custom properties work inside `@keyframes` in modern browsers.

**Action**: Change to use CSS custom properties:

```css
@keyframes pulse-glow {
  0%,
  100% {
    box-shadow: var(--shadow-glow-amber-subtle, 0 0 4px rgba(245, 158, 11, 0.2));
  }
  50% {
    box-shadow: var(--shadow-glow-amber-intense, 0 0 16px rgba(245, 158, 11, 0.5));
  }
}
```

Add corresponding variables to both theme blocks in `variables.css`.

### Step 0.3: Create `useCssVar` composable

File: `apps/web/src/composables/useCssVar.ts` (NEW)

```typescript
/**
 * Read a CSS custom property from the document root.
 * Returns the current value or the provided fallback.
 */
export function getCssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}
```

This avoids repeating the verbose `getComputedStyle(...)` pattern in ~14 components.

---

## Phase 1: Course Components (23 files, highest visual impact)

### Batch 1A: Course Generator (11 files, ~45 instances)

| File                           | Hex | RGBA | JS                |
| ------------------------------ | --- | ---- | ----------------- |
| `CourseTopicInput.vue`         | 11  | 3    | 0                 |
| `InteractiveOutlineEditor.vue` | 4   | 2    | 0                 |
| `ContentGenerationSidebar.vue` | 4   | 1    | 0                 |
| `ResearchProgress.vue`         | 3   | 2    | 0                 |
| `OutlineReview.vue`            | 2   | 0    | 0                 |
| `OutlineEditor.vue`            | 2   | 0    | 0                 |
| `GenerationProgress.vue`       | 1   | 1    | 1 (template prop) |
| `SubAgentCard.vue` (generator) | 0   | 4    | 2 (JS returns)    |
| `AgentStepTimeline.vue`        | 0   | 1    | 0                 |
| `LessonPreviewCard.vue`        | 1   | 1    | 0                 |
| `TodoListView.vue`             | 0   | 1    | 0                 |

**Replacement rules for this batch**:

- `#10b981` / `#059669` in CSS -> `var(--sec-primary, #10b981)`
- `#f59e0b` in CSS -> `var(--sec-accent, #f59e0b)`
- `rgba(245, 158, 11, 0.12)` -> `var(--sec-accent-bg, rgba(245, 158, 11, 0.12))`
- `rgba(16, 185, 129, 0.12)` -> `var(--sec-primary-bg, rgba(16, 185, 129, 0.12))`
- `GenerationProgress.vue` template `color="#f59e0b"` -> `:color="getCssVar('--sec-accent', '#f59e0b')"`

### Batch 1B: Course Viewer (10 files, ~55 instances)

| File                       | Hex | RGBA | JS                |
| -------------------------- | --- | ---- | ----------------- |
| `QuizLesson.vue`           | 10  | 5    | 0                 |
| `PracticeLesson.vue`       | 10  | 6    | 0                 |
| `CourseHeader.vue`         | 5   | 2    | 0                 |
| `SlidesLesson.vue`         | 4   | 3    | 0                 |
| `CourseNav.vue`            | 3   | 2    | 1 (template prop) |
| `CourseNotesPanel.vue`     | 3   | 0    | 0                 |
| `LectureLesson.vue`        | 3   | 0    | 0                 |
| `CourseExplainSidebar.vue` | 1   | 1    | 0                 |
| `ExplainChatMessage.vue`   | 1   | 1    | 0                 |
| `ContextPill.vue`          | 1   | 0    | 0                 |

### Batch 1C: Course List (2 files, ~8 instances)

| File                | Hex | RGBA | JS                           |
| ------------------- | --- | ---- | ---------------------------- |
| `CourseCard.vue`    | 5   | 1    | 2 (computed + template prop) |
| `CourseFilters.vue` | 2   | 1    | 0                            |

---

## Phase 2: Secretary Components (18 files, ~75 instances)

Many secretary components already use `var(--sec-*, fallback)` for main color references but have leftover hardcoded rgba values.

### Batch 2A: High-instance secretary files

| File                       | Hex (not in var)   | RGBA (not in var) |
| -------------------------- | ------------------ | ----------------- |
| `TodayPlan.vue`            | 1 (`#aaf2d2`)      | 12                |
| `InboxProposals.vue`       | 7                  | 9                 |
| `SecretaryActionSheet.vue` | 1 (`#aaf2d2`)      | 7                 |
| `PlanSchedule.vue`         | 2 (JS data arrays) | 2                 |
| `PlanOverview.vue`         | 0                  | 2                 |
| `PlanHeader.vue`           | 0                  | 2                 |
| `PlanCreationChat.vue`     | 0                  | 2                 |
| `PlanArtifacts.vue`        | 0                  | 1                 |

### Batch 2B: Lower-instance secretary files

| File                       | Instances                  |
| -------------------------- | -------------------------- |
| `RoadmapDetailModal.vue`   | 2 hex                      |
| `SecretaryMessageCard.vue` | 1 hex                      |
| `MemoryFileEditor.vue`     | 1 hex                      |
| `StreakBadge.vue`          | 1 hex                      |
| `SourceIcon.vue`           | 1 hex + 1 rgba (JS object) |
| `SecretaryPanel.vue`       | 0 hex, 2 rgba              |
| `CalendarTimelineView.vue` | 0 hex, 2 rgba              |
| `TickerBar.vue`            | 0 hex, 2 rgba              |
| `ActivePlansOverview.vue`  | 0 hex, 1 rgba              |
| `ProgressChart.vue`        | 0 (already uses var())     |

**Special JS cases**:

- `InboxProposals.vue` lines 57, 60: JS data `{ color: '#f59e0b' }` / `{ color: '#10b981' }` -> use `getCssVar()`
- `PlanSchedule.vue` lines 63, 65: same pattern
- `SourceIcon.vue` line 16: JS object with `bg: 'rgba(...)'` and `color: '#34d399'` -> use `getCssVar()`

---

## Phase 3: AI Components (18 files, ~50 instances)

### Batch 3A: AI Sidebar and Activity

| File                       | Hex | RGBA | JS                                            |
| -------------------------- | --- | ---- | --------------------------------------------- |
| `AISidebar.vue`            | 2   | 3    | 0                                             |
| `ActivityItem.vue`         | 4   | 0    | 4 (getStepColor, getToolColor)                |
| `FlashcardDeck.vue`        | 6   | 0    | 2 (difficultyColor)                           |
| `StreamingCodePreview.vue` | 0   | 0    | 1 (CSS custom property)                       |
| `EditProposalCard.vue`     | 0   | 0    | 0 (already uses `var(--task-complete-color)`) |
| `TaskChecklist.vue`        | 0   | 0    | 0 (already uses `var(--task-*)`)              |

### Batch 3B: AI Modals

| File                  | Hex | RGBA | JS                                                             |
| --------------------- | --- | ---- | -------------------------------------------------------------- |
| `MindmapModal.vue`    | 4   | 0    | 1 (getBranchColor -- array has `#3fb950` among 5 mixed colors) |
| `AddSourceModal.vue`  | 4   | 0    | 0                                                              |
| `SlidesModal.vue`     | 3   | 0    | 1 (getTypeColor)                                               |
| `ExercisesModal.vue`  | 2   | 0    | 1 (getDifficultyColor)                                         |
| `FlashcardsModal.vue` | 2   | 0    | 0                                                              |
| `ResourcesModal.vue`  | 1   | 0    | 0                                                              |
| `ConceptsModal.vue`   | 1   | 0    | 0                                                              |

### Batch 3C: AI Tabs

| File                       | Hex | RGBA |
| -------------------------- | --- | ---- |
| `RecommendTab.vue`         | 5   | 0    |
| `LearningResourcesTab.vue` | 3   | 0    |
| `WorkflowsTab.vue`         | 3   | 0    |
| `NotePreviewPanel.vue`     | 1   | 0    |
| `SourceCard.vue`           | 1   | 0    |

**Special JS cases**:

- `ActivityItem.vue` `getStepColor()`: `'read' -> '#34d399'`, `'write'/'delegation' -> '#fbbf24'` -> use `getCssVar()`
- `ActivityItem.vue` `getToolColor()`: `'complete' -> '#3fb950'` -> use `getCssVar()`
- `FlashcardDeck.vue` `difficultyColor`: `'easy' -> '#10b981'`, default `'#f59e0b'` -> use `getCssVar()`
- `MindmapModal.vue` `getBranchColor()`: array `['#58a6ff', '#3fb950', '#a371f7', '#f78166', '#d29922']` -- replace `#3fb950` with `getCssVar('--sec-primary', '#10b981')`. Others are non-green/amber, leave as-is.
- `SlidesModal.vue` `getTypeColor()`: `'content' -> '#3fb950'` -> use `getCssVar()`
- `ExercisesModal.vue` `getDifficultyColor()`: `'beginner' -> '#3fb950'` -> use `getCssVar()`

---

## Phase 4: Deep Agent Components (10 files, ~20 instances)

| File                           | Hex (not in var) | RGBA (not in var) |
| ------------------------------ | ---------------- | ----------------- |
| `InlineTasksFiles.vue`         | 3                | 0                 |
| `NoteDraftResponseCard.vue`    | 2                | 1                 |
| `SubagentCard.vue` (deepagent) | 2                | 0                 |
| `TodoPanel.vue`                | 2                | 0                 |
| `FileCard.vue`                 | 2                | 0                 |
| `ToolCallBox.vue`              | 1                | 0                 |
| `ThreadListPanel.vue`          | 1                | 0                 |
| `TaskProgressBar.vue`          | 1                | 0                 |
| `InterruptBanner.vue`          | 1                | 0                 |
| `FileViewerModal.vue`          | 1                | 0                 |

All are CSS `color` or `background` properties using `#3fb950` (GitHub green). Replace with `var(--sec-primary, #10b981)`.

---

## Phase 5: Layout, Settings and Views (8 files, ~20 instances)

| File                    | Hex           | RGBA | Notes                                      |
| ----------------------- | ------------- | ---- | ------------------------------------------ |
| `SideBar.vue`           | 2 (`#238636`) | 0    | `.action-btn.primary` bg + border          |
| `SettingsView.vue`      | 4             | 8    | Status banners, consent logos, btn-primary |
| `EditorView.vue`        | 1             | 0    | Tag badge color                            |
| `CaptureView.vue`       | 1             | 0    | Success message color                      |
| `CliAuthView.vue`       | 0             | 1    | Success banner rgba                        |
| `UsageSection.vue`      | 1             | 1    | Progress bar bg                            |
| `NotificationToast.vue` | 1             | 0    | Success toast color                        |
| `AuthView.vue`          | 3             | 2    | Auth state indicators (LOW PRIORITY)       |

**Skip**: `NavigationDock.vue` -- the `#3fb950` on `.nav-home.active` is a semantic role color.

---

## Execution Plan -- Agent Assignments

### Agent 1: Foundation + Secretary (Phase 0 + Phase 2)

**Files**: `variables.css`, `glass-design.css`, `useCssVar.ts` (new), 18 secretary component files
**Estimated instances**: ~75

### Agent 2: Course Generator + Viewer (Phase 1)

**Files**: 23 course component files
**Estimated instances**: ~108

### Agent 3: AI Components (Phase 3)

**Files**: 18 AI component files
**Estimated instances**: ~50

### Agent 4: Deep Agent + Layout + Settings + Views (Phase 4 + Phase 5)

**Files**: 18 files
**Estimated instances**: ~40

---

## Verification Checklist

### Automated

- [ ] `pnpm typecheck` -- no new errors
- [ ] `pnpm lint` -- no new errors
- [ ] Grep for hardcoded hex greens NOT in var(): should return 0 (or only NavigationDock)
- [ ] Grep for hardcoded hex ambers NOT in var(): should return 0 (or only NavigationDock)
- [ ] Grep for hardcoded rgba greens NOT in var(): should return 0

### Visual -- Light Theme

- [ ] All green accents are sage (#3b7d68), not neon
- [ ] All amber accents are muted (#b4883a), not neon
- [ ] Secretary dashboard: badges, progress bars, plan cards all sage/muted
- [ ] Course generator: topic input, outline editor, progress all sage/muted
- [ ] Course viewer: quiz options, practice options, complete button all sage/muted
- [ ] AI sidebar: card badges, send button, flashcard colors all sage/muted
- [ ] Deep agent: tool status, task progress all sage/muted

### Visual -- Dark Theme

- [ ] All colors unchanged (neon green and amber preserved via CSS variable fallbacks)
- [ ] Course generator timeline still neon
- [ ] Secretary dashboard still neon
- [ ] AI sidebar still neon

### Functional

- [ ] Theme toggle between light/dark works for all updated components
- [ ] No broken styles (missing semicolons, unclosed var(), etc.)
- [ ] ProgressBar components render correct color in both themes
- [ ] Flashcard difficulty colors change per theme
- [ ] MindmapModal branch colors render correctly

---

## Risk Notes

1. **CSS var() inside rgba()**: Cannot do `rgba(var(--color), 0.5)`. Use pre-defined `--sec-primary-bg` (opacity ~0.1) and `--sec-primary-border` (opacity ~0.25) variables. For other opacities, use `var(--custom-name, rgba(...))` with a new variable.

2. **@keyframes and var()**: CSS custom properties work inside `@keyframes` in all modern browsers (Chrome 49+, Firefox 31+, Safari 9.1+). Safe to use.

3. **Scoped styles and CSS var inheritance**: Vue scoped styles inherit CSS custom properties from `:root`. No issues expected.

4. **JS getComputedStyle timing**: Reads the CURRENT theme value. If theme changes after component mount, reactive computeds will not auto-update unless they watch for theme changes. Acceptable since theme changes trigger full re-render via `data-theme` attribute.

5. **NavigationDock exclusion**: The `#3fb950` on `.nav-home.active` is intentionally left as a hardcoded semantic color. Grep verification should account for this exception.
