<script setup lang="ts">
/**
 * NotePreviewPanel - Right-side panel showing note being edited by AI
 *
 * Hosts its own Muya instance + useDiffBlocks for inline diff visualization.
 * Does NOT use editorStore.currentDocument — manages its own document via notesService.
 * After accept/reject, saves directly via notesService.updateNote().
 */
import { ref, computed, onMounted, onUnmounted, watch, nextTick, markRaw } from 'vue'
import { useAIStore } from '@/stores/ai'
import { usePreferencesStore, useEditorStore } from '@/stores'
import { useDiffBlocks } from '@/composables/useDiffBlocks'
import { registerMuyaPlugins } from '@/utils/muyaPlugins'
import DiffActionBar from '@/components/ai/DiffActionBar.vue'
import * as notesService from '@/services/notes.service'
import { X, FileText, Check } from 'lucide-vue-next'

import { Muya } from '@inkdown/muya'

// Muya styles are already imported globally by EditorArea
// Only need KaTeX + Prism if not already loaded
import 'katex/dist/katex.min.css'
import 'prismjs/themes/prism.css'

const aiStore = useAIStore()
const preferencesStore = usePreferencesStore()
const editorStore = useEditorStore()

// Local document state
const previewDocument = ref<{ id: string; title: string; content: string } | null>(null)
const isLoading = ref(true)

// Save status and word count (Fix 2)
const isSaved = ref(true)
const wordCount = ref({ words: 0, characters: 0, paragraphs: 0 })

// Title editing state (Fix 3)
const isEditingTitle = ref(false)
const editingTitleValue = ref('')
const titleInputRef = ref<HTMLInputElement | null>(null)

// Muya instance refs
const editorRef = ref<HTMLElement>()
const muyaInstance = ref<InstanceType<typeof Muya> | null>(null)
const panelRef = ref<HTMLElement | null>(null)

// Resize functionality
const isResizing = ref(false)
const panelWidth = ref(450) // Default width in pixels

// The noteId driving this panel
const previewNoteId = computed(() => aiStore.previewNoteId)

// Word count display (Fix 2)
const wordCountDisplay = computed(() => {
  const w = wordCount.value.words
  return `${w} word${w !== 1 ? 's' : ''}`
})

// Auto-save timer
const autoSaveTimer = ref<ReturnType<typeof setTimeout>>()
let loadSequence = 0

// Resize handlers
function startResize(e: MouseEvent) {
  e.preventDefault()
  isResizing.value = true
  document.addEventListener('mousemove', onResize)
  document.addEventListener('mouseup', stopResize)
  document.body.style.cursor = 'ew-resize'
  document.body.style.userSelect = 'none'
}

function onResize(e: MouseEvent) {
  if (!isResizing.value || !panelRef.value) return
  // Panel is on the right side, so width = window width - mouse X
  const newWidth = window.innerWidth - e.clientX
  if (newWidth >= 360 && newWidth <= 800) {
    panelWidth.value = newWidth
  }
}

