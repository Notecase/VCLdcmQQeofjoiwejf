# Light Theme Overhaul: "Warm Minimal + Muted Functional"

## Context

The light theme is unfinished — sidebar and content areas are all near-identical white/cool-blue-gray (`#f8fafc`, `#ffffff`, `#f1f5f9`) with no surface depth. Green accents (`#059669`, `#10b981`) are too saturated for light mode. The secretary sidebar has no user profile section (unlike the note editor sidebar). This plan overhauls the entire light theme to a warm minimal palette with desaturated sage green accents, and adds the shared profile section to both sidebars.

**Design direction chosen**: Warm Minimal base + Muted Functional accents (desaturated sage green `#3b7d68`)

---

## Color Palette Reference

### Surfaces (warm off-white hierarchy)

| Level     | Hex       | Use                                  |
| --------- | --------- | ------------------------------------ |
| surface-0 | `#ffffff` | Editor canvas, cards, inputs         |
| surface-1 | `#faf9f7` | Main content bg, app bg              |
| surface-2 | `#f5f3f0` | Sidebars, nav bars, panels           |
| surface-3 | `#eae8e4` | Borders, dividers, hover backgrounds |

### Accent (desaturated sage green)

| Token          | Hex                     |
| -------------- | ----------------------- |
| primary        | `#3b7d68`               |
| primary-light  | `#4e9a82`               |
| primary-bg     | `rgba(59,125,104,0.1)`  |
| primary-border | `rgba(59,125,104,0.25)` |

### Accent-amber (desaturated)

| Token        | Hex       |
| ------------ | --------- |
| accent       | `#b4883a` |
| accent-dark  | `#96702e` |
| accent-light | `#c9a04e` |

### Text (warm grays)

| Level     | Hex       |
| --------- | --------- |
| primary   | `#1c1917` |
| body      | `#44403c` |
| secondary | `#78716c` |
| muted     | `#a8a29e` |

### Border

`#eae8e4` (warm) replacing `#e2e8f0` (cool slate)

---

## Phase 1: CSS Variables — Foundation

**File**: `apps/web/src/assets/themes/variables.css` (lines 321-634)
**Scope**: ~80 variable value changes in the light theme block

### Step 1.1: Core design tokens (lines 325-335)

| Variable                 | Old                                         | New                                         |
| ------------------------ | ------------------------------------------- | ------------------------------------------- |
| `--app-bg`               | `#f8fafc`                                   | `#faf9f7`                                   |
| `--sidebar-bg`           | `#ffffff`                                   | `#f5f3f0`                                   |
| `--bg-color`             | `#f5f5f5`                                   | `#faf9f7`                                   |
| `--primary-color`        | `#2563eb`                                   | `#3b7d68`                                   |
| `--primary-gradient`     | `linear-gradient(135deg, #2563eb, #1d4ed8)` | `linear-gradient(135deg, #3b7d68, #2d6353)` |
| `--hover-bg`             | `#f1f5f9`                                   | `#f0eeeb`                                   |
| `--text-color`           | `#334155`                                   | `#44403c`                                   |
| `--text-color-secondary` | `#64748b`                                   | `#78716c`                                   |
| `--border-color`         | `#e2e8f0`                                   | `#eae8e4`                                   |

### Step 1.2: Editor bg tokens (lines 341-409)

Most are neutral `rgba(0,0,0,X)` — no change needed. Update only:

- `--code-block-bg-color`, `--codeBgColor`, `--codeBlockBgColor`: `#f5f5f5` → `#f5f3f0`
- `--input-bg-color`, `--inputBgColor`: `#fafafa` → `#faf9f7`
- `--tableBorderColor`: `#e0e0e0` → `#eae8e4`

### Step 1.3: Glass tokens (lines 411-425)

- `--glass-bg-light`: `rgba(245,248,250,0.7)` → `rgba(250,249,247,0.7)`
- `--glass-bg-hover`: `rgba(241,245,249,0.8)` → `rgba(240,238,235,0.8)`
- `--glass-bg-active`: `rgba(226,232,240,0.7)` → `rgba(234,232,228,0.7)`

