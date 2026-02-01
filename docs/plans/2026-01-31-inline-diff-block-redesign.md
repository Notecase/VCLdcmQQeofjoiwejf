# Inline Diff Block Redesign - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the broken character-level inline diff with a clean hunk-based diff block UI where clicking `+`/`-` icons accepts/rejects changes.

**Architecture:** Create a new `InlineDiffBlock.vue` component that renders entire hunks as visual blocks (not inline highlights). Each hunk shows deletion line (`-`) and addition line (`+`) with clickable icons. Clicking resolves the hunk and collapses the block to show the result. A floating `DiffActionBar.vue` provides "Accept All" / "Deny All" for bulk actions.

**Tech Stack:** Vue 3, Pinia (existing AI store), CSS variables (existing theme system)

---

## Task 1: Create InlineDiffBlock Component

**Files:**
- Create: `apps/web/src/components/ai/InlineDiffBlock.vue`

**Step 1: Create the component file with basic structure**

```vue
<script setup lang="ts">
/**
 * InlineDiffBlock - Clean hunk-based diff visualization
 *
 * Displays a single diff hunk as a block with:
 * - Deletion row (red, with clickable "-" icon)
 * - Addition row (green, with clickable "+" icon)
 *
 * Click "-" = reject change (keep original)
 * Click "+" = accept change (use new version)
 */
import { computed } from 'vue'
import type { DiffHunk } from '@/stores/ai'

const props = defineProps<{
  hunk: DiffHunk
  editId: string
}>()

const emit = defineEmits<{
  accept: [hunkId: string]
  reject: [hunkId: string]
}>()

const showDeletion = computed(() =>
  props.hunk.oldContent && props.hunk.type !== 'add'
)

const showAddition = computed(() =>
  props.hunk.newContent && props.hunk.type !== 'remove'
)

function handleReject() {
  // Click on "-" means reject the change (keep original)
  emit('reject', props.hunk.id)
}

function handleAccept() {
  // Click on "+" means accept the change (use new version)
  emit('accept', props.hunk.id)
}
</script>

<template>
  <div class="inline-diff-block" :class="{ 'type-modify': hunk.type === 'modify' }">
    <!-- Deletion row -->
    <div
      v-if="showDeletion"
      class="diff-row deletion"
      role="button"
      tabindex="0"
      @click="handleReject"
      @keydown.enter="handleReject"
      @keydown.space.prevent="handleReject"
    >
      <span class="diff-icon">−</span>
      <span class="diff-content">{{ hunk.oldContent }}</span>
    </div>

    <!-- Addition row -->
    <div
      v-if="showAddition"
      class="diff-row addition"
      role="button"
      tabindex="0"
      @click="handleAccept"
      @keydown.enter="handleAccept"
      @keydown.space.prevent="handleAccept"
    >
      <span class="diff-icon">+</span>
      <span class="diff-content">{{ hunk.newContent }}</span>
    </div>
  </div>
</template>

<style scoped>
.inline-diff-block {
  margin: 8px 0;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--border-color, #30363d);
  font-family: inherit;
  font-size: inherit;
  line-height: 1.6;
}

.diff-row {
  display: flex;
  align-items: flex-start;
  padding: 8px 12px;
  cursor: pointer;
  transition: all 0.15s ease;
  gap: 12px;
}

.diff-row:hover {
  filter: brightness(1.1);
}

.diff-row:active {
  transform: scale(0.995);
}

.diff-row:focus {
  outline: 2px solid var(--primary-color, #58a6ff);
  outline-offset: -2px;
}

/* Deletion row - red theme */
.diff-row.deletion {
  background: rgba(248, 81, 73, 0.15);
  border-bottom: 1px solid rgba(248, 81, 73, 0.3);
}

.diff-row.deletion .diff-icon {
  color: #f85149;
  font-weight: 600;
}

.diff-row.deletion .diff-content {
  color: #ffa198;
}

/* Addition row - green theme */
.diff-row.addition {
  background: rgba(46, 160, 67, 0.15);
}

.diff-row.addition .diff-icon {
  color: #3fb950;
  font-weight: 600;
}

.diff-row.addition .diff-content {
  color: #7ee787;
}

/* Icon styling */
.diff-icon {
  flex-shrink: 0;
  width: 20px;
  font-size: 16px;
  font-weight: bold;
  text-align: center;
  user-select: none;
}

/* Content styling */
.diff-content {
  flex: 1;
  white-space: pre-wrap;
  word-break: break-word;
}

/* When only one row exists (pure add or pure remove) */
.inline-diff-block:not(.type-modify) .diff-row {
  border-bottom: none;
}
</style>
```

