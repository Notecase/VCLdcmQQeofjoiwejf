<script setup lang="ts">
/**
 * EditPreviewCard — side-by-side diff preview in the Claude Code chat.
 * Shows old text (red) vs new text (green) with accept/reject buttons.
 * Bridges to the existing aiStore.requestEditAction() system.
 */
import { computed } from 'vue'
import { useAIStore } from '@/stores/ai'
import { Check, X } from 'lucide-vue-next'

const props = defineProps<{
  editId: string
  noteId: string
  oldText: string
  newText: string
}>()

const aiStore = useAIStore()

const pendingEdit = computed(() => aiStore.pendingEdits.find((e) => e.blockId === props.editId))

const isResolved = computed(
  () => pendingEdit.value?.status === 'accepted' || pendingEdit.value?.status === 'rejected'
)

function accept() {
  aiStore.requestEditAction(props.editId, 'accept')
}

function reject() {
  aiStore.requestEditAction(props.editId, 'reject')
}

/** Truncate text for display */
function truncate(text: string, max = 200): string {
  if (text.length <= max) return text
  return text.slice(0, max) + '...'
}
</script>

<template>
  <div
    class="edit-preview"
    :class="{ resolved: isResolved }"
  >
    <div class="edit-header">
      <span class="edit-label">Edit Proposed</span>
      <div
        v-if="!isResolved"
        class="edit-actions"
      >
        <button
          class="action-btn accept"
          title="Accept edit"
          @click="accept"
        >
          <Check :size="12" />
          Accept
        </button>
        <button
          class="action-btn reject"
          title="Reject edit"
          @click="reject"
        >
          <X :size="12" />
          Reject
        </button>
      </div>
      <span
        v-else
        class="edit-status"
        :class="pendingEdit?.status"
      >
        {{ pendingEdit?.status === 'accepted' ? 'Accepted' : 'Rejected' }}
      </span>
    </div>

    <div class="diff-container">
      <div class="diff-side old">
        <div class="diff-label">Old</div>
        <pre class="diff-text">{{ truncate(oldText) }}</pre>
      </div>
      <div class="diff-side new">
        <div class="diff-label">New</div>
        <pre class="diff-text">{{ truncate(newText) }}</pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
.edit-preview {
  border: 1px solid var(--border-secondary, #2a2a2a);
  border-radius: 8px;
  margin: 6px 0;
  overflow: hidden;
}

.edit-preview.resolved {
  opacity: 0.7;
}

.edit-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: var(--bg-secondary, #1a1a1a);
  border-bottom: 1px solid var(--border-secondary, #2a2a2a);
}

.edit-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary, #8b8b8b);
}

.edit-actions {
  display: flex;
  gap: 4px;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 4px;
  border: none;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}

.action-btn.accept {
  background: rgba(74, 222, 128, 0.1);
  color: #4ade80;
}

.action-btn.accept:hover {
  background: rgba(74, 222, 128, 0.2);
}

.action-btn.reject {
  background: rgba(248, 81, 73, 0.1);
  color: #f85149;
}

.action-btn.reject:hover {
  background: rgba(248, 81, 73, 0.2);
}

.edit-status {
  font-size: 11px;
  font-weight: 500;
}

.edit-status.accepted {
  color: #4ade80;
}

.edit-status.rejected {
  color: #f85149;
}

.diff-container {
  display: flex;
  gap: 1px;
  background: var(--border-secondary, #2a2a2a);
}

.diff-side {
  flex: 1;
  padding: 8px;
}

.diff-side.old {
  background: rgba(248, 81, 73, 0.05);
}

.diff-side.new {
  background: rgba(74, 222, 128, 0.05);
}

.diff-label {
  font-size: 10px;
  text-transform: uppercase;
  font-weight: 600;
  margin-bottom: 4px;
}

.diff-side.old .diff-label {
  color: #f85149;
}

.diff-side.new .diff-label {
  color: #4ade80;
}

.diff-text {
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  font-size: 11px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--text-primary, #d4d4d4);
  margin: 0;
  max-height: 150px;
  overflow-y: auto;
}
</style>