### Step 1.4: AI sidebar tokens (lines 427-452)

- `--ai-sidebar-bg`: `#f8fafc` → `#faf9f7`
- `--ai-tab-color`: `#64748b` → `#78716c`
- `--ai-tab-active`: `#334155` → `#44403c`
- `--ai-card-border`, `--ai-input-border`: `#e2e8f0` → `#eae8e4`
- `--ai-cmd-bg`: `#f1f5f9` → `#f0eeeb`
- `--ai-send-bg`: `#e2e8f0` → `#eae8e4`
- `--ai-send-active-bg`: `#238636` → `#3b7d68`
- `--ai-scrollbar-thumb`: `#cbd5e1` → `#d6d3ce`

### Step 1.5: Task/role/diff tokens (lines 473-509)

- `--task-pending-color`: `#94a3b8` → `#a8a29e`
- `--task-running-color`: `#d97706` → `#b4883a`
- `--task-complete-color`: `#16a34a` → `#3b7d68`
- `--role-user-color`: `#334155` → `#44403c`
- `--role-assistant-bg`: `rgba(34,197,94,0.15)` → `rgba(59,125,104,0.15)`
- `--role-assistant-color`: `#16a34a` → `#3b7d68`
- Diff add colors: replace `34,197,94` → `59,125,104`; `#16a34a` → `#3b7d68`; `#166534` → `#2d5a49`
- `--diff-inline-addition-bg`: `#d4edda` → `#d5e8e1`
- `--diff-inline-addition-text`: `#3d5c45` → `#2d5a49`
- `--diff-inline-plus-color`, `--diff-inline-accept-btn`: `#5a9e6f` → `#3b7d68`

### Step 1.6: Surface/text tokens (lines 529-537)

- `--surface-1`: `#f8fafc` → `#faf9f7`
- `--surface-2`: `#f1f5f9` → `#f5f3f0`
- `--surface-3`: `#e2e8f0` → `#eae8e4`
- `--text-primary`: `#1e293b` → `#1c1917`
- `--text-secondary`: `#64748b` → `#78716c`
- `--text-muted`: `#94a3b8` → `#a8a29e`

### Step 1.7: Artifact tokens (lines 540-541)

- `--artifact-bg`: `#f6f8fa` → `#f5f3f0`
- `--artifact-border`: `#d0d7de` → `#ddd9d4`

### Step 1.8: Secretary tokens (lines 543-602)

- `--sec-primary`: `#059669` → `#3b7d68`
- `--sec-primary-light`: `#10b981` → `#4e9a82`
- `--sec-primary-bg`: `rgba(5,150,105,0.1)` → `rgba(59,125,104,0.1)`
- `--sec-primary-border`: `rgba(5,150,105,0.25)` → `rgba(59,125,104,0.25)`
- `--sec-accent`: `#d97706` → `#b4883a`
- `--sec-accent-dark`: `#b45309` → `#96702e`
- `--sec-accent-bg`: `rgba(217,119,6,0.1)` → `rgba(180,136,58,0.1)`
- `--sec-accent-border`: `rgba(217,119,6,0.25)` → `rgba(180,136,58,0.25)`
- `--sec-urgent`: `#ea580c` → `#c4693a`
- `--sec-task-learn`: `#d97706` → `#b4883a`
- `--sec-task-practice`: `#059669` → `#3b7d68`
- `--sec-task-review`: `#0d9488` → `#478f85`
- `--sec-task-break`: `#9ca3af` → `#a8a29e`
- `--sec-fab-bg`: gradient `#059669,#10b981` → `#3b7d68,#4e9a82`
- `--sec-fab-shadow`: `rgba(5,150,105,0.3)` → `rgba(59,125,104,0.3)`
- `--sec-surface-0`: `#f8fafc` → `#faf9f7`
- Ticker: `--sec-ticker-fade`: `rgba(248,250,252,0.9)` → `rgba(250,249,247,0.9)`
- Ticker live: `rgba(5,150,105,X)` → `rgba(59,125,104,X)`, `#059669` → `#3b7d68`
- Ticker next: `rgba(217,119,6,0.1)` → `rgba(180,136,58,0.1)`, `#d97706` → `#b4883a`

