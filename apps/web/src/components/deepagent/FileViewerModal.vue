<script setup lang="ts">
/**
 * FileViewerModal - Modal for viewing/editing virtual files.
 *
 * Markdown files rendered with MarkdownContent.
 * Code files highlighted with prismjs. Edit mode with textarea.
 */
import { ref, computed, watch, nextTick } from 'vue'
import type { VirtualFile } from '@inkdown/shared/types'
import Prism from 'prismjs'
import 'prismjs/themes/prism-tomorrow.css'
import { X, Copy, Download, Edit, Save, FileText, Check, BookOpen } from 'lucide-vue-next'
import MarkdownContent from './MarkdownContent.vue'

const props = defineProps<{
  file: VirtualFile | null
  visible: boolean
}>()

const emit = defineEmits<{
  close: []
  save: [filename: string, content: string]
  saveAsNote: [file: VirtualFile]
}>()

const editMode = ref(false)
const editContent = ref('')
const editFilename = ref('')
const copied = ref(false)
const codeRef = ref<HTMLElement | null>(null)

// Reset state when file changes
watch(
  () => props.file,
  (f) => {
    if (f) {
      editContent.value = f.content
      editFilename.value = f.name
      editMode.value = false
      copied.value = false
      nextTick(highlightCode)
    }
  }
)

const isMarkdown = computed(() => props.file?.name.endsWith('.md') ?? false)

const fileExtension = computed(() => {
  if (!props.file) return ''
  const parts = props.file.name.split('.')
  return parts.length > 1 ? parts.pop()! : ''
})

const prismLanguage = computed(() => {
  const ext = fileExtension.value
  const langMap: Record<string, string> = {
    js: 'javascript',
    ts: 'javascript',
    jsx: 'javascript',
    tsx: 'javascript',
    py: 'python',
    rb: 'ruby',
    json: 'json',
    css: 'css',
    html: 'html',
    xml: 'xml',
    yaml: 'yaml',
    yml: 'yaml',
    sh: 'bash',
    bash: 'bash',
    sql: 'sql',
  }
  return langMap[ext] || 'markup'
})

function highlightCode() {
  nextTick(() => {
    if (codeRef.value) {
      Prism.highlightElement(codeRef.value)
    }
  })
}

function enterEdit() {
  if (!props.file) return
  editContent.value = props.file.content
  editFilename.value = props.file.name
  editMode.value = true
}

function exitEdit() {
  editMode.value = false
  nextTick(highlightCode)
}

function handleSave() {
  emit('save', editFilename.value, editContent.value)
  editMode.value = false
}

function handleSaveAsNote() {
  if (!props.file) return
  emit('saveAsNote', props.file)
}

