<script setup lang="ts">
/**
 * FileCard - Individual virtual file card with icon, name, size, and timestamp.
 *
 */
import { computed } from 'vue'
import type { VirtualFile } from '@inkdown/shared/types'
import { FileText, FileType } from 'lucide-vue-next'

const props = defineProps<{
  file: VirtualFile
}>()

const emit = defineEmits<{
  click: []
}>()

const isMarkdown = computed(() => props.file.name.endsWith('.md'))

const fileSize = computed(() => {
  const bytes = new Blob([props.file.content]).size
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
})

const lastUpdated = computed(() => {
  if (!props.file.updatedAt) return ''
  const d = new Date(props.file.updatedAt)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return d.toLocaleDateString()
})

const extension = computed(() => {
  const parts = props.file.name.split('.')
  return parts.length > 1 ? `.${parts.pop()}` : ''
})
</script>

<template>
  <button
    class="file-card"
    :class="{ markdown: isMarkdown }"
    type="button"
    @click="emit('click')"
  >
    <div class="file-icon-wrapper">
      <FileType
        v-if="isMarkdown"
        :size="24"
        class="file-icon markdown-icon"
      />
      <FileText
        v-else
        :size="24"
        class="file-icon"
      />
    </div>
    <div class="file-info">
      <span
        class="file-name"
        :title="file.name"
        >{{ file.name }}</span
      >
      <div class="file-meta">
        <span class="file-size">{{ fileSize }}</span>
        <span
          v-if="extension"
          class="file-ext"
          >{{ extension }}</span
        >
      </div>
      <span class="file-updated">{{ lastUpdated }}</span>
    </div>
  </button>
</template>

<style scoped>
.file-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px 12px;
  background: var(--app-bg, #0d1117);
  border: 1px solid var(--border-color, #30363d);
  border-radius: 10px;
  cursor: pointer;
  transition:
    transform 0.15s ease,
    border-color 0.15s ease,
    box-shadow 0.15s ease;
  text-align: center;
}

.file-card:hover {
  transform: translateY(-2px);
  border-color: var(--primary-color, #7c9ef8);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.file-card.markdown:hover {
  border-color: #3fb950;
}

.file-icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
}

.file-icon {
  color: var(--text-color-secondary, #8b949e);
}

.markdown-icon {
  color: #3fb950;
}

.file-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  width: 100%;
}

.file-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-color, #e6edf3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-meta {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.file-size {
  font-size: 10px;
  color: rgba(139, 148, 158, 0.6);
}

.file-ext {
  font-size: 10px;
  color: rgba(139, 148, 158, 0.6);
  background: rgba(255, 255, 255, 0.04);
  padding: 1px 5px;
  border-radius: 3px;
  font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, monospace;
}

.file-updated {
  font-size: 10px;
  color: rgba(139, 148, 158, 0.6);
  opacity: 0.7;
}
</style>
