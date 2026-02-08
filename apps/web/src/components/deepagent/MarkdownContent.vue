<script setup lang="ts">
/**
 * MarkdownContent - Renders markdown string as sanitized HTML with syntax highlighting.
 *
 * Uses marked + DOMPurify + prismjs. Dark theme styling.
 */
import { computed, ref, watch, nextTick, onMounted } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import Prism from 'prismjs'
import 'prismjs/themes/prism-tomorrow.css'
import 'github-markdown-css/github-markdown-dark.css'

const props = defineProps<{
  content: string
  isStreaming?: boolean
}>()

const containerRef = ref<HTMLElement | null>(null)
let highlightTimer: ReturnType<typeof setTimeout> | null = null

const renderedHtml = computed(() => {
  if (!props.content) return ''
  const raw = marked.parse(props.content, { async: false }) as string
  return DOMPurify.sanitize(raw)
})

function highlightCode() {
  nextTick(() => {
    if (containerRef.value) {
      containerRef.value.querySelectorAll('pre code').forEach((block) => {
        Prism.highlightElement(block as HTMLElement)
      })
    }
  })
}

function scheduleHighlight() {
  if (highlightTimer) {
    clearTimeout(highlightTimer)
    highlightTimer = null
  }
  if (props.isStreaming) return
  highlightTimer = setTimeout(() => {
    highlightTimer = null
    highlightCode()
  }, 80)
}

watch(() => props.content, scheduleHighlight)
watch(() => props.isStreaming, (isStreaming) => {
  if (!isStreaming) {
    scheduleHighlight()
  } else if (highlightTimer) {
    clearTimeout(highlightTimer)
    highlightTimer = null
  }
})

onMounted(scheduleHighlight)
</script>

<template>
  <div ref="containerRef" class="markdown-body md-content" v-html="renderedHtml" />
</template>

<style scoped>
.md-content {
  font-size: 14px;
  line-height: 1.7;
  color: var(--text-color, #e6edf3);
  word-break: break-word;
}

.md-content :deep(pre) {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--border-color, #30363d);
  border-radius: 6px;
  padding: 12px 16px;
  overflow-x: auto;
  font-size: 13px;
  line-height: 1.5;
}

.md-content :deep(code:not(pre code)) {
  background: rgba(255, 255, 255, 0.06);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.9em;
}

.md-content :deep(a) {
  color: var(--primary-color, #7c9ef8);
  text-decoration: none;
}

.md-content :deep(a:hover) {
  text-decoration: underline;
}

.md-content :deep(blockquote) {
  border-left: 3px solid var(--border-color, #30363d);
  padding-left: 12px;
  color: var(--text-color-secondary, #8b949e);
  margin: 8px 0;
}

.md-content :deep(table) {
  border-collapse: collapse;
  width: 100%;
}

.md-content :deep(th),
.md-content :deep(td) {
  border: 1px solid var(--border-color, #30363d);
  padding: 8px 12px;
  text-align: left;
}

.md-content :deep(th) {
  background: rgba(255, 255, 255, 0.04);
  font-weight: 600;
}

.md-content :deep(img) {
  max-width: 100%;
  border-radius: 8px;
}

.md-content :deep(hr) {
  border: none;
  border-top: 1px solid var(--border-color, #30363d);
  margin: 16px 0;
}

.md-content :deep(ul),
.md-content :deep(ol) {
  padding-left: 24px;
}

.md-content :deep(p) {
  margin: 8px 0;
}

.md-content :deep(p:first-child) {
  margin-top: 0;
}

.md-content :deep(p:last-child) {
  margin-bottom: 0;
}

.md-content :deep(h1),
.md-content :deep(h2),
.md-content :deep(h3),
.md-content :deep(h4) {
  margin-top: 16px;
  margin-bottom: 8px;
  font-weight: 600;
  color: var(--text-color, #e6edf3);
}

.md-content :deep(h1:first-child),
.md-content :deep(h2:first-child),
.md-content :deep(h3:first-child) {
  margin-top: 0;
}
</style>
