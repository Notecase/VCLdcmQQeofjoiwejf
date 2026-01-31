<script setup lang="ts">
/**
 * InlineDiffOverlay - Cursor-like inline diff visualization
 *
 * Renders diff hunks as an overlay on the Muya editor:
 * - Green background for additions
 * - Red strikethrough for deletions
 * - Accept/Reject buttons per hunk
 * - Keyboard shortcuts: Tab (next), Shift+Tab (prev), Cmd+Enter (accept), Escape (reject)
 */
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useAIStore, type DiffHunk } from '@/stores/ai'
import { Check, X } from 'lucide-vue-next'

defineProps<{
  editorElement: HTMLElement | null
}>()

const emit = defineEmits<{
  apply: [content: string]
  discard: []
}>()

const store = useAIStore()

// Refs for positioning
const overlayRef = ref<HTMLElement | null>(null)
const hunkRefs = ref<Map<string, HTMLElement>>(new Map())

// Computed
const activeEdit = computed(() => store.activeEdit)
const hunks = computed(() => activeEdit.value?.diffHunks || [])
const focusedHunkIndex = computed(() => store.focusedHunkIndex)
const focusedHunk = computed(() => store.focusedHunk)

const pendingCount = computed(() => hunks.value.filter((h) => h.status === 'pending').length)

const additionsCount = computed(() => {
  return hunks.value
    .filter((h) => h.status !== 'rejected')
    .reduce((sum, h) => sum + h.newLines, 0)
})

const deletionsCount = computed(() => {
  return hunks.value
    .filter((h) => h.status !== 'rejected')
    .reduce((sum, h) => sum + h.oldLines, 0)
})

// Scroll focused hunk into view
watch(focusedHunkIndex, async () => {
  await nextTick()
  const hunk = focusedHunk.value
  if (hunk) {
    const el = hunkRefs.value.get(hunk.id)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
})

// Keyboard handler
function handleKeydown(e: KeyboardEvent) {
  if (!activeEdit.value) return

  // Tab / Shift+Tab - navigate hunks
  if (e.key === 'Tab') {
    e.preventDefault()
    if (e.shiftKey) {
      store.focusPreviousHunk()
    } else {
      store.focusNextHunk()
    }
    return
  }

  // Cmd/Ctrl + Enter - accept focused hunk
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault()
    if (focusedHunk.value && focusedHunk.value.status === 'pending') {
      store.acceptHunk(activeEdit.value.id, focusedHunk.value.id)
    }
    return
  }

  // Escape - reject focused hunk or close overlay
  if (e.key === 'Escape') {
    e.preventDefault()
    if (focusedHunk.value && focusedHunk.value.status === 'pending') {
      store.rejectHunk(activeEdit.value.id, focusedHunk.value.id)
    } else {
      handleDiscard()
    }
    return
  }

  // Y - accept focused hunk (vim-style)
  if (e.key === 'y' && !e.metaKey && !e.ctrlKey) {
    if (focusedHunk.value && focusedHunk.value.status === 'pending') {
      e.preventDefault()
      store.acceptHunk(activeEdit.value.id, focusedHunk.value.id)
    }
    return
  }

  // N - reject focused hunk (vim-style)
  if (e.key === 'n' && !e.metaKey && !e.ctrlKey) {
    if (focusedHunk.value && focusedHunk.value.status === 'pending') {
      e.preventDefault()
      store.rejectHunk(activeEdit.value.id, focusedHunk.value.id)
    }
    return
  }
}

function handleAcceptHunk(hunk: DiffHunk) {
  if (activeEdit.value) {
    store.acceptHunk(activeEdit.value.id, hunk.id)
  }
}

function handleRejectHunk(hunk: DiffHunk) {
  if (activeEdit.value) {
    store.rejectHunk(activeEdit.value.id, hunk.id)
  }
}

function handleAcceptAll() {
  if (activeEdit.value) {
    store.acceptAllHunks(activeEdit.value.id)
  }
}

function handleRejectAll() {
  if (activeEdit.value) {
    store.rejectAllHunks(activeEdit.value.id)
  }
}

function handleApply() {
  if (!activeEdit.value) return
  const finalContent = store.applyAcceptedHunks(activeEdit.value.id)
  if (finalContent !== null) {
    emit('apply', finalContent)
  }
  store.setActiveEdit(null)
}

function handleDiscard() {
  if (activeEdit.value) {
    store.discardEdit(activeEdit.value.id)
  }
  emit('discard')
}

