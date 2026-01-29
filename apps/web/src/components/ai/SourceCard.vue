<script setup lang="ts">
/**
 * SourceCard - Displays a single source item
 *
 * Shows source type, title, word count, and status.
 * Provides actions to view or delete the source.
 */
import { computed } from 'vue'
import {
  FileText,
  Link,
  FileCode,
  Youtube,
  AlignLeft,
  Loader2,
  CheckCircle,
  XCircle,
  Eye,
  Trash2,
} from 'lucide-vue-next'
import type { Source, SourceType } from '@/stores/sources'

// Props
const props = defineProps<{
  source: Source
}>()

// Emits
const emit = defineEmits<{
  view: [source: Source]
  delete: [source: Source]
}>()

// Computed
const iconComponent = computed(() => {
  const iconMap: Record<SourceType, typeof FileText> = {
    pdf: FileText,
    link: Link,
    file: FileCode,
    text: AlignLeft,
    youtube: Youtube,
  }
  return iconMap[props.source.type] || FileText
})

const statusIcon = computed(() => {
  switch (props.source.status) {
    case 'processing':
      return Loader2
    case 'ready':
      return CheckCircle
    case 'error':
      return XCircle
    default:
      return null
  }
})

const statusClass = computed(() => props.source.status)

const typeLabel = computed(() => {
  const labels: Record<SourceType, string> = {
    pdf: 'PDF',
    link: 'Link',
    file: 'File',
    text: 'Text',
    youtube: 'YouTube',
  }
  return labels[props.source.type] || 'Unknown'
})

const subtitle = computed(() => {
  const parts: string[] = []

  if (props.source.wordCount > 0) {
    parts.push(`${props.source.wordCount.toLocaleString()} words`)
  }

  if (props.source.pageCount) {
    parts.push(`${props.source.pageCount} pages`)
  }

  return parts.join(' • ')
})

function handleView() {
  emit('view', props.source)
}

function handleDelete() {
  emit('delete', props.source)
}
</script>

<template>
  <div class="source-card" :class="{ processing: source.status === 'processing' }">
    <div class="source-icon">
      <component :is="iconComponent" :size="16" />
    </div>

    <div class="source-info">
      <span class="source-title">{{ source.title }}</span>
      <span class="source-meta">{{ subtitle }}</span>
    </div>

    <div class="source-status" :class="statusClass">
      <component
        v-if="statusIcon"
        :is="statusIcon"
        :size="14"
        :class="{ spin: source.status === 'processing' }"
      />
    </div>

    <div class="source-actions">
      <button
        class="action-btn view-btn"
        @click="handleView"
        title="View content"
        :disabled="source.status !== 'ready'"
      >
        <Eye :size="14" />
      </button>
      <button
        class="action-btn delete-btn"
        @click="handleDelete"
        title="Remove source"
      >
        <Trash2 :size="14" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.source-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: rgba(22, 27, 34, 0.5);
  border: 1px solid #30363d;
  border-radius: 8px;
  transition: all 0.15s ease;
}

.source-card:hover {
  border-color: #58a6ff;
  background: rgba(22, 27, 34, 0.8);
}

.source-card.processing {
  opacity: 0.8;
}

/* Icon */
.source-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background: rgba(88, 166, 255, 0.1);
  color: #58a6ff;
  flex-shrink: 0;
}

/* Info */
.source-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.source-title {
  font-size: 13px;
  font-weight: 500;
  color: #e6edf3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.source-meta {
  font-size: 11px;
  color: #8b949e;
}

/* Status */
.source-status {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.source-status.processing {
  color: #58a6ff;
}

.source-status.ready {
  color: #3fb950;
}

.source-status.error {
  color: #f85149;
}

/* Actions */
.source-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.source-card:hover .source-actions {
  opacity: 1;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #8b949e;
  cursor: pointer;
  transition: all 0.15s ease;
}

.action-btn:hover {
  background: #21262d;
  color: #e6edf3;
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.delete-btn:hover {
  background: rgba(248, 81, 73, 0.1);
  color: #f85149;
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