**Step 2: Verify file created**

Run: `ls -la apps/web/src/components/ai/InlineDiffBlock.vue`
Expected: File exists

**Step 3: Commit**

```bash
git add apps/web/src/components/ai/InlineDiffBlock.vue
git commit -m "feat(ai): add InlineDiffBlock component for hunk-based diff UI"
```

---

## Task 2: Create DiffActionBar Component

**Files:**
- Create: `apps/web/src/components/ai/DiffActionBar.vue`

**Step 1: Create the floating action bar component**

```vue
<script setup lang="ts">
/**
 * DiffActionBar - Floating bar with Accept All / Deny All buttons
 *
 * Appears at bottom center when diff blocks are active.
 * Disappears when all hunks are resolved.
 */
import { computed } from 'vue'
import { CheckCheck, XCircle } from 'lucide-vue-next'

const props = defineProps<{
  pendingCount: number
  totalCount: number
}>()

const emit = defineEmits<{
  acceptAll: []
  rejectAll: []
}>()

const isVisible = computed(() => props.pendingCount > 0)
</script>

<template>
  <Teleport to="body">
    <Transition name="slide-up">
      <div v-if="isVisible" class="diff-action-bar">
        <span class="pending-count">{{ pendingCount }} change{{ pendingCount !== 1 ? 's' : '' }} remaining</span>

        <button
          class="action-btn accept-all"
          @click="emit('acceptAll')"
        >
          <CheckCheck :size="16" />
          Accept All
        </button>

        <button
          class="action-btn reject-all"
          @click="emit('rejectAll')"
        >
          <XCircle :size="16" />
          Deny All
        </button>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.diff-action-bar {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 20px;
  background: var(--float-btn-bg, rgba(22, 27, 34, 0.95));
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--border-color, rgba(48, 54, 61, 0.8));
  border-radius: 12px;
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.4),
    0 4px 12px rgba(0, 0, 0, 0.2);
  z-index: 1000;
}

.pending-count {
  color: var(--text-color-secondary, #8b949e);
  font-size: 13px;
  font-weight: 500;
  padding-right: 12px;
  border-right: 1px solid var(--border-color, rgba(48, 54, 61, 0.5));
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.action-btn.accept-all {
  background: var(--diff-add-border, #3fb950);
  color: white;
}

.action-btn.accept-all:hover {
  background: #2ea043;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(46, 160, 67, 0.4);
}

.action-btn.reject-all {
  background: rgba(248, 81, 73, 0.15);
  color: #f85149;
  border: 1px solid rgba(248, 81, 73, 0.3);
}

.action-btn.reject-all:hover {
  background: rgba(248, 81, 73, 0.25);
  transform: translateY(-1px);
}

/* Slide-up animation */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(20px);
}
</style>
```

**Step 2: Verify file created**

Run: `ls -la apps/web/src/components/ai/DiffActionBar.vue`
Expected: File exists

**Step 3: Commit**

```bash
git add apps/web/src/components/ai/DiffActionBar.vue
git commit -m "feat(ai): add DiffActionBar floating component for bulk actions"
```

---

## Task 3: Create InlineDiffView Container Component

**Files:**
- Create: `apps/web/src/components/ai/InlineDiffView.vue`

**Step 1: Create the container that manages diff blocks**

This component replaces `InlineDiffController.vue`. It doesn't try to inject into Muya's DOM - instead, it renders diff blocks as a separate overlay that visually replaces the editor content.

