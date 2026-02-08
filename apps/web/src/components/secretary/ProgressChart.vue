<script setup lang="ts">
import { ref, computed } from 'vue'
import { parseDateString } from '@inkdown/shared/secretary'
import type { DailyStats } from '@/utils/secretaryAnalytics'

const props = defineProps<{
  stats: DailyStats[]
}>()

const days = ref<7 | 14 | 30>(7)

const visibleStats = computed(() => {
  return props.stats.slice(-days.value)
})

function barColor(rate: number): string {
  if (rate >= 80) return '#34d399'
  if (rate >= 50) return '#e3b341'
  return '#f85149'
}

function shortDate(dateStr: string): string {
  const d = parseDateString(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
</script>

<template>
  <div class="progress-chart">
    <div class="chart-header">
      <h4>Completion Rate</h4>
      <div class="day-toggle">
        <button
          v-for="d in [7, 14, 30] as const"
          :key="d"
          class="toggle-btn"
          :class="{ active: days === d }"
          @click="days = d"
        >
          {{ d }}d
        </button>
      </div>
    </div>

    <div v-if="visibleStats.length === 0" class="empty-chart">
      <p>No history data yet</p>
    </div>

    <div v-else class="chart-bars">
      <div
        v-for="stat in visibleStats"
        :key="stat.date"
        class="bar-col"
        :title="`${stat.date}: ${stat.completionRate}% (${stat.completedTasks}/${stat.totalTasks})`"
      >
        <div class="bar-track">
          <div
            class="bar-fill"
            :style="{
              height: `${Math.max(stat.completionRate, 2)}%`,
              background: barColor(stat.completionRate),
            }"
          />
        </div>
        <span class="bar-label">{{ shortDate(stat.date) }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.progress-chart {
  padding: 16px;
  border-radius: 12px;
  background: var(--card-bg, #242428);
  border: 1px solid var(--border-color, #333338);
}

.chart-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.chart-header h4 {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color, #e2e8f0);
  margin: 0;
}

.day-toggle {
  display: flex;
  border: 1px solid var(--border-color, #333338);
  border-radius: 6px;
  overflow: hidden;
}

.toggle-btn {
  padding: 3px 10px;
  border: none;
  background: transparent;
  color: var(--text-color-secondary, #94a3b8);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}

.toggle-btn.active {
  background: var(--sec-primary-bg, rgba(16, 185, 129, 0.12));
  color: var(--sec-primary, #10b981);
}

.toggle-btn:hover:not(.active) {
  background: rgba(255, 255, 255, 0.04);
}

.chart-bars {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  height: 120px;
}

.bar-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
  min-width: 0;
}

.bar-track {
  flex: 1;
  width: 100%;
  max-width: 24px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 4px 4px 0 0;
  display: flex;
  align-items: flex-end;
  overflow: hidden;
}

.bar-fill {
  width: 100%;
  border-radius: 4px 4px 0 0;
  transition: height 0.3s ease;
  min-height: 2px;
}

.bar-label {
  font-size: 9px;
  color: var(--text-color-secondary, #94a3b8);
  margin-top: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  text-align: center;
}

.empty-chart {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 80px;
}

.empty-chart p {
  font-size: 13px;
  color: var(--text-color-secondary, #94a3b8);
  margin: 0;
}
</style>
