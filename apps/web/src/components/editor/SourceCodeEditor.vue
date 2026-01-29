<script setup lang="ts">
/**
 * SourceCodeEditor - Raw markdown editing with CodeMirror 6
 * Toggle between WYSIWYG (Muya) and source code mode
 */
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { EditorState } from '@codemirror/state'
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
} from '@codemirror/view'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { defaultKeymap, historyKeymap, history } from '@codemirror/commands'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { oneDark } from '@codemirror/theme-one-dark'
import { syntaxHighlighting, defaultHighlightStyle, HighlightStyle } from '@codemirror/language'
import { tags } from '@lezer/highlight'

const props = defineProps<{
  markdown: string
  // eslint-disable-next-line no-unused-vars
  onUpdate?: (content: string) => void
}>()

const emit = defineEmits<{
  change: [content: string]
  'cursor-change': [cursor: { line: number; ch: number }]
}>()

const containerRef = ref<HTMLDivElement>()
let editorView: EditorView | null = null

// Custom theme for Inkdown
const inkdownTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: 'var(--font-size, 16px)',
    fontFamily: 'var(--code-font-family, "DejaVu Sans Mono", monospace)',
  },
  '.cm-scroller': {
    fontFamily: 'inherit',
    lineHeight: 'var(--line-height, 1.6)',
  },
  '.cm-content': {
    padding: '50px 0',
    maxWidth: 'var(--editor-line-width, 800px)',
    margin: '0 auto',
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    borderRight: 'none',
    color: 'var(--text-color-secondary, #666)',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'var(--float-hover-color, rgba(255,255,255,0.05))',
  },
  '.cm-activeLine': {
    backgroundColor: 'var(--float-hover-color, rgba(255,255,255,0.05))',
  },
  '.cm-cursor': {
    borderLeftColor: 'var(--primary-color, #65b9f4)',
  },
  '.cm-selectionBackground': {
    backgroundColor: 'var(--selection-bg, rgba(101, 185, 244, 0.3)) !important',
  },
})

// Custom markdown highlighting
const markdownHighlighting = HighlightStyle.define([
  { tag: tags.heading1, fontWeight: 'bold', fontSize: '1.6em' },
  { tag: tags.heading2, fontWeight: 'bold', fontSize: '1.4em' },
  { tag: tags.heading3, fontWeight: 'bold', fontSize: '1.2em' },
  { tag: tags.heading4, fontWeight: 'bold', fontSize: '1.1em' },
  { tag: tags.strong, fontWeight: 'bold' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.link, color: 'var(--primary-color, #65b9f4)' },
  { tag: tags.url, color: 'var(--primary-color, #65b9f4)', textDecoration: 'underline' },
  {
    tag: tags.monospace,
    fontFamily: 'var(--code-font-family)',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  { tag: tags.quote, fontStyle: 'italic', color: 'var(--text-color-secondary)' },
  { tag: tags.meta, color: 'var(--text-color-secondary)' },
  { tag: tags.processingInstruction, color: 'var(--text-color-secondary)' },
])

// Line number formatter (like desktop - only show multiples of 10)
function lineNumberFormatter(lineNo: number): string {
  if (lineNo === 1 || lineNo % 10 === 0) {
    return String(lineNo)
  }
  return ''
}

function createEditorState(content: string): EditorState {
  return EditorState.create({
    doc: content,
    extensions: [
      // Basic editing
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),

      // Line numbers
      lineNumbers({ formatNumber: lineNumberFormatter }),

      // Active line highlighting
      highlightActiveLine(),
      highlightActiveLineGutter(),
      highlightSelectionMatches(),

      // Markdown language support
      markdown({ base: markdownLanguage }),

      // Syntax highlighting
      syntaxHighlighting(defaultHighlightStyle),
      syntaxHighlighting(markdownHighlighting),

      // Theme (dark mode)
      oneDark,
      inkdownTheme,

      // Line wrapping
      EditorView.lineWrapping,

      // Update listener
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const content = update.state.doc.toString()
          emit('change', content)
          props.onUpdate?.(content)
        }
        if (update.selectionSet) {
          const pos = update.state.selection.main.head
          const line = update.state.doc.lineAt(pos)
          emit('cursor-change', {
            line: line.number,
            ch: pos - line.from,
          })
        }
      }),
    ],
  })
}

function initEditor() {
  if (!containerRef.value) return

  editorView = new EditorView({
    state: createEditorState(props.markdown || ''),
    parent: containerRef.value,
  })
}

function focusEditor() {
  editorView?.focus()
}

function getContent(): string {
  return editorView?.state.doc.toString() || ''
}

function setContent(content: string) {
  if (!editorView) return

  const transaction = editorView.state.update({
    changes: {
      from: 0,
      to: editorView.state.doc.length,
      insert: content,
    },
  })
  editorView.dispatch(transaction)
}

// Watch for external markdown changes
watch(
  () => props.markdown,
  (newVal) => {
    if (editorView && newVal !== editorView.state.doc.toString()) {
      setContent(newVal)
    }
  }
)

onMounted(() => {
  initEditor()
})

onUnmounted(() => {
  editorView?.destroy()
  editorView = null
})

// Expose methods for parent component
defineExpose({
  focusEditor,
  getContent,
  setContent,
})
</script>

<template>
  <div
    ref="containerRef"
    class="source-code-editor"
  ></div>
</template>

<style scoped>
.source-code-editor {
  height: 100%;
  width: 100%;
  overflow: auto;
  background: var(--editor-bg, #1e1e1e);
}

/* CodeMirror container styling */
.source-code-editor :deep(.cm-editor) {
  height: 100%;
}

.source-code-editor :deep(.cm-scroller) {
  overflow: auto;
}
</style>
