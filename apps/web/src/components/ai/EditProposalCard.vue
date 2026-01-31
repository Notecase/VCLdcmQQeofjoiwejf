<script setup lang="ts">
/**
 * EditProposalCard - Compact edit summary in chat
 *
 * Shows a summary card with:
 * - "+X / -Y lines" summary
 * - "View in Editor", "Accept All", "Reject All" buttons
 */
import { computed } from 'vue'
import { useAIStore, type PendingEdit } from '@/stores/ai'
import { FileEdit, Eye, Check, X, ChevronRight } from 'lucide-vue-next'

const props = defineProps<{
  edit: PendingEdit
}>()

const emit = defineEmits<{
  viewInEditor: []
}>()

const store = useAIStore()

// Computed stats
const hunks = computed(() => props.edit.diffHunks)

const stats = computed(() => {
  let additions = 0
  let deletions = 0

  for (const hunk of hunks.value) {
    additions += hunk.newLines
    deletions += hunk.oldLines
  }

  return { additions, deletions, total: hunks.value.length }
})

const pendingCount = computed(() => hunks.value.filter((h) => h.status === 'pending').length)

const isActive = computed(() => store.activeEditId === props.edit.id)

const statusLabel = computed(() => {
  if (props.edit.status === 'accepted') return 'Applied'
  if (props.edit.status === 'rejected') return 'Discarded'
  if (pendingCount.value === 0) return 'Ready to apply'
  return `${pendingCount.value} changes pending`
})

function handleViewInEditor() {
  store.setActiveEdit(props.edit.id)
  emit('viewInEditor')
}

function handleAcceptAll() {
  store.acceptAllHunks(props.edit.id)
}

function handleRejectAll() {
  store.rejectAllHunks(props.edit.id)
}
</script>

<template>
  <div
    class="edit-proposal-card"
    :class="{
      active: isActive,
      applied: edit.status === 'accepted',
      discarded: edit.status === 'rejected',
    }"
  >
    <!-- Header -->
    <div class="card-header">
      <div class="header-left">
        <FileEdit
          :size="16"
          class="card-icon"
        />
        <span class="card-title">Proposed Edit</span>
      </div>
      <div class="header-stats">
        <span class="stat additions">+{{ stats.additions }}</span>
        <span class="stat deletions">-{{ stats.deletions }}</span>
      </div>
    </div>

    <!-- Summary -->
    <div class="card-summary">
      <span class="summary-text">
        {{ stats.total }} change{{ stats.total !== 1 ? 's' : '' }} proposed
      </span>
      <span
        class="status-text"
        :class="{
          pending: pendingCount > 0,
          ready: pendingCount === 0 && edit.status === 'pending',
          applied: edit.status === 'accepted',
          discarded: edit.status === 'rejected',
        }"
      >
        {{ statusLabel }}
      </span>
    </div>

    <!-- Actions -->
    <div
      v-if="edit.status === 'pending'"
      class="card-actions"
    >
      <button
        class="action-btn view"
        @click="handleViewInEditor"
      >
        <Eye :size="14" />
        <span>View in Editor</span>
        <ChevronRight :size="14" />
      </button>

      <div class="action-row">
        <button
          class="action-btn accept"
          :disabled="pendingCount === 0"
          @click="handleAcceptAll"
        >
          <Check :size="14" />
          Accept All
        </button>
        <button
          class="action-btn reject"
          :disabled="pendingCount === 0"
          @click="handleRejectAll"
        >
          <X :size="14" />
          Reject All
        </button>
      </div>
    </div>

    <!-- Completed state -->
    <div
      v-else
      class="card-completed"
    >
      <span
        v-if="edit.status === 'accepted'"
        class="completed-badge applied"
      >
        <Check :size="12" />
        Changes applied
      </span>
      <span
        v-else
        class="completed-badge discarded"
      >
        <X :size="12" />
        Changes discarded
      </span>
    </div>
  </div>
</template>

<style scoped>
.edit-proposal-card {
  background: rgba(22, 27, 34, 0.7);
  border: 1px solid rgba(48, 54, 61, 0.6);
  border-radius: 10px;
  padding: 12px;
  margin: 8px 0;
  transition: all 0.2s;
}

.edit-proposal-card.active {
  border-color: #58a6ff;
  box-shadow: 0 0 0 2px rgba(88, 166, 255, 0.15);
}

.edit-proposal-card.applied {
  border-color: #3fb950;
  opacity: 0.8;
}

.edit-proposal-card.discarded {
  border-color: #6e7681;
  opacity: 0.6;
}

/* Header */
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.card-icon {
  color: #58a6ff;
}

.card-title {
  font-size: 13px;
  font-weight: 600;
  color: #e6edf3;
}

.header-stats {
  display: flex;
  gap: 8px;
  font-size: 12px;
  font-weight: 500;
  font-family: 'JetBrains Mono', monospace;
}

.stat.additions {
  color: #3fb950;
}

.stat.deletions {
  color: #f85149;
}

/* Summary */
.card-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.summary-text {
  font-size: 12px;
  color: #8b949e;
}

.status-text {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 500;
}

.status-text.pending {
  background: rgba(139, 148, 158, 0.15);
  color: #8b949e;
}

.status-text.ready {
  background: rgba(88, 166, 255, 0.15);
  color: #58a6ff;
}

.status-text.applied {
  background: rgba(63, 185, 80, 0.15);
  color: #3fb950;
}

.status-text.discarded {
  background: rgba(110, 118, 129, 0.15);
  color: #6e7681;
}

/* Actions */
.card-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 500;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}

.action-btn.view {
  background: rgba(88, 166, 255, 0.1);
  color: #58a6ff;
  border: 1px solid rgba(88, 166, 255, 0.3);
  justify-content: space-between;
}

.action-btn.view:hover {
  background: rgba(88, 166, 255, 0.2);
}

.action-row {
  display: flex;
  gap: 8px;
}

.action-btn.accept {
  flex: 1;
  background: rgba(63, 185, 80, 0.1);
  color: #3fb950;
  border: 1px solid rgba(63, 185, 80, 0.3);
}

.action-btn.accept:hover:not(:disabled) {
  background: rgba(63, 185, 80, 0.2);
}

.action-btn.reject {
  flex: 1;
  background: rgba(248, 81, 73, 0.1);
  color: #f85149;
  border: 1px solid rgba(248, 81, 73, 0.3);
}

.action-btn.reject:hover:not(:disabled) {
  background: rgba(248, 81, 73, 0.2);
}

.action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Completed state */
.card-completed {
  padding-top: 4px;
}

.completed-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
}

.completed-badge.applied {
  background: rgba(63, 185, 80, 0.15);
  color: #3fb950;
}

.completed-badge.discarded {
  background: rgba(110, 118, 129, 0.15);
  color: #6e7681;
}
</style>
