<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { useSecretaryStore } from '@/stores/secretary'
import DayExpandOverlay from './DayExpandOverlay.vue'
import type { ScheduledTask, CalendarEvent } from '@inkdown/shared/types'

const store = useSecretaryStore()
const weekOffset = ref(0)
const expandedDayIndex = ref<number | null>(null)

const today = computed(() => new Date())

const weekStart = computed(() => {
  const d = new Date(today.value)
  const dow = d.getDay()
  const diff = dow === 0 ? -6 : 1 - dow // Monday-based
  d.setDate(d.getDate() + diff + weekOffset.value * 7)
  d.setHours(0, 0, 0, 0)
  return d
})

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

const todayStr = computed(() => {
  const d = today.value
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})

const weekDays = computed<DayColumn[]>(() => {
  const days: DayColumn[] = []
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart.value)
    d.setDate(d.getDate() + i)
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

    let tasks: ScheduledTask[] = []
    if (store.todayPlan && store.todayPlan.date === dateStr) {
      tasks = store.todayPlan.tasks
    } else if (store.tomorrowPlan && store.tomorrowPlan.date === dateStr) {
      tasks = store.tomorrowPlan.tasks
    }

    const events = store.calendarEventsByDate.get(dateStr) || []

    const weekDay = (store as any).thisWeek?.days?.find((wd: any) => wd.date === dateStr)
    const planEntries = weekDay?.planEntries || []

    days.push({
      date: d,
      dateStr,
      dayLabel: dayNames[i],
      dayNum: d.getDate(),
      isToday: dateStr === todayStr.value,
      tasks,
      events,
      planEntries,
    })
  }
  return days
})

const weekLabel = computed(() => {
  const start = weekDays.value[0]
  const end = weekDays.value[6]
  const startStr = start.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const endStr = end.date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  return `${startStr} — ${endStr}`
})

/** Combined items (tasks + events) limited to 4 for the grid cell */
function dayItemCount(day: DayColumn): number {
  return day.tasks.length + day.events.length
}

function formatEventTime(event: CalendarEvent): string {
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

function onDayClick(index: number) {
  expandedDayIndex.value = index
}

function closeOverlay() {
  expandedDayIndex.value = null
}
</script>

<template>
  <div class="calendar-timeline">
    <header class="timeline-header">
      <div class="header-left">
        <h2 class="timeline-title">Calendar</h2>
        <span class="week-label">{{ weekLabel }}</span>
      </div>
      <div class="header-nav">
        <button
          class="nav-btn"
          @click="weekOffset--"
        >
          <ChevronLeft :size="16" />
        </button>
        <button
          class="nav-btn today-btn"
          @click="weekOffset = 0"
        >
          Today
        </button>
        <button
          class="nav-btn"
          @click="weekOffset++"
        >
          <ChevronRight :size="16" />
        </button>
      </div>
    </header>

    <div class="week-grid">
      <div
        v-for="(day, idx) in weekDays"
        :key="day.dateStr"
        class="day-column"
        :class="{ today: day.isToday }"
        @click="onDayClick(idx)"
      >
        <div class="day-header">
          <span class="day-name">{{ day.dayLabel }}</span>
          <span
            class="day-number"
            :class="{ 'today-num': day.isToday }"
          >
            {{ day.dayNum }}
          </span>
        </div>

        <div class="day-content">
          <!-- Tasks -->
          <div
            v-for="task in day.tasks.slice(0, Math.max(0, 4 - day.events.slice(0, 4).length))"
            :key="task.id"
            class="timeline-task"
            :class="task.status"
          >
            <span class="task-dot" />
            <span class="task-time">{{ task.scheduledTime }}</span>
            <span class="task-name">{{ task.title }}</span>
          </div>

          <!-- Calendar events -->
          <div
            v-for="event in day.events.slice(0, Math.max(0, 4 - day.tasks.slice(0, 4).length))"
            :key="event.id"
            class="timeline-event"
          >
            <span class="event-time">{{ formatEventTime(event) }}</span>
            <span class="event-name">{{ event.title }}</span>
          </div>

          <!-- Overflow indicator -->
          <span
            v-if="dayItemCount(day) > 4"
            class="overflow-count"
          >
            +{{ dayItemCount(day) - 4 }} more
          </span>

          <!-- Plan entries (when no tasks and no events) -->
          <div
            v-if="day.tasks.length === 0 && day.events.length === 0 && day.planEntries.length > 0"
            class="plan-entries"
          >
            <span
              v-for="entry in day.planEntries"
              :key="entry.planId"
              class="plan-chip"
            >
              {{ entry.planId }}: {{ entry.topic }}
            </span>
          </div>

          <!-- Empty -->
          <span
            v-if="day.tasks.length === 0 && day.events.length === 0 && day.planEntries.length === 0"
            class="empty-day"
          >
            No items
          </span>
        </div>
      </div>
    </div>

    <!-- Day expand overlay (outside grid, fixed position) -->
    <Teleport to="body">
      <Transition name="day-expand">
        <div
          v-if="expandedDayIndex !== null"
          class="overlay-backdrop"
          @click.self="closeOverlay"
        >
          <DayExpandOverlay
            :day="weekDays[expandedDayIndex]"
            :day-index="expandedDayIndex"
            :total-columns="7"
            @close="closeOverlay"
          />
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.calendar-timeline {
  padding: 8px 0 24px;
}

.timeline-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  padding: 0 4px;
}

