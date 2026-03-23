<script setup lang="ts">
/**
 * TaskChecklist - DeepAgent todo list with animated progress bar.
 *
 * Renders decomposition events as a LangChain-style checklist
 * with per-task status indicators and a gradient progress bar.
 */
import { computed } from 'vue'
import type { SubTask } from '@/stores/ai'
import { CheckCircle2, XCircle, Circle, Loader2 } from 'lucide-vue-next'

const props = defineProps<{
  tasks: SubTask[]
}>()

const completedCount = computed(() => props.tasks.filter((t) => t.status === 'completed').length)

const totalCount = computed(() => props.tasks.length)

const percent = computed(() =>
  totalCount.value === 0 ? 0 : Math.round((completedCount.value / totalCount.value) * 100)
)

const allDone = computed(
  () =>
    totalCount.value > 0 &&
    props.tasks.every((t) => t.status === 'completed' || t.status === 'failed')
)

function formatDuration(task: SubTask): string {
  if (!task.startedAt || !task.completedAt) return ''
  const ms = new Date(task.completedAt).getTime() - new Date(task.startedAt).getTime()
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}
</script>

<template>
  <div class="task-checklist">
    <!-- Header -->
    <div class="checklist-header">
      <span class="header-title">Task Plan</span>
      <span class="header-count"> {{ completedCount }}/{{ totalCount }} complete </span>
    </div>

    <!-- Progress bar -->
    <div class="progress-track">
      <div
        class="progress-fill"
        :class="{ done: allDone }"
        :style="{ width: `${percent}%` }"
      />
    </div>

    <!-- Task list -->
    <div class="task-list">
      <div
        v-for="task in tasks"
        :key="task.id"
        class="task-item"
        :class="task.status"
      >
        <div class="task-icon">
          <Loader2
            v-if="task.status === 'in_progress'"
            :size="14"
            class="spin"
          />
          <CheckCircle2
            v-else-if="task.status === 'completed'"
            :size="14"
          />
          <XCircle
            v-else-if="task.status === 'failed'"
            :size="14"
          />
          <Circle
            v-else
            :size="14"
          />
        </div>
        <span
          class="task-description"
          :class="{ strikethrough: task.status === 'completed' }"
        >
          {{ task.description }}
        </span>
        <span
          v-if="task.status === 'completed' && formatDuration(task)"
          class="task-duration"
        >
          {{ formatDuration(task) }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.task-checklist {
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--border-subtle, rgba(48, 54, 61, 0.5));
  border-radius: 10px;
  margin-bottom: 8px;
}

/* Header */
.checklist-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.header-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary, #e6edf3);
}

.header-count {
  font-size: 10px;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  color: var(--text-muted, #6e7681);
}

/* Progress bar */
.progress-track {
  width: 100%;
  height: 3px;
  background: var(--task-progress-track, rgba(48, 54, 61, 0.6));
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 10px;
}

.progress-fill {
  height: 100%;
  background: var(--task-running-color, #fbbf24);
  border-radius: 2px;
  transition:
    width 0.4s ease,
    background 0.4s ease;
}

.progress-fill.done {
  background: var(--task-complete-color, #3fb950);
}

/* Task list */
.task-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.task-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
  min-height: 24px;
}

.task-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.task-item.pending .task-icon {
  color: var(--task-pending-color, #6e7681);
}

.task-item.in_progress .task-icon {
  color: var(--task-running-color, #fbbf24);
}

.task-item.completed .task-icon {
  color: var(--task-complete-color, #3fb950);
}

.task-item.failed .task-icon {
  color: var(--task-failed-color, #f85149);
}

.task-description {
  font-size: 12px;
  color: var(--text-secondary, #8b949e);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-item.in_progress .task-description {
  color: var(--text-primary, #e6edf3);
}

.task-description.strikethrough {
  text-decoration: line-through;
  opacity: 0.7;
}

.task-item.failed .task-description {
  color: var(--text-muted, #6e7681);
}

.task-duration {
  font-size: 10px;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  color: var(--text-muted, #6e7681);
  flex-shrink: 0;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
