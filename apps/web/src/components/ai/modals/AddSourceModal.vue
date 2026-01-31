<script setup lang="ts">
/**
 * AddSourceModal - Modal for adding sources
 *
 * Provides tabs for different source types:
 * - PDF: File upload for PDF documents
 * - Link: URL input for web pages
 * - File: Upload other file types (txt, md, csv)
 * - Text: Paste content directly
 */
import { ref, computed } from 'vue'
import { FileText, Link, FileCode, AlignLeft, Upload, Loader2 } from 'lucide-vue-next'
import BaseModal from './BaseModal.vue'
import { useSourcesStore } from '@/stores/sources'

// Props
const props = defineProps<{
  noteId: string
}>()

// Emits
const emit = defineEmits<{
  close: []
  added: []
}>()

// Store
const sourcesStore = useSourcesStore()

// State
type TabType = 'pdf' | 'link' | 'file' | 'text'
const activeTab = ref<TabType>('pdf')
const linkUrl = ref('')
const pastedText = ref('')
const textTitle = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const selectedFile = ref<File | null>(null)
const uploading = ref(false)
const error = ref<string | null>(null)

// Computed
const tabs: Array<{ id: TabType; label: string; icon: typeof FileText }> = [
  { id: 'pdf', label: 'PDF', icon: FileText },
  { id: 'link', label: 'Link', icon: Link },
  { id: 'file', label: 'File', icon: FileCode },
  { id: 'text', label: 'Text', icon: AlignLeft },
]

const canSubmit = computed(() => {
  switch (activeTab.value) {
    case 'pdf':
    case 'file':
      return selectedFile.value !== null
    case 'link':
      return linkUrl.value.trim().length > 0 && isValidUrl(linkUrl.value)
    case 'text':
      return pastedText.value.trim().length > 0
    default:
      return false
  }
})

const uploadProgress = computed(() => sourcesStore.uploadProgress)

// Methods
function isValidUrl(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files && input.files[0]) {
    selectedFile.value = input.files[0]
    error.value = null
  }
}

function triggerFileSelect() {
  fileInput.value?.click()
}

async function handleSubmit() {
  if (!canSubmit.value || uploading.value) return

  uploading.value = true
  error.value = null

  try {
    let result: unknown = null

    switch (activeTab.value) {
      case 'pdf':
      case 'file':
        if (selectedFile.value) {
          result = await sourcesStore.uploadFile(props.noteId, selectedFile.value)
        }
        break

      case 'link':
        result = await sourcesStore.addLink(props.noteId, linkUrl.value.trim())
        break

      case 'text':
        result = await sourcesStore.addText(
          props.noteId,
          pastedText.value.trim(),
          textTitle.value.trim() || undefined
        )
        break
    }

    if (result) {
      emit('added')
      emit('close')
    } else {
      error.value = sourcesStore.uploadError || 'Failed to add source'
    }
  } catch (e) {
    error.value = String(e)
  } finally {
    uploading.value = false
  }
}

function resetForm() {
  selectedFile.value = null
  linkUrl.value = ''
  pastedText.value = ''
  textTitle.value = ''
  error.value = null
  if (fileInput.value) {
    fileInput.value.value = ''
  }
}

function switchTab(tab: TabType) {
  activeTab.value = tab
  resetForm()
}
</script>

<template>
  <BaseModal
    title="Add Source"
    subtitle="Add external content to your note's knowledge base"
    size="md"
    @close="emit('close')"
  >
    <template #icon>
      <Upload :size="20" />
    </template>

    <div class="add-source-content">
      <!-- Tabs -->
      <div class="source-tabs">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          class="tab-btn"
          :class="{ active: activeTab === tab.id }"
          @click="switchTab(tab.id)"
        >
          <component
            :is="tab.icon"
            :size="14"
          />
          <span>{{ tab.label }}</span>
        </button>
      </div>

      <!-- Tab Content -->
      <div class="tab-content">
        <!-- PDF / File Upload -->
        <div
          v-if="activeTab === 'pdf' || activeTab === 'file'"
          class="upload-area"
        >
          <input
            ref="fileInput"
            type="file"
            :accept="activeTab === 'pdf' ? '.pdf' : '.txt,.md,.csv,.json'"
            hidden
            @change="handleFileSelect"
          />

          <div
            class="drop-zone"
            :class="{ 'has-file': selectedFile }"
            @click="triggerFileSelect"
          >
            <template v-if="selectedFile">
              <FileText
                :size="32"
                class="file-icon"
              />
              <span class="file-name">{{ selectedFile.name }}</span>
              <span class="file-size">{{ (selectedFile.size / 1024).toFixed(1) }} KB</span>
            </template>
            <template v-else>
              <Upload
                :size="32"
                class="upload-icon"
              />
              <span class="drop-text">
                {{ activeTab === 'pdf' ? 'Click to upload PDF' : 'Click to upload file' }}
              </span>
              <span class="drop-hint">
                {{ activeTab === 'pdf' ? 'PDF files only' : '.txt, .md, .csv, .json' }}
              </span>
            </template>
          </div>
        </div>

        <!-- Link Input -->
        <div
          v-else-if="activeTab === 'link'"
          class="link-input-area"
        >
          <div class="input-group">
            <label class="input-label">URL</label>
            <input
              v-model="linkUrl"
              type="url"
              class="text-input"
              placeholder="https://example.com/article"
              @keydown.enter="handleSubmit"
            />
          </div>
          <p class="input-hint">We'll fetch and extract the main content from the page.</p>
        </div>

        <!-- Text Input -->
        <div
          v-else-if="activeTab === 'text'"
          class="text-input-area"
        >
          <div class="input-group">
            <label class="input-label">Title (optional)</label>
            <input
              v-model="textTitle"
              type="text"
              class="text-input"
              placeholder="Source title"
            />
          </div>
          <div class="input-group">
            <label class="input-label">Content</label>
            <textarea
              v-model="pastedText"
              class="text-area"
              placeholder="Paste your content here..."
              rows="8"
            />
          </div>
        </div>
      </div>

      <!-- Progress -->
      <div
        v-if="uploadProgress"
        class="upload-progress"
      >
        <div class="progress-info">
          <Loader2
            :size="14"
            class="spin"
          />
          <span>{{ uploadProgress.message }}</span>
        </div>
        <div class="progress-bar">
          <div
            class="progress-fill"
            :style="{ width: `${uploadProgress.progress}%` }"
          />
        </div>
      </div>

      <!-- Error -->
      <div
        v-if="error"
        class="error-message"
      >
        {{ error }}
      </div>
    </div>

    <template #footer>
      <button
        class="btn-secondary"
        @click="emit('close')"
      >
        Cancel
      </button>
      <button
        class="btn-primary"
        :disabled="!canSubmit || uploading"
        @click="handleSubmit"
      >
        <Loader2
          v-if="uploading"
          :size="14"
          class="spin"
        />
        <span>{{ uploading ? 'Adding...' : 'Add Source' }}</span>
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
.add-source-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* Tabs */
.source-tabs {
  display: flex;
  gap: 4px;
  padding: 4px;
  background: var(--modal-card-bg);
  border-radius: var(--modal-radius-sm);
}