function stopResize() {
  isResizing.value = false
  document.removeEventListener('mousemove', onResize)
  document.removeEventListener('mouseup', stopResize)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

// Custom sync handler: saves via notesService instead of editorStore
function handleDiffSync(markdown: string) {
  if (!previewDocument.value) return
  previewDocument.value.content = markdown
  notesService
    .updateNote(previewDocument.value.id, { content: markdown })
    .catch((err) => console.warn('[NotePreviewPanel] Sync save failed:', err))
}

// Initialize diff blocks with preview-specific refs and custom sync
const { clearAllDiffs, acceptAllDiffs, rejectAllDiffs, isDiffInjecting } = useDiffBlocks(
  muyaInstance as unknown as Parameters<typeof useDiffBlocks>[0],
  previewNoteId as unknown as Parameters<typeof useDiffBlocks>[1],
  { onSync: handleDiffSync }
)

/**
 * Calculate word count from markdown content
 */
function calculateWordCount(markdown: string) {
  const text = markdown.replace(/[#*`~[\]()>_-]/g, ' ').trim()
  const words = text.split(/\s+/).filter((w) => w.length > 0).length
  const characters = text.replace(/\s/g, '').length
  const paragraphs = markdown.split(/\n\n+/).filter((p) => p.trim().length > 0).length
  return { words, characters, paragraphs }
}

/**
 * Load note content from database
 */
async function loadNote(noteId: string) {
  isLoading.value = true
  previewDocument.value = null
  try {
    const result = await notesService.getNote(noteId)
    if (result.data && Array.isArray(result.data) && result.data.length > 0) {
      const note = result.data[0]
      previewDocument.value = {
        id: note.id,
        title: note.title,
        content: note.content || '',
      }
      // Initialize word count
      wordCount.value = calculateWordCount(note.content || '')
      isSaved.value = true
    }
  } catch (err) {
    console.error('[NotePreviewPanel] Failed to load note:', err)
  } finally {
    isLoading.value = false
  }
}

/**
 * Initialize Muya editor for preview
 */
function initializeMuya() {
  if (!editorRef.value || !previewDocument.value) return

  registerMuyaPlugins({ frontControls: true })

  const options = {
    markdown: previewDocument.value.content,
    focusMode: false,
    preferLooseListItem: preferencesStore.preferLooseListItem,
    autoPairBracket: preferencesStore.autoPairBracket,
    autoPairMarkdownSyntax: preferencesStore.autoPairMarkdownSyntax,
    autoPairQuote: preferencesStore.autoPairQuote,
    bulletListMarker: preferencesStore.bulletListMarker,
    orderListDelimiter: preferencesStore.orderListDelimiter,
    tabSize: preferencesStore.tabSize,
    fontSize: preferencesStore.fontSize,
    lineHeight: preferencesStore.lineHeight,
    codeBlockLineNumbers: preferencesStore.codeBlockLineNumbers,
    listIndentation: preferencesStore.listIndentation,
    hideQuickInsertHint: preferencesStore.hideQuickInsertHint,
    hideLinkPopup: preferencesStore.hideLinkPopup,
    spellcheckEnabled: false,
    trimUnnecessaryCodeBlockEmptyLines: preferencesStore.trimUnnecessaryCodeBlockEmptyLines,
    mermaidTheme: preferencesStore.theme.includes('dark') ? 'dark' : 'default',
    vegaTheme: preferencesStore.theme.includes('dark') ? 'dark' : 'latimes',
    superSubScript: true,
    footnote: true,
    isGitlabCompatibilityEnabled: true,
    disableHtml: false,
  }

  muyaInstance.value = markRaw(new Muya(editorRef.value, options))

  // Handle content changes — save directly via notesService
  muyaInstance.value.on('json-change', () => {
    if (isDiffInjecting.value) return
    // Mark as unsaved and update word count (Fix 2)
    isSaved.value = false
    const markdown = muyaInstance.value?.getMarkdown() || ''
    wordCount.value = calculateWordCount(markdown)

    if (autoSaveTimer.value) clearTimeout(autoSaveTimer.value)
    const timerNoteId = previewNoteId.value // capture at creation time
    autoSaveTimer.value = setTimeout(() => {
      // Only save if we're still on the same note (prevents cross-note save after rapid switch)
      if (previewNoteId.value === timerNoteId) {
        savePreviewDocument()
      }
    }, 1500)
  })
}

/**
 * Save preview document directly via notesService (bypasses editorStore)
 */
async function savePreviewDocument() {
  if (!muyaInstance.value || !previewDocument.value) return
  const markdown = muyaInstance.value.getMarkdown()
  previewDocument.value.content = markdown

  try {
    await notesService.updateNote(previewDocument.value.id, {
      content: markdown,
      word_count: wordCount.value.words,
      character_count: wordCount.value.characters,
    })
    isSaved.value = true // Mark as saved (Fix 2)
  } catch (err) {
    console.warn('[NotePreviewPanel] Failed to save:', err)
  }
}

/**
 * Title editing functions (Fix 3)
 */
function startEditTitle() {
  if (!previewDocument.value) return
  editingTitleValue.value = previewDocument.value.title
  isEditingTitle.value = true
  nextTick(() => {
    titleInputRef.value?.focus()
    titleInputRef.value?.select()
  })
}

async function saveTitle() {
  if (!previewDocument.value || !isEditingTitle.value) return
  const newTitle = editingTitleValue.value.trim()
  if (!newTitle) {
    cancelEditTitle()
    return
  }

  const noteId = previewDocument.value.id
  previewDocument.value.title = newTitle
  isEditingTitle.value = false

  // Use editorStore.renameDocument for automatic sidebar sync
  await editorStore.renameDocument(noteId, newTitle)
}

function cancelEditTitle() {
  isEditingTitle.value = false
  editingTitleValue.value = ''
}

function handleClose() {
  aiStore.closeNotePreview()
}

function handleAcceptAll() {
  acceptAllDiffs()
  // After accepting, save the merged content
  nextTick(() => savePreviewDocument())
}

function handleRejectAll() {
  rejectAllDiffs()
  nextTick(() => savePreviewDocument())
}

// Watch for previewNoteId changes — load new note and reinitialize Muya
watch(
  previewNoteId,
  async (noteId) => {
    if (!noteId) return
    const sequence = ++loadSequence

    // Clear auto-save timer to prevent stale save firing on wrong note
    if (autoSaveTimer.value) {
      clearTimeout(autoSaveTimer.value)
      autoSaveTimer.value = undefined
    }

    await loadNote(noteId)
    await nextTick()

    // Ignore stale loads when rapidly switching notes
    if (sequence !== loadSequence) return

    if (!muyaInstance.value) {
      initializeMuya()
    } else {
      clearAllDiffs()
      muyaInstance.value.setMarkdown(previewDocument.value?.content || '')
    }
  },
  { immediate: true }
)

// Fallback: if the immediate watcher couldn't init Muya (editorRef not bound yet),
// onMounted guarantees the DOM is ready for initialization
onMounted(() => {
  if (!muyaInstance.value && previewDocument.value && editorRef.value) {
    initializeMuya()
  }
})

onUnmounted(() => {
  if (autoSaveTimer.value) clearTimeout(autoSaveTimer.value)
  // Clean up resize listeners
  document.removeEventListener('mousemove', onResize)
  document.removeEventListener('mouseup', stopResize)
  if (muyaInstance.value) {
    try {
      muyaInstance.value.destroy()
    } catch {
      /* ignore */
    }
    muyaInstance.value = null
  }
})
</script>

<template>
  <div
    ref="panelRef"
    class="note-preview-panel"
    :style="{ width: `${panelWidth}px` }"
  >
    <!-- Resize Handle -->
    <div
      class="resize-handle"
      :class="{ active: isResizing }"
      @mousedown="startResize"
    />

    <!-- Header -->
    <div class="preview-header">
      <div class="header-left">
        <FileText
          :size="14"
          class="header-icon"
        />
        <!-- Editable title (Fix 3) -->
        <input
          v-if="isEditingTitle"
          ref="titleInputRef"
          v-model="editingTitleValue"
          class="title-input"
          @keyup.enter="saveTitle"
          @keyup.escape="cancelEditTitle"
          @blur="saveTitle"
        />
        <span
          v-else
          class="note-title"
          title="Click to rename"
          @click="startEditTitle"
        >
          {{ previewDocument?.title || 'Loading...' }}
        </span>
      </div>

      <!-- Status + Word Count (Fix 2) -->
      <div class="header-right">
        <span
          class="status-badge"
          :class="{ saved: isSaved }"
        >
          <Check
            v-if="isSaved"
            :size="10"
          />
          {{ isSaved ? 'Saved' : 'Draft' }}
        </span>
        <span class="word-count">{{ wordCountDisplay }}</span>
        <button
          class="close-btn"
          title="Close preview"
          @click="handleClose"
        >
          <X :size="16" />
        </button>
      </div>
    </div>

    <!-- Editor body -->
    <div class="preview-body">
      <div
        ref="editorRef"
        class="preview-editor muya-editor muya-editor--contained-diff mu-front-controls-enabled"
      ></div>
      <div
        v-if="isLoading"
        class="loading-state"
      >
        <div class="loading-spinner"></div>
        <p>Loading note...</p>
      </div>
    </div>

    <!-- Diff Action Bar -->
    <DiffActionBar
      @accept-all="handleAcceptAll"
      @reject-all="handleRejectAll"
    />
  </div>
</template>

<style scoped>
.note-preview-panel {
  min-width: 360px;
  max-width: 800px;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--editorBgColor, var(--card-bg, #0d1117));
  border-left: 1px solid var(--border-color, #30363d);
  position: relative;
  flex-shrink: 0;
}

/* Resize handle on the left side */
.resize-handle {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  cursor: ew-resize;
  background: transparent;
  z-index: 200;
  transition: background 0.15s ease;
}

.resize-handle:hover,
.resize-handle.active {
  background: var(--primary-color, #7c9ef8);
  opacity: 0.5;
}

.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border-color, #21262d);
  flex-shrink: 0;
  /* Higher z-index to cover Muya floating icons (ParagraphFrontButton uses z-index: 1000 on body) */
  position: relative;
  z-index: 1001;
  background: var(--editorBgColor, var(--card-bg, #0d1117));
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.header-icon {
  color: var(--text-color-secondary, #8b949e);
  flex-shrink: 0;
}

.note-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color, #e6edf3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
  transition: background 0.15s;
}

.note-title:hover {
  background: rgba(255, 255, 255, 0.06);
}

.title-input {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color, #e6edf3);
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--primary-color, #7c9ef8);
  border-radius: 4px;
  padding: 2px 6px;
  outline: none;
  min-width: 120px;
  max-width: 200px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  background: rgba(124, 158, 248, 0.1);
  color: var(--primary-color, #7c9ef8);
}

.status-badge.saved {
  background: rgba(52, 211, 153, 0.15);
  color: #10b981;
}

.word-count {
  font-size: 11px;
  color: var(--text-color-secondary, #8b949e);
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--text-color-secondary, #8b949e);
  cursor: pointer;
  transition: all 0.15s;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-color, #e6edf3);
}

.preview-body {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
  position: relative;
  /* Create new stacking context to contain Muya icons (z-index: 1000) inside this element */
  isolation: isolate;
  z-index: 0;
}

.preview-editor {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 24px 40px;
  font-family: var(--editor-font-family, 'Open Sans', -apple-system, sans-serif);
  font-size: var(--editor-font-size, 16px);
  line-height: var(--editor-line-height, 1.6);
  color: var(--text-color);
  outline: none;
}

/* Fix 1: Hide the first H1 that duplicates the header title */
.preview-editor :deep(> p:first-child > span.mu-atx-heading.mu-h1:first-child),
.preview-editor :deep(> .mu-paragraph:first-child .mu-atx-heading.mu-h1) {
  display: none;
}

/* Alternative: Push the first H1 content to hide behind overlapping area */
.preview-editor :deep(> .mu-paragraph:first-child) {
  margin-top: 0;
}

.loading-state {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-color-secondary, #8b949e);
  background: var(--editorBgColor, var(--card-bg, #0d1117));
  pointer-events: all;
  cursor: progress;
}

.loading-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--border-color, #30363d);
  border-top-color: var(--primary-color, #7c9ef8);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
