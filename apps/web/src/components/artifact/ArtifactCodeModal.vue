<script setup lang="ts">
/**
 * ArtifactCodeModal - Modal for editing artifact code
 *
 * Features:
 * - Title input
 * - Tab navigation (HTML / CSS / JS)
 * - Code textarea with syntax highlighting (basic)
 * - Cancel and Save buttons
 */
import { ref, computed, watch } from 'vue'

export interface ArtifactData {
  blockId: string
  title: string
  html: string
  css: string
  javascript: string
  height: number
}

const props = defineProps<{
  visible: boolean
  data: ArtifactData
}>()

const emit = defineEmits<{
  close: []
  save: [data: ArtifactData]
}>()

// Height for the artifact preview
const localHeight = ref(props.data.height || 300)

// Local state for editing
const localData = ref<ArtifactData>({ ...props.data })
const activeTab = ref<'html' | 'css' | 'javascript'>('html')

// Sync when props change
watch(
  () => props.data,
  (newData) => {
    localData.value = { ...newData }
  },
  { deep: true }
)

// Reset when modal opens
watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      localData.value = { ...props.data }
      localHeight.value = props.data.height || 300
      activeTab.value = 'html'
    }
  }
)

const currentCode = computed({
  get: () => localData.value[activeTab.value],
  set: (value: string) => {
    localData.value[activeTab.value] = value
  },
})

function handleSave() {
  emit('save', { ...localData.value, height: localHeight.value })
}

function handleClose() {
  emit('close')
}

