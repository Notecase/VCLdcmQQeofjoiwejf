<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick, markRaw } from 'vue'
import { useEditorStore, usePreferencesStore, useAuthStore } from '@/stores'
import { useAIStore, type PendingArtifact } from '@/stores/ai'
import { useDiffBlocks } from '@/composables/useDiffBlocks'
import ArtifactCodeModal, { type ArtifactData } from '@/components/artifact/ArtifactCodeModal.vue'

// Import Muya from TS package
import { Muya } from '@inkdown/muya'
import { registerMuyaPlugins } from '@/utils/muyaPlugins'

// Import Muya styles directly from the package
import '@inkdown/muya/assets/styles/index.css'
import '@/assets/themes/editor/default.css'

// Import KaTeX CSS for math rendering
import 'katex/dist/katex.min.css'

// Import Prism CSS for code syntax highlighting
import 'prismjs/themes/prism.css'

// Interface for TOC heading items
interface TocItem {
  lvl: number
  content: string
  slug: string
}

// Helper function to create a slug from heading text
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') // Remove special chars
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Remove consecutive hyphens
    .trim()
}

// Helper function to extract headings from Muya state
function extractHeadingsFromState(state: any[]): TocItem[] {
  const headings: TocItem[] = []

  function traverse(blocks: any[]) {
    for (const block of blocks) {
      // Check for ATX heading (# Heading)
      if (block.name === 'atx-heading') {
        const text = block.text?.replace(/^#+\s*/, '') || '' // Remove leading # markers
        headings.push({
          lvl: block.meta?.level || 1,
          content: text,
          slug: slugify(text),
        })
      }
      // Check for Setext heading (underlined heading)
      else if (block.name === 'setext-heading') {
        headings.push({
          lvl: block.meta?.level || 1,
          content: block.text || '',
          slug: slugify(block.text || ''),
        })
      }
      // Recursively check children (for block quotes, lists, etc.)
      else if (block.children && Array.isArray(block.children)) {
        traverse(block.children)
      }
    }
  }

  traverse(state)
  return headings
}

const editorStore = useEditorStore()
const preferencesStore = usePreferencesStore()
const authStore = useAuthStore()
const aiStore = useAIStore()

const editorRef = ref<HTMLElement>()
const muyaInstance = ref<InstanceType<typeof Muya> | null>(null)

// Current note ID for diff tracking
const currentNoteId = computed(() => editorStore.currentDocument?.id)

// Initialize true inline diff system
// The composable watches for pending edits and injects diff blocks directly into Muya's DOM
const { clearAllDiffs, acceptAllDiffs, rejectAllDiffs } = useDiffBlocks(
  muyaInstance as unknown as Parameters<typeof useDiffBlocks>[0],
  currentNoteId
)
const autoSaveTimer = ref<ReturnType<typeof setTimeout>>()
const tocUpdateTimer = ref<ReturnType<typeof setTimeout>>()
const isEditorReady = ref(false)
const isUploadingImage = ref(false)

// Artifact code modal state
const artifactModalOpen = ref(false)
const artifactEditData = ref<ArtifactData | null>(null)

// Initialize Muya editor
function initializeMuya() {
  if (!editorRef.value) return

  registerMuyaPlugins({ frontControls: true })

  const options = {
    markdown: editorStore.currentDocument?.content || '',
    focusMode: preferencesStore.focus,
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
    spellcheckEnabled: false, // Web doesn't have native spellcheck integration
    trimUnnecessaryCodeBlockEmptyLines: preferencesStore.trimUnnecessaryCodeBlockEmptyLines,
    // Theme for diagrams
    mermaidTheme: preferencesStore.theme.includes('dark') ? 'dark' : 'default',
    vegaTheme: preferencesStore.theme.includes('dark') ? 'dark' : 'latimes',
    sequenceTheme: preferencesStore.sequenceTheme,
    // Enable math and extended markdown features
    superSubScript: true, // Enable superscript/subscript syntax
    footnote: true, // Enable footnote syntax
    isGitlabCompatibilityEnabled: true, // Enable GitLab-flavored markdown
    disableHtml: false, // Allow HTML for math rendering
  }

  // Use markRaw to prevent Vue from proxying the Muya instance.
  // Without this, Vue's reactivity system wraps DOM elements, event listeners,
  // and internal objects in Proxies, which breaks structuredClone() in getState().
  muyaInstance.value = markRaw(new Muya(editorRef.value, options))

  // Restore editor state (cursor and scroll position) after initialization
  const currentDoc = editorStore.currentDocument
  if (currentDoc?.editor_state) {
    nextTick(() => {
      try {
        // Restore cursor position
        if (currentDoc.editor_state?.cursor && muyaInstance.value) {
          muyaInstance.value.setCursor(currentDoc.editor_state.cursor)
        }

        // Restore scroll position
        if (currentDoc.editor_state?.scroll && muyaInstance.value) {
          const container = muyaInstance.value.container
          if (container) {
            container.scrollTop = currentDoc.editor_state.scroll.top || 0
            container.scrollLeft = currentDoc.editor_state.scroll.left || 0
          }
        }
      } catch (error) {
        console.warn('Failed to restore editor state:', error)
      }
    })
  }

  // Handle content changes - TS Muya uses 'json-change' event
  muyaInstance.value.on('json-change', () => {
    const markdown = muyaInstance.value?.getMarkdown() || ''
    const state = muyaInstance.value?.getState() || []

    // Calculate word count from markdown
    const words = markdown.split(/\s+/).filter((w: string) => w.length > 0).length
    const characters = markdown.length
    const paragraphs = state.length

    // Update store
    editorStore.updateContent(markdown, {
      words,
      characters,
      paragraphs,
    })

    // Debounce TOC update to avoid excessive store updates
    if (tocUpdateTimer.value) {
      clearTimeout(tocUpdateTimer.value)
    }
    tocUpdateTimer.value = setTimeout(() => {
      const toc = extractHeadingsFromState(state)
      editorStore.updateToc(toc)
    }, 500)

    // Auto-save with debounce
    if (autoSaveTimer.value) {
      clearTimeout(autoSaveTimer.value)
    }

    if (preferencesStore.autoSave) {
      autoSaveTimer.value = setTimeout(() => {
        editorStore.saveDocument()
      }, preferencesStore.autoSaveDelay)
    }
  })

  // Handle selection changes
  muyaInstance.value.on('selection-change', () => {
    // Could dispatch to store for toolbar state
  })

  // Handle artifact code editor open event
  muyaInstance.value.on('artifact-open-code-editor', (data: { blockId: string; code: string; title: string; height: number }) => {
    // Parse code JSON to extract html/css/javascript
    let html = ''
    let css = ''
    let javascript = ''
    try {
      const parsed = JSON.parse(data.code)
      html = parsed.html || ''
      css = parsed.css || ''
      javascript = parsed.javascript || ''
    } catch {
      // If code is not JSON, treat as raw HTML
      html = data.code
    }

    artifactEditData.value = {
      blockId: data.blockId,
      title: data.title,
      html,
      css,
      javascript,
      height: data.height,
    }
    artifactModalOpen.value = true
  })

  isEditorReady.value = true

  // Extract initial TOC after editor is ready
  nextTick(() => {
    const state = muyaInstance.value?.getState() || []
    const toc = extractHeadingsFromState(state)
    editorStore.updateToc(toc)
  })
}

// Watch for document changes
watch(
  () => editorStore.currentDocument,
  (newDoc, oldDoc) => {
    if (newDoc && muyaInstance.value && newDoc.id !== oldDoc?.id) {
      // Clear any active diffs when switching documents
      // (Note: composable also watches noteId, but explicit clear is safer)
      clearAllDiffs()

      // Switch to new document content, restoring cursor position if available
      muyaInstance.value.setMarkdown(newDoc.content, newDoc.editor_state?.cursor)

      // Update TOC after document switch
      nextTick(() => {
        const state = muyaInstance.value?.getState() || []
        const toc = extractHeadingsFromState(state)
        editorStore.updateToc(toc)
      })
    }
  }
)

// Load persisted artifacts when note changes
watch(
  currentNoteId,
  async (noteId) => {
    if (noteId && authStore.user?.id) {
      await aiStore.loadPersistedArtifacts(authStore.user.id, noteId)
    }
  },
  { immediate: true }
)

// Watch for pending artifacts and insert them into editor
watch(
  () => aiStore.getPendingArtifactsForNote(currentNoteId.value || ''),
  (pendingArtifacts) => {
    if (!muyaInstance.value || !currentNoteId.value) return
    for (const artifact of pendingArtifacts) {
      insertArtifactBlock(artifact)
    }
  },
  { deep: true }
)

/**
 * Insert an artifact block into the editor
 * Creates an IArtifactState and appends it to the document
 */
function insertArtifactBlock(artifact: PendingArtifact) {
  const muya = muyaInstance.value
  if (!muya?.editor?.scrollPage) return

  const scrollPage = muya.editor.scrollPage
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ScrollPageClass = (scrollPage as any).constructor

  // Create artifact state with JSON-serialized content
  // IMPORTANT: Use nullish coalescing (??) to ensure data fields are never undefined
  // JSON.stringify silently OMITS keys with undefined values, causing content loss
  const artifactState = {
    name: 'artifact' as const,
    meta: { title: artifact.data.title || 'Untitled Artifact', customHeight: 300 },
    text: JSON.stringify({
      html: artifact.data.html ?? '',
      css: artifact.data.css ?? '',
      javascript: artifact.data.javascript ?? '',
    }),
  }

  // Load and create artifact block
  const ArtifactBlockClass = ScrollPageClass.loadBlock('artifact')
  if (!ArtifactBlockClass) {
    console.warn('[EditorArea] ArtifactBlock class not found')
    return
  }

  const artifactBlock = ArtifactBlockClass.create(muya, artifactState)

  // Insert at end of document
  // Use 'user' source to properly sync OT state (prevents index mismatch errors)
  const lastBlock = scrollPage.children?.tail
  if (lastBlock) {
    scrollPage.insertAfter(artifactBlock, lastBlock, 'user')
  } else {
    scrollPage.insertBefore(artifactBlock, null, 'user')
  }

  // Mark as inserted
  aiStore.markArtifactInserted(artifact.id)

  // Sync content to store
  nextTick(() => {
    const markdown = muya.getMarkdown()
    editorStore.updateContent(markdown, {
      words: markdown.split(/\s+/).filter((w: string) => w.length > 0).length,
      characters: markdown.length,
      paragraphs: markdown.split('\n\n').length,
    })
    editorStore.saveDocument()
  })

  console.log('[EditorArea] Artifact block inserted:', artifact.data.title)
}

/**
 * Handle artifact code modal save
 * Emits the update event back to Muya
 */
function handleArtifactSave(data: ArtifactData) {
  const muya = muyaInstance.value
  if (!muya) return

  // Convert back to JSON code format
  const codeJson = JSON.stringify({
    html: data.html,
    css: data.css,
    javascript: data.javascript,
  })

  // Emit update event to Muya
  muya.eventCenter.emit('artifact-update-code', {
    blockId: data.blockId,
    code: codeJson,
    title: data.title,
    height: data.height,
  })

  // Close modal
  artifactModalOpen.value = false
  artifactEditData.value = null
}

/**
 * Close artifact modal without saving
 */
function closeArtifactModal() {
  artifactModalOpen.value = false
  artifactEditData.value = null
}

// Watch for preference changes
watch(
  () => preferencesStore.focus,
  (value) => {
    muyaInstance.value?.setFocusMode(value)
  }
)

watch(
  () => preferencesStore.fontSize,
  (value) => {
    muyaInstance.value?.setFont({ fontSize: value })
  }
)

watch(
  () => preferencesStore.lineHeight,
  (value) => {
    muyaInstance.value?.setFont({ lineHeight: value })
  }
)

watch(
  () => preferencesStore.tabSize,
  (value) => {
    muyaInstance.value?.setTabSize(value)
  }
)

watch(
  () => preferencesStore.theme,
  (value) => {
    const isDark = value.includes('dark')
    muyaInstance.value?.setOptions(
      {
        mermaidTheme: isDark ? 'dark' : 'default',
        vegaTheme: isDark ? 'dark' : 'latimes',
      },
      true
    )
  }
)

// Keyboard shortcuts
function handleKeydown(event: KeyboardEvent) {
  // Save: Cmd/Ctrl + S
  if ((event.metaKey || event.ctrlKey) && event.key === 's') {
    event.preventDefault()
    editorStore.saveDocument()
  }

  // Undo: Cmd/Ctrl + Z
  if ((event.metaKey || event.ctrlKey) && event.key === 'z' && !event.shiftKey) {
    event.preventDefault()
    muyaInstance.value?.undo()
  }

  // Redo: Cmd/Ctrl + Shift + Z or Cmd/Ctrl + Y
  if (
    (event.metaKey || event.ctrlKey) &&
    (event.key === 'y' || (event.key === 'z' && event.shiftKey))
  ) {
    event.preventDefault()
    muyaInstance.value?.redo()
  }
}

onMounted(() => {
  initializeMuya()
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)

  if (autoSaveTimer.value) {
    clearTimeout(autoSaveTimer.value)
  }

  if (tocUpdateTimer.value) {
    clearTimeout(tocUpdateTimer.value)
  }

  if (muyaInstance.value) {
    try {
      muyaInstance.value.destroy()
    } catch {
      // Ignore cleanup errors
    }
    muyaInstance.value = null
  }
})

