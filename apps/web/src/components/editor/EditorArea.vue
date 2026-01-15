<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { useEditorStore, usePreferencesStore } from '@/stores'

// Import Muya and plugins
import Muya from '@/muya/lib'
import TablePicker from '@/muya/lib/ui/tablePicker'
import QuickInsert from '@/muya/lib/ui/quickInsert'
import CodePicker from '@/muya/lib/ui/codePicker'
import EmojiPicker from '@/muya/lib/ui/emojiPicker'
import ImagePathPicker from '@/muya/lib/ui/imagePicker'
import ImageSelector from '@/muya/lib/ui/imageSelector'
import ImageToolbar from '@/muya/lib/ui/imageToolbar'
import Transformer from '@/muya/lib/ui/transformer'
import FormatPicker from '@/muya/lib/ui/formatPicker'
import LinkTools from '@/muya/lib/ui/linkTools'
import FootnoteTool from '@/muya/lib/ui/footnoteTool'
import TableBarTools from '@/muya/lib/ui/tableTools'
import FrontMenu from '@/muya/lib/ui/frontMenu'

// Import Muya styles
import '@/muya/lib/assets/styles/index.css'
import '@/muya/themes/default.css'

// Import KaTeX CSS for math rendering
import 'katex/dist/katex.min.css'

// Import Prism CSS for code syntax highlighting
import 'prismjs/themes/prism.css'

// Platform utilities
import { openExternal } from '@/utils/platform'

const editorStore = useEditorStore()
const preferencesStore = usePreferencesStore()

const editorRef = ref<HTMLElement>()
let muyaInstance: any = null
const autoSaveTimer = ref<ReturnType<typeof setTimeout>>()
const isEditorReady = ref(false)

// Register Muya plugins once
let pluginsRegistered = false
function registerPlugins() {
  if (pluginsRegistered) return
  
  Muya.use(TablePicker)
  Muya.use(QuickInsert)
  Muya.use(CodePicker)
  Muya.use(EmojiPicker)
  Muya.use(ImagePathPicker)
  Muya.use(ImageSelector, {
    unsplashAccessKey: import.meta.env.VITE_UNSPLASH_ACCESS_KEY || ''
  })
  Muya.use(Transformer)
  Muya.use(ImageToolbar)
  Muya.use(FormatPicker)
  Muya.use(FrontMenu)
  Muya.use(LinkTools, {
    jumpClick: (linkInfo: { href: string }) => {
      openExternal(linkInfo.href)
    }
  })
  Muya.use(FootnoteTool)
  Muya.use(TableBarTools)
  
  pluginsRegistered = true
}

// Initialize Muya editor
function initializeMuya() {
  if (!editorRef.value) return

  registerPlugins()

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
    superSubScript: true,  // Enable superscript/subscript syntax
    footnote: true,        // Enable footnote syntax
    isGitlabCompatibilityEnabled: true,  // Enable GitLab-flavored markdown
    disableHtml: false     // Allow HTML for math rendering
  }

  muyaInstance = new Muya(editorRef.value, options)

  // Handle content changes
  muyaInstance.on('change', (changes: any) => {
    const { markdown, wordCount: wc, cursor, toc } = changes
    
    // Update store
    editorStore.updateContent(markdown, {
      words: wc?.word || 0,
      characters: wc?.character || 0,
      paragraphs: wc?.paragraph || 0
    })

    if (cursor) {
      editorStore.updateCursor(cursor)
    }

    if (toc) {
      editorStore.updateToc(toc)
    }

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

  // Handle link clicks
  muyaInstance.on('format-click', ({ event, formatType, data }: any) => {
    const ctrlOrMeta = (navigator.platform.includes('Mac') && event.metaKey) || 
                       (!navigator.platform.includes('Mac') && event.ctrlKey)
    
    if (formatType === 'link' && ctrlOrMeta && data?.href) {
      openExternal(data.href)
    }
  })

  // Handle selection changes
  muyaInstance.on('selectionChange', (changes: any) => {
    // Could dispatch to store for toolbar state
  })

  isEditorReady.value = true
}

// Watch for document changes
watch(
  () => editorStore.currentDocument,
  (newDoc, oldDoc) => {
    if (newDoc && muyaInstance && newDoc.id !== oldDoc?.id) {
      // Switch to new document content
      muyaInstance.setMarkdown(newDoc.content, newDoc.cursor)
    }
  }
)

// Watch for preference changes
watch(() => preferencesStore.focus, (value) => {
  muyaInstance?.setFocusMode(value)
})

watch(() => preferencesStore.fontSize, (value) => {
  muyaInstance?.setFont({ fontSize: value })
})

watch(() => preferencesStore.lineHeight, (value) => {
  muyaInstance?.setFont({ lineHeight: value })
})

watch(() => preferencesStore.tabSize, (value) => {
  muyaInstance?.setTabSize(value)
})

watch(() => preferencesStore.theme, (value) => {
  const isDark = value.includes('dark')
  muyaInstance?.setOptions({
    mermaidTheme: isDark ? 'dark' : 'default',
    vegaTheme: isDark ? 'dark' : 'latimes'
  }, true)
})

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
    muyaInstance?.undo()
  }
  
  // Redo: Cmd/Ctrl + Shift + Z or Cmd/Ctrl + Y
  if ((event.metaKey || event.ctrlKey) && (event.key === 'y' || (event.key === 'z' && event.shiftKey))) {
    event.preventDefault()
    muyaInstance?.redo()
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
  
  if (muyaInstance) {
    try {
      muyaInstance.destroy()
    } catch (e) {
      // Ignore cleanup errors
    }
    muyaInstance = null
  }
})

