# Plan: Integrate Muya Read-Only Renderer into AI Course System

**Date**: 2026-02-08
**Status**: Draft

## Context

The AI course generation system produces raw markdown content for lessons (lectures, quizzes, practices, videos), but the frontend renders it using `v-html` which expects pre-rendered HTML. Since `lesson.content.markdown` contains raw markdown (`#`, `**`, `---`, code fences, etc.), it displays as unformatted plain text instead of rich formatted content.

**Goal**: Use the Muya editor engine (already in the codebase) as a **read-only markdown renderer** to properly display course content with headings, bold, code highlighting, math, tables, blockquotes, etc. Also darken the header/sidebar while making the content area the visual highlight.

## Architecture

### New Component: `MuyaRenderer.vue`

A lightweight, reusable read-only markdown renderer wrapping Muya.

**File**: `apps/web/src/components/shared/MuyaRenderer.vue`

**Props**: `markdown: string` (the raw markdown to render)

**Key design decisions**:
- **No plugin registration** — skip all `Muya.use()` calls. EditorArea may have already registered plugins globally (they're stored on `Muya.plugins` static array), but they remain dormant when `contenteditable='false'`
- **`markRaw()`** — CRITICAL: wrap Muya instance to prevent Vue proxy issues (breaks `structuredClone()`)
- **`contenteditable='false'`** — override the hardcoded `'true'` in `getContainer()` (`muya.ts:242`) immediately after construction
- **`setContent(md, false)`** — use for reactive updates (no auto-focus)
- **CSS hiding** — hide editing artifacts (front button, quick-insert hints) via scoped CSS
- **Lifecycle** — create on `onMounted`, destroy on `onUnmounted`, watch `markdown` prop for changes

**Reference pattern**: `apps/web/src/components/editor/EditorArea.vue` lines 162-303

---

## Implementation Steps

### Step 1: Create `MuyaRenderer.vue`

**New file**: `apps/web/src/components/shared/MuyaRenderer.vue`

```vue
<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, markRaw } from 'vue'
import { Muya } from '@inkdown/muya'

// CSS imports (Vite deduplicates if EditorArea already imported them)
import '@inkdown/muya/assets/styles/index.css'
import 'katex/dist/katex.min.css'
import 'prismjs/themes/prism.css'

const props = defineProps<{
  markdown: string
}>()

const containerRef = ref<HTMLElement>()
const muyaInstance = ref<InstanceType<typeof Muya> | null>(null)

function initializeMuya() {
  if (!containerRef.value) return

  muyaInstance.value = markRaw(new Muya(containerRef.value, {
    markdown: props.markdown || '',
    focusMode: false,
    hideQuickInsertHint: true,
    hideLinkPopup: true,
    spellcheckEnabled: false,
    math: true,
    superSubScript: true,
    footnote: true,
    isGitlabCompatibilityEnabled: true,
    disableHtml: false,
    mermaidTheme: 'dark',
    codeBlockLineNumbers: false,
  }))

  // Override hardcoded contenteditable="true"
  muyaInstance.value.domNode.setAttribute('contenteditable', 'false')
  muyaInstance.value.domNode.classList.remove('mu-show-quick-insert-hint')
}

watch(() => props.markdown, (newMd) => {
  if (muyaInstance.value && newMd !== undefined) {
    muyaInstance.value.setContent(newMd || '', false)
    // Re-apply readonly after content replacement
    muyaInstance.value.domNode.setAttribute('contenteditable', 'false')
  }
})

onMounted(() => initializeMuya())

onUnmounted(() => {
  if (muyaInstance.value) {
    try { muyaInstance.value.destroy() } catch { /* ignore cleanup errors */ }
    muyaInstance.value = null
  }
})
</script>

<template>
  <div class="muya-renderer">
    <div ref="containerRef" class="muya-renderer-container" />
  </div>
</template>

<style scoped>
.muya-renderer { /* wrapper for scoping */ }

.muya-renderer-container {
  outline: none;
  cursor: default;
}

/* Hide editing UI artifacts */
.muya-renderer-container :deep(.mu-front-button),
.muya-renderer-container :deep(.mu-front-button-wrapper) {
  display: none !important;
}

/* Hide caret and prevent selection styling */
.muya-renderer-container :deep(.mu-editor) {
  cursor: default !important;
  caret-color: transparent !important;
  padding: 0 !important; /* parent controls spacing */
}

/* Make language selector in code blocks non-interactive */
.muya-renderer-container :deep(.mu-language-input) {
  pointer-events: none;
  opacity: 0.5;
}
</style>
```

### Step 2: Integrate into LectureLesson.vue

**File**: `apps/web/src/components/course/viewer/LectureLesson.vue`

**Changes**:
1. Import `MuyaRenderer` component
2. Replace `<div class="lecture-body" v-html="lesson.content.markdown" />` (line 22) with:
   ```html
   <MuyaRenderer v-if="lesson.content.markdown" :markdown="lesson.content.markdown" />
   ```
3. Remove the old `.lecture-body :deep(h1)`, `.lecture-body :deep(p)`, etc. CSS rules (lines 68-122) — Muya handles its own rendering with proper styles

### Step 3: Integrate into PracticeLesson.vue

**File**: `apps/web/src/components/course/viewer/PracticeLesson.vue`

**Changes**:
1. Import `MuyaRenderer`
2. Replace line 50: `<div v-if="lesson.content.markdown" class="intro-content" v-html="lesson.content.markdown" />` with:
   ```html
   <MuyaRenderer v-if="lesson.content.markdown" :markdown="lesson.content.markdown" />
   ```
3. Remove the `.intro-content` CSS rule (lines 159-163)

### Step 4: Integrate into QuizLesson.vue

**File**: `apps/web/src/components/course/viewer/QuizLesson.vue`

**Changes**:
1. Import `MuyaRenderer`
2. Replace line 84: `<div v-if="lesson.content.markdown && !quizSubmitted" class="quiz-intro" v-html="lesson.content.markdown" />` with:
   ```html
   <MuyaRenderer v-if="lesson.content.markdown && !quizSubmitted" :markdown="lesson.content.markdown" />
   ```
3. Remove the `.quiz-intro` CSS rule (lines 202-206)

### Step 5: Integrate into VideoLesson.vue

**File**: `apps/web/src/components/course/viewer/VideoLesson.vue`

**Changes**:
1. Import `MuyaRenderer`
2. Replace line 91: `<div v-if="lesson.content.markdown" class="supplementary-content" v-html="lesson.content.markdown" />` with:
   ```html
   <MuyaRenderer v-if="lesson.content.markdown" :markdown="lesson.content.markdown" />
   ```
3. Remove the `.supplementary-content` CSS rule (lines 260-264)

### Step 6: Course Layout Contrast Styling

**File**: `apps/web/src/views/CourseView.vue`

Make the header and sidebar darker, content area brighter:

```css
/* Darken the top bar explicitly */
.course-top-bar {
  background: var(--app-bg, #010409);
}

/* Darken the sidebar explicitly */
.course-sidebar-right {
  background: rgba(10, 12, 16, 0.95);
  backdrop-filter: blur(16px);
}

/* Brighten content reading area */
.content-scroll {
  background: var(--editor-bg-color, #1e1e22);
  border-radius: 0;
}
```

This creates visual hierarchy: dark chrome (header + sidebar) with a brighter reading pane.

---

## Key Technical Notes

| Topic | Detail |
|-------|--------|
| **Muya.plugins is static** | Plugins registered by EditorArea persist globally. MuyaRenderer instances will have those plugins instantiated but they remain dormant with `contenteditable='false'` |
| **Multiple instances safe** | Codebase already runs EditorArea + NotePreviewPanel simultaneously. Each Muya gets its own Editor/EventCenter/ScrollPage |
| **Performance** | Only ONE lesson visible at a time (LessonContent.vue dispatches by type). Typical content is 50-500 lines — well within Muya's envelope |
| **getContainer() replaces DOM** | `muya.ts:246` calls `originContainer.replaceWith(newContainer)`. The Vue `ref` points to original, but `muyaInstance.domNode` is the live container |
| **CSS already globally loaded** | EditorArea imports Muya CSS globally. MuyaRenderer imports redundantly for safety — Vite deduplicates |
| **Theme variables** | Muya consumes `--editor-color`, `--editor-bg-color`, etc. from `variables.css` — dark theme works automatically |

## Files Summary

| Action | File |
|--------|------|
| **CREATE** | `apps/web/src/components/shared/MuyaRenderer.vue` |
| **MODIFY** | `apps/web/src/components/course/viewer/LectureLesson.vue` |
| **MODIFY** | `apps/web/src/components/course/viewer/PracticeLesson.vue` |
| **MODIFY** | `apps/web/src/components/course/viewer/QuizLesson.vue` |
| **MODIFY** | `apps/web/src/components/course/viewer/VideoLesson.vue` |
| **MODIFY** | `apps/web/src/views/CourseView.vue` |

## Verification

1. **Visual**: Navigate to a lecture lesson → headings render large/bold, code blocks highlighted, lists bulleted, blockquotes styled, math rendered
2. **Read-only**: Click in content area → no cursor, no editing toolbar, no front button ghost icon
3. **Navigation**: Switch between lessons → content updates correctly, no stale content
4. **All types**: Test lecture, practice, quiz, video — all render their markdown sections
5. **Contrast**: Header and sidebar visually darker than the content reading area
6. **No regressions**: The main note editor (EditorArea) still works normally
7. **Build**: `pnpm typecheck && pnpm build` passes