// Expose Muya instance for parent components (e.g., format toolbar)
const getMuya = () => muyaInstance.value
defineExpose({ getMuya, isEditorReady, isUploadingImage, acceptAllDiffs, rejectAllDiffs })
</script>

<template>
  <div
    class="editor-area"
    :class="{
      'typewriter-mode': preferencesStore.typewriter,
      'focus-mode': preferencesStore.focus,
      'source-mode': preferencesStore.sourceCode,
    }"
    :style="{
      '--editor-font-size': `${preferencesStore.fontSize}px`,
      '--editor-line-height': preferencesStore.lineHeight,
    }"
  >
    <!-- Muya Editor Container -->
    <!-- Diff blocks are injected directly into .mu-container by useDiffBlocks composable -->
    <div
      ref="editorRef"
      class="muya-editor"
      :dir="preferencesStore.textDirection"
    ></div>

    <!-- Loading state -->
    <div
      v-if="!isEditorReady"
      class="editor-loading"
    >
      <div class="loading-spinner"></div>
      <p>Initializing editor...</p>
    </div>

    <!-- Artifact Code Modal -->
    <ArtifactCodeModal
      v-if="artifactEditData"
      :visible="artifactModalOpen"
      :data="artifactEditData"
      @save="handleArtifactSave"
      @close="closeArtifactModal"
    />
  </div>
