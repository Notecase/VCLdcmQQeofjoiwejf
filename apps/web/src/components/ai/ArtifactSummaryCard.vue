<script setup lang="ts">
/**
 * ArtifactSummaryCard - Compact card for completed artifacts in chat
 *
 * Features:
 * - Compact card showing artifact title with success styling
 * - Expandable to show actions (View in note, Edit, Delete)
 * - Green accent for success indication
 * - Styled consistently with ToolCallCard
 */
import { ref } from 'vue'
import { ChevronDown, Box, ExternalLink, Pencil, Trash2, CheckCircle2 } from 'lucide-vue-next'

defineProps<{
  title: string
  noteId: string
  artifactId?: string
}>()

const emit = defineEmits<{
  scrollToArtifact: []
  editArtifact: []
  deleteArtifact: []
}>()

const expanded = ref(false)

function toggle() {
  expanded.value = !expanded.value
}

function handleScrollToArtifact() {
  emit('scrollToArtifact')
}

function handleEditArtifact() {
  emit('editArtifact')
}

function handleDeleteArtifact() {
  emit('deleteArtifact')
}
</script>

<template>
  <div
    class="artifact-card"
    :class="{ expanded }"
  >
    <button
      class="artifact-header"
      type="button"
      @click="toggle"
    >
      <div class="artifact-info">
        <Box
          :size="14"
          class="artifact-icon"
        />
        <span class="artifact-title">{{ title }}</span>
        <span class="created-label">created</span>
      </div>
      <div class="artifact-status">
        <CheckCircle2
          :size="12"
          class="success-icon"
        />
        <ChevronDown
          :size="14"
          class="chevron"
          :class="{ rotated: !expanded }"
        />
      </div>
    </button>

    <Transition name="collapse">
      <div
        v-if="expanded"
        class="artifact-body"
      >
        <div class="artifact-actions">
          <button
            class="action-btn"
            type="button"
            @click="handleScrollToArtifact"
          >
            <ExternalLink :size="12" />
            <span>View in note</span>
          </button>
          <button
            class="action-btn"
            type="button"
            @click="handleEditArtifact"
          >
            <Pencil :size="12" />
            <span>Edit code</span>
          </button>
          <button
            class="action-btn delete"
            type="button"
            @click="handleDeleteArtifact"
          >
            <Trash2 :size="12" />
            <span>Delete</span>
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.artifact-card {
  background: var(--tool-card-bg);
  border: 1px solid var(--diff-add-border);
  border-radius: 10px;
  overflow: hidden;
  transition:
    border-color var(--transition-normal) ease,
    box-shadow var(--transition-normal) ease;
  margin-top: 12px;
}

.artifact-card:hover {
  border-color: var(--diff-add-border);
  box-shadow: 0 0 0 1px rgba(63, 185, 80, 0.2);
}

/* Header */
.artifact-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 10px 14px;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background var(--transition-fast) ease;
}

.artifact-header:hover {
  background: rgba(63, 185, 80, 0.05);
}

.artifact-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.artifact-icon {
  color: var(--diff-add-border);
  flex-shrink: 0;
}

.artifact-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
}

.created-label {
  font-size: 11px;
  color: var(--diff-add-text);
  font-weight: 500;
}

.artifact-status {
  display: flex;
  align-items: center;
  gap: 8px;
}

.success-icon {
  color: var(--diff-add-border);
}

.chevron {
  color: var(--text-muted);
  transition: transform var(--transition-fast) ease;
}

.chevron.rotated {
  transform: rotate(-90deg);
}

/* Body */
.artifact-body {
  padding: 0 14px 14px;
  border-top: 1px solid var(--border-subtle);
  margin-top: 0;
}

.artifact-actions {
  display: flex;
  gap: 8px;
  padding-top: 12px;
  flex-wrap: wrap;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary);
  background: var(--surface-2);
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  cursor: pointer;
  transition: all var(--transition-fast) ease;
}

.action-btn:hover {
  background: var(--surface-3);
  color: var(--text-primary);
  border-color: var(--border-subtle);
}

.action-btn.delete:hover {
  background: rgba(248, 81, 73, 0.1);
  color: var(--diff-remove-border);
  border-color: var(--diff-remove-border);
}

/* Collapse transition */
.collapse-enter-active,
.collapse-leave-active {
  transition: all var(--transition-normal) var(--ease-out-expo);
  overflow: hidden;
}

.collapse-enter-from,
.collapse-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}

.collapse-enter-to,
.collapse-leave-from {
  max-height: 100px;
}
</style>
