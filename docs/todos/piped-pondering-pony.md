# Light Theme: Comprehensive Neon Color Remediation

## Context

Phases 1-4 of the light theme overhaul are DONE — CSS variables in `variables.css` are correct, UserProfile extracted, editor themes warmed. However, **~200+ hardcoded neon colors** remain in component files across the codebase. These bypass the CSS variables and show vivid neon green/amber in light theme (screenshots show Save button, course badges, AI sidebar, research toggle all still neon).

**Goal**: Replace ALL hardcoded neon hex/rgba values with CSS variable references (`var(--sec-primary)`, `var(--sec-accent)`, etc.) so colors adapt between light (warm sage/amber) and dark (neon) themes automatically.

---

## Replacement Strategy

**CSS rules**: Replace `#10b981` → `var(--sec-primary, #10b981)`, `#f59e0b` → `var(--sec-accent, #f59e0b)`, etc. The fallback is the dark theme default (backwards compat). The CSS variable provides the correct warm color in light theme.

**rgba values**: Replace `rgba(16, 185, 129, X)` → `var(--sec-primary-bg)` / `var(--sec-primary-border)` where opacity matches, otherwise use inline: `var(--sec-primary-bg, rgba(16, 185, 129, X))`.

**JS computed/data**: Use `getComputedStyle(document.documentElement).getPropertyValue('--sec-primary').trim() || '#10b981'`.

**Gradient buttons** (`#238636` → `#2ea043` → `#3fb950`): Replace with `var(--primary-gradient)` or `var(--sec-fab-bg)`.

## What NOT to change

- NavigationDock semantic icon colors (blue=notes, gold=calendar, purple=courses, green=home)
- Error/warning colors (red `#f85149`, `#ef4444`)
- Blue accent colors (`#58a6ff`, `#3b82f6`) — informational, not green/amber

---

## Phase 0: Foundation (variables.css + glass-design.css)

Add theme-scoped status variables to `variables.css` (both light and dark blocks):

**Light theme block** — add:

```css
--status-completed: #3b7d68;
--status-running: #b4883a;
--shadow-glow-green: 0 0 12px rgba(59, 125, 104, 0.3);
--shadow-glow-amber: 0 0 12px rgba(180, 136, 58, 0.3);
```

**Dark theme block** — add:

```css
--status-completed: #22c55e;
--status-running: #f59e0b;
--shadow-glow-green: 0 0 12px rgba(34, 197, 94, 0.3);
--shadow-glow-amber: 0 0 12px rgba(245, 158, 11, 0.3);
```

These override `glass-design.css` `:root` defaults via `[data-theme]` specificity.

---

## Phase 1: Secretary Components (~40 instances)

| File                                           | Instances | Key Changes                                                                                                                     |
| ---------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `components/secretary/MemoryFileEditor.vue`    | 3         | Save button: `#34d399` → `var(--sec-primary-light)`                                                                             |
| `components/secretary/TodayPlan.vue`           | 25        | Today label, progress badges, task borders, start button, artifact badges — all hardcoded rgba → `var(--sec-primary-bg/border)` |
| `components/secretary/InboxProposals.vue`      | 13        | Categories array (JS), filter pills, badges, bot-reply, status badges                                                           |
| `components/secretary/ActivePlansOverview.vue` | 7         | Plan abbrev badge, progress fill gradient, view details link                                                                    |
| `components/secretary/RoadmapDetailModal.vue`  | 2         | Progress value, progress fill gradient                                                                                          |

---

## Phase 2: Course Components (~100 instances)

| File                                                       | Instances | Key Changes                                                   |
| ---------------------------------------------------------- | --------- | ------------------------------------------------------------- |
| `components/course/list/CourseCard.vue`                    | 5         | `difficultyColor()` computed (JS), ready badge, topic text    |
| `components/course/list/CourseFilters.vue`                 | 3         | Active filter pill: border/bg/color                           |
| `components/course/generator/CourseTopicInput.vue`         | 14        | Input focus, difficulty buttons, focus tags, generate button  |
| `components/course/generator/InteractiveOutlineEditor.vue` | 9         | Difficulty badges, approve button, add buttons                |
| `components/course/generator/OutlineReview.vue`            | 2         | Approve button                                                |
| `components/course/generator/GenerationProgress.vue`       | 7         | ProgressBar prop, stage items, thinking header                |
| `components/course/generator/ContentGenerationSidebar.vue` | 5         | Lesson status, selected row                                   |
| `components/course/viewer/CourseExplainSidebar.vue`        | 3         | Context icon, send button gradient + shadow                   |
| `components/course/viewer/CourseNav.vue`                   | 6         | ProgressBar prop (JS), selected/completed lessons, check icon |
| `components/course/viewer/CourseHeader.vue`                | 7         | Lesson type badge, complete button, completed badge           |
| `components/course/viewer/PracticeLesson.vue`              | 16        | Problem cards, result badges, options, submit button          |
| `components/course/viewer/QuizLesson.vue`                  | 15        | Score banner, retry button, options, submit button            |

---

## Phase 3: AI & Deep Agent Components (~30 instances)

| File                                             | Instances | Key Changes                                                  |
| ------------------------------------------------ | --------- | ------------------------------------------------------------ |
| `components/ai/AISidebar.vue`                    | 7         | Card badge, research toggle, send button shadows             |
| `components/ai/FlashcardDeck.vue`                | 5         | `difficultyColor` computed (JS), action buttons, stat values |
| `components/ai/modals/AddSourceModal.vue`        | 5         | Drop zone, btn-primary gradient                              |
| `components/ai/modals/MindmapModal.vue`          | 5         | Branch colors (JS array), btn-primary, copy button           |
| `components/ai/modals/SlidesModal.vue`           | 5         | Type colors (JS), btn-primary                                |
| `components/deepagent/NoteDraftResponseCard.vue` | 4         | Saved badge, accept button                                   |
| `components/deepagent/ThreadListPanel.vue`       | 1         | dot-idle status                                              |

---

## Phase 4: Layout & Misc (~10 instances)

| File                                | Instances | Key Changes                 |
| ----------------------------------- | --------- | --------------------------- |
| `components/layout/SideBar.vue`     | 3         | action-btn.primary gradient |
| `components/layout/UserProfile.vue` | 0         | Already uses vars ✓         |

---

## Execution Plan

```
Phase 0 (variables.css) ────────┐
                                ▼
    ┌───────────┬───────────┬───────────┐
Phase 1      Phase 2      Phase 3     Phase 4
(secretary)  (course)     (AI/deep)   (layout)
    └───────────┴───────────┴───────────┘
                     ▼
              Verification
```

Phase 0 first (adds status variables), then Phases 1-4 in parallel via 4 agents.

---

## Verification

1. `pnpm typecheck` — no errors
2. `pnpm lint` — no new errors
3. Light theme visual check: all greens sage (#3b7d68), all ambers muted (#b4883a)
4. Dark theme visual check: unchanged (neon preserved via CSS var fallbacks)
5. Course page: badges, buttons, progress bars all muted
6. Secretary: Save button, plan badges, progress all muted
7. AI sidebar: research toggle, send button all muted
