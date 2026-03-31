<script setup lang="ts">
/**
 * ArtifactPreviewCard — shows artifact metadata and live iframe preview in chat.
 */
import { computed } from 'vue'
import { Code2 } from 'lucide-vue-next'

const props = defineProps<{
  title: string
  html: string
  css?: string
  javascript?: string
}>()

/** Build an iframe-safe srcdoc */
const srcDoc = computed(() => {
  const style = props.css ? `<style>${props.css}</style>` : ''
  const script = props.javascript ? `<script>${props.javascript}</` + 'script>' : ''
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
${style}
</head>
<body>${props.html}${script}</body>
</html>`
})
</script>

<template>
  <div class="artifact-preview">
    <div class="artifact-header">
      <Code2 :size="12" />
      <span class="artifact-title">{{ title }}</span>
    </div>
    <div class="artifact-iframe-wrapper">
      <iframe
        :srcdoc="srcDoc"
        sandbox="allow-scripts"
        class="artifact-iframe"
      />
    </div>
  </div>
</template>

<style scoped>
.artifact-preview {
  border: 1px solid var(--border-secondary, #2a2a2a);
  border-radius: 8px;
  margin: 6px 0;
  overflow: hidden;
}

.artifact-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--bg-secondary, #1a1a1a);
  border-bottom: 1px solid var(--border-secondary, #2a2a2a);
  color: var(--text-secondary, #8b8b8b);
  font-size: 11px;
}

.artifact-title {
  font-weight: 500;
  color: var(--text-primary, #d4d4d4);
}

.artifact-iframe-wrapper {
  background: white;
  height: 200px;
}

.artifact-iframe {
  width: 100%;
  height: 100%;
  border: none;
}
</style>
