<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, FolderOpen, Pause, Play, Trash2, Zap } from 'lucide-vue-next'
import { useSecretaryStore } from '@/stores/secretary'
import type { LearningRoadmap } from '@inkdown/shared/types'

const props = defineProps<{
  plan: LearningRoadmap
}>()

const emit = defineEmits<{
  pause: []
  delete: []
  run: []
}>()

const router = useRouter()
const store = useSecretaryStore()

const hasLinkedProject = computed(() => !!store.currentWorkspace?.projectId)

function goToFolder() {
  router.push('/editor')
}

const statusClass = computed(() => {
  switch (props.plan.status) {
    case 'active':
      return 'status-active'
    case 'paused':
      return 'status-paused'
    case 'completed':
      return 'status-completed'
    default:
      return 'status-archived'
  }
})

const statusLabel = computed(() => {
  return props.plan.status.charAt(0).toUpperCase() + props.plan.status.slice(1)
})

function formatDateRange(plan: LearningRoadmap): string {
  const start = new Date(plan.dateRange.start).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
  const end = new Date(plan.dateRange.end).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
  return `${start} — ${end} · ${plan.schedule.hoursPerDay}h/day`
}

function goBack() {
  router.push('/calendar')
}
</script>

<template>
  <header class="plan-header">
    <div class="header-top">
      <button
        class="back-link"
        @click="goBack"
      >
        <ArrowLeft :size="16" />
        All plans
      </button>

      <div class="header-actions">
        <button
          v-if="hasLinkedProject"
          class="action-btn secondary"
          title="View Folder"
          @click="goToFolder"
        >
          <FolderOpen :size="16" />
        </button>
        <button
          class="action-btn secondary"
          :title="plan.status === 'paused' ? 'Resume' : 'Pause'"
          @click="emit('pause')"
        >
          <Pause
            v-if="plan.status === 'active'"
            :size="16"
          />
          <Play
            v-else
            :size="16"
          />
        </button>
        <button
          class="action-btn danger"
          title="Delete plan"
          @click="emit('delete')"
        >
          <Trash2 :size="16" />
        </button>
        <button
          class="action-btn primary"
          @click="emit('run')"
        >
          <Zap :size="14" />
          Run now
        </button>
      </div>
    </div>

    <h1 class="plan-title">{{ plan.name }}</h1>

    <div class="plan-meta">
      <span
        class="status-badge"
        :class="statusClass"
        >{{ statusLabel }}</span
      >
      <span
        v-if="plan.currentTopic"
        class="current-topic"
        >{{ plan.currentTopic }}</span
      >
    </div>

    <div class="progress-section">
      <div class="progress-track">
        <div
          class="progress-fill"
          :style="{ width: `${plan.progress.percentComplete}%` }"
        />
      </div>
      <div class="progress-meta">
        <span class="progress-label"
          >{{ plan.progress.completedLessons }}/{{ plan.progress.totalLessons }} lessons ·
          {{ plan.progress.percentComplete }}%</span
        >
        <span class="date-range">{{ formatDateRange(plan) }}</span>
      </div>
    </div>
  </header>
</template>

<style scoped>
.plan-header {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  border: none;
  background: none;
  color: var(--text-color-secondary, #94a3b8);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: color var(--sec-transition-fast) ease;
}

.back-link:hover {
  color: var(--text-color, #e2e8f0);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border: 1px solid var(--sec-glass-border);
  border-radius: var(--sec-radius-sm, 8px);
  background: transparent;
  color: var(--text-color-secondary, #94a3b8);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--sec-transition-fast) ease;
}

.action-btn:hover {
  background: rgba(255, 255, 255, 0.04);
  border-color: var(--sec-glass-border-hover);
  color: var(--text-color, #e2e8f0);
}

.action-btn.danger:hover {
  border-color: rgba(248, 81, 73, 0.4);
  color: #f85149;
}

.action-btn.primary {
  background: var(--sec-primary-bg, rgba(16, 185, 129, 0.12));
  border-color: var(--sec-primary-border, rgba(16, 185, 129, 0.3));
  color: var(--sec-primary, #10b981);
  font-weight: 600;
}

.action-btn.primary:hover {
  background: rgba(16, 185, 129, 0.2);
  border-color: rgba(16, 185, 129, 0.5);
}

.plan-title {
  font-size: var(--pw-title-size, 28px);
  font-weight: 600;
  color: var(--text-color, #e2e8f0);
  margin: 0;
  line-height: 1.2;
}

.plan-meta {
  display: flex;
  align-items: center;
  gap: 12px;
}

.status-badge {
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.status-active {
  background: var(--sec-primary-bg, rgba(16, 185, 129, 0.12));
  color: var(--sec-primary, #10b981);
}

.status-paused {
  background: var(--sec-accent-bg, rgba(245, 158, 11, 0.12));
  color: var(--sec-accent, #f59e0b);
}

.status-completed {
  background: rgba(99, 102, 241, 0.12);
  color: #818cf8;
}

.status-archived {
  background: rgba(107, 114, 128, 0.12);
  color: #6b7280;
}

.current-topic {
  font-size: 14px;
  color: var(--text-color-secondary, #94a3b8);
}

.progress-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.progress-track {
  height: 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.05);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    var(--sec-primary, #10b981),
    var(--sec-primary-light, #34d399)
  );
  transition: width 0.5s ease;
}

.progress-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.progress-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--sec-primary, #10b981);
}

.date-range {
  font-size: 12px;
  color: var(--text-color-secondary, #94a3b8);
}
</style>
