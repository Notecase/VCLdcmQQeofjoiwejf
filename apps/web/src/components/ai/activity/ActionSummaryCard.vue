<script setup lang="ts">
/**
 * ActionSummaryCard - Compact card for completed AI actions (note creation, edits).
 *
 * Green left border, action icon, description text, optional "Open note" button.
 * Follows ArtifactSummaryCard design patterns.
 */
import { computed } from 'vue'
import { FilePlus, PenLine, CheckCircle2, ExternalLink } from 'lucide-vue-next'
import type { CompletedAction } from '@/stores/ai'
import { useEditorStore } from '@/stores/editor'

const props = defineProps<{
  action: CompletedAction
}>()

const editorStore = useEditorStore()

const actionIcon = computed(() => {
  switch (props.action.action) {
    case 'create_note':
      return FilePlus
    case 'edit':
    case 'update':
      return PenLine
    default:
      return CheckCircle2
  }
})

function handleOpenNote() {
  if (props.action.noteId) {
    editorStore.loadDocument(props.action.noteId)
  }
}
</script>

<template>
  <div class="action-card">
    <div class="action-content">
      <div class="action-left">
        <component
          :is="actionIcon"
          :size="14"
          class="action-icon"
        />
        <span class="action-description">{{ action.description }}</span>
      </div>
      <div class="action-right">
        <button
          v-if="action.noteId"
          class="open-btn"
          type="button"
          @click="handleOpenNote"
        >
          <ExternalLink :size="11" />
          <span>Open note</span>
        </button>
        <CheckCircle2
          :size="12"
          class="check-icon"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.action-card {
  background: var(--tool-card-bg);
  border: 1px solid var(--diff-add-border);
  border-left: 3px solid var(--diff-add-border);
  border-radius: 8px;
  margin-top: 10px;
  overflow: hidden;
  transition:
    border-color var(--transition-normal) ease,
    box-shadow var(--transition-normal) ease;
}

.action-card:hover {
  box-shadow: 0 0 0 1px rgba(63, 185, 80, 0.15);
}

.action-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
}

.action-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.action-icon {
  color: var(--diff-add-border);
  flex-shrink: 0;
}

.action-description {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.action-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.open-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary);
  background: var(--surface-2);
  border: 1px solid var(--border-subtle);
  border-radius: 5px;
  cursor: pointer;
  transition: all var(--transition-fast) ease;
}

.open-btn:hover {
  background: var(--surface-3);
  color: var(--text-primary);
  border-color: var(--diff-add-border);
}

.check-icon {
  color: var(--diff-add-border);
}
</style>
