<script setup lang="ts">
import { computed } from 'vue'
import { useSecretaryStore } from '@/stores/secretary'
import BaseModal from '@/components/ai/modals/BaseModal.vue'
import { BookOpen, Calendar, Clock } from 'lucide-vue-next'
import type { LearningRoadmap } from '@inkdown/shared/types'

const props = defineProps<{
  roadmap: LearningRoadmap
}>()

const emit = defineEmits<{
  close: []
}>()

const store = useSecretaryStore()

const fileContent = computed(() => {
  const file = store.memoryFiles.find(f => f.filename === props.roadmap.archiveFilename)
  return file?.content || null
})

const progressPercent = computed(() => props.roadmap.progress.percentComplete)
</script>

<template>
  <BaseModal :title="roadmap.name" size="md" @close="emit('close')">
    <template #icon>
      <BookOpen :size="20" />
    </template>

    <div class="roadmap-detail">
      <!-- Meta row -->
      <div class="meta-row">
        <span class="id-badge">{{ roadmap.id }}</span>
        <span v-if="roadmap.dateRange.start" class="meta-item">
          <Calendar :size="12" />
          {{ roadmap.dateRange.start }} &mdash; {{ roadmap.dateRange.end }}
        </span>
        <span class="meta-item">
          <Clock :size="12" />
          {{ roadmap.schedule.hoursPerDay }}h/day
        </span>
      </div>

      <!-- Progress -->
      <div class="progress-section">
        <div class="progress-header">
          <span>Progress</span>
          <span class="progress-value">{{ roadmap.progress.currentDay }}/{{ roadmap.progress.totalDays }} days ({{ progressPercent }}%)</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: `${progressPercent}%` }" />
        </div>
      </div>

      <!-- Current topic -->
      <div v-if="roadmap.currentTopic" class="current-topic">
        <span class="topic-label">Current Topic:</span>
        <span>{{ roadmap.currentTopic }}</span>
      </div>

      <!-- File content -->
      <div v-if="fileContent" class="file-content">
        <h4>Roadmap Details</h4>
        <pre class="content-block">{{ fileContent }}</pre>
      </div>
      <p v-else class="no-content">
        No detailed roadmap file found at {{ roadmap.archiveFilename }}.
      </p>
    </div>
  </BaseModal>
</template>

<style scoped>
.roadmap-detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.meta-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.id-badge {
  padding: 2px 10px;
  border-radius: 4px;
  background: rgba(124, 158, 248, 0.15);
  color: var(--primary-color, #7c9ef8);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: var(--text-color-secondary, #94a3b8);
}

.progress-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: var(--text-color-secondary, #94a3b8);
}

.progress-value {
  font-weight: 600;
  color: #34d399;
}

.progress-bar {
  height: 6px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 3px;
  background: linear-gradient(90deg, #34d399, #3fb950);
  transition: width 0.3s ease;
}

.current-topic {
  font-size: 13px;
  color: var(--text-color, #e2e8f0);
}

.topic-label {
  font-weight: 600;
  color: var(--text-color-secondary, #94a3b8);
  margin-right: 6px;
}

.file-content h4 {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color, #e2e8f0);
  margin: 0 0 8px;
}

.content-block {
  padding: 14px 16px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border-color, #333338);
  color: var(--text-color, #e2e8f0);
  font-family: 'SF Mono', 'Fira Code', 'JetBrains Mono', monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-x: auto;
  max-height: 400px;
  overflow-y: auto;
  margin: 0;
}

.no-content {
  font-size: 13px;
  color: var(--text-color-secondary, #94a3b8);
  text-align: center;
  padding: 24px 0;
  margin: 0;
}
</style>