// Close on Escape
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    handleClose()
  }
  // Save on Cmd/Ctrl + Enter
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    handleSave()
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="visible" class="modal-overlay" @click.self="handleClose" @keydown="handleKeydown">
        <div class="modal-content">
          <div class="modal-header">
            <h3 class="modal-title">Edit Artifact</h3>
            <button class="close-btn" @click="handleClose">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div class="modal-body">
            <!-- Title and Height Row -->
            <div class="form-row">
              <div class="form-group form-group-title">
                <label class="form-label">Title</label>
                <input
                  v-model="localData.title"
                  type="text"
                  class="form-input"
                  placeholder="Artifact title..."
                />
              </div>
              <div class="form-group form-group-height">
                <label class="form-label">Height (px)</label>
                <input
                  v-model.number="localHeight"
                  type="number"
                  class="form-input"
                  min="100"
                  max="1000"
                  step="50"
                />
              </div>
            </div>

            <!-- Tab Navigation -->
            <div class="tabs">
              <button
                :class="['tab', { active: activeTab === 'html' }]"
                @click="activeTab = 'html'"
              >
                HTML
              </button>
              <button
                :class="['tab', { active: activeTab === 'css' }]"
                @click="activeTab = 'css'"
              >
                CSS
              </button>
              <button
                :class="['tab', { active: activeTab === 'javascript' }]"
                @click="activeTab = 'javascript'"
              >
                JavaScript
              </button>
            </div>

            <!-- Code Editor -->
            <div class="code-editor">
              <textarea
                v-model="currentCode"
                class="code-textarea"
                :placeholder="`Enter ${activeTab.toUpperCase()} code...`"
                spellcheck="false"
              ></textarea>
            </div>
          </div>

          <div class="modal-footer">
            <button class="btn btn-secondary" @click="handleClose">Cancel</button>
            <button class="btn btn-primary" @click="handleSave">
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.modal-content {
  display: flex;
  flex-direction: column;
  width: 90%;
  max-width: 800px;
  max-height: 85vh;
  background: var(--bg-color, #fff);
  border-radius: 12px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color, #e5e5e5);
}

.modal-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-color, #1a1a1a);
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  background: transparent;
  border-radius: 8px;
  color: var(--text-color-secondary, #666);
  cursor: pointer;
  transition: all 0.15s ease;
}

.close-btn:hover {
  background: rgba(0, 0, 0, 0.08);
  color: var(--text-color, #1a1a1a);
}

.modal-body {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
}

.form-row {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group-title {
  flex: 1;
  margin-bottom: 0;
}

.form-group-height {
  width: 100px;
  flex-shrink: 0;
  margin-bottom: 0;
}

.form-label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color-secondary, #666);
}

.form-input {
  width: 100%;
  padding: 10px 12px;
  font-size: 14px;
  border: 1px solid var(--border-color, #e5e5e5);
  border-radius: 8px;
  background: var(--input-bg-color, #f8f9fa);
  color: var(--text-color, #1a1a1a);
  outline: none;
  transition: border-color 0.15s ease;
}

.form-input:focus {
  border-color: var(--primary-color, #0066cc);
}

.tabs {
  display: flex;
  gap: 4px;
  padding: 4px;
  margin-bottom: 12px;
  background: var(--input-bg-color, #f0f1f3);
  border-radius: 8px;
}

.tab {
  flex: 1;
  padding: 8px 16px;
  border: none;
  background: transparent;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color-secondary, #666);
  cursor: pointer;
  transition: all 0.15s ease;
}

.tab:hover {
  background: rgba(0, 0, 0, 0.04);
}

.tab.active {
  background: var(--bg-color, #fff);
  color: var(--text-color, #1a1a1a);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.code-editor {
  flex: 1;
  min-height: 300px;
}

.code-textarea {
  width: 100%;
  height: 300px;
  padding: 12px;
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
  font-size: 13px;
  line-height: 1.5;
  border: 1px solid var(--border-color, #e5e5e5);
  border-radius: 8px;
  background: var(--code-bg-color, #1e1e1e);
  color: var(--code-color, #d4d4d4);
  resize: vertical;
  outline: none;
}

.code-textarea:focus {
  border-color: var(--primary-color, #0066cc);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid var(--border-color, #e5e5e5);
}

.btn {
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 500;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-secondary {
  background: var(--input-bg-color, #f0f1f3);
  color: var(--text-color, #1a1a1a);
}

.btn-secondary:hover {
  background: var(--border-color, #e0e1e3);
}

.btn-primary {
  background: var(--primary-color, #0066cc);
  color: white;
}

.btn-primary:hover {
  background: var(--primary-color-dark, #0055aa);
}

/* Dark theme */
:root[data-theme='dark'] .modal-content,
:root[data-theme='one-dark'] .modal-content,
:root[data-theme='material-dark'] .modal-content {
  background: #2d2d30;
}

:root[data-theme='dark'] .modal-header,
:root[data-theme='one-dark'] .modal-header,
:root[data-theme='material-dark'] .modal-header,
:root[data-theme='dark'] .modal-footer,
:root[data-theme='one-dark'] .modal-footer,
:root[data-theme='material-dark'] .modal-footer {
  border-color: #404040;
}

:root[data-theme='dark'] .form-input,
:root[data-theme='one-dark'] .form-input,
:root[data-theme='material-dark'] .form-input {
  background: #3d3d3d;
  border-color: #505050;
  color: #d4d4d4;
}

:root[data-theme='dark'] .tabs,
:root[data-theme='one-dark'] .tabs,
:root[data-theme='material-dark'] .tabs {
  background: #3d3d3d;
}

:root[data-theme='dark'] .tab.active,
:root[data-theme='one-dark'] .tab.active,
:root[data-theme='material-dark'] .tab.active {
  background: #2d2d30;
  color: #d4d4d4;
}

:root[data-theme='dark'] .code-textarea,
:root[data-theme='one-dark'] .code-textarea,
:root[data-theme='material-dark'] .code-textarea {
  background: #1e1e1e;
  border-color: #404040;
}

/* Transition */
.modal-enter-active,
.modal-leave-active {
  transition: all 0.25s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-content,
.modal-leave-to .modal-content {
  transform: scale(0.95);
}
</style>
