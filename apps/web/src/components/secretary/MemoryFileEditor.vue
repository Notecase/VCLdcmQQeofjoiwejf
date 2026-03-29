<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted } from 'vue'
import { useSecretaryStore } from '@/stores/secretary'
import { renderMathContent } from '@/utils/mathRenderer'
import { Save, X, Code, Eye, Trash2 } from 'lucide-vue-next'
import ConfirmDialog from './ConfirmDialog.vue'

const store = useSecretaryStore()

const editContent = ref('')
const isSaving = ref(false)
const viewMode = ref<'edit' | 'preview'>('edit')
const showDeleteConfirm = ref(false)
const showUnsavedConfirm = ref(false)

// Sync content when selected file changes
watch(
  () => store.selectedFile,
  (file) => {
    editContent.value = file?.content || ''
    viewMode.value = 'edit'
  },
  { immediate: true }
)

const filename = computed(() => store.selectedFile?.filename || '')
const isDirty = computed(() => editContent.value !== (store.selectedFile?.content || ''))

const renderedPreview = computed(() => renderMathContent(editContent.value))

async function save() {
  if (!filename.value) return
  isSaving.value = true
  await store.updateMemoryFile(filename.value, editContent.value)
  isSaving.value = false
}

function close() {
  store.selectedFilename = null
}

function discardAndClose() {
  showUnsavedConfirm.value = false
  close()
}

function requestClose() {
  if (isDirty.value) {
    showUnsavedConfirm.value = true
  } else {
    close()
  }
}

async function handleDelete() {
  if (!filename.value) return
  showDeleteConfirm.value = false
  await store.updateMemoryFile(filename.value, '')
  store.selectedFilename = null
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    requestClose()
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="memory-editor">
    <div class="editor-header">
      <div class="filename-area">
        <h3>{{ filename }}</h3>
        <span
          v-if="isDirty"
          class="dirty-dot"
          title="Unsaved changes"
        />
      </div>
      <div class="header-actions">
        <div class="view-toggle">
          <button
            class="toggle-btn"
            :class="{ active: viewMode === 'edit' }"
            title="Edit"
            @click="viewMode = 'edit'"
          >
            <Code :size="14" />
          </button>
          <button
            class="toggle-btn"
            :class="{ active: viewMode === 'preview' }"
            title="Preview"
            @click="viewMode = 'preview'"
          >
            <Eye :size="14" />
          </button>
        </div>
        <button
          class="action-btn save"
          :disabled="isSaving"
          @click="save"
        >
          <Save :size="14" />
          {{ isSaving ? 'Saving...' : 'Save' }}
        </button>
        <button
          class="action-btn delete"
          @click="showDeleteConfirm = true"
        >
          <Trash2 :size="14" />
        </button>
        <button
          class="action-btn close"
          title="Close (Esc)"
          @click="requestClose"
        >
          <X :size="14" />
        </button>
      </div>
    </div>
    <textarea
      v-if="viewMode === 'edit'"
      v-model="editContent"
      class="editor-textarea"
      spellcheck="false"
    />
    <div
      v-else
      class="editor-preview prose"
      v-html="renderedPreview"
    />

    <ConfirmDialog
      v-if="showDeleteConfirm"
      title="Delete File"
      :message="`Delete ${filename}? This cannot be undone.`"
      confirm-label="Delete"
      variant="danger"
      @confirm="handleDelete"
      @cancel="showDeleteConfirm = false"
    />

    <ConfirmDialog
      v-if="showUnsavedConfirm"
      title="Unsaved Changes"
      message="You have unsaved changes. Close anyway?"
      confirm-label="Discard"
      variant="danger"
      @confirm="discardAndClose"
      @cancel="showUnsavedConfirm = false"
    />
  </div>
</template>

<style scoped>
.memory-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 12px;
  padding: 8px 0;
}

.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.filename-area {
  display: flex;
  align-items: center;
  gap: 6px;
}

.editor-header h3 {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color, #e2e8f0);
  margin: 0;
}

.dirty-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #e3b341;
  flex-shrink: 0;
}

.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.view-toggle {
  display: flex;
  border: 1px solid var(--border-color, #333338);
  border-radius: 6px;
  overflow: hidden;
}

.toggle-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px 8px;
  border: none;
  background: transparent;
  color: var(--text-color-secondary, #94a3b8);
  cursor: pointer;
  transition: all 0.15s;
}

.toggle-btn.active {
  background: rgba(124, 158, 248, 0.15);
  color: var(--primary-color, #7c9ef8);
}

.toggle-btn:hover:not(.active) {
  background: var(--hover-bg, rgba(255, 255, 255, 0.04));
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid var(--border-color, #333338);
  background: transparent;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.action-btn.save {
  color: var(--sec-primary-light, #34d399);
  border-color: var(--sec-primary-border, rgba(52, 211, 153, 0.3));
}

.action-btn.save:hover:not(:disabled) {
  background: var(--sec-primary-bg, rgba(52, 211, 153, 0.1));
}

.action-btn.save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-btn.delete {
  color: #f85149;
  border-color: rgba(248, 81, 73, 0.3);
}

.action-btn.delete:hover {
  background: rgba(248, 81, 73, 0.1);
}

.action-btn.close {
  color: var(--text-color-secondary, #94a3b8);
}

.action-btn.close:hover {
  background: var(--hover-bg, rgba(255, 255, 255, 0.04));
}

.editor-textarea {
  flex: 1;
  padding: 16px;
  border-radius: 12px;
  border: 1px solid var(--border-color, #333338);
  background: var(--card-bg, #242428);
  color: var(--text-color, #e2e8f0);
  font-family: 'SF Mono', 'Fira Code', 'JetBrains Mono', monospace;
  font-size: 13px;
  line-height: 1.6;
  resize: none;
  outline: none;
}

.editor-textarea:focus {
  border-color: var(--primary-color, #7c9ef8);
}

.editor-preview {
  flex: 1;
  padding: 16px;
  border-radius: 12px;
  border: 1px solid var(--border-color, #333338);
  background: var(--card-bg, #242428);
  overflow-y: auto;
  font-size: 14px;
  line-height: 1.65;
  color: var(--text-color, #e2e8f0);
}

/* Prose styling for preview */
.prose :deep(p) {
  margin: 0 0 0.85em 0;
}

.prose :deep(p:last-child) {
  margin-bottom: 0;
}

.prose :deep(code) {
  font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace;
  font-size: 0.9em;
  padding: 0.2em 0.45em;
  background: var(--editor-color-04, rgba(255, 255, 255, 0.06));
  border-radius: 5px;
  color: #f0883e;
}

.prose :deep(pre) {
  margin: 1em 0;
  padding: 14px 16px;
  background: var(--editor-color-04, rgba(255, 255, 255, 0.03));
  border: 1px solid var(--border-color, #333338);
  border-radius: 8px;
  overflow-x: auto;
}

.prose :deep(pre code) {
  padding: 0;
  background: none;
  color: var(--text-color, #e2e8f0);
  font-size: 12px;
  line-height: 1.55;
}

.prose :deep(ul),
.prose :deep(ol) {
  margin: 0.6em 0;
  padding-left: 1.6em;
}

.prose :deep(li) {
  margin: 0.3em 0;
}

.prose :deep(strong) {
  font-weight: 600;
  color: var(--text-color, #e2e8f0);
}

.prose :deep(em) {
  font-style: italic;
}
</style>