.tab-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 16px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--text-color-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.tab-btn:hover {
  color: var(--text-color);
}

.tab-btn.active {
  background: var(--modal-btn-secondary-hover);
  color: var(--text-color);
}

/* Upload Area */
.upload-area {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.drop-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px 20px;
  border: 2px dashed var(--modal-border);
  border-radius: var(--modal-radius-sm);
  background: var(--modal-card-bg);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.drop-zone:hover {
  border-color: #58a6ff;
  background: rgba(88, 166, 255, 0.05);
}

.drop-zone.has-file {
  border-color: #3fb950;
  background: rgba(63, 185, 80, 0.05);
}

.upload-icon {
  color: var(--text-color-secondary);
}

.file-icon {
  color: #3fb950;
}

.drop-text {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
}

.drop-hint {
  font-size: 12px;
  color: var(--text-color-secondary);
}

.file-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
}

.file-size {
  font-size: 12px;
  color: var(--text-color-secondary);
}

/* Link Input */
.link-input-area,
.text-input-area {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.input-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-color-secondary);
}

.text-input {
  padding: 10px 12px;
  background: var(--modal-card-bg);
  border: 1px solid var(--modal-border);
  border-radius: var(--modal-radius-sm);
  color: var(--text-color);
  font-size: 14px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.text-input:focus {
  outline: none;
  border-color: #58a6ff;
  background: var(--modal-card-bg-hover);
}

.text-area {
  padding: 10px 12px;
  background: var(--modal-card-bg);
  border: 1px solid var(--modal-border);
  border-radius: var(--modal-radius-sm);
  color: var(--text-color);
  font-size: 14px;
  resize: vertical;
  min-height: 160px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.text-area:focus {
  outline: none;
  border-color: #58a6ff;
  background: var(--modal-card-bg-hover);
}

.input-hint {
  font-size: 12px;
  color: var(--text-color-secondary);
}

/* Progress */
.upload-progress {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: rgba(88, 166, 255, 0.1);
  border-radius: var(--modal-radius-sm);
}

.progress-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #58a6ff;
}

.progress-bar {
  height: 4px;
  background: var(--modal-card-bg);
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #58a6ff, #a371f7);
  border-radius: 2px;
  transition: width 0.3s ease;
}

/* Error */
.error-message {
  font-size: 12px;
  color: #f85149;
  background: rgba(248, 81, 73, 0.1);
  padding: 10px 12px;
  border-radius: var(--modal-radius-sm);
  border-left: 3px solid #f85149;
}

/* Footer Buttons */
.btn-secondary {
  padding: 10px 20px;
  border: 1px solid var(--modal-border);
  border-radius: var(--modal-radius-sm);
  background: var(--modal-btn-secondary-bg);
  color: var(--text-color-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.btn-secondary:hover {
  color: var(--text-color);
  background: var(--modal-btn-secondary-hover);
}

.btn-primary {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 20px;
  border: none;
  border-radius: var(--modal-radius-sm);
  background: linear-gradient(135deg, #238636 0%, #2ea043 100%);
  color: #ffffff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(35, 134, 54, 0.3);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.btn-primary:hover:not(:disabled) {
  background: linear-gradient(135deg, #2ea043 0%, #3fb950 100%);
  box-shadow: 0 4px 12px rgba(35, 134, 54, 0.4);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Spinner */
.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
