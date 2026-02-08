# Revert Light Theme + Restore Old AI System Integration

## Context

The previous Deep Agent UI implementation made two critical mistakes:
1. **Switched the entire UI from dark theme to light theme** — Introduced `--da-*` CSS variables that bypass the app's global dark theme system (`--app-bg`, `--text-color`, `--border-color` from `variables.css`)
2. **Replaced the old AI system** instead of combining — Removed `NotePreviewPanel`, `ClarificationDialog`, error banner, and `useAIStore` integration; added an unwanted `ThreadListPanel`

**Goal:** Restore dark theme across all components. Remove ThreadListPanel from layout. Restore old AI features (NotePreviewPanel, ClarificationDialog, error banner). Keep all deep-agent-ui features (ToolCallBox, MarkdownContent, SubagentCard, TaskProgressBar, InterruptBanner, InlineTasksFiles, FileViewerModal).

---

## CSS Variable Mapping (Light → Dark)

Every `--da-*` reference and hardcoded light color must be replaced:

| Light (current) | Dark (target) |
|---|---|
| `--da-bg` / `#f9f9f9` / `#f9fafb` | `var(--app-bg, #0d1117)` |
| `--da-surface` / `var(--da-surface, #f9fafb)` | `rgba(255, 255, 255, 0.04)` |
| `--da-border` / `#e5e7eb` | `var(--border-color, #30363d)` |
| `--da-text-primary` / `#111827` | `var(--text-color, #e6edf3)` |
| `--da-text-secondary` / `#6b7280` | `var(--text-color-secondary, #8b949e)` |
| `--da-text-tertiary` / `#9ca3af` | `rgba(139, 148, 158, 0.6)` |
| `--da-accent` / `#2F6868` | `var(--primary-color, #7c9ef8)` |
| `--da-primary` / `#1c3c3c` | `var(--primary-color, #7c9ef8)` |
| `--da-success` / `#10b981` | `#3fb950` |
| `--da-warning` / `#f59e0b` | `#d29922` |
| `--da-error` / `#ef4444` | `#f85149` |
| `--da-user-msg-bg` / `#e8f4f8` | `rgba(88, 166, 255, 0.08)` |
| `#ffffff` (backgrounds) | `var(--app-bg, #0d1117)` |
| `#f3f4f6` / `#f6f8fa` (code bg) | `rgba(255, 255, 255, 0.06)` |
| `rgba(0, 0, 0, 0.02)` (hover) | `rgba(255, 255, 255, 0.04)` |
| `rgba(47, 104, 104, *)` (teal) | `rgba(124, 158, 248, *)` (primary) |
| `rgba(59, 130, 246, *)` (blue) | `rgba(88, 166, 255, *)` |

---

## File Changes

### 1. `apps/web/src/views/HomePage.vue` — MAJOR MERGE

**Script changes:**
- Add back imports: `useAIStore` from `@/stores/ai`, `useAIChat` from `@/services/ai.service`, `NotePreviewPanel`, `ClarificationDialog`
- Keep all deep agent imports (ToolCallBox, MarkdownContent, SubagentCard, etc.)
- Remove `ThreadListPanel` import
- Add: `const aiStore = useAIStore()` + `const { clearChat, isProcessing, error, clearError } = useAIChat()`
- Restore clarification handlers from git HEAD version
- Remove `showThreadList` computed
- Restore `handleNewSession` to call both `deepAgent.createNewThread()` and `clearChat()`

**Template changes:**
- Remove `<ThreadListPanel>` block entirely
- Restore `<NotePreviewPanel>` (right side, slides in via Transition)
- Restore `<ClarificationDialog>`
- Restore error banner
- Restore "New session" button in header
- Keep all deep agent rendering (MarkdownContent, ToolCallBox, SubagentCard, InlineTasksFiles)

**CSS changes:**
- Remove the entire `--da-*` variable declaration block
- Replace ALL `--da-*` references per mapping table above
- Remove `border-bottom` from `.home-header` (original had none)
- Remove `background: #ffffff` from `.chat-main`
- Restore `.ghost-action`, `.error-banner`, `.slide-right-*`, `.slide-up-*` from git HEAD

### 2. `apps/web/src/components/deepagent/MarkdownContent.vue`

- Change `import 'github-markdown-css/github-markdown-light.css'` → `'github-markdown-css/github-markdown-dark.css'`
- Change `import 'prismjs/themes/prism.css'` → `'prismjs/themes/prism-tomorrow.css'`
- Convert all CSS: text colors, backgrounds, borders per mapping

### 3. `apps/web/src/components/ai/ChatComposer.vue`

- Convert all `--da-*` to dark equivalents
- `#ffffff` bg → `var(--card-bg, rgba(255, 255, 255, 0.06))`
- Stop button: `#fef2f2` → `rgba(248, 81, 73, 0.08)`

### 4. `apps/web/src/components/ai/ChatHero.vue`

- Teal accents → `var(--primary-color, #7c9ef8)` equivalents
- All borders and text per mapping

### 5. `apps/web/src/components/deepagent/ToolCallBox.vue`

- All `--da-*` → dark equivalents
- `#f3f4f6` code bg → `rgba(255, 255, 255, 0.06)`

### 6. `apps/web/src/components/deepagent/SubagentCard.vue`

- All colors per mapping (surfaces, borders, status badges, text)

### 7. `apps/web/src/components/deepagent/TaskProgressBar.vue`

- Progress fill: `--da-accent` → `var(--primary-color, #7c9ef8)`
- All surfaces/borders/text per mapping

### 8. `apps/web/src/components/deepagent/InterruptBanner.vue`

- `#fffbeb` → `rgba(210, 153, 34, 0.08)`
- All buttons, forms, text per mapping

### 9. `apps/web/src/components/deepagent/InlineTasksFiles.vue`

- All `--da-*` per mapping
- Tab accent: `var(--primary-color, #7c9ef8)`

### 10. `apps/web/src/components/deepagent/FileViewerModal.vue`

- Modal bg: `#ffffff` → dark surface
- Prism theme: `prism.css` → `prism-tomorrow.css`
- All colors per mapping

### 11-14. FileCard, FileGrid, TodoPanel, DeepAgentRightPanel, ThreadListPanel

- Convert all `--da-*` per mapping for consistency (even if not in active layout)

---

## Execution Strategy

Use a team of 2 agents in parallel:
- **`homepage-agent`**: Handles the complex HomePage.vue merge (restoring old AI features + dark theme CSS)
- **`theme-agent`**: Handles all 13 other component files (mechanical --da-* → dark theme conversion)

Both run simultaneously since they touch different files.

---

## Verification

```bash
pnpm typecheck && pnpm lint
```

Visual: Dark backgrounds, light text, no `--da-*` or `#f9f9f9`/`#ffffff` backgrounds remaining. NotePreviewPanel slides in. ThreadListPanel gone. ToolCallBox/MarkdownContent/SubagentCard visible in dark theme.