// Expose Muya instance for parent components (e.g., format toolbar)
const getMuya = () => muyaInstance
defineExpose({ getMuya, isEditorReady })
</script>

<template>
  <div 
    class="editor-area"
    :class="{
      'typewriter-mode': preferencesStore.typewriter,
      'focus-mode': preferencesStore.focus,
      'source-mode': preferencesStore.sourceCode
    }"
    :style="{
      '--editor-font-size': `${preferencesStore.fontSize}px`,
      '--editor-line-height': preferencesStore.lineHeight
    }"
  >
    <!-- Muya Editor Container -->
    <div 
      ref="editorRef"
      class="muya-editor"
      :dir="preferencesStore.textDirection"
    ></div>
    
    <!-- Loading state -->
    <div v-if="!isEditorReady" class="editor-loading">
      <div class="loading-spinner"></div>
      <p>Initializing editor...</p>
    </div>
  </div>
</template>

<style scoped>
.editor-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--editor-bg);
}

.muya-editor {
  flex: 1;
  overflow-y: auto;
  padding: 40px;
  font-family: var(--editor-font-family, 'Open Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
  font-size: var(--editor-font-size, 16px);
  line-height: var(--editor-line-height, 1.6);
  color: var(--text-color);
  outline: none;
}

/* Muya editor overrides */
.muya-editor :deep(.ag-container-block) {
  max-width: 800px;
  margin: 0 auto;
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

.muya-editor :deep(h1) { font-size: 2em; }
.muya-editor :deep(h2) { font-size: 1.5em; }
.muya-editor :deep(h3) { font-size: 1.25em; }

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
.focus-mode .muya-editor :deep(.ag-paragraph:not(.ag-active)) {
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
  background: var(--editor-bg);
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
  to { transform: rotate(360deg); }
}

/* ============================================
 * INLINE MATH - Typora-like styling
 * ============================================ */

/* Inline math container - keep inline with text */
.muya-editor :deep(span.ag-math) {
  display: inline !important;
  vertical-align: baseline;
  font-family: inherit;
}

/* Inline math when hidden (showing rendered output) */
.muya-editor :deep(span.ag-math.ag-hide) {
  display: inline !important;
}

/* Inline math rendered output - stay inline, NO background (simple like text) */
.muya-editor :deep(span.ag-math.ag-hide > .ag-math-render) {
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
.muya-editor :deep(span.ag-math.ag-hide > .ag-math-render .katex) {
  font-size: 1em;
  vertical-align: baseline;
  white-space: nowrap;
}

/* When editing inline math (not hidden) - show input with popup preview */
.muya-editor :deep(span.ag-math:not(.ag-hide) > .ag-math-render) {
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
.muya-editor :deep(span.ag-math:not(.ag-hide) > .ag-math-text) {
  padding: 2px 4px;
  background: rgba(100, 100, 100, 0.15);
  border-radius: 4px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.9em;
  color: var(--themeColor, #0078d4);
}

/* ============================================
 * BLOCK MATH (display math $$...$$)
 * ============================================ */

/* Block math container - minimal styling */
.muya-editor :deep(figure[data-role="MULTIPLEMATH"]) {
  margin: 16px 0;
  padding: 0;
  background: transparent;
}

.muya-editor :deep(pre.ag-multiple-math) {
  margin: 0;
  padding: 12px;
  background: var(--codeBlockBgColor, rgba(0, 0, 0, 0.2));
  border-radius: 6px;
}

/* Block math preview container */
.muya-editor :deep(.ag-container-preview) {
  padding: 8px;
  text-align: center;
}

.muya-editor :deep(.ag-container-preview .katex-display) {
  margin: 0;
  padding: 8px 0;
}

.muya-editor :deep(.ag-container-preview .katex) {
  font-size: 1.2em;
}

/* ============================================
 * CODE BLOCKS - improved styling
 * ============================================ */

.muya-editor :deep(pre.ag-fence-code) {
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid var(--border-color, #333);
  border-radius: 8px;
  margin: 16px 0;
  padding: 16px;
  overflow-x: auto;
}

.muya-editor :deep(pre.ag-fence-code code) {
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
  font-size: 14px;
  line-height: 1.5;
}

.muya-editor :deep(.ag-language-input) {
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

.muya-editor :deep(figure[data-role="MERMAID"]),
.muya-editor :deep(figure[data-role="FLOWCHART"]),
.muya-editor :deep(figure[data-role="SEQUENCE"]),
.muya-editor :deep(figure[data-role="VEGA-LITE"]),
.muya-editor :deep(figure[data-role="PLANTUML"]) {
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

.muya-editor :deep(li.ag-task-list-item) {
  list-style-type: none;
  position: relative;
  margin-left: -1.2em;
}

.muya-editor :deep(li.ag-task-list-item > input[type="checkbox"]) {
  margin-right: 8px;
  cursor: pointer;
}

/* ============================================
 * FOOTNOTES
 * ============================================ */

.muya-editor :deep(.ag-inline-footnote-identifier) {
  vertical-align: super;
  font-size: 0.75em;
  color: var(--primary-color, #65b9f4);
  cursor: pointer;
}

.muya-editor :deep(.ag-inline-footnote-identifier:hover) {
  text-decoration: underline;
}

/* ============================================
 * LINKS
 * ============================================ */

.muya-editor :deep(a),
.muya-editor :deep(.ag-link) {
  color: var(--primary-color, #65b9f4);
  text-decoration: none;
}

.muya-editor :deep(a:hover),
.muya-editor :deep(.ag-link:hover) {
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

.muya-editor :deep(.ag-inline-image img) {
  max-width: 100%;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

/* ============================================
 * SAFARI ICON FIXES - Override drop-shadow filter
 * ============================================ */

/* 
 * The Muya icon system uses a trick where:
 * 1. Icon text is positioned at left: -16px (hidden)
 * 2. drop-shadow(16px 0) creates a visible copy
 * Safari doesn't support this well, so we need to:
 * - Disable the filter
 * - Position the icon content directly
 * - Make sure overflow is visible
 */

/* Front icon container - make sure it's visible */
.muya-editor :deep(.ag-front-icon) {
  overflow: visible !important;
  opacity: 0.6 !important;
}

.muya-editor :deep(.ag-front-icon:hover) {
  opacity: 1 !important;
  background: var(--selectionColor, rgba(100, 100, 200, 0.2)) !important;
}

/* Icon wrapper - visible overflow */
.muya-editor :deep(.ag-front-icon i.icon) {
  overflow: visible !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
}

/* Icon content - position it directly, no filter */
.muya-editor :deep(.ag-front-icon i.icon > i[class^=icon-]) {
  filter: none !important;
  -webkit-filter: none !important;
  left: 0 !important;
  position: relative !important;
  display: block !important;
  overflow: visible !important;
  color: var(--iconColor, #888) !important;
}

/* Same fix for all other Muya icons */
.muya-editor :deep(i.icon > i[class^=icon-]),
:deep(.ag-front-menu i.icon > i[class^=icon-]),
:deep(.ag-tool-bar i.icon > i[class^=icon-]),
:deep(.ag-container-icon i.icon > i[class^=icon-]) {
  filter: none !important;
  -webkit-filter: none !important;
  left: 0 !important;
  position: relative !important;
  display: block !important;
  overflow: visible !important;
}

/* General icon wrapper styling */
:deep(.ag-front-menu li.item .icon-wrapper) {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  margin-left: 10px;
  margin-right: 8px;
  overflow: visible;
}

:deep(.ag-front-menu li.item .icon-wrapper img) {
  width: 16px;
  height: 16px;
  opacity: 0.8;
}

/* Front menu styling */
:deep(.ag-front-menu) {
  background: var(--floatBgColor, #2d2d30) !important;
  border: 1px solid var(--floatBorderColor, #454545) !important;
  border-radius: 6px !important;
  box-shadow: var(--floatShadow, 0 4px 16px rgba(0, 0, 0, 0.4)) !important;
  color: var(--editorColor, #d4d4d4) !important;
}

:deep(.ag-front-menu ul li:hover) {
  background: var(--floatHoverColor, rgba(255, 255, 255, 0.08)) !important;
}

:deep(.ag-front-menu ul li > span) {
  color: var(--editorColor, #d4d4d4) !important;
}

:deep(.ag-front-menu .submenu) {
  background: var(--floatBgColor, #2d2d30) !important;
  border: 1px solid var(--floatBorderColor, #454545) !important;
}

/* ============================================
 * CHECKBOX - Task List Item Fixes (MarkText Style)
 * Muya uses ::before for the checkbox shape
 * We must override ::before to make it SQUARE, not circular
 * ============================================ */

/* Container positioning */
.muya-editor :deep(li.ag-task-list-item) {
  position: relative;
  list-style-type: none;
  padding-left: 8px;
}

/* Hide the actual input - Muya uses ::before/::after */
.muya-editor :deep(li.ag-task-list-item > input[type="checkbox"]) {
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
.muya-editor :deep(li.ag-task-list-item > input[type="checkbox"]::before) {
  content: '' !important;
  width: 18px !important;
  height: 18px !important;
  display: inline-block !important;
  border: 2px solid var(--editorColor50, rgba(128, 128, 128, 0.5)) !important;
  border-radius: 3px !important;  /* SQUARE with slight rounding, NOT 50% circle */
  background-color: var(--editorBgColor, #1e1e1e) !important;
  position: absolute !important;
  top: -2px !important;
  left: -2px !important;
  box-sizing: border-box !important;
  transition: all 0.2s ease !important;
}

/* Hover state */
.muya-editor :deep(li.ag-task-list-item > input[type="checkbox"]:hover::before) {
  border-color: #6b8a73 !important;
}

/* CHECKED state - Sage green background */
.muya-editor :deep(li.ag-task-list-item > input.ag-checkbox-checked::before) {
  background-color: #6b8a73 !important;
  border-color: #6b8a73 !important;
  box-shadow: none !important;
}

/* Checkmark styling */
.muya-editor :deep(li.ag-task-list-item > input[type="checkbox"]::after) {
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
.muya-editor :deep(li.ag-task-list-item > input.ag-checkbox-checked::after) {
  transform: rotate(-45deg) scale(1) !important;
}

/* Strikethrough text when checked */
.muya-editor :deep(li.ag-task-list-item > input.ag-checkbox-checked ~ *) {
  color: var(--editorColor50, rgba(128, 128, 128, 0.5)) !important;
}

/* ============================================
 * TABLE - Improved styling
 * ============================================ */

.muya-editor :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 16px 0;
  background: transparent;
}

/* Let Muya's ::before pseudo-element handle borders - no direct cell borders */
.muya-editor :deep(table th),
.muya-editor :deep(table td) {
  padding: 6px 13px;  /* Match MarkText padding */
  text-align: left;
  position: relative;  /* Required for ::before border system */
  /* NO border property - Muya uses ::before for borders */
}

.muya-editor :deep(table th) {
  font-weight: bold;
}

/* Subtle hover effect */
.muya-editor :deep(table tr:hover td) {
  background: var(--editorColor04, rgba(255, 255, 255, 0.04));
}

/* Table toolbar */
.muya-editor :deep(.ag-tool-bar) {
  background: var(--floatBgColor, #2d2d30);
  border: 1px solid var(--floatBorderColor, #454545);
  border-radius: 4px;
  padding: 4px;
}

.muya-editor :deep(.ag-tool-bar ul li) {
  background: transparent;
  border-radius: 4px;
  color: var(--iconColor, #ccc);
}

.muya-editor :deep(.ag-tool-bar ul li:hover) {
  background: var(--floatHoverColor, rgba(255, 255, 255, 0.1));
}

/* ============================================
 * QUICK INSERT MENU
 * ============================================ */

:deep(.ag-float-wrapper) {
  background: var(--floatBgColor, #2d2d30) !important;
  border: 1px solid var(--floatBorderColor, #454545) !important;
  border-radius: 6px !important;
  box-shadow: var(--floatShadow, 0 4px 16px rgba(0, 0, 0, 0.4)) !important;
}

/* Quick Insert icon fixes - disable filter trick for Safari */
:deep(.ag-quick-insert .icon-container) {
  overflow: visible !important;
}

:deep(.ag-quick-insert .icon-container > i.icon) {
  overflow: visible !important;
  opacity: 1 !important;
}

/* CRITICAL: Fix the filter trick that breaks Safari */
:deep(.ag-quick-insert .icon-container > i.icon > i[class^=icon-]) {
  filter: none !important;
  -webkit-filter: none !important;
  left: 0 !important;
  position: relative !important;
  display: block !important;
  width: 20px !important;
  height: 20px !important;
  background-position: center !important;
  background-repeat: no-repeat !important;
}

/* Same fix for ALL Muya components using this icon pattern */
:deep(.icon-container > i.icon > i[class^=icon-]),
:deep(.ag-tool-bar .icon-container > i.icon > i[class^=icon-]),
:deep(.ag-front-menu .icon-wrapper > i.icon > i[class^=icon-]) {
  filter: none !important;
  -webkit-filter: none !important;
  left: 0 !important;
  position: relative !important;
}

/* Image picker/selector popup */
:deep(.ag-image-picker),
:deep(.ag-image-selector) {
  background: var(--floatBgColor, #2d2d30) !important;
  border: 1px solid var(--floatBorderColor, #454545) !important;
  border-radius: 6px !important;
}

:deep(.ag-image-picker input),
:deep(.ag-image-selector input) {
  background: var(--editorBgColor, #1e1e1e) !important;
  border: 1px solid var(--floatBorderColor, #454545) !important;
  color: var(--editorColor, #d4d4d4) !important;
  border-radius: 4px;
  padding: 8px 12px;
}

/* ============================================
 * FRONT ICON (paragraph menu indicator)
 * ============================================ */

.muya-editor :deep(.ag-front-icon) {
  opacity: 0.5;
  cursor: pointer;
  color: var(--iconColor, #ccc);
  transition: opacity 0.2s;
}

.muya-editor :deep(.ag-front-icon:hover) {
  opacity: 1;
}

/* Add visible icon indicator when hovering */
.muya-editor :deep(.ag-paragraph:hover .ag-front-icon::before) {
  content: '⋮';
  font-size: 14px;
  color: var(--iconColor, #ccc);
}

/* ============================================
 * CODE PICKER / LANGUAGE SELECTOR
 * ============================================ */

:deep(.ag-code-picker) {
  background: var(--floatBgColor, #2d2d30) !important;
  border: 1px solid var(--floatBorderColor, #454545) !important;
  color: var(--editorColor, #d4d4d4) !important;
}

:deep(.ag-code-picker li:hover) {
  background: var(--floatHoverColor, rgba(255, 255, 255, 0.08)) !important;
}

/* ============================================
 * EMOJI PICKER
 * ============================================ */

:deep(.ag-emoji-picker) {
  background: var(--floatBgColor, #2d2d30) !important;
  border: 1px solid var(--floatBorderColor, #454545) !important;
}

/* ============================================
 * TABLE PICKER
 * ============================================ */

:deep(.ag-table-picker) {
  background: var(--floatBgColor, #2d2d30) !important;
  border: 1px solid var(--floatBorderColor, #454545) !important;
}

:deep(.ag-table-picker td) {
  border: 1px solid var(--floatBorderColor, #454545) !important;
}

:deep(.ag-table-picker td.selected) {
  background: var(--themeColor, #0078d4) !important;
}

/* ============================================
 * FORMAT PICKER
 * ============================================ */

:deep(.ag-format-picker) {
  background: var(--floatBgColor, #2d2d30) !important;
  border: 1px solid var(--floatBorderColor, #454545) !important;
}

:deep(.ag-format-picker button) {
  color: var(--editorColor, #d4d4d4) !important;
  background: transparent !important;
  border: none !important;
}

:deep(.ag-format-picker button:hover) {
  background: var(--floatHoverColor, rgba(255, 255, 255, 0.1)) !important;
}

/* ============================================
 * LINK TOOLS POPUP
 * ============================================ */

:deep(.ag-link-tools) {
  background: var(--floatBgColor, #2d2d30) !important;
  border: 1px solid var(--floatBorderColor, #454545) !important;
  border-radius: 6px !important;
}

:deep(.ag-link-tools input) {
  background: var(--editorBgColor, #1e1e1e) !important;
  border: 1px solid var(--floatBorderColor, #454545) !important;
  color: var(--editorColor, #d4d4d4) !important;
}

:deep(.ag-link-tools button) {
  background: var(--themeColor, #0078d4) !important;
  color: white !important;
  border: none !important;
  border-radius: 4px !important;
}
</style>
