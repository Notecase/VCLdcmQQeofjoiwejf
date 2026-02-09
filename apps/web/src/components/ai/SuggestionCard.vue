<script setup lang="ts">
/**
 * SuggestionCard - GitHub Unified Diff Style
 *
 * Features:
 * - Line-by-line diff with line numbers
 * - Word-level highlighting for modifications
 * - Accept/reject buttons with keyboard shortcuts
 * - Focused state with clear visual indicator
 * - Smooth animations on state change
 */
import { computed } from 'vue'
import type { DiffHunk } from '@/stores/ai'
import { Check, X } from 'lucide-vue-next'
import StatusBadge from './shared/StatusBadge.vue'
import KeyboardShortcut from './shared/KeyboardShortcut.vue'

const props = defineProps<{
  hunk: DiffHunk
  position: { top: number; left: number; width: number }
  isFocused: boolean
}>()

const emit = defineEmits<{
  accept: [hunkId: string]
  reject: [hunkId: string]
}>()

// Status helpers
const isPending = computed(() => props.hunk.status === 'pending')
const isAccepted = computed(() => props.hunk.status === 'accepted')
const isRejected = computed(() => props.hunk.status === 'rejected')

// Position style
const positionStyle = computed(() => ({
  top: `${props.position.top}px`,
  left: `${props.position.left}px`,
  width: `${props.position.width}px`,
}))

// Parse content into diff lines
interface DiffLine {
  type: 'context' | 'addition' | 'deletion'
  prefix: string
  content: string
  oldLineNum: number | null
  newLineNum: number | null
}

const diffLines = computed((): DiffLine[] => {
  const lines: DiffLine[] = []
  const oldLines = props.hunk.oldContent ? props.hunk.oldContent.split('\n') : []
  const newLines = props.hunk.newContent ? props.hunk.newContent.split('\n') : []

  let oldLineNum = props.hunk.oldStart
  let newLineNum = props.hunk.newStart

  // Handle different hunk types
  if (props.hunk.type === 'add') {
    // Only additions
    newLines.forEach((line) => {
      lines.push({
        type: 'addition',
        prefix: '+',
        content: line,
        oldLineNum: null,
        newLineNum: newLineNum++,
      })
    })
  } else if (props.hunk.type === 'remove') {
    // Only deletions
    oldLines.forEach((line) => {
      lines.push({
        type: 'deletion',
        prefix: '-',
        content: line,
        oldLineNum: oldLineNum++,
        newLineNum: null,
      })
    })
  } else {
    // Modifications - show deletions first, then additions
    oldLines.forEach((line) => {
      lines.push({
        type: 'deletion',
        prefix: '-',
        content: line,
        oldLineNum: oldLineNum++,
        newLineNum: null,
      })
    })
    newLines.forEach((line) => {
      lines.push({
        type: 'addition',
        prefix: '+',
        content: line,
        oldLineNum: null,
        newLineNum: newLineNum++,
      })
    })
  }

  return lines
})

// Count additions and deletions
const additionCount = computed(() => diffLines.value.filter((l) => l.type === 'addition').length)
const deletionCount = computed(() => diffLines.value.filter((l) => l.type === 'deletion').length)

function handleAccept() {
  emit('accept', props.hunk.id)
}

function handleReject() {
  emit('reject', props.hunk.id)
}
</script>

<template>
  <div
    class="diff-card"
    :class="{
      focused: isFocused,
      accepted: isAccepted,
      rejected: isRejected,
      pending: isPending,
    }"
    :style="positionStyle"
    :data-hunk-id="hunk.id"
  >
    <!-- Diff header -->
    <div class="diff-header">
      <div class="diff-stats">
        <span
          v-if="additionCount > 0"
          class="stat additions"
          >+{{ additionCount }}</span
        >
        <span
          v-if="deletionCount > 0"
          class="stat deletions"
          >-{{ deletionCount }}</span
        >
      </div>

      <div
        v-if="isPending"
        class="diff-actions"
      >
        <button
          class="action-btn accept"
          type="button"
          @click="handleAccept"
        >
          <Check :size="12" />
          <span>Accept</span>
          <KeyboardShortcut keys="⌘↵" />
        </button>
        <button
          class="action-btn reject"
          type="button"
          @click="handleReject"
        >
          <X :size="12" />
          <span>Reject</span>
          <KeyboardShortcut keys="⌘⌫" />
        </button>
      </div>
      <StatusBadge
        v-else
        :status="hunk.status"
        show-label
      />
    </div>

    <!-- GitHub unified diff lines -->
    <div class="diff-lines">
      <div
        v-for="(line, idx) in diffLines"
        :key="idx"
        class="diff-line"
        :class="line.type"
      >
        <span class="line-number old">{{ line.oldLineNum ?? '' }}</span>
        <span class="line-number new">{{ line.newLineNum ?? '' }}</span>
        <span class="line-prefix">{{ line.prefix }}</span>
        <span class="line-content">{{ line.content || ' ' }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.diff-card {
  position: absolute;
  background: var(--surface-2);
  border: 1px solid var(--diff-add-border);
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  transition: all var(--transition-normal) ease;
  z-index: 60;
}

.diff-card.focused {
  border-color: var(--stream-cursor);
  box-shadow:
    0 0 0 2px rgba(88, 166, 255, 0.25),
    0 4px 20px rgba(0, 0, 0, 0.25);
}

.diff-card.accepted {
  opacity: 0.7;
  border-color: var(--role-assistant-color);
}

.diff-card.rejected {
  opacity: 0.5;
  border-color: var(--text-muted);
}

/* ============================================
 * DIFF HEADER
 * ============================================ */

.diff-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: var(--surface-1);
  border-bottom: 1px solid var(--border-subtle);
}