```vue
<script setup lang="ts">
/**
 * InlineDiffView - Container for hunk-based inline diff visualization
 *
 * Architecture:
 * 1. When activeEdit exists, render diff blocks over the editor
 * 2. Each hunk is an InlineDiffBlock
 * 3. When user clicks +/-, resolve the hunk and collapse
 * 4. When all hunks resolved, apply changes and restore editor
 */
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useAIStore } from '@/stores/ai'
import InlineDiffBlock from './InlineDiffBlock.vue'
import DiffActionBar from './DiffActionBar.vue'

const props = defineProps<{
  getMuya: () => any
}>()

const emit = defineEmits<{
  apply: [content: string]
  discard: []
}>()

const aiStore = useAIStore()

// Local state
const isActive = ref(false)
const originalMarkdown = ref('')
const resolvedHunks = ref<Map<string, 'accepted' | 'rejected'>>(new Map())

// Computed
const activeEdit = computed(() => aiStore.activeEdit)
const hunks = computed(() => activeEdit.value?.diffHunks || [])
const pendingHunks = computed(() =>
  hunks.value.filter(h => !resolvedHunks.value.has(h.id))
)
const pendingCount = computed(() => pendingHunks.value.length)
const totalCount = computed(() => hunks.value.length)

// Watch for active edit changes
watch(
  activeEdit,
  (edit) => {
    if (edit && !isActive.value) {
      activateDiffMode(edit)
    } else if (!edit && isActive.value) {
      deactivateDiffMode()
    }
  },
  { immediate: true }
)

// Watch for all hunks resolved
watch(
  pendingCount,
  async (count) => {
    if (count === 0 && isActive.value && totalCount.value > 0) {
      // All hunks resolved - auto-apply
      await nextTick()
      applyChanges()
    }
  }
)

function activateDiffMode(edit: NonNullable<typeof activeEdit.value>) {
  const muya = props.getMuya()
  if (!muya) return

  // Store original content for potential discard
  originalMarkdown.value = edit.originalContent

  // Reset resolved hunks
  resolvedHunks.value = new Map()

  isActive.value = true
}

function deactivateDiffMode() {
  isActive.value = false
  resolvedHunks.value = new Map()
  originalMarkdown.value = ''
}

function handleAcceptHunk(hunkId: string) {
  resolvedHunks.value.set(hunkId, 'accepted')

  // Also update store state
  if (activeEdit.value) {
    aiStore.acceptHunk(activeEdit.value.id, hunkId)
  }
}

function handleRejectHunk(hunkId: string) {
  resolvedHunks.value.set(hunkId, 'rejected')

  // Also update store state
  if (activeEdit.value) {
    aiStore.rejectHunk(activeEdit.value.id, hunkId)
  }
}

function handleAcceptAll() {
  pendingHunks.value.forEach(hunk => {
    handleAcceptHunk(hunk.id)
  })
}

function handleRejectAll() {
  pendingHunks.value.forEach(hunk => {
    handleRejectHunk(hunk.id)
  })
}

function applyChanges() {
  if (!activeEdit.value) return

  // Get final content from store (which handles the merge logic)
  const finalContent = aiStore.applyAcceptedHunks(activeEdit.value.id)

  if (finalContent !== null) {
    emit('apply', finalContent)
  }

  // Clear active edit
  aiStore.setActiveEdit(null)
}

function handleDiscard() {
  // Restore original content
  const muya = props.getMuya()
  if (muya && originalMarkdown.value) {
    muya.setMarkdown(originalMarkdown.value)
  }

  if (activeEdit.value) {
    aiStore.discardEdit(activeEdit.value.id)
  }

  emit('discard')
}

// Check if a hunk is still pending (not yet resolved)
function isHunkPending(hunkId: string): boolean {
  return !resolvedHunks.value.has(hunkId)
}

onMounted(() => {
  if (activeEdit.value && !isActive.value) {
    activateDiffMode(activeEdit.value)
  }
})

onUnmounted(() => {
  if (isActive.value) {
    deactivateDiffMode()
  }
})
</script>

<template>
  <div v-if="isActive && activeEdit" class="inline-diff-view">
    <!-- Diff blocks container -->
    <div class="diff-blocks-container">
      <!-- Context: Show what's being edited -->
      <div class="diff-header">
        <span class="diff-title">AI Suggested Changes</span>
        <span class="diff-stats">
          <span class="stat additions">+{{ hunks.filter(h => h.type !== 'remove').length }}</span>
          <span class="stat deletions">-{{ hunks.filter(h => h.type !== 'add').length }}</span>
        </span>
      </div>

      <!-- Render each pending hunk as a diff block -->
      <template v-for="hunk in hunks" :key="hunk.id">
        <InlineDiffBlock
          v-if="isHunkPending(hunk.id)"
          :hunk="hunk"
          :edit-id="activeEdit.id"
          @accept="handleAcceptHunk"
          @reject="handleRejectHunk"
        />
      </template>

      <!-- Empty state when all resolved -->
      <div v-if="pendingCount === 0 && totalCount > 0" class="all-resolved">
        Applying changes...
      </div>
    </div>

    <!-- Floating action bar -->
    <DiffActionBar
      :pending-count="pendingCount"
      :total-count="totalCount"
      @accept-all="handleAcceptAll"
      @reject-all="handleRejectAll"
    />
  </div>
</template>

<style scoped>
.inline-diff-view {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--editor-bg, #0d1117);
  z-index: 50;
  overflow-y: auto;
  padding: 20px;
}

.diff-blocks-container {
  max-width: 800px;
  margin: 0 auto;
}

.diff-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color, #30363d);
}

.diff-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color, #e6edf3);
}

.diff-stats {
  display: flex;
  gap: 8px;
}

.stat {
  font-size: 12px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 4px;
}

.stat.additions {
  color: #3fb950;
  background: rgba(46, 160, 67, 0.15);
}

.stat.deletions {
  color: #f85149;
  background: rgba(248, 81, 73, 0.15);
}

.all-resolved {
  text-align: center;
  padding: 40px;
  color: var(--text-color-secondary, #8b949e);
  font-size: 14px;
}
</style>
```