async function handleCopy() {
  if (!props.file) return
  try {
    await navigator.clipboard.writeText(props.file.content)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch {
    // Clipboard API may not be available
  }
}

function handleDownload() {
  if (!props.file) return
  const blob = new Blob([props.file.content], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = props.file.name
  a.click()
  URL.revokeObjectURL(url)
}

function handleBackdropClick(e: MouseEvent) {
  if ((e.target as HTMLElement).classList.contains('modal-backdrop')) {
    emit('close')
  }
}

// Add line numbers to code
const numberedLines = computed(() => {
  if (!props.file || isMarkdown.value) return []
  return props.file.content.split('\n')
})
</script>

<template>
  <Transition name="modal">
    <div
      v-if="visible && file"
      class="modal-backdrop"
      @click="handleBackdropClick"
    >
      <div class="modal-container">
        <!-- Header -->
        <div class="modal-header">
          <div class="header-row-top">
            <div class="file-badge">
              <FileText :size="13" />
              <span>.{{ fileExtension || 'txt' }}</span>
            </div>
            <button
              class="close-pill"
              type="button"
              title="Close"
              @click="emit('close')"
            >
              <X :size="14" />
            </button>
          </div>

          <div class="header-title">
            <h2 v-if="!editMode">{{ file.name }}</h2>
            <input
              v-else
              v-model="editFilename"
              class="filename-input"
              type="text"
            />
          </div>

          <div class="header-actions">
            <button
              v-if="!editMode"
              class="hdr-btn"
              type="button"
              @click="enterEdit"
            >
              <Edit :size="13" /> Edit
            </button>
            <button
              class="hdr-btn"
              :class="{ success: copied }"
              type="button"
              @click="handleCopy"
            >
              <Check
                v-if="copied"
                :size="13"
              />
              <Copy
                v-else
                :size="13"
              />
              {{ copied ? 'Copied' : 'Copy' }}
            </button>
            <button
              class="hdr-btn"
              type="button"
              @click="handleDownload"
            >
              <Download :size="13" /> Download
            </button>
            <button
              class="hdr-btn accent"
              type="button"
              @click="handleSaveAsNote"
            >
              <BookOpen :size="13" /> Save as Note
            </button>
          </div>
        </div>

        <!-- Body -->
        <div class="modal-body">
          <!-- Edit mode -->
          <textarea
            v-if="editMode"
            v-model="editContent"
            class="edit-textarea"
          />

          <!-- Markdown rendering -->
          <div
            v-else-if="isMarkdown"
            class="markdown-viewer"
          >
            <MarkdownContent :content="file.content" />
          </div>

          <!-- Code rendering with line numbers -->
          <div
            v-else
            class="code-viewer"
          >
            <table class="code-table">
              <tbody>
                <tr
                  v-for="(line, idx) in numberedLines"
                  :key="idx"
                >
                  <td class="line-number">{{ idx + 1 }}</td>
                  <td class="line-content">
                    <pre><code ref="codeRef" :class="`language-${prismLanguage}`">{{ line }}</code></pre>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Footer (edit mode only) -->
        <div
          v-if="editMode"
          class="modal-footer"
        >
          <button
            class="btn btn-ghost"
            type="button"
            @click="exitEdit"
          >
            Cancel
          </button>
          <button
            class="btn btn-primary"
            type="button"
            @click="handleSave"
          >
            <Save :size="12" />
            Save Changes
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-container {
  min-width: 60vw;
  height: 80vh;
  max-height: 80vh;
  max-width: 1000px;
  background: var(--surface-1, #0d1117);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow:
    0 24px 64px rgba(0, 0, 0, 0.5),
    0 0 0 1px rgba(255, 255, 255, 0.03);
}

/* Header */
.modal-header {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px 24px 16px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.025) 0%, transparent 100%);
  border-bottom: 1px solid var(--border-color, #333338);
  flex-shrink: 0;
}

.header-row-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.file-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-color-secondary, #94a3b8);
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.close-pill {
  width: 28px;
  height: 28px;
  border-radius: 7px;
  border: none;
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-color-secondary, #94a3b8);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s;
}

.close-pill:hover {
  background: rgba(248, 81, 73, 0.1);
  color: #f85149;
}

.header-title h2 {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-color, #e2e8f0);
  letter-spacing: -0.01em;
  line-height: 1.3;
  margin: 0;
}

.filename-input {
  padding: 4px 8px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border-color, #30363d);
  border-radius: 4px;
  color: var(--text-color, #e6edf3);
  font-size: 16px;
  font-weight: 500;
  outline: none;
  width: 100%;
}

.filename-input:focus {
  border-color: rgba(255, 255, 255, 0.2);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.hdr-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: 6px;
  border: 1px solid var(--border-color, #333338);
  background: transparent;
  color: var(--text-color-secondary, #94a3b8);
  font-size: 12px;
  font-weight: 450;
  cursor: pointer;
  transition: all 0.15s;
}

.hdr-btn:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-color, #e2e8f0);
  border-color: rgba(255, 255, 255, 0.12);
}

.hdr-btn.accent {
  border-color: rgba(255, 255, 255, 0.12);
  color: var(--text-color, #e2e8f0);
}

.hdr-btn.success {
  color: #3fb950;
  border-color: rgba(63, 185, 80, 0.3);
}

/* Body */
.modal-body {
  flex: 1;
  overflow: auto;
  padding: 0;
}

/* Markdown viewer */
.markdown-viewer {
  padding: 28px 32px;
}

/* Code viewer with line numbers */
.code-viewer {
  padding: 0;
  overflow: auto;
  min-height: 100%;
}

.code-table {
  width: 100%;
  border-collapse: collapse;
  font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, monospace;
  font-size: 12px;
  line-height: 1.6;
}

.code-table tr:hover {
  background: rgba(255, 255, 255, 0.04);
}

.line-number {
  width: 50px;
  min-width: 50px;
  padding: 0 12px 0 16px;
  text-align: right;
  color: rgba(139, 148, 158, 0.6);
  user-select: none;
  vertical-align: top;
  border-right: 1px solid var(--border-color, #30363d);
}

.line-content {
  padding: 0 16px;
  white-space: pre;
}

.line-content pre {
  margin: 0;
  padding: 0;
  background: transparent;
}

.line-content code {
  font-family: inherit;
}

/* Edit textarea */
.edit-textarea {
  width: 100%;
  height: 100%;
  padding: 18px;
  background: transparent;
  border: none;
  color: var(--text-color, #e6edf3);
  font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, monospace;
  font-size: 12px;
  line-height: 1.7;
  resize: none;
  outline: none;
}

/* Footer */
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 18px;
  border-top: 1px solid var(--border-color, #30363d);
  flex-shrink: 0;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 6px;
  border: 1px solid transparent;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-primary {
  background: var(--primary-color, #ffffff);
  color: #0d1117;
}

.btn-primary:hover {
  opacity: 0.9;
}

.btn-ghost {
  background: transparent;
  border-color: var(--border-color, #30363d);
  color: var(--text-color-secondary, #8b949e);
}

.btn-ghost:hover {
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-color, #e6edf3);
}

/* Scrollbar */
.modal-body::-webkit-scrollbar {
  width: 6px;
}

.modal-body::-webkit-scrollbar-track {
  background: transparent;
}

.modal-body::-webkit-scrollbar-thumb {
  background: var(--border-color, #30363d);
  border-radius: 3px;
}

/* Modal transition */
.modal-enter-active {
  transition: all 0.25s ease-out;
}

.modal-leave-active {
  transition: all 0.2s ease-in;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-container,
.modal-leave-to .modal-container {
  transform: scale(0.95);
}
</style>