function setHunkRef(id: string, el: HTMLElement | null) {
  if (el) {
    hunkRefs.value.set(id, el)
  } else {
    hunkRefs.value.delete(id)
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div
    v-if="activeEdit"
    ref="overlayRef"
    class="inline-diff-overlay"
  >
    <!-- Header toolbar -->
    <div class="diff-toolbar">
      <div class="diff-stats">
        <span class="stat additions">+{{ additionsCount }}</span>
        <span class="stat deletions">-{{ deletionsCount }}</span>
        <span class="stat pending">{{ pendingCount }} pending</span>
      </div>

      <div class="diff-actions">
        <button
          class="action-btn accept-all"
          :disabled="pendingCount === 0"
          title="Accept All (Cmd+Shift+Enter)"
          @click="handleAcceptAll"
        >
          <Check :size="14" />
          Accept All
        </button>
        <button
          class="action-btn reject-all"
          :disabled="pendingCount === 0"
          title="Reject All"
          @click="handleRejectAll"
        >
          <X :size="14" />
          Reject All
        </button>
        <button
          class="action-btn apply"
          title="Apply Changes"
          @click="handleApply"
        >
          Apply
        </button>
        <button
          class="action-btn discard"
          title="Discard All"
          @click="handleDiscard"
        >
          Discard
        </button>
      </div>
    </div>

    <!-- Diff hunks -->
    <div class="diff-content">
      <div
        v-for="(hunk, index) in hunks"
        :key="hunk.id"
        :ref="(el) => setHunkRef(hunk.id, el as HTMLElement)"
        class="diff-hunk"
        :class="{
          focused: index === focusedHunkIndex,
          accepted: hunk.status === 'accepted',
          rejected: hunk.status === 'rejected',
          'type-add': hunk.type === 'add',
          'type-remove': hunk.type === 'remove',
          'type-modify': hunk.type === 'modify',
        }"
      >
        <!-- Hunk header -->
        <div class="hunk-header">
          <span class="hunk-location">
            Line {{ hunk.oldStart }}
            <span
              v-if="hunk.type === 'modify'"
              class="hunk-type"
              >Modified</span
            >
            <span
              v-else-if="hunk.type === 'add'"
              class="hunk-type add"
              >Added</span
            >
            <span
              v-else-if="hunk.type === 'remove'"
              class="hunk-type remove"
              >Removed</span
            >
          </span>

          <div
            v-if="hunk.status === 'pending'"
            class="hunk-actions"
          >
            <button
              class="hunk-btn accept"
              title="Accept (y or Cmd+Enter)"
              @click="handleAcceptHunk(hunk)"
            >
              <Check :size="12" />
            </button>
            <button
              class="hunk-btn reject"
              title="Reject (n or Escape)"
              @click="handleRejectHunk(hunk)"
            >
              <X :size="12" />
            </button>
          </div>

          <div
            v-else
            class="hunk-status"
          >
            <span
              v-if="hunk.status === 'accepted'"
              class="status-badge accepted"
              >Accepted</span
            >
            <span
              v-else
              class="status-badge rejected"
              >Rejected</span
            >
          </div>
        </div>

        <!-- Hunk content -->
        <div class="hunk-content">
          <!-- Old content (deletions) -->
          <div
            v-if="hunk.oldContent && hunk.type !== 'add'"
            class="hunk-old"
          >
            <pre><code v-for="(line, i) in hunk.oldContent.split('\n')" :key="'old-' + i" class="diff-line removed">- {{ line }}</code></pre>
          </div>

          <!-- New content (additions) -->
          <div
            v-if="hunk.newContent && hunk.type !== 'remove'"
            class="hunk-new"
          >
            <pre><code v-for="(line, i) in hunk.newContent.split('\n')" :key="'new-' + i" class="diff-line added">+ {{ line }}</code></pre>
          </div>
        </div>
      </div>
    </div>

    <!-- Navigation hints -->
    <div class="diff-hints">
      <span class="hint">
        <kbd>Tab</kbd> Next hunk
      </span>
      <span class="hint">
        <kbd>Shift+Tab</kbd> Previous
      </span>
      <span class="hint">
        <kbd>y</kbd> Accept
      </span>
      <span class="hint">
        <kbd>n</kbd> Reject
      </span>
      <span class="hint">
        <kbd>Esc</kbd> Close
      </span>
    </div>
  </div>
</template>

<style scoped>
.inline-diff-overlay {
  position: absolute;
  top: 0;
  right: 0;
  width: 400px;
  max-height: 100%;
  background: var(--ai-sidebar-bg, #0d1117);
  border-left: 1px solid var(--border-color, #30363d);
  display: flex;
  flex-direction: column;
  z-index: 100;
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.3);
}

/* Toolbar */
.diff-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: rgba(22, 27, 34, 0.9);
  border-bottom: 1px solid var(--border-color, #30363d);
  gap: 12px;
}

.diff-stats {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.stat {
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;
}

.stat.additions {
  color: #3fb950;
  background: rgba(63, 185, 80, 0.15);
}

.stat.deletions {
  color: #f85149;
  background: rgba(248, 81, 73, 0.15);
}

.stat.pending {
  color: #8b949e;
  background: rgba(139, 148, 158, 0.15);
}

.diff-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 500;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
}

.action-btn.accept-all {
  background: rgba(63, 185, 80, 0.15);
  color: #3fb950;
}

.action-btn.accept-all:hover:not(:disabled) {
  background: rgba(63, 185, 80, 0.25);
}

.action-btn.reject-all {
  background: rgba(248, 81, 73, 0.15);
  color: #f85149;
}

.action-btn.reject-all:hover:not(:disabled) {
  background: rgba(248, 81, 73, 0.25);
}

.action-btn.apply {
  background: var(--primary-color, #58a6ff);
  color: white;
}

.action-btn.apply:hover {
  opacity: 0.9;
}

.action-btn.discard {
  background: transparent;
  color: #8b949e;
  border: 1px solid #30363d;
}

.action-btn.discard:hover {
  background: #21262d;
}

.action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Diff content */
.diff-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.diff-hunk {
  margin-bottom: 8px;
  border-radius: 6px;
  border: 1px solid #30363d;
  background: #161b22;
  overflow: hidden;
  transition: all 0.15s;
}

.diff-hunk.focused {
  border-color: #58a6ff;
  box-shadow: 0 0 0 2px rgba(88, 166, 255, 0.2);
}

.diff-hunk.accepted {
  border-color: #3fb950;
  opacity: 0.7;
}

.diff-hunk.rejected {
  border-color: #f85149;
  opacity: 0.5;
}

/* Hunk header */
.hunk-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: rgba(22, 27, 34, 0.8);
  border-bottom: 1px solid #21262d;
}

.hunk-location {
  font-size: 11px;
  color: #8b949e;
  display: flex;
  align-items: center;
  gap: 8px;
}

.hunk-type {
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 500;
  text-transform: uppercase;
}

.hunk-type.add {
  background: rgba(63, 185, 80, 0.15);
  color: #3fb950;
}

.hunk-type.remove {
  background: rgba(248, 81, 73, 0.15);
  color: #f85149;
}

.hunk-actions {
  display: flex;
  gap: 4px;
}

.hunk-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
}

.hunk-btn.accept {
  background: rgba(63, 185, 80, 0.15);
  color: #3fb950;
}

.hunk-btn.accept:hover {
  background: rgba(63, 185, 80, 0.3);
}

.hunk-btn.reject {
  background: rgba(248, 81, 73, 0.15);
  color: #f85149;
}

.hunk-btn.reject:hover {
  background: rgba(248, 81, 73, 0.3);
}

.hunk-status {
  font-size: 10px;
}

.status-badge {
  padding: 2px 6px;
  border-radius: 3px;
  font-weight: 500;
}

.status-badge.accepted {
  background: rgba(63, 185, 80, 0.15);
  color: #3fb950;
}

.status-badge.rejected {
  background: rgba(248, 81, 73, 0.15);
  color: #f85149;
}

/* Hunk content */
.hunk-content {
  padding: 8px;
}

.hunk-old,
.hunk-new {
  margin: 0;
}

.hunk-old pre,
.hunk-new pre {
  margin: 0;
  padding: 0;
  background: transparent;
}

.diff-line {
  display: block;
  padding: 1px 8px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.diff-line.removed {
  background: rgba(248, 81, 73, 0.15);
  color: #ffa198;
  text-decoration: line-through;
  text-decoration-color: rgba(248, 81, 73, 0.5);
}

.diff-line.added {
  background: rgba(63, 185, 80, 0.15);
  color: #7ee787;
}

/* Hints */
.diff-hints {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(22, 27, 34, 0.9);
  border-top: 1px solid var(--border-color, #30363d);
  font-size: 10px;
  color: #6e7681;
}

.hint {
  display: flex;
  align-items: center;
  gap: 4px;
}

kbd {
  padding: 1px 4px;
  background: #21262d;
  border: 1px solid #30363d;
  border-radius: 3px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
}

/* Scrollbar */
.diff-content::-webkit-scrollbar {
  width: 6px;
}

.diff-content::-webkit-scrollbar-track {
  background: transparent;
}

.diff-content::-webkit-scrollbar-thumb {
  background: #30363d;
  border-radius: 3px;
}
</style>
