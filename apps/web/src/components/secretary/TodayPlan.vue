<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useSecretaryStore } from '@/stores/secretary'
import { useNotificationsStore } from '@/stores/notifications'
import {
  CheckCircle,
  Circle,
  MinusCircle,
  PlayCircle,
  CalendarOff,
  MoreHorizontal,
  FileText,
  Play,
} from 'lucide-vue-next'
import type { ScheduledTask } from '@inkdown/shared/types'
import TaskPopover from './TaskPopover.vue'

function endTime(task: ScheduledTask): string {
  const [h, m] = task.scheduledTime.split(':').map(Number)
  const totalMin = h * 60 + m + task.durationMinutes
  const endH = Math.floor(totalMin / 60) % 24
  const endM = totalMin % 60
  return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`
}

const store = useSecretaryStore()
const notifications = useNotificationsStore()
const popoverTask = ref<ScheduledTask | null>(null)
const popoverTriggerRect = ref<DOMRect | null>(null)
const completingTaskId = ref<string | null>(null)
const hoveredTaskId = ref<string | null>(null)

// Reactive clock for real-time task highlighting
const now = ref(new Date())
let clockInterval: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  clockInterval = setInterval(() => { now.value = new Date() }, 30_000)
})
onUnmounted(() => {
  if (clockInterval) clearInterval(clockInterval)
})

const currentTaskId = computed(() => {
  if (!store.todayPlan) return null
  const n = now.value
  const nowMinutes = n.getHours() * 60 + n.getMinutes()
  for (const task of store.todayPlan.tasks) {
    if (task.status === 'completed' || task.status === 'skipped') continue
    const [h, m] = task.scheduledTime.split(':').map(Number)
    const start = h * 60 + m
    const end = start + task.durationMinutes
    if (nowMinutes >= start && nowMinutes < end) return task.id
  }
  return null
})

function isCurrent(task: ScheduledTask): boolean {
  return task.id === currentTaskId.value
}

function startTask(task: ScheduledTask) {
  store.updateTaskStatus(task.id, 'in_progress')
  notifications.success(`Started: ${task.title}`)
}

function openPopover(event: MouseEvent, task: ScheduledTask) {
  const target = (event.currentTarget as HTMLElement)
  popoverTriggerRect.value = target.getBoundingClientRect()
  popoverTask.value = task
}

function closePopover() {
  popoverTask.value = null
  popoverTriggerRect.value = null
}

function isBreak(task: ScheduledTask): boolean {
  return task.type === 'break' || task.title.toLowerCase().includes('break')
}

function isUpcoming(task: ScheduledTask): boolean {
  const n = now.value
  const [h, m] = task.scheduledTime.split(':').map(Number)
  const taskTime = new Date(n.getFullYear(), n.getMonth(), n.getDate(), h, m)
  return taskTime > n && task.status === 'pending'
}

const todayDateStr = computed(() => {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
})

function toggleTask(event: Event, taskId: string) {
  event.stopPropagation()
  if (!store.todayPlan) return
  const task = store.todayPlan.tasks.find((t) => t.id === taskId)
  if (!task) return

  const nextStatus = task.status === 'completed' ? 'pending' : 'completed'

  if (nextStatus === 'completed') {
    completingTaskId.value = taskId
    setTimeout(() => { completingTaskId.value = null }, 300)
  }

  store.updateTaskStatus(taskId, nextStatus)

  if (nextStatus === 'completed') {
    notifications.success('Task completed')
  } else {
    notifications.info('Task marked pending')
  }
}

async function runTaskAction(actionId: string) {
  if (!popoverTask.value) return
  const task = popoverTask.value

  try {
    switch (actionId) {
      case 'study_now':
        store.studyNow(task)
        break
      case 'make_note':
        await store.launchTaskWorkflow(task, 'make_note_from_task')
        notifications.success('Note creation mission started')
        break
      case 'research_deeper':
        await store.launchTaskWorkflow(task, 'research_topic_from_task')
        notifications.success('Research mission started')
        break
      case 'mark_complete':
        await store.updateTaskStatus(task.id, 'completed')
        notifications.success('Task completed')
        break
    }
  } catch (error) {
    notifications.error(error instanceof Error ? error.message : 'Action failed')
  } finally {
    closePopover()
  }
}
</script>

<template>
  <div class="today-plan">
    <div class="plan-header">
      <div class="header-left">
        <span class="today-label">Today</span>
        <span class="today-date">{{ todayDateStr }}</span>
      </div>
      <span
        v-if="store.todayPlan"
        class="progress-badge"
      >
        {{ store.todayProgress.completed }}/{{ store.todayProgress.total }} completed
      </span>
    </div>

    <div
      v-if="store.todayPlan"
      class="progress-track"
    >
      <div
        class="progress-fill"
        :style="{ width: `${store.todayProgress.percent}%` }"
      />
    </div>

    <div
      v-if="store.todayPlan && store.todayPlan.tasks.length > 0"
      class="task-list"
    >
      <article
        v-for="task in store.todayPlan.tasks"
        :key="task.id"
        class="task-item"
        :class="[task.status, { upcoming: isUpcoming(task), current: isCurrent(task), 'just-completed': completingTaskId === task.id }]"
        @mouseenter="hoveredTaskId = task.id"
        @mouseleave="hoveredTaskId = null"
      >
        <button
          class="task-icon"
          :class="{ completing: completingTaskId === task.id }"
          @click="toggleTask($event, task.id)"
        >
          <CheckCircle
            v-if="task.status === 'completed'"
            :size="18"
          />
          <PlayCircle
            v-else-if="task.status === 'in_progress'"
            :size="18"
          />
          <MinusCircle
            v-else-if="task.status === 'skipped'"
            :size="18"
          />
          <Circle
            v-else
            :size="18"
          />
        </button>

        <span class="task-time">{{ task.scheduledTime }} &mdash; {{ endTime(task) }}</span>
        <span class="task-title">{{ task.title }}</span>

        <!-- Artifact pills (note links, etc.) -->
        <div
          v-if="task.artifacts && task.artifacts.length > 0"
          class="artifact-row"
        >
          <template
            v-for="artifact in task.artifacts"
            :key="artifact.id"
          >
            <router-link
              v-if="artifact.status === 'ready' && artifact.kind === 'note' && artifact.targetId"
              :to="`/editor?noteId=${artifact.targetId}`"
              class="artifact-pill ready artifact-link"
              @click.stop
            >
              <FileText :size="12" />
              Open note
            </router-link>
            <a
              v-else
              class="artifact-pill"
              :class="artifact.status"
              :href="artifact.href || undefined"
              @click.stop
            >
              {{ artifact.label }}
            </a>
          </template>
        </div>

        <span class="task-spacer" />

        <router-link
          v-if="task.planId"
          :to="`/calendar/plan/${task.planId}`"
          class="task-plan-tag"
          @click.stop
        >{{ task.planId }}</router-link>

        <button
          v-if="hoveredTaskId === task.id && task.status === 'pending' && !isBreak(task)"
          class="task-start-btn"
          title="Start task"
          @click.stop="startTask(task)"
        >
          <Play :size="11" />
          Start
        </button>

        <button
          v-if="!isBreak(task) && hoveredTaskId === task.id"
          class="task-menu"
          @click.stop="openPopover($event, task)"
        >
          <MoreHorizontal :size="14" />
        </button>
      </article>
    </div>

    <div
      v-else
      class="empty-state"
    >
      <CalendarOff
        :size="32"
        class="empty-icon"
      />
      <p class="empty-text">No tasks scheduled for today</p>
      <p class="empty-hint">Use "Prepare Tomorrow" to generate a plan, then approve it.</p>
    </div>

    <TaskPopover
      :open="Boolean(popoverTask)"
      :trigger-rect="popoverTriggerRect"
      @close="closePopover"
      @action="runTaskAction"
    />
  </div>
</template>

<style scoped>
.today-plan {
  padding: 20px;
  border-radius: 12px;
  background: var(--card-bg, #242428);
  border: 1px solid var(--border-color, #333338);
}

.plan-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.today-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--sec-accent, #f59e0b);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.today-date {
  font-size: 12px;
  color: var(--text-color-secondary, #94a3b8);
}

.progress-badge {
  padding: 5px 12px;
  border-radius: 999px;
  background: var(--sec-primary-bg, rgba(16, 185, 129, 0.12));
  color: var(--sec-primary, #10b981);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.progress-track {
  height: 3px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.05);
  overflow: hidden;
  margin-bottom: 18px;
}

.progress-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    var(--sec-primary, #10b981),
    var(--sec-primary-light, #34d399)
  );
  transition: width 0.5s var(--sec-ease-decel, ease);
}

/* ── Task list ── */

.task-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.task-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  transition: background 0.12s ease, opacity 400ms ease;
}

.task-item:hover {
  background: rgba(255, 255, 255, 0.03);
}

.task-item.completed {
  opacity: 0.55;
}

.task-item.completed .task-title {
  text-decoration: line-through;
  text-decoration-color: rgba(255, 255, 255, 0.2);
}

.task-item.upcoming {
  opacity: 0.75;
}

.task-item.current {
  background: rgba(16, 185, 129, 0.07);
  border-left: 3px solid var(--sec-primary, #10b981);
  padding-left: 9px;
}

.task-item.current .task-title {
  color: var(--sec-primary-light, #34d399);
  font-weight: 600;
}

.task-item.current .task-time {
  color: var(--sec-primary, #10b981);
}

.task-item.just-completed {
  animation: task-fade-complete 400ms ease forwards;
}

@keyframes task-fade-complete {
  0% { opacity: 1; }
  50% { opacity: 0.5; background: var(--sec-primary-bg); }
  100% { opacity: 0.55; }
}

/* ── Icon ── */

.task-icon {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: var(--text-color-secondary, #94a3b8);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
}

.task-icon.completing {
  animation: check-spring var(--sec-transition-normal) var(--sec-ease-spring);
}

@keyframes check-spring {
  0% { transform: scale(1); }
  40% { transform: scale(1.25); }
  70% { transform: scale(0.92); }
  100% { transform: scale(1); }
}

.task-item.completed .task-icon {
  color: var(--sec-primary, #10b981);
}

.task-item.in_progress .task-icon {
  color: var(--sec-accent, #f59e0b);
}

.task-item.skipped .task-icon {
  color: var(--text-color-secondary, #94a3b8);
}

/* ── Time ── */

.task-time {
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 12px;
  color: var(--text-color-secondary, #94a3b8);
  white-space: nowrap;
  flex-shrink: 0;
}

/* ── Title ── */

.task-title {
  font-size: 13px;
  color: var(--text-color, #e2e8f0);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Spacer pushes right-side elements ── */

.task-spacer {
  flex: 1;
  min-width: 8px;
}

/* ── Plan tag ── */

.task-plan-tag {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--sec-primary-bg, rgba(16, 185, 129, 0.12));
  color: var(--sec-primary, #10b981);
  font-weight: 700;
  letter-spacing: 0.03em;
  flex-shrink: 0;
  white-space: nowrap;
  text-decoration: none;
  cursor: pointer;
  transition: background var(--sec-transition-fast) ease;
}

.task-plan-tag:hover {
  background: rgba(16, 185, 129, 0.2);
}

/* ── Start button (hover only) ── */

.task-start-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid rgba(16, 185, 129, 0.35);
  background: rgba(16, 185, 129, 0.1);
  color: var(--sec-primary, #10b981);
  cursor: pointer;
  padding: 3px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  font-family: inherit;
  transition: background 0.12s ease, border-color 0.12s ease;
  flex-shrink: 0;
}

.task-start-btn:hover {
  background: rgba(16, 185, 129, 0.2);
  border-color: rgba(16, 185, 129, 0.5);
}

/* ── Menu button (hover only) ── */

.task-menu {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--text-color-secondary, #94a3b8);
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
  transition: background 0.12s ease;
  flex-shrink: 0;
}

.task-menu:hover {
  background: rgba(255, 255, 255, 0.06);
}

/* ── Artifacts ── */

.artifact-row {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.artifact-pill {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 9px;
  border-radius: 999px;
  text-decoration: none;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.02em;
  border: 1px solid var(--sec-glass-border);
  color: var(--text-color, #e2e8f0);
  background: var(--sec-surface-card);
  transition:
    background var(--sec-transition-normal) ease,
    border-color var(--sec-transition-normal) ease,
    color var(--sec-transition-normal) ease;
}

.artifact-pill.pending {
  border-color: rgba(245, 158, 11, 0.32);
  background: rgba(245, 158, 11, 0.14);
  color: #f5c56b;
}

.artifact-pill.ready {
  border-color: rgba(16, 185, 129, 0.32);
  background: rgba(16, 185, 129, 0.16);
  color: #aaf2d2;
}

.artifact-pill.blocked {
  border-color: rgba(248, 81, 73, 0.32);
  background: rgba(248, 81, 73, 0.14);
  color: #ffb1ab;
}

.artifact-link {
  gap: 5px;
  cursor: pointer;
  text-decoration: none;
}

.artifact-link:hover {
  background: rgba(16, 185, 129, 0.22);
  border-color: rgba(16, 185, 129, 0.5);
}

/* ── Empty state ── */

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 34px 16px 18px;
  text-align: center;
}

.empty-icon,
.empty-text,
.empty-hint {
  color: var(--text-color-secondary, #94a3b8);
}

.empty-text,
.empty-hint {
  margin: 0;
}

.empty-text {
  color: var(--text-color, #e2e8f0);
}

.empty-hint {
  max-width: 340px;
  font-size: 13px;
}

/* ── Responsive ── */

@media (max-width: 900px) {
  .task-time {
    display: none;
  }
}
</style>