**Step 2: Verify file created**

Run: `ls -la apps/web/src/components/ai/InlineDiffView.vue`
Expected: File exists

**Step 3: Commit**

```bash
git add apps/web/src/components/ai/InlineDiffView.vue
git commit -m "feat(ai): add InlineDiffView container for hunk-based diff"
```

---

## Task 4: Update EditorArea to Use New InlineDiffView

**Files:**
- Modify: `apps/web/src/components/editor/EditorArea.vue`

**Step 1: Replace InlineDiffController import with InlineDiffView**

Find this import (around line 6):
```typescript
import InlineDiffController from '@/components/ai/InlineDiffController.vue'
```

Replace with:
```typescript
import InlineDiffView from '@/components/ai/InlineDiffView.vue'
```

**Step 2: Update template to use InlineDiffView**

Find the InlineDiffController usage in the template (search for `InlineDiffController`):
```vue
<InlineDiffController
  v-if="showDiffOverlay && diffViewMode === 'inline'"
  :get-muya="getMuya"
  @apply="handleDiffApply"
  @discard="handleDiffDiscard"
/>
```

Replace with:
```vue
<InlineDiffView
  v-if="showDiffOverlay && diffViewMode === 'inline'"
  :get-muya="getMuya"
  @apply="handleDiffApply"
  @discard="handleDiffDiscard"
/>
```

**Step 3: Verify the change compiles**

Run: `cd /Users/quangnguyen/CodingPRJ/inkdown && pnpm typecheck`
Expected: No TypeScript errors related to InlineDiffView

**Step 4: Commit**

```bash
git add apps/web/src/components/editor/EditorArea.vue
git commit -m "feat(ai): integrate InlineDiffView into EditorArea"
```

---

## Task 5: Test the New Diff UI

**Files:**
- Test manually in browser

**Step 1: Start the dev server**

Run: `cd /Users/quangnguyen/CodingPRJ/inkdown && pnpm dev`
Expected: Dev server starts without errors

**Step 2: Manual testing checklist**

1. Open a note in the editor
2. Trigger an AI edit proposal (via chat or shortcut)
3. Verify: Diff blocks appear with `-` and `+` rows
4. Click the `-` row → Verify: Block collapses, original text kept
5. Click the `+` row → Verify: Block collapses, new text applied
6. Test "Accept All" button → Verify: All pending hunks accepted
7. Test "Deny All" button → Verify: All pending hunks rejected
8. Verify: Action bar disappears when all hunks resolved

**Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix(ai): address issues found during manual testing"
```

---

## Task 6: Clean Up Old Components (Optional)

**Files:**
- Archive: `apps/web/src/components/ai/InlineDiffController.vue`
- Archive: `apps/web/src/components/ai/InlineDiffRenderer.vue`
- Clean: `apps/web/src/utils/diffMerger.ts` (remove unused functions)

**Step 1: Move old components to archive folder**

```bash
mkdir -p apps/web/src/components/ai/_deprecated
mv apps/web/src/components/ai/InlineDiffController.vue apps/web/src/components/ai/_deprecated/
mv apps/web/src/components/ai/InlineDiffRenderer.vue apps/web/src/components/ai/_deprecated/
```

**Step 2: Commit cleanup**

```bash
git add -A
git commit -m "chore(ai): archive deprecated inline diff components"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Create InlineDiffBlock component | `InlineDiffBlock.vue` |
| 2 | Create DiffActionBar component | `DiffActionBar.vue` |
| 3 | Create InlineDiffView container | `InlineDiffView.vue` |
| 4 | Integrate into EditorArea | `EditorArea.vue` |
| 5 | Manual testing | - |
| 6 | Archive old components | `_deprecated/` |

**Key Design Decisions:**
- **No DOM injection**: Diff blocks are a separate overlay, not injected into Muya
- **Hunk-level granularity**: Each block is one hunk (paragraph-level change)
- **Click to decide**: `-` keeps original, `+` uses new version
- **Auto-apply**: When all hunks resolved, changes apply automatically
- **Store sync**: All decisions sync to AI store for persistence