### Step 1.9: Chat + modal tokens (lines 612-634)

- `--chat-popup-bg`: `#f5f5f5` → `#f5f3f0`

### Step 1.10: Add new variable

Add `--sec-accent-light: #c9a04e;` after `--sec-accent-dark` in the light block.
Also add it to the dark theme block: `--sec-accent-light: #fbbf24;`

---

## Phase 2: Profile Component Extraction

### Step 2.1: Create `apps/web/src/components/layout/UserProfile.vue`

Extract from `SideBar.vue`:

- **Template**: The `<div ref="userMenuRef" class="user-section">` block (user avatar, name, badge, expandable menu with theme toggle, settings, discord, trash, sign out)
- **Script**: `showUserMenu` ref, `userMenuRef` ref, `userDisplayName` computed, `userInitial` computed, `currentTheme` computed, `setTheme()`, `toggleUserMenu()`, `closeUserMenu()`, click-outside handler (register/unregister in onMounted/onUnmounted), `goToSettings()`, `goToAuth()`, `signOut()`
- **Imports**: `ref, computed, onMounted, onUnmounted` from vue; `useRouter` from vue-router; Lucide icons (`ChevronUp, Settings, LogOut, Moon, Sun, Monitor, User, MessageCircle, Trash2`); `useAuthStore, usePreferencesStore`; `useCreditsStore`
- **CSS**: All `.user-section`, `.user-profile-btn`, `.user-avatar`, `.user-info`, `.user-name`, `.user-badge`, `.user-menu`, `.theme-toggle`, `.menu-item`, `.slide-up-*` transition styles
- Move `creditsStore.fetchCredits()` from SideBar's `onMounted` into UserProfile's `onMounted`

### Step 2.2: Update `apps/web/src/components/layout/SideBar.vue`

- Import `UserProfile` component
- Replace the entire user-section template block with `<UserProfile />`
- Remove extracted script logic and CSS
- Remove now-unused Lucide icon imports
- Keep context-menu click-outside handling (separate from user-menu)

### Step 2.3: Add profile to `apps/web/src/views/SecretaryView.vue`

- Import `UserProfile`
- Add `<UserProfile />` inside `<aside class="file-sidebar">` after `<MemoryFileList />`
- Update `.file-sidebar` CSS to `display: flex; flex-direction: column;`
- Ensure `MemoryFileList` gets `flex: 1; min-height: 0; overflow-y: auto;`

---

## Phase 3: Hardcoded Color Remediation

### Step 3.1: `apps/web/src/views/CourseGeneratorView.vue` (CRITICAL — 8 instances)

Replace all hardcoded `#10b981` with `var(--sec-primary)` and `#f59e0b` with `var(--sec-accent)`:

