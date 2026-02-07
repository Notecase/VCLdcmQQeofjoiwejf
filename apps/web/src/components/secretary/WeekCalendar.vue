<script setup lang="ts">
import { computed } from 'vue'
import { useSecretaryStore } from '@/stores/secretary'
import { getCurrentWeekMonday, addDays, getTodayDate, parseDateString } from '@inkdown/shared/secretary'

const store = useSecretaryStore()

/**
 * Parse "## This Week" section from Plan.md to extract per-day entries.
 * Lines like: **Mon:** QM - Topic | DL - Topic
 */
function parseThisWeekEntries(planContent: string): Map<string, Array<{ planId: string; topic: string }>> {
  const result = new Map<string, Array<{ planId: string; topic: string }>>()

  // Extract the This Week section
  const weekMatch = planContent.match(/##\s*(?:This Week|THIS WEEK)[^\n]*\n([\s\S]*?)(?=\n##\s|\n#\s|$)/i)
  if (!weekMatch) return result

  const weekContent = weekMatch[1]
  const linePattern = /\*\*(\w+):\*\*\s*(.+)/g
  let match: RegExpExecArray | null

  while ((match = linePattern.exec(weekContent)) !== null) {
    const dayAbbr = match[1] // e.g., "Mon", "Tue"
    const entriesStr = match[2]

    const entries: Array<{ planId: string; topic: string }> = []
    for (const part of entriesStr.split('|')) {
      const trimmed = part.trim()
      if (!trimmed) continue
      // Format: "QM - Topic" or just "Topic"
      const dashIdx = trimmed.indexOf(' - ')
      if (dashIdx >= 0) {
        entries.push({
          planId: trimmed.slice(0, dashIdx).trim(),
          topic: trimmed.slice(dashIdx + 3).trim(),
        })
      } else {
        entries.push({ planId: '', topic: trimmed })
      }
    }

    if (entries.length > 0) {
      result.set(dayAbbr, entries)
    }
  }

  return result
}

const weekDays = computed(() => {
  const mondayStr = getCurrentWeekMonday()
  const todayStr = getTodayDate()

  // Parse Plan.md for per-day entries
  const planFile = store.memoryFiles.find(f => f.filename === 'Plan.md')
  const parsedEntries = planFile ? parseThisWeekEntries(planFile.content) : new Map()

  const days: Array<{
    date: string
    dayName: string
    dayNum: number
    isToday: boolean
    planEntries: Array<{ planId: string; topic: string }>
  }> = []

  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  for (let i = 0; i < 7; i++) {
    const dateStr = addDays(mondayStr, i)
    const isToday = dateStr === todayStr
    const dayName = dayNames[i]

    // Use parsed entries if available, otherwise fallback to active plans for today
    const entries = parsedEntries.get(dayName) || (isToday
      ? store.activePlans
        .filter(p => p.status === 'active')
        .map(p => ({ planId: p.id, topic: p.currentTopic || p.name }))
      : [])

    days.push({
      date: dateStr,
      dayName,
      dayNum: parseDateString(dateStr).getDate(),
      isToday,
      planEntries: entries,
    })
  }

  return days
})
</script>

<template>
  <div class="week-calendar">
    <h4 class="cal-title">This Week</h4>
    <div class="week-grid">
      <div
        v-for="day in weekDays"
        :key="day.date"
        class="day-cell"
        :class="{ today: day.isToday }"
      >
        <span class="day-name">{{ day.dayName }}</span>
        <span class="day-num">{{ day.dayNum }}</span>
        <div v-if="day.planEntries.length > 0" class="day-dots">
          <span
            v-for="(entry, idx) in day.planEntries"
            :key="idx"
            class="dot"
            :title="entry.topic"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.week-calendar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.025);
}

.cal-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color-secondary, #94a3b8);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0;
}

.week-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}

.day-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 6px 2px;
  border-radius: 8px;
  transition: background 0.15s;
}

.day-cell.today {
  background: var(--sec-accent-bg, rgba(245, 158, 11, 0.12));
  border: 1px solid var(--sec-accent-border, rgba(245, 158, 11, 0.3));
}

.day-name {
  font-size: 10px;
  color: var(--text-color-secondary, #94a3b8);
  font-weight: 500;
}

.day-num {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color, #e2e8f0);
}

.day-cell.today .day-num {
  color: var(--sec-accent, #f59e0b);
}

.day-dots {
  display: flex;
  gap: 3px;
  margin-top: 2px;
}

.dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--sec-primary, #10b981);
}
</style>