.header-left {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.timeline-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-color, #e2e8f0);
  margin: 0;
}

.week-label {
  font-size: 13px;
  color: var(--text-color-secondary, #94a3b8);
}

.header-nav {
  display: flex;
  align-items: center;
  gap: 4px;
}

.nav-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--sec-glass-border);
  background: var(--sec-surface-card);
  color: var(--text-color-secondary, #94a3b8);
  border-radius: var(--sec-radius-sm);
  cursor: pointer;
  font-size: 12px;
  font-family: inherit;
  font-weight: 600;
  transition: all var(--sec-transition-fast) ease;
}

.nav-btn:hover {
  background: var(--sec-surface-card-hover);
  color: var(--text-color, #e2e8f0);
}

.today-btn {
  padding: 0 12px;
}

/* Week grid */
.week-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 6px;
  position: relative;
}

.day-column {
  border-radius: var(--sec-radius-md);
  border: 1px solid var(--sec-glass-border);
  background: var(--sec-surface-card);
  overflow: hidden;
  min-height: 180px;
  transition: border-color var(--sec-transition-fast) ease;
  cursor: pointer;
}

.day-column:hover {
  border-color: var(--text-muted, #4b5563);
}

.day-column.today {
  border-color: rgba(16, 185, 129, 0.2);
  background: rgba(16, 185, 129, 0.03);
}

.day-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-bottom: 1px solid var(--sec-glass-border);
}

.day-name {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-color-secondary, #94a3b8);
}

.day-number {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color, #e2e8f0);
}

.today-num {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--sec-primary, #10b981);
  color: white;
  font-size: 11px;
}

.day-content {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* Tasks */
.timeline-task {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  border-radius: 4px;
  font-size: 10px;
  color: var(--text-color-secondary, #94a3b8);
  transition: background 0.12s;
}

.timeline-task.completed {
  opacity: 0.5;
  text-decoration: line-through;
}

.task-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--sec-primary, #10b981);
  flex-shrink: 0;
}

.task-time {
  color: var(--text-muted, #4b5563);
  font-variant-numeric: tabular-nums;
  font-size: 9px;
  flex-shrink: 0;
}

.task-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-color, #e2e8f0);
  font-size: 10px;
}

/* Calendar events */
.timeline-event {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  border-radius: 4px;
  font-size: 10px;
  border-left: 2px solid rgba(59, 130, 246, 0.6);
  transition: background 0.12s;
}

.event-time {
  color: var(--text-muted, #4b5563);
  font-variant-numeric: tabular-nums;
  font-size: 9px;
  flex-shrink: 0;
}

.event-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-color-secondary, #94a3b8);
  font-size: 10px;
}

.overflow-count {
  font-size: 9px;
  color: var(--text-muted, #4b5563);
  padding: 2px 6px;
}

/* Plan entries */
.plan-entries {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.plan-chip {
  font-size: 9px;
  padding: 3px 6px;
  border-radius: 4px;
  background: var(--sec-primary-bg, rgba(16, 185, 129, 0.08));
  color: var(--sec-primary, #10b981);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-day {
  font-size: 10px;
  color: var(--text-muted, #374151);
  padding: 4px;
}

/* Overlay backdrop — scoped styles won't apply inside Teleport,
   but we keep them here for co-location. The actual styles are in
   DayExpandOverlay which is unscoped for the backdrop. */

/* Responsive */
@media (max-width: 900px) {
  .week-grid {
    grid-template-columns: 1fr;
  }

  .day-column {
    min-height: auto;
    cursor: default;
  }

  .overlay-backdrop {
    display: none;
  }
}
</style>
