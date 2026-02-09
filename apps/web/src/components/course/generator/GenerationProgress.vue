<script setup lang="ts">
import { computed } from 'vue'
import {
  Search,
  Database,
  BarChart3,
  Map,
  CheckCircle2,
  FileText,
  Film,
  ClipboardCheck,
  Loader2,
} from 'lucide-vue-next'
import type { GenerationStageType } from '@inkdown/shared/types'
import ProgressBar from '../shared/ProgressBar.vue'

const props = defineProps<{
  stage: GenerationStageType
  progress: number
  thinking: string
  error: string | null
}>()

interface StageInfo {
  key: GenerationStageType
  label: string
  icon: typeof Search
}

const stages: StageInfo[] = [
  { key: 'research', label: 'Deep Research', icon: Search },
  { key: 'indexing', label: 'Indexing Sources', icon: Database },
  { key: 'analysis', label: 'Analysis', icon: BarChart3 },
  { key: 'planning', label: 'Planning Outline', icon: Map },
  { key: 'approval', label: 'Awaiting Approval', icon: CheckCircle2 },
  { key: 'content', label: 'Generating Content', icon: FileText },
  { key: 'multimedia', label: 'Adding Multimedia', icon: Film },
  { key: 'review', label: 'Quality Review', icon: ClipboardCheck },
  { key: 'complete', label: 'Complete', icon: CheckCircle2 },
]

const stageIndex = computed(() => stages.findIndex((s) => s.key === props.stage))

function stageStatus(idx: number): 'done' | 'active' | 'pending' {
  if (idx < stageIndex.value) return 'done'
  if (idx === stageIndex.value) return 'active'
  return 'pending'
}
</script>

<template>
  <div class="generation-progress">
    <h3 class="progress-title">Generating Your Course</h3>

    <!-- Stage Pipeline -->
    <div class="stage-pipeline">
      <div
        v-for="(s, idx) in stages"
        :key="s.key"
        class="stage-item"
        :class="stageStatus(idx)"
      >
        <div class="stage-icon">
          <CheckCircle2
            v-if="stageStatus(idx) === 'done'"
            :size="18"
          />
          <Loader2
            v-else-if="stageStatus(idx) === 'active'"
            :size="18"
            class="spinning"
          />
          <component
            :is="s.icon"
            v-else
            :size="18"
          />
        </div>
        <span class="stage-label">{{ s.label }}</span>
        <div
          v-if="idx < stages.length - 1"
          class="stage-connector"
          :class="stageStatus(idx)"
        />
      </div>
    </div>

    <!-- Overall Progress Bar -->
    <div class="overall-progress">
      <ProgressBar
        :value="progress"
        :show-label="true"
        color="#f59e0b"
        :height="8"
      />
    </div>

    <!-- Error -->
    <div
      v-if="error"
      class="error-banner"
    >
      {{ error }}
    </div>

    <!-- Thinking Output -->
    <div
      v-if="thinking && !error"
      class="thinking-output"
    >
      <div class="thinking-header">
        <Loader2
          :size="14"
          class="spinning"
        />
        <span>AI is thinking...</span>
      </div>
      <div class="thinking-text">{{ thinking.slice(-500) }}</div>
    </div>
  </div>
</template>

<style scoped>
.generation-progress {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 20px;
  border-radius: var(--radius-panel, 16px);
  background: var(--glass-bg, rgba(30, 30, 30, 0.6));
  backdrop-filter: blur(var(--glass-blur-heavy, 20px));
  -webkit-backdrop-filter: blur(var(--glass-blur-heavy, 20px));
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
  box-shadow: var(--shadow-md, 0 4px 12px rgba(0, 0, 0, 0.25));
}

.progress-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-color, #e2e8f0);
  margin: 0;
}

.stage-pipeline {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

.stage-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: var(--radius-sm, 6px);
  font-size: 12px;
  font-weight: 500;
  transition: all var(--transition-normal, 250ms ease);
}

.stage-item.done {
  color: var(--status-completed, #22c55e);
}

.stage-item.active {
  color: var(--status-running, #f59e0b);
  background: rgba(245, 158, 11, 0.1);
}

.stage-item.pending {
  color: var(--status-pending, #6b7280);
}

.stage-icon {
  display: flex;
  align-items: center;
}

.stage-label {
  white-space: nowrap;
}

.stage-connector {
  width: 16px;
  height: 2px;
  background: var(--glass-border, rgba(255, 255, 255, 0.08));
  border-radius: 1px;
  flex-shrink: 0;
}

.stage-connector.done {
  background: var(--status-completed, #22c55e);
}

.stage-connector.active {
  background: var(--status-running, #f59e0b);
}

.overall-progress {
  padding: 0 4px;
}

.error-banner {
  padding: 12px 16px;
  border-radius: var(--radius-sm, 6px);
  background: rgba(248, 81, 73, 0.1);
  border: 1px solid rgba(248, 81, 73, 0.3);
  color: var(--status-error, #ef4444);
  font-size: 13px;
}

.thinking-output {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  border-radius: var(--radius-md, 10px);
  background: var(--glass-bg, rgba(30, 30, 30, 0.6));
  backdrop-filter: blur(var(--glass-blur, 12px));
  -webkit-backdrop-filter: blur(var(--glass-blur, 12px));
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
}

.thinking-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--status-running, #f59e0b);
}

.thinking-text {
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-color-secondary, #94a3b8);
  white-space: pre-wrap;
  max-height: 200px;
  overflow-y: auto;
}

.thinking-text::-webkit-scrollbar {
  width: 4px;
}

.thinking-text::-webkit-scrollbar-thumb {
  background: var(--glass-border, rgba(255, 255, 255, 0.08));
  border-radius: 2px;
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