</template>

<style scoped>
.editor-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  /* Allow vertical overflow for diff hunks positioned outside scroll container */
  overflow-x: hidden;
  overflow-y: visible;
  background: transparent;
  position: relative;
}

.muya-editor {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 40px 80px;
  font-family: var(
    --editor-font-family,
    'Open Sans',
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    sans-serif
  );
  font-size: var(--editor-font-size, 16px);
  line-height: var(--editor-line-height, 1.6);
  color: var(--text-color);
  outline: none;
}

/* Muya editor overrides - TS Muya uses 'mu-' prefix */
.muya-editor :deep(.mu-container-block) {
  max-width: 100%;
  width: 100%;
}

.muya-editor :deep(h1),
.muya-editor :deep(h2),
.muya-editor :deep(h3),
.muya-editor :deep(h4),
.muya-editor :deep(h5),
.muya-editor :deep(h6) {
  color: var(--text-color);
  font-weight: 600;
  margin-top: 1.5em;
  margin-bottom: 0.5em;
}

.muya-editor :deep(h1) {
  font-size: 2em;
}
.muya-editor :deep(h2) {
  font-size: 1.5em;
}
.muya-editor :deep(h3) {
  font-size: 1.25em;
}

.muya-editor :deep(p) {
  margin-bottom: 1em;
}