- `.timeline-step.done .step-dot` bg + border → `var(--sec-primary)`
- `.timeline-step.done .step-line` bg → `var(--sec-primary)`
- `.timeline-step.active .step-dot` bg + border → `var(--sec-accent)`
- `.timeline-step.active .step-dot` box-shadow → `rgba(180,136,58,0.4)` (hardcode since can't use var in rgba)
- `.timeline-step.active .step-line` gradient → use `var(--sec-accent)`
- `.timeline-step.done .step-label` color → `var(--sec-primary)`
- `.timeline-step.active .step-label` color → `var(--sec-accent)`
- `.progress-bar-fill` bg → `var(--sec-accent)`
- `.todo-item.done .todo-check` color → `var(--sec-primary)`

### Step 3.2: `apps/web/src/views/CourseView.vue` (CRITICAL — 6 instances)

- Template line ~97: `color="#f59e0b"` → use a computed property: `const progressColor = computed(() => getComputedStyle(document.documentElement).getPropertyValue('--sec-accent').trim() || '#b4883a')` — then pass `:color="progressColor"`
- `.lesson-type-badge` bg → `var(--sec-accent-bg)`
- `.complete-btn` border → `1px solid var(--sec-primary)`; bg → `var(--sec-primary-bg)`; color → `var(--sec-primary)`
- `.complete-btn:hover` bg → `var(--sec-primary)`
- `.completed-badge` color → `var(--sec-primary)`

### Step 3.3: `apps/web/src/views/SecretaryView.vue` (MEDIUM — 7 instances)

- Background gradient: `rgba(16,185,129,0.05)` → `rgba(59,125,104,0.05)`; `rgba(245,158,11,0.04)` → `rgba(180,136,58,0.04)`
- `.section-chip.active` border → `var(--sec-primary-border)`; bg → `var(--sec-primary-bg)`; color → `var(--sec-primary-light)`
- `.chip-badge` bg → `var(--sec-primary-border)`; color → `var(--sec-primary-light)`

### Step 3.4: `apps/web/src/views/HomePage.vue` (LOW — 4 instances)

- `.status-chip.live` color → `var(--sec-primary)`; bg → `var(--sec-primary-bg)`
- `.mode-toggle.active` border → `var(--sec-accent-border)`; color → `var(--sec-accent)`
- `.mode-toggle.active:hover` bg → `var(--sec-accent-bg)`

### Step 3.5: `apps/web/src/views/CourseListView.vue` (LOW — 2 instances)

- `.create-btn` bg → `var(--sec-accent)`
- `.create-btn:hover` bg → `var(--sec-accent-light, #c9a04e)`

### Step 3.6: `apps/web/src/views/SettingsView.vue` (LOW — 2 instances)

- `.status-dot.active` → `var(--sec-primary)`
- `.status-dot.pending` → `var(--sec-accent)`

### Step 3.7: `apps/web/src/views/PlanWorkspaceView.vue` (LOW — 1 instance)

- Spinner fallback: update `#10b981` → `#3b7d68` in fallback

### Step 3.8: `apps/web/src/components/layout/SideBar.vue` (LOW — user avatar + badge)

Note: After Phase 2, these will be in `UserProfile.vue`:

- `.user-avatar` gradient → `linear-gradient(135deg, var(--sec-accent), var(--sec-accent-dark))`
- `.user-badge.studious` color → `var(--sec-primary-light)`; bg → `var(--sec-primary-bg)`

### Step 3.9: `apps/web/src/components/course/shared/ProgressBar.vue` (LOW — default prop)

- Default `color` prop: `#f59e0b` → `#b4883a` (fallback only, callers should pass explicit value)

### Skip: NavigationDock.vue nav icon colors

These are semantic role identifiers (blue=notes, gold=calendar, purple=courses, green=home). They provide sufficient contrast on warm backgrounds. **No changes needed.**

### Skip: SecretaryDashboard.vue error/warning banners

Error=red, warning=yellow are semantic status colors. **No changes needed.**

---

## Phase 4: Editor Theme Variants

### Step 4.1: `apps/web/src/assets/themes/ulysses.css`

- `--editorBgColor`: `#f3f3f3` → `#f5f3f0`
- `--sideBarBgColor`: `rgba(248,248,248,0.9)` → `rgba(245,243,240,0.9)` (if exists)
- blockquote bg: `rgb(233,233,233)` → `rgb(234,232,228)` (if exists)

### Step 4.2: `apps/web/src/assets/themes/graphite.css`

- `--editorBgColor`: `#f7f7f7` → `#f5f3f0`
- `.editor-tabs` bg: `#f3f3f3` → `#f5f3f0`
- borders: `#dddddd` → `#ddd9d4`
- `.title-bar-editor-bg`: `#f3f3f3` → `#f5f3f0`

---

## Execution Order & Dependencies

```
Phase 1 (variables.css)  ───┐
Phase 2 (UserProfile)   ────┤──> All independent, run in parallel
Phase 3 (hardcoded fix) ────┤
Phase 4 (editor themes) ────┘
                             │
                             ▼
                     Final Verification
```

All 4 phases are independent and can be executed by parallel agents.

---

## Verification Checklist

After all phases complete, verify in the running app (`pnpm dev`):

### Light theme surface hierarchy

- [ ] App background is warm off-white (`#faf9f7`), not blue-tinted
- [ ] Sidebar is visibly distinct from main content (`#f5f3f0` vs `#ffffff`)
- [ ] Cards/inputs are white on the warm background
- [ ] Borders are warm (`#eae8e4`)

### Accent colors

- [ ] No vivid `#059669`/`#10b981` green remaining — all sage `#3b7d68`
- [ ] No vivid `#f59e0b` amber remaining — all muted `#b4883a`
- [ ] Secretary dashboard: progress bars, "View Details", completion badges all sage
- [ ] Course generator: timeline dots, progress bars use CSS vars
- [ ] Course viewer: progress bar + complete button use CSS vars
- [ ] Nav dock: semantic icon colors (blue/gold/purple/green) preserved as-is

### Text hierarchy

- [ ] Body text is warm gray `#44403c`, not cool `#334155`
- [ ] Secondary text is `#78716c`
- [ ] Placeholders/muted text is `#a8a29e`

### Profile section

- [ ] Note editor sidebar: profile at bottom with avatar, name, "Studious" badge, expandable menu
- [ ] Secretary sidebar: identical profile at bottom of file sidebar
- [ ] Theme toggle works in both locations
- [ ] Settings link works in both locations
- [ ] Sign out works in both locations
- [ ] Click outside dismisses menu in both locations

### Editor theme variants

- [ ] Ulysses-light: editor bg is warm
- [ ] Graphite-light: editor bg is warm

### No regressions

- [ ] Dark theme unchanged — switch back and verify
- [ ] Diff viewer green/red still legible
- [ ] AI sidebar styling correct
- [ ] Course generation timeline still functional
- [ ] No TypeScript errors (`pnpm typecheck`)
- [ ] No lint errors (`pnpm lint`)

---

## Files Modified (Summary)

| File                                                    | Phase | Changes                                                  |
| ------------------------------------------------------- | ----- | -------------------------------------------------------- |
| `apps/web/src/assets/themes/variables.css`              | 1     | ~80 CSS variable value updates                           |
| `apps/web/src/components/layout/UserProfile.vue`        | 2     | **NEW** — extracted shared profile component             |
| `apps/web/src/components/layout/SideBar.vue`            | 2, 3  | Extract profile, use `<UserProfile />`                   |
| `apps/web/src/views/SecretaryView.vue`                  | 2, 3  | Add `<UserProfile />` to sidebar, fix hardcoded colors   |
| `apps/web/src/views/CourseGeneratorView.vue`            | 3     | Replace 8 hardcoded colors with CSS vars                 |
| `apps/web/src/views/CourseView.vue`                     | 3     | Replace 6 hardcoded colors, add computed for ProgressBar |
| `apps/web/src/views/HomePage.vue`                       | 3     | Replace 4 hardcoded colors                               |
| `apps/web/src/views/CourseListView.vue`                 | 3     | Replace 2 hardcoded colors                               |
| `apps/web/src/views/SettingsView.vue`                   | 3     | Replace 2 hardcoded colors                               |
| `apps/web/src/views/PlanWorkspaceView.vue`              | 3     | Update 1 fallback color                                  |
| `apps/web/src/components/course/shared/ProgressBar.vue` | 3     | Update default color prop                                |
| `apps/web/src/assets/themes/ulysses.css`                | 4     | Warm editor bg tints                                     |
| `apps/web/src/assets/themes/graphite.css`               | 4     | Warm editor bg tints                                     |

## Risk Notes

1. **ProgressBar inline style**: `CourseView.vue` passes `color` as prop → applied via inline `:style`. Use `getComputedStyle()` to read the CSS variable at runtime.
2. **`box-shadow` rgba**: Some box-shadows use hardcoded rgba. Can't use `var()` inside `rgba()` — hardcode the new warm values directly.
3. **~48 additional files** have scattered `#10b981`/`#f59e0b` references in components that already use `var(--sec-primary)`. These will auto-update via Phase 1. Any remaining hardcoded colors in lower-visibility components can be addressed in a follow-up pass.
