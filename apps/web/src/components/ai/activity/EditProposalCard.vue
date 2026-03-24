<script setup lang="ts">
/**
 * EditProposalCard - Inline diff card with accept/reject actions.
 *
 * Shows edit-proposal events as collapsible cards in the chat
 * with diff summary and red/green diff lines.
 */
import { ref, computed } from 'vue'
import type { PendingEdit } from '@/stores/ai'
import { useAIStore } from '@/stores/ai'
import { FileEdit, Check, X, ChevronDown } from 'lucide-vue-next'

const props = defineProps<{
  edit: PendingEdit
}>()

const store = useAIStore()
const expanded = ref(false)

const isResolved = computed(() => props.edit.status !== 'pending')

// Compute diff summary
const addedLines = computed(() => {
  return props.edit.diffHunks.reduce((sum, h) => sum + h.newLines, 0)
})

const removedLines = computed(() => {
  return props.edit.diffHunks.reduce((sum, h) => sum + h.oldLines, 0)
})

// Diff lines for expanded view
const diffLines = computed(() => {
  const lines: Array<{ text: string; type: 'add' | 'remove' | 'context' }> = []

  for (const hunk of props.edit.diffHunks) {
    if (hunk.oldContent) {
      for (const line of hunk.oldContent.split('\n')) {
        lines.push({ text: line, type: 'remove' })
      }
    }
    if (hunk.newContent) {
      for (const line of hunk.newContent.split('\n')) {
        lines.push({ text: line, type: 'add' })
      }
    }
  }

  return lines
})

function handleAccept() {
  store.setActiveEdit(props.edit.id)
  store.requestEditAction(props.edit.id, 'accept')
}

function handleReject() {
  store.requestEditAction(props.edit.id, 'reject')
}
</script>

<template>
  <div
    class="edit-proposal-card"
    :class="{ resolved: isResolved, [edit.status]: true }"
  >
    <!-- Header -->
    <button
      class="card-header"
      type="button"
      @click="expanded = !expanded"
    >
      <div class="header-left">
        <FileEdit
          :size="14"
          class="header-icon"
        />
        <span class="header-title">Proposed edit</span>
        <span class="diff-summary">
          <span
            v-if="addedLines > 0"
            class="added"
            >+{{ addedLines }}</span
          >
          <span
            v-if="removedLines > 0"
            class="removed"
            >-{{ removedLines }}</span
          >
        </span>
      </div>
      <div class="header-right">
        <!-- Status text when resolved -->
        <span
          v-if="isResolved"
          class="status-text"
          :class="edit.status"
        >
          {{ edit.status === 'accepted' ? 'Accepted' : 'Rejected' }}
        </span>
        <!-- Action buttons when pending -->
        <template v-if="!isResolved">
          <button
            class="action-btn accept"
            title="Accept edit"
            @click.stop="handleAccept"
          >
            <Check :size="14" />
          </button>
          <button
            class="action-btn reject"
            title="Reject edit"
            @click.stop="handleReject"
          >
            <X :size="14" />
          </button>
        </template>
        <ChevronDown
          :size="12"
          class="chevron"
          :class="{ rotated: !expanded }"
        />
      </div>
    </button>

    <!-- Expanded diff view -->
    <Transition name="collapse">
      <div
        v-if="expanded && diffLines.length > 0"
        class="diff-body"
      >
        <div
          v-for="(line, idx) in diffLines"
          :key="idx"
          class="diff-line"
          :class="line.type"
        >
          <span class="diff-prefix">{{
            line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '
          }}</span>
          <span class="diff-text">{{ line.text }}</span>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.edit-proposal-card {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--border-subtle, rgba(48, 54, 61, 0.5));
  border-radius: 10px;
  overflow: hidden;
  margin-top: 8px;
  transition:
    border-color 0.2s ease,
    opacity 0.2s ease;
}

.edit-proposal-card:hover {
  border-color: rgba(124, 158, 248, 0.3);
}

.edit-proposal-card.resolved {
  opacity: 0.7;
}

.edit-proposal-card.accepted {
  border-color: rgba(63, 185, 80, 0.3);
}

.edit-proposal-card.rejected {
  border-color: rgba(248, 81, 73, 0.2);
}

/* Header */
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 10px 12px;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background 0.15s ease;
}

.card-header:hover {
  background: rgba(255, 255, 255, 0.03);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-icon {
  color: var(--primary-color, #7c9ef8);
  flex-shrink: 0;
}

.header-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary, #8b949e);
}

.diff-summary {
  display: flex;
  gap: 6px;
  font-size: 11px;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
}

.diff-summary .added {
  color: var(--task-complete-color, #3fb950);
}

.diff-summary .removed {
  color: var(--task-failed-color, #f85149);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-text {
  font-size: 11px;
  font-weight: 500;
}

.status-text.accepted {
  color: var(--task-complete-color, #3fb950);
}

.status-text.rejected {
  color: var(--task-failed-color, #f85149);
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  border: 1px solid var(--border-subtle, rgba(48, 54, 61, 0.5));
  background: transparent;
  cursor: pointer;
  transition: all 0.15s ease;
}

.action-btn.accept {
  color: var(--task-complete-color, #3fb950);
}

.action-btn.accept:hover {
  background: rgba(63, 185, 80, 0.15);
  border-color: rgba(63, 185, 80, 0.4);
}

.action-btn.reject {
  color: var(--task-failed-color, #f85149);
}

.action-btn.reject:hover {
  background: rgba(248, 81, 73, 0.15);
  border-color: rgba(248, 81, 73, 0.4);
}

.chevron {
  color: var(--text-muted, #6e7681);
  transition: transform 0.15s ease;
}

.chevron.rotated {
  transform: rotate(-90deg);
}

/* Diff body */
.diff-body {
  max-height: 200px;
  overflow-y: auto;
  border-top: 1px solid var(--border-subtle, rgba(48, 54, 61, 0.5));
  font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace;
  font-size: 11px;
  line-height: 1.5;
}

.diff-line {
  display: flex;
  padding: 1px 12px;
}

.diff-line.add {
  background: rgba(63, 185, 80, 0.08);
  color: var(--task-complete-color, #3fb950);
}

.diff-line.remove {
  background: rgba(248, 81, 73, 0.08);
  color: var(--task-failed-color, #f85149);
}

.diff-line.context {
  color: var(--text-muted, #6e7681);
}

.diff-prefix {
  width: 16px;
  flex-shrink: 0;
  user-select: none;
  opacity: 0.6;
}

.diff-text {
  white-space: pre-wrap;
  word-break: break-word;
}

/* Scrollbar */
.diff-body::-webkit-scrollbar {
  width: 4px;
}

.diff-body::-webkit-scrollbar-track {
  background: transparent;
}

.diff-body::-webkit-scrollbar-thumb {
  background: var(--border-subtle, rgba(48, 54, 61, 0.5));
  border-radius: 2px;
}

/* Collapse transition */
.collapse-enter-active,
.collapse-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}

.collapse-enter-from,
.collapse-leave-to {
  opacity: 0;
  max-height: 0;
}

.collapse-enter-to,
.collapse-leave-from {
  max-height: 200px;
}
</style>