.muya-editor :deep(code) {
  background: var(--bg-color);
  padding: 0.2em 0.4em;
  border-radius: 4px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.9em;
}

.muya-editor :deep(pre) {
  background: var(--bg-color);
  padding: 16px;
  border-radius: 8px;
  overflow-x: auto;
}

.muya-editor :deep(blockquote) {
  border-left: 4px solid var(--primary-color);
  padding-left: 16px;
  margin-left: 0;
  color: var(--text-color-secondary);
}

.muya-editor :deep(a) {
  color: var(--primary-color);
  text-decoration: none;
}

.muya-editor :deep(a:hover) {
  text-decoration: underline;
}

/* Focus mode */
.focus-mode .muya-editor :deep(.mu-paragraph:not(.mu-active)) {
  opacity: 0.3;
}

/* Typewriter mode */
.typewriter-mode .muya-editor {
  padding-top: 40vh;
  padding-bottom: 40vh;
}

/* Loading state */
.editor-loading {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: var(--editorBgColor);
  gap: 16px;
  color: var(--text-color-secondary);
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border-color);
  border-top-color: var(--primary-color);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* ============================================
 * INLINE MATH - Typora-like styling
 * ============================================ */

/* Inline math container - keep inline with text */
.muya-editor :deep(span.mu-math) {
  display: inline !important;
  vertical-align: baseline;
  font-family: inherit;
}

