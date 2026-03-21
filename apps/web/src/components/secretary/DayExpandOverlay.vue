<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { X } from 'lucide-vue-next'
import type { ScheduledTask, CalendarEvent } from '@inkdown/shared/types'

interface DayColumn {
  date: Date
  dateStr: string
  dayLabel: string
  dayNum: number
  isToday: boolean
  tasks: ScheduledTask[]
  events: CalendarEvent[]
  planEntries: { planId: string; topic: string }[]
}

const props = defineProps<{
  day: DayColumn
  dayIndex: number
  totalColumns: number
}>()

const emit = defineEmits<{
  close: []
}>()

function formatEventTime(event: { isAllDay: boolean; startTime: string }): string {
  if (event.isAllDay) return 'All day'
  try {
    return new Date(event.startTime).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  } catch {
    return ''
  }
}

const formattedDate = computed(() => {
  return props.day.date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
})

const hasContent = computed(() => props.day.tasks.length > 0 || props.day.events.length > 0)

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div
    class="day-overlay-card"
    @click.stop
  >
    <header class="overlay-header">
      <div>
        <span class="overlay-day-name">{{ day.dayLabel }}</span>
        <span class="overlay-date">{{ formattedDate }}</span>
      </div>
      <button
        class="close-btn"
        @click="emit('close')"
      >
        <X :size="14" />
      </button>
    </header>

    <div class="overlay-body">
      <template v-if="hasContent">
        <!-- Tasks section -->
        <div
          v-if="day.tasks.length > 0"
          class="section"
        >
          <h4 class="section-title">Tasks</h4>
          <div
            v-for="task in day.tasks"
            :key="task.id"
            class="overlay-task"
            :class="task.status"
          >
            <span class="task-dot" />
            <span class="item-time">{{ task.scheduledTime }}</span>
            <span class="item-title">{{ task.title }}</span>
          </div>
        </div>

        <!-- Events section -->
        <div
          v-if="day.events.length > 0"
          class="section"
        >
          <h4 class="section-title">Events</h4>
          <div
            v-for="event in day.events"
            :key="event.id"
            class="overlay-event"
          >
            <span class="item-time">{{ formatEventTime(event) }}</span>
            <div class="event-details">
              <span class="item-title">{{ event.title }}</span>
              <span
                v-if="event.location"
                class="event-location"
              >{{ event.location }}</span>
            </div>
          </div>
        </div>
      </template>

      <div
        v-else
        class="empty-state"
      >
        No tasks or events
      </div>
    </div>
  </div>
</template>

<style>
/* Backdrop — unscoped so it works inside Teleport */
.overlay-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Transition classes for the backdrop */
.day-expand-enter-active {
  transition: opacity 300ms cubic-bezier(0.16, 1, 0.3, 1);
}
.day-expand-enter-active .day-overlay-card {
  transition: transform 350ms cubic-bezier(0.16, 1, 0.3, 1), opacity 350ms ease;
}
.day-expand-leave-active {
  transition: opacity 200ms ease;
}
.day-expand-leave-active .day-overlay-card {
  transition: transform 200ms ease, opacity 200ms ease;
}
.day-expand-enter-from {
  opacity: 0;
}
.day-expand-enter-from .day-overlay-card {
  transform: scale(0.85);
  opacity: 0;
}
.day-expand-leave-to {
  opacity: 0;
}
.day-expand-leave-to .day-overlay-card {
  transform: scale(0.9);
  opacity: 0;
}
</style>

<style scoped>
.day-overlay-card {
  width: 420px;
  max-width: 92vw;
  max-height: 80vh;
  background: var(--sec-surface-card, #1a1a2e);
  border: 1px solid var(--sec-glass-border, rgba(255, 255, 255, 0.06));
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.04);
}

.overlay-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--sec-glass-border, rgba(255, 255, 255, 0.06));
  flex-shrink: 0;
}

.overlay-day-name {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-color-secondary, #94a3b8);
  margin-right: 8px;
}

.overlay-date {
  font-size: 13px;
  color: var(--text-color, #e2e8f0);
  font-weight: 500;
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--text-color-secondary, #94a3b8);
  cursor: pointer;
  border-radius: 6px;
  transition: background 0.12s;
}

.close-btn:hover {
  background: var(--sec-surface-card-hover, rgba(255, 255, 255, 0.06));
  color: var(--text-color, #e2e8f0);
}

.overlay-body {
  flex: 1;
  overflow-y: auto;
  padding: 14px 20px 20px;
}

.section {
  margin-bottom: 16px;
}

.section:last-child {
  margin-bottom: 0;
}

.section-title {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted, #4b5563);
  margin: 0 0 8px;
}

.overlay-task {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  border-radius: 6px;
  font-size: 12px;
  transition: background 0.12s;
}

.overlay-task:hover {
  background: var(--sec-surface-card-hover, rgba(255, 255, 255, 0.04));
}

.overlay-task.completed {
  opacity: 0.45;
  text-decoration: line-through;
}

.task-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--sec-primary, #10b981);
  flex-shrink: 0;
}

.overlay-event {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 7px 8px;
  border-radius: 6px;
  border-left: 2px solid rgba(59, 130, 246, 0.6);
  font-size: 12px;
  transition: background 0.12s;
}

.overlay-event:hover {
  background: var(--sec-surface-card-hover, rgba(255, 255, 255, 0.04));
}

.item-time {
  color: var(--text-muted, #4b5563);
  font-variant-numeric: tabular-nums;
  font-size: 11px;
  flex-shrink: 0;
  min-width: 40px;
}

.item-title {
  color: var(--text-color, #e2e8f0);
  font-size: 12px;
}

.event-details {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.event-location {
  font-size: 10px;
  color: var(--text-muted, #4b5563);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-state {
  font-size: 12px;
  color: var(--text-muted, #374151);
  padding: 32px 0;
  text-align: center;
}

@media (max-width: 900px) {
  .day-overlay-card {
    display: none;
  }
}
</style>
