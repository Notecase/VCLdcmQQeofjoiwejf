<script setup lang="ts">
import { computed } from 'vue'
import { Globe, Loader2, Check, AlertCircle } from 'lucide-vue-next'
import type { ResearchProgress } from '@inkdown/shared/types'
import ProgressBar from '../shared/ProgressBar.vue'

const props = defineProps<{
  progress: ResearchProgress
}>()

const statusLabel = computed(() => {
  switch (props.progress.status) {
    case 'starting':
      return 'Starting research...'
    case 'researching':
      return 'Researching sources...'
    case 'writing':
      return 'Writing report...'
    case 'complete':
      return 'Research complete'
    case 'failed':
      return 'Research failed'
    default:
      return 'Researching...'
  }
})

const isActive = computed(
  () => props.progress.status === 'researching' || props.progress.status === 'writing'
)
</script>

<template>
  <div class="research-progress">
    <div class="research-header">
      <div class="research-title">
        <Globe :size="16" />
        <span>Deep Research</span>
      </div>
      <span
        class="research-status"
        :class="progress.status"
        >{{ statusLabel }}</span
      >
    </div>

    <ProgressBar
      :value="progress.progress"
      :show-label="true"
      color="#3b82f6"
      :height="6"
    />

    <!-- Sources -->
    <div
      v-if="progress.sources.length > 0"
      class="source-list"
    >
      <div
        v-for="source in progress.sources"
        :key="source.url"
        class="source-item"
        :class="source.status"
      >
        <div class="source-icon">
          <Loader2
            v-if="source.status === 'reading'"
            :size="12"
            class="spinning"
          />
          <Check
            v-else-if="source.status === 'done'"
            :size="12"
          />
          <AlertCircle
            v-else-if="source.status === 'failed'"
            :size="12"
          />
          <Globe
            v-else
            :size="12"
          />
        </div>
        <span class="source-title">{{ source.title || source.url }}</span>
      </div>
    </div>

    <!-- Partial Report -->
    <div
      v-if="progress.partialReport && isActive"
      class="partial-report"
    >
      <div class="report-label">Research Notes</div>
      <div class="report-text">{{ progress.partialReport.slice(-400) }}</div>
    </div>

    <!-- Thinking -->
    <div
      v-if="progress.thinking && isActive"
      class="thinking-bubble"
    >
      {{ progress.thinking.slice(-200) }}
    </div>
  </div>
</template>

<style scoped>
.research-progress {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  border-radius: var(--radius-md, 10px);
  background: var(--glass-bg, rgba(30, 30, 30, 0.6));
  backdrop-filter: blur(var(--glass-blur, 12px));
  -webkit-backdrop-filter: blur(var(--glass-blur, 12px));
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
}

.research-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.research-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color, #e2e8f0);
}

.research-status {
  font-size: 12px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: var(--radius-full, 9999px);
  backdrop-filter: blur(8px);
}

.research-status.researching,
.research-status.starting {
  color: #3b82f6;
  background: rgba(59, 130, 246, 0.12);
}

.research-status.writing {
  color: var(--sec-accent, #f59e0b);
  background: var(--sec-accent-bg, rgba(245, 158, 11, 0.12));
}

.research-status.complete {
  color: var(--sec-primary, #10b981);
  background: var(--sec-primary-bg, rgba(16, 185, 129, 0.12));
}

.research-status.failed {
  color: #f85149;
  background: rgba(248, 81, 73, 0.12);
}

.source-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 180px;
  overflow-y: auto;
}

.source-list::-webkit-scrollbar {
  width: 4px;
}

.source-list::-webkit-scrollbar-thumb {
  background: var(--border-color, #333338);
  border-radius: 2px;
}

.source-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 12px;
  color: var(--text-color-secondary, #94a3b8);
}

.source-item.reading {
  color: #3b82f6;
  background: rgba(59, 130, 246, 0.06);
}

.source-item.done {
  color: var(--sec-primary, #10b981);
}

.source-item.failed {
  color: #f85149;
  opacity: 0.7;
}

.source-icon {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.source-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.partial-report {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.report-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-color-secondary, #64748b);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.report-text {
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-color-secondary, #94a3b8);
  white-space: pre-wrap;
  max-height: 120px;
  overflow-y: auto;
}

.thinking-bubble {
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-color-secondary, #64748b);
  font-style: italic;
  padding: 8px 12px;
  border-radius: 8px;
  background: rgba(59, 130, 246, 0.06);
  border-left: 3px solid rgba(59, 130, 246, 0.3);
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.spinning {
  animation: spin 1s linear infinite;
}
</style>
