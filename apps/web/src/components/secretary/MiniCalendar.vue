<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { useSecretaryStore } from '@/stores/secretary'

const emit = defineEmits<{
  'select-date': [date: string]
}>()

const store = useSecretaryStore()
const monthOffset = ref(0)

const viewDate = computed(() => {
  const d = new Date()
  d.setMonth(d.getMonth() + monthOffset.value)
  return d
})

const monthLabel = computed(() => {
  return viewDate.value.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
})

const today = computed(() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})

interface CalDay {
  date: string
  day: number
  isCurrentMonth: boolean
  isToday: boolean
  hasItems: boolean
}

const busyDates = computed(() => store.busyDates)

const calendarDays = computed<CalDay[]>(() => {
  const year = viewDate.value.getFullYear()
  const month = viewDate.value.getMonth()

  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)

  // Monday = 0, Sunday = 6
  let startDow = firstDay.getDay() - 1
  if (startDow < 0) startDow = 6

  const days: CalDay[] = []

  // Fill leading days from prev month
  const prevMonthLast = new Date(year, month, 0).getDate()
  for (let i = startDow - 1; i >= 0; i--) {
    const d = prevMonthLast - i
    const prevMonth = month === 0 ? 12 : month
    const prevYear = month === 0 ? year - 1 : year
    const dateStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    days.push({
      date: dateStr,
      day: d,
      isCurrentMonth: false,
      isToday: false,
      hasItems: busyDates.value.has(dateStr),
    })
  }

  // Current month days
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    days.push({
      date: dateStr,
      day: d,
      isCurrentMonth: true,
      isToday: dateStr === today.value,
      hasItems: busyDates.value.has(dateStr),
    })
  }

  // Fill trailing days
  const remaining = 7 - (days.length % 7)
  if (remaining < 7) {
    for (let d = 1; d <= remaining; d++) {
      const nextMonth = month + 2
      const nextYear = nextMonth > 12 ? year + 1 : year
      const nm = nextMonth > 12 ? 1 : nextMonth
      const dateStr = `${nextYear}-${String(nm).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      days.push({
        date: dateStr,
        day: d,
        isCurrentMonth: false,
        isToday: false,
        hasItems: busyDates.value.has(dateStr),
      })
    }
  }

  return days
})

const dayHeaders = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
</script>

<template>
  <div class="mini-calendar">
    <div class="cal-header">
      <span class="cal-month">{{ monthLabel }}</span>
      <div class="cal-nav">
        <button
          class="cal-nav-btn"
          @click="monthOffset--"
        >
          <ChevronLeft :size="12" />
        </button>
        <button
          class="cal-nav-btn"
          @click="monthOffset++"
        >
          <ChevronRight :size="12" />
        </button>
      </div>
    </div>

    <div class="cal-grid">
      <span
        v-for="h in dayHeaders"
        :key="h"
        class="cal-day-header"
      >
        {{ h }}
      </span>
      <button
        v-for="(day, idx) in calendarDays"
        :key="idx"
        class="cal-day"
        :class="{
          'current-month': day.isCurrentMonth,
          today: day.isToday,
          'has-items': day.hasItems,
        }"
        @click="emit('select-date', day.date)"
      >
        {{ day.day }}
        <span
          v-if="day.hasItems && day.isCurrentMonth"
          class="busy-dot"
        />
      </button>
    </div>
  </div>
</template>

<style scoped>
.mini-calendar {
  background: var(--sec-surface-card);
  border: 1px solid var(--sec-glass-border);
  border-radius: var(--sec-radius-sm);
  padding: 10px;
}

.cal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.cal-month {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-color, #e2e8f0);
}

.cal-nav {
  display: flex;
  gap: 2px;
}

.cal-nav-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  color: var(--text-color-secondary, #94a3b8);
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.12s;
}

.cal-nav-btn:hover {
  background: var(--sec-surface-card-hover);
}

.cal-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 1px;
  text-align: center;
}

.cal-day-header {
  font-size: 9px;
  color: var(--text-muted, #4b5563);
  padding: 2px 0;
  font-weight: 600;
}

.cal-day {
  position: relative;
  font-size: 10px;
  padding: 4px 0;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: var(--text-muted, #4b5563);
  cursor: pointer;
  font-family: inherit;
  transition: background 0.12s;
}

.cal-day:hover {
  background: var(--sec-surface-card-hover);
}

.cal-day.current-month {
  color: var(--text-color-secondary, #94a3b8);
}

.cal-day.today {
  background: var(--sec-primary-bg, rgba(16, 185, 129, 0.12));
  color: var(--sec-primary, #10b981);
  font-weight: 700;
}

.cal-day.has-items.current-month {
  color: var(--text-color, #e2e8f0);
}

.busy-dot {
  display: block;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--sec-primary, #10b981);
  margin: 1px auto 0;
}
</style>
