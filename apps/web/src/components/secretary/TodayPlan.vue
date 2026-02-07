<script setup lang="ts">
import { computed } from 'vue'
import { useSecretaryStore } from '@/stores/secretary'
import { useNotificationsStore } from '@/stores/notifications'
import { CheckCircle, Circle, MinusCircle, PlayCircle, CalendarOff, Play } from 'lucide-vue-next'
import type { ScheduledTask } from '@inkdown/shared/types'

function endTime(task: ScheduledTask): string {
  const [h, m] = task.scheduledTime.split(':').map(Number)
  const totalMin = h * 60 + m + task.durationMinutes
  const endH = Math.floor(totalMin / 60) % 24
  const endM = totalMin % 60
  return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`
}

const store = useSecretaryStore()
const notifications = useNotificationsStore()

const todayDateStr = computed(() => {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
})

function inferTaskType(title: string): string {
  const lower = title.toLowerCase()
  if (lower.includes('break')) return 'break'
  if (lower.includes('review')) return 'review'
  if (lower.includes('practice') || lower.includes('exercise')) return 'practice'
  if (lower.includes('project')) return 'project'
  return 'learn'
}

function taskTypeColor(task: ScheduledTask): string {
  const type = inferTaskType(task.title)
  const colors: Record<string, string> = {
    learn: 'var(--sec-task-learn, #f59e0b)',
    practice: 'var(--sec-task-practice, #10b981)',
    review: 'var(--sec-task-review, #14b8a6)',
    break: 'var(--sec-task-break, #6b7280)',
    project: 'var(--sec-task-project, #8b5cf6)',
  }
  return colors[type] || colors.learn
}

function toggleTask(taskId: string) {
  if (!store.todayPlan) return
  const task = store.todayPlan.tasks.find(t => t.id === taskId)
  if (!task) return

  const nextStatus = task.status === 'completed' ? 'pending' : 'completed'
  store.updateTaskStatus(taskId, nextStatus)

  if (nextStatus === 'completed') {
    notifications.success('Task completed')
  } else {
    notifications.info('Task marked pending')
  }
}

function handleStudyNow(event: Event, task: ScheduledTask) {
  event.stopPropagation()
  store.studyNow(task)
}
</script>

<template>
  <div class="today-plan">
    <!-- Header -->
    <div class="plan-header">
      <div class="header-left">
        <span class="today-label">TODAY</span>
        <span class="today-date">{{ todayDateStr }}</span>
      </div>
      <span v-if="store.todayPlan" class="progress-badge">
        {{ store.todayProgress.completed }}/{{ store.todayProgress.total }} completed
      </span>
    </div>

    <!-- Progress bar -->
    <div v-if="store.todayPlan" class="progress-track">
      <div
        class="progress-fill"
        :style="{ width: `${store.todayProgress.percent}%` }"
      />
    </div>

    <!-- Task timeline -->
    <div v-if="store.todayPlan && store.todayPlan.tasks.length > 0" class="task-list">
      <div
        v-for="task in store.todayPlan.tasks"
        :key="task.id"
        class="task-item"
        :class="task.status"
        @click="toggleTask(task.id)"
      >
        <div class="task-icon">
          <CheckCircle v-if="task.status === 'completed'" :size="16" />
          <PlayCircle v-else-if="task.status === 'in_progress'" :size="16" />
          <MinusCircle v-else-if="task.status === 'skipped'" :size="16" />
          <Circle v-else :size="16" />
        </div>
        <div class="task-time">{{ task.scheduledTime }} – {{ endTime(task) }}</div>
        <span class="type-dot" :style="{ background: taskTypeColor(task) }" />
        <div class="task-title">{{ task.title }}</div>
        <span v-if="task.planId" class="task-plan-tag">{{ task.planId }}</span>
        <button
          v-if="task.status !== 'completed' && task.status !== 'skipped' && !task.title.toLowerCase().includes('break')"
          class="start-btn"
          @click="handleStudyNow($event, task)"
        >
          <Play :size="11" />
          Start
        </button>
      </div>
    </div>

    <div v-else class="empty-state">
      <CalendarOff :size="32" class="empty-icon" />
      <p class="empty-text">No tasks scheduled for today</p>
      <p class="empty-hint">Use "Prepare Tomorrow" to generate a plan, then approve it.</p>
    </div>
  </div>
</template>

<style scoped>
.today-plan {
  padding: 16px;
  border-radius: 12px;
  background: var(--card-bg, #242428);
  border: 1px solid var(--border-color, #333338);
}

.plan-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.today-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--sec-accent, #f59e0b);
  letter-spacing: 1px;
}

.today-date {
  font-size: 12px;
  color: var(--text-color-secondary, #94a3b8);
}

.progress-badge {
  padding: 2px 10px;
  border-radius: 10px;
  background: var(--sec-primary-bg, rgba(16, 185, 129, 0.12));
  color: var(--sec-primary, #10b981);
  font-size: 11px;
  font-weight: 600;
}

.progress-track {
  height: 4px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.06);
  overflow: hidden;
  margin-bottom: 12px;
}

.progress-fill {
  height: 100%;
  border-radius: 2px;
  background: linear-gradient(90deg, var(--sec-primary, #10b981), var(--sec-primary-light, #34d399));
  transition: width 0.4s ease;
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.task-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
  font-size: 13px;
}

.task-item:hover {
  background: rgba(255, 255, 255, 0.04);
}

.task-icon {
  flex-shrink: 0;
  display: flex;
  color: var(--text-color-secondary, #94a3b8);
}

.task-item.completed .task-icon { color: var(--sec-primary, #10b981); }
.task-item.in_progress .task-icon { color: var(--sec-accent, #f59e0b); }
.task-item.skipped .task-icon { color: var(--text-color-secondary, #94a3b8); }
.task-item.completed .task-title { text-decoration: line-through; opacity: 0.5; }

.task-time {
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 12px;
  color: var(--text-color-secondary, #94a3b8);
  min-width: 90px;
}

.type-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.task-title {
  flex: 1;
  color: var(--text-color, #e2e8f0);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-plan-tag {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--sec-primary-bg, rgba(16, 185, 129, 0.12));
  color: var(--sec-primary, #10b981);
  font-weight: 600;
  flex-shrink: 0;
}

.start-btn {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 3px 10px;
  border-radius: 6px;
  border: 1px solid var(--sec-accent-border, rgba(245, 158, 11, 0.3));
  background: transparent;
  color: var(--sec-accent, #f59e0b);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
  opacity: 0;
}

.task-item:hover .start-btn {
  opacity: 1;
}

.start-btn:hover {
  background: var(--sec-accent-bg, rgba(245, 158, 11, 0.12));
  border-color: var(--sec-accent, #f59e0b);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px 16px;
  gap: 6px;
}

.empty-icon {
  color: var(--text-color-secondary, #94a3b8);
  opacity: 0.5;
  margin-bottom: 4px;
}

.empty-text {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color-secondary, #94a3b8);
  margin: 0;
}

.empty-hint {
  font-size: 12px;
  color: var(--text-color-secondary, #94a3b8);
  opacity: 0.6;
  margin: 0;
  text-align: center;
}
</style>