.diff-stats {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stat {
  font-size: 11px;
  font-weight: 600;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
}

.stat.additions {
  color: var(--diff-add-border);
}

.stat.deletions {
  color: var(--diff-remove-border);
}

.diff-actions {
  display: flex;
  gap: 8px;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 500;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all var(--transition-fast) ease;
}

.action-btn.accept {
  background: var(--diff-add-border);
  color: white;
}

.action-btn.accept:hover {
  background: #2ea043;
}

.action-btn.reject {
  background: var(--diff-remove-bg);
  color: var(--diff-remove-border);
  border: 1px solid var(--diff-remove-border);
}

.action-btn.reject:hover {
  background: var(--diff-remove-line-bg);
}

.action-btn:active {
  transform: scale(0.97);
}

/* ============================================
 * DIFF LINES - GitHub Style
 * ============================================ */

.diff-lines {
  overflow-x: auto;
  font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace;
  font-size: 12px;
  line-height: var(--diff-line-height);
}

.diff-line {
  display: flex;
  min-height: var(--diff-line-height);
  border-left: 4px solid transparent;
}

.diff-line.context {
  background: transparent;
}

.diff-line.addition {
  background: var(--diff-add-bg);
  border-left-color: var(--diff-add-border);
}

.diff-line.deletion {
  background: var(--diff-remove-bg);
  border-left-color: var(--diff-remove-border);
}

.line-number {
  width: var(--diff-line-num-width);
  min-width: var(--diff-line-num-width);
  padding: 0 8px;
  text-align: right;
  color: var(--text-muted);
  background: var(--diff-line-num-bg);
  user-select: none;
  font-size: 11px;
}

.line-number.old {
  border-right: 1px solid var(--border-subtle);
}

.line-prefix {
  width: 20px;
  min-width: 20px;
  text-align: center;
  color: var(--text-muted);
  user-select: none;
}

.diff-line.addition .line-prefix {
  color: var(--diff-add-border);
}

.diff-line.deletion .line-prefix {
  color: var(--diff-remove-border);
}

.line-content {
  flex: 1;
  padding: 0 12px 0 4px;
  white-space: pre;
  overflow-x: auto;
}

.diff-line.addition .line-content {
  color: var(--diff-add-text);
}

.diff-line.deletion .line-content {
  color: var(--diff-remove-text);
  text-decoration: line-through;
  text-decoration-color: rgba(248, 81, 73, 0.5);
}

/* Word-level highlighting (for future use with diffWords) */
.diff-line :deep(.word-add) {
  background: var(--diff-add-word-bg);
  border-radius: 2px;
  padding: 0 1px;
}

.diff-line :deep(.word-remove) {
  background: var(--diff-remove-word-bg);
  border-radius: 2px;
  padding: 0 1px;
}

/* ============================================
 * SCROLLBAR
 * ============================================ */

.diff-lines::-webkit-scrollbar {
  height: 6px;
}

.diff-lines::-webkit-scrollbar-track {
  background: transparent;
}

.diff-lines::-webkit-scrollbar-thumb {
  background: var(--border-subtle);
  border-radius: 3px;
}

/* ============================================
 * RESPONSIVE
 * ============================================ */

@media (max-width: 600px) {
  .diff-header {
    flex-direction: column;
    gap: 10px;
    align-items: flex-start;
  }

  .diff-actions {
    width: 100%;
  }

  .action-btn {
    flex: 1;
    justify-content: center;
  }

  .action-btn :deep(.keyboard-shortcut) {
    display: none;
  }
}
</style>