/* Inline math when hidden (showing rendered output) */
.muya-editor :deep(span.mu-math.mu-hide) {
  display: inline !important;
}

/* Inline math rendered output - stay inline, NO background (simple like text) */
.muya-editor :deep(span.mu-math.mu-hide > .mu-math-render) {
  display: inline !important;
  position: relative !important;
  top: 0 !important;
  left: 0 !important;
  padding: 0 !important;
  margin: 0 !important;
  background: transparent !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  vertical-align: baseline !important;
}

/* Inline KaTeX styling */
.muya-editor :deep(span.mu-math.mu-hide > .mu-math-render .katex) {
  font-size: 1em;
  vertical-align: baseline;
  white-space: nowrap;
}

/* When editing inline math (not hidden) - show input with popup preview */
.muya-editor :deep(span.mu-math:not(.mu-hide) > .mu-math-render) {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 1000;
  padding: 8px 12px;
  background: var(--floatBgColor, #2d2d30);
  border: 1px solid var(--floatBorderColor, #454545);
  border-radius: 6px;
  box-shadow: var(--floatShadow);
}

/* Source text when editing */
.muya-editor :deep(span.mu-math:not(.mu-hide) > .mu-math-text) {
  padding: 2px 4px;
  background: rgba(100, 100, 100, 0.15);
  border-radius: 4px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.9em;
  color: var(--editorColor);
}

/* ============================================
 * BLOCK MATH (display math $$...$$)
 * ============================================ */

/* Block math container - minimal styling */
.muya-editor :deep(figure[data-role='MULTIPLEMATH']) {
  margin: 16px 0;
  padding: 0;
  background: transparent;
}

.muya-editor :deep(pre.mu-multiple-math) {
  margin: 0;
  padding: 12px;
  background: var(--codeBlockBgColor, rgba(0, 0, 0, 0.2));
  border-radius: 6px;
}

/* Block math preview container */
.muya-editor :deep(.mu-container-preview) {
  padding: 8px;
  text-align: center;
}

.muya-editor :deep(.mu-container-preview .katex-display) {
  margin: 0;
  padding: 8px 0;
}

.muya-editor :deep(.mu-container-preview .katex) {
  font-size: 1.2em;
}

/* ============================================
 * CODE BLOCKS - improved styling
 * ============================================ */

.muya-editor :deep(pre.mu-fence-code) {
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid var(--border-color, #333);
  border-radius: 8px;
  margin: 16px 0;
  padding: 16px;
  overflow-x: auto;
}

.muya-editor :deep(pre.mu-fence-code code) {
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
  font-size: 14px;
  line-height: 1.5;
}

.muya-editor :deep(.mu-language-input) {
  font-size: 12px;
  color: var(--text-color-secondary, #888);
  background: transparent;
  border: none;
  padding: 4px 8px;
  font-family: monospace;
}

/* Inline code */
.muya-editor :deep(span code) {
  padding: 2px 6px;
  background: rgba(100, 100, 100, 0.2);
  border-radius: 4px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.9em;
}

/* ============================================
 * TABLES - cleaner styling
 * ============================================ */

.muya-editor :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 16px 0;
  border: 1px solid var(--border-color, #333);
  border-radius: 8px;
  overflow: hidden;
}

.muya-editor :deep(th),
.muya-editor :deep(td) {
  border: 1px solid var(--border-color, #333);
  padding: 10px 16px;
  text-align: left;
}

.muya-editor :deep(th) {
  background: rgba(100, 100, 100, 0.15);
  font-weight: 600;
}

.muya-editor :deep(tr:nth-child(even)) {
  background: rgba(100, 100, 100, 0.05);
}

/* ============================================
 * DIAGRAMS - visual containers
 * ============================================ */

.muya-editor :deep(figure[data-role='MERMAID']),
.muya-editor :deep(figure[data-role='FLOWCHART']),
.muya-editor :deep(figure[data-role='SEQUENCE']),
.muya-editor :deep(figure[data-role='VEGA-LITE']),
.muya-editor :deep(figure[data-role='PLANTUML']) {
  margin: 24px 0;
  padding: 20px;
  background: rgba(100, 100, 100, 0.08);
  border-radius: 8px;
  text-align: center;
}

/* ============================================
 * BLOCKQUOTES
 * ============================================ */

.muya-editor :deep(blockquote) {
  margin: 16px 0;
  padding: 12px 20px;
  border-left: 4px solid var(--primary-color, #65b9f4);
  background: rgba(100, 100, 100, 0.05);
  border-radius: 0 8px 8px 0;
  color: var(--text-color-secondary, #aaa);
}

.muya-editor :deep(blockquote blockquote) {
  margin-left: 0;
}

/* ============================================
 * TASK LISTS
 * ============================================ */

.muya-editor :deep(li.mu-task-list-item) {
  list-style-type: none;
  position: relative;
  margin-left: -1.2em;
}

.muya-editor :deep(li.mu-task-list-item > input[type='checkbox']) {
  margin-right: 8px;
  cursor: pointer;
}

/* ============================================
 * FOOTNOTES
 * ============================================ */

.muya-editor :deep(.mu-inline-footnote-identifier) {
  vertical-align: super;
  font-size: 0.75em;
  color: var(--primary-color, #65b9f4);
  cursor: pointer;
}

.muya-editor :deep(.mu-inline-footnote-identifier:hover) {
  text-decoration: underline;
}

/* ============================================
 * LINKS
 * ============================================ */

.muya-editor :deep(a),
.muya-editor :deep(.mu-link) {
  color: var(--primary-color, #65b9f4);
  text-decoration: none;
}

.muya-editor :deep(a:hover),
.muya-editor :deep(.mu-link:hover) {
  text-decoration: underline;
}

/* ============================================
 * HORIZONTAL RULE
 * ============================================ */

.muya-editor :deep(hr) {
  border: none;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--border-color, #444), transparent);
  margin: 32px 0;
}

/* ============================================
 * IMAGES
 * ============================================ */

.muya-editor :deep(.mu-inline-image img) {
  max-width: 100%;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

/* ============================================
 * FRONT BUTTON & MENU STYLING
 * ============================================ */

/* Front button icon fixes */
.muya-editor :deep(.mu-front-button) {
  opacity: 0.6;
}

.muya-editor :deep(.mu-front-button:hover) {
  opacity: 1;
}

/* Front menu styling */
:deep(.mu-front-menu) {
  background: var(--floatBgColor, #2d2d30) !important;
  border: 1px solid var(--floatBorderColor, #454545) !important;
  border-radius: 6px !important;
  box-shadow: var(--floatShadow, 0 4px 16px rgba(0, 0, 0, 0.4)) !important;
  color: var(--editorColor, #d4d4d4) !important;
}

:deep(.mu-front-menu ul li:hover) {
  background: var(--floatHoverColor, rgba(255, 255, 255, 0.08)) !important;
}

:deep(.mu-front-menu ul li > span) {
  color: var(--editorColor, #d4d4d4) !important;
}

/* ============================================
 * CHECKBOX - Task List Item Fixes
 * ============================================ */

/* Container positioning */
.muya-editor :deep(li.mu-task-list-item) {
  position: relative;
  list-style-type: none;
  padding-left: 8px;
}

/* Hide the actual input - Muya uses ::before/::after */
.muya-editor :deep(li.mu-task-list-item > input[type='checkbox']) {
  -webkit-appearance: none;
  appearance: none;
  position: absolute;
  left: -23px;
  top: 0.3em;
  width: 12px;
  height: 12px;
  cursor: pointer;
  background: transparent !important;
  border: none !important;
}

/* OVERRIDE ::before - Make it SQUARE (not circle) */
.muya-editor :deep(li.mu-task-list-item > input[type='checkbox']::before) {
  content: '' !important;
  width: 18px !important;
  height: 18px !important;
  display: inline-block !important;
  border: 2px solid var(--editorColor50, rgba(128, 128, 128, 0.5)) !important;
  border-radius: 3px !important;
  background-color: var(--editorBgColor, #1e1e1e) !important;
  position: absolute !important;
  top: -2px !important;
  left: -2px !important;
  box-sizing: border-box !important;
  transition: all 0.2s ease !important;
}

/* Hover state */
.muya-editor :deep(li.mu-task-list-item > input[type='checkbox']:hover::before) {
  border-color: #6b8a73 !important;
}

/* CHECKED state - Sage green background */
.muya-editor :deep(li.mu-task-list-item > input.mu-checkbox-checked::before) {
  background-color: #6b8a73 !important;
  border-color: #6b8a73 !important;
  box-shadow: none !important;
}

/* Checkmark styling */
.muya-editor :deep(li.mu-task-list-item > input[type='checkbox']::after) {
  content: '' !important;
  transform: rotate(-45deg) scale(0) !important;
  width: 8px !important;
  height: 4px !important;
  border: 2px solid white !important;
  border-top: none !important;
  border-right: none !important;
  position: absolute !important;
  display: inline-block !important;
  top: 1px !important;
  left: 4px !important;
  transform-origin: bottom !important;
  transition: all 0.2s ease !important;
}

/* Checkmark visible when checked */
.muya-editor :deep(li.mu-task-list-item > input.mu-checkbox-checked::after) {
  transform: rotate(-45deg) scale(1) !important;
}

/* Strikethrough text when checked */
.muya-editor :deep(li.mu-task-list-item > input.mu-checkbox-checked ~ *) {
  color: var(--editorColor50, rgba(128, 128, 128, 0.5)) !important;
}

/* ============================================
 * TABLE STYLING
 * ============================================ */

.muya-editor :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 16px 0;
  background: transparent;
}

.muya-editor :deep(table th),
.muya-editor :deep(table td) {
  padding: 6px 13px;
  text-align: left;
  position: relative;
}

.muya-editor :deep(table th) {
  font-weight: bold;
}

/* Subtle hover effect */
.muya-editor :deep(table tr:hover td) {
  background: var(--editorColor04, rgba(255, 255, 255, 0.04));
}

/* Table toolbar */
.muya-editor :deep(.mu-tool-bar) {
  background: var(--floatBgColor, #2d2d30);
  border: 1px solid var(--floatBorderColor, #454545);
  border-radius: 4px;
  padding: 4px;
}

.muya-editor :deep(.mu-tool-bar ul li) {
  background: transparent;
  border-radius: 4px;
  color: var(--iconColor, #ccc);
}

.muya-editor :deep(.mu-tool-bar ul li:hover) {
  background: var(--floatHoverColor, rgba(255, 255, 255, 0.1));
}

/* ============================================
 * QUICK INSERT MENU
 * ============================================ */

:deep(.mu-float-wrapper) {
  background: var(--floatBgColor, #2d2d30) !important;
  border: 1px solid var(--floatBorderColor, #454545) !important;
  border-radius: 6px !important;
  box-shadow: var(--floatShadow, 0 4px 16px rgba(0, 0, 0, 0.4)) !important;
}

/* ============================================
 * CODE PICKER / LANGUAGE SELECTOR
 * ============================================ */

:deep(.mu-code-picker) {
  background: var(--floatBgColor, #2d2d30) !important;
  border: 1px solid var(--floatBorderColor, #454545) !important;
  color: var(--editorColor, #d4d4d4) !important;
}

:deep(.mu-code-picker li:hover) {
  background: var(--floatHoverColor, rgba(255, 255, 255, 0.08)) !important;
}

/* ============================================
 * EMOJI PICKER
 * ============================================ */

:deep(.mu-emoji-picker) {
  background: var(--floatBgColor, #2d2d30) !important;
  border: 1px solid var(--floatBorderColor, #454545) !important;
}

/* ============================================
 * TABLE PICKER
 * ============================================ */

:deep(.mu-table-picker) {
  background: var(--floatBgColor, #2d2d30) !important;
  border: 1px solid var(--floatBorderColor, #454545) !important;
}

:deep(.mu-table-picker td) {
  border: 1px solid var(--floatBorderColor, #454545) !important;
}

:deep(.mu-table-picker td.selected) {
  background: var(--themeColor, #0078d4) !important;
}

/* ============================================
 * FORMAT PICKER / INLINE TOOLBAR
 * ============================================ */

:deep(.mu-format-picker),
:deep(.mu-inline-format-toolbar) {
  background: var(--floatBgColor, #2d2d30) !important;
  border: 1px solid var(--floatBorderColor, #454545) !important;
}

:deep(.mu-format-picker button),
:deep(.mu-inline-format-toolbar button) {
  color: var(--editorColor, #d4d4d4) !important;
  background: transparent !important;
  border: none !important;
}

:deep(.mu-format-picker button:hover),
:deep(.mu-inline-format-toolbar button:hover) {
  background: var(--floatHoverColor, rgba(255, 255, 255, 0.1)) !important;
}

/* ============================================
 * LINK TOOLS POPUP
 * ============================================ */

:deep(.mu-link-tools) {
  background: var(--floatBgColor, #2d2d30) !important;
  border: 1px solid var(--floatBorderColor, #454545) !important;
  border-radius: 6px !important;
}

:deep(.mu-link-tools input) {
  background: var(--editorBgColor, #1e1e1e) !important;
  border: 1px solid var(--floatBorderColor, #454545) !important;
  color: var(--editorColor, #d4d4d4) !important;
}

:deep(.mu-link-tools button) {
  background: var(--themeColor, #0078d4) !important;
  color: white !important;
  border: none !important;
  border-radius: 4px !important;
}
</style>

<!-- Global styles for Muya float elements (appended to document.body, outside Vue scope) -->
<style>
/* ============================================
 * ICON COLOR FIX FOR MUYA FLOAT ELEMENTS
 * Float boxes are appended to document.body via BaseFloat,
 * so we need GLOBAL (non-scoped) styles to override Muya defaults
 * ============================================ */

/* Dark theme icon colors for all float elements */
:root[data-theme='dark'] .mu-float-wrapper,
:root[data-theme='one-dark'] .mu-float-wrapper,
:root[data-theme='material-dark'] .mu-float-wrapper {
  --icon-color: rgba(255, 255, 255, 0.7);
  --editor-color: rgba(255, 255, 255, 0.7);
  --editor-color-10: rgba(255, 255, 255, 0.1);
  --editor-color-30: rgba(255, 255, 255, 0.3);
  --editor-color-50: rgba(255, 255, 255, 0.5);
  --theme-color: #7c9ef8;
  --float-bg-color: #3f3f3f;
  --float-hover-color: rgba(255, 255, 255, 0.08);
  --float-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  --delete-color: #ff6969;
}

/* Dark theme icon colors for front button (ghost icon next to blocks) */
:root[data-theme='dark'] .mu-front-button-wrapper,
:root[data-theme='one-dark'] .mu-front-button-wrapper,
:root[data-theme='material-dark'] .mu-front-button-wrapper {
  --icon-color: rgba(255, 255, 255, 0.7);
  --button-bg-color-hover: linear-gradient(#4a4a4a, #404040);
  --button-border: 1px solid rgba(255, 255, 255, 0.1);
}

/* Light theme icon colors */
:root[data-theme='light'] .mu-float-wrapper,
:root[data-theme='ulysses-light'] .mu-float-wrapper,
:root[data-theme='graphite-light'] .mu-float-wrapper,
:root[data-theme='cadmium-light'] .mu-float-wrapper {
  --icon-color: rgba(0, 0, 0, 0.54);
  --editor-color: rgba(0, 0, 0, 0.7);
  --editor-color-10: rgba(0, 0, 0, 0.1);
  --editor-color-30: rgba(0, 0, 0, 0.3);
  --editor-color-50: rgba(0, 0, 0, 0.5);
  --theme-color: #7c9ef8;
  --float-bg-color: #ffffff;
  --float-hover-color: rgba(0, 0, 0, 0.04);
  --float-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  --delete-color: #f44336;
}

:root[data-theme='light'] .mu-front-button-wrapper,
:root[data-theme='ulysses-light'] .mu-front-button-wrapper,
:root[data-theme='graphite-light'] .mu-front-button-wrapper,
:root[data-theme='cadmium-light'] .mu-front-button-wrapper {
  --icon-color: rgba(0, 0, 0, 0.54);
  --button-bg-color-hover: linear-gradient(#f9f9f9, #f2f2f2);
  --button-border: 1px solid #dcdfe6;
}
</style>
