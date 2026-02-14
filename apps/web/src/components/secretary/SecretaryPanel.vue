<script setup lang="ts">
import { computed } from 'vue'
import { useSecretaryStore } from '@/stores/secretary'
import { Target, Zap, Eye, Settings, RefreshCw, ChevronRight } from 'lucide-vue-next'
import WeekCalendar from './WeekCalendar.vue'
import StreakBadge from './StreakBadge.vue'
import ProgressChart from './ProgressChart.vue'
import {
  computeDailyCompletionRates,
  computeStreak,
  computeWeeklySummary,
} from '@/utils/secretaryAnalytics'

const store = useSecretaryStore()

const todayFocus = computed(() => {
  return store.activePlans
    .filter((p) => p.status === 'active' && p.currentTopic)
    .map((p) => ({ id: p.id, topic: p.currentTopic }))
})

const dailyStats = computed(() => computeDailyCompletionRates(store.historyEntries))
const streak = computed(() => computeStreak(store.historyEntries))
const weeklySummary = computed(() => computeWeeklySummary(store.historyEntries))
const hasAnalytics = computed(() => store.historyEntries.length > 0)
</script>

<template>
  <div class="secretary-panel">
    <!-- Today's Focus -->
    <div class="panel-section">
      <h4 class="section-title">
        <Target :size="14" />
        Today's Focus
      </h4>
      <div
        v-if="todayFocus.length > 0"
        class="focus-list"
      >
        <div
          v-for="item in todayFocus"
          :key="item.id"
          class="focus-card"
        >
          <span class="focus-badge">{{ item.id }}</span>
          <span class="focus-topic">{{ item.topic }}</span>
        </div>
      </div>
      <p
        v-else
        class="empty-text"
      >
        No active topics for today.
      </p>
    </div>

    <!-- Analytics -->
    <div
      v-if="hasAnalytics"
      class="panel-section analytics-sidebar"
    >
      <StreakBadge
        :current-streak="streak.current"
        :longest-streak="streak.longest"
        :weekly-completed="weeklySummary.completedTasks"
        :weekly-total="weeklySummary.totalTasks"
      />
      <ProgressChart :stats="dailyStats" />
    </div>

    <!-- Week Calendar -->
    <div class="panel-section">
      <WeekCalendar />
    </div>

    <!-- Quick Actions -->
    <div class="panel-section">
      <h4 class="section-title">
        <Zap :size="14" />
        Quick Actions
      </h4>
      <div class="quick-actions">
        <button
          class="quick-btn"
          @click="store.sendChatMessage('Show my active plans and progress')"
        >
          <Eye
            :size="14"
            class="btn-icon"
          />
          <span>View Plans</span>
          <ChevronRight
            :size="14"
            class="btn-chevron"
          />
        </button>
        <button
          class="quick-btn"
          @click="store.sendChatMessage('Update my preferences')"
        >
          <Settings
            :size="14"
            class="btn-icon"
          />
          <span>Preferences</span>
          <ChevronRight
            :size="14"
            class="btn-chevron"
          />
        </button>
        <button
          class="quick-btn"
          @click="store.refreshMemoryFiles()"
        >
          <RefreshCw
            :size="14"
            class="btn-icon"
          />
          <span>Refresh Data</span>
          <ChevronRight
            :size="14"
            class="btn-chevron"
          />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.secretary-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 8px 0;
}

.panel-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color-secondary, #94a3b8);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0;
}

.focus-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.focus-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--editor-color-04, rgba(255, 255, 255, 0.03));
  border: 1px solid var(--border-color, #333338);
}

.focus-badge {
  padding: 2px 7px;
  border-radius: 4px;
  background: var(--sec-primary-bg, rgba(16, 185, 129, 0.12));
  color: var(--sec-primary, #10b981);
  font-size: 10px;
  font-weight: 700;
}

.focus-topic {
  font-size: 13px;
  color: var(--text-color, #e2e8f0);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-text {
  font-size: 12px;
  color: var(--text-color-secondary, #94a3b8);
  opacity: 0.6;
  margin: 0;
}

.quick-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.quick-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--border-color, #333338);
  background: transparent;
  color: var(--text-color, #e2e8f0);
  font-size: 12px;
  cursor: pointer;
  text-align: left;
  transition: all 0.15s;
}

.quick-btn span {
  flex: 1;
}

.btn-icon {
  color: var(--text-color-secondary, #94a3b8);
  flex-shrink: 0;
}

.btn-chevron {
  color: var(--text-color-secondary, #94a3b8);
  opacity: 0.4;
  flex-shrink: 0;
  transition: transform 0.15s;
}

.quick-btn:hover {
  background: var(--hover-bg, rgba(255, 255, 255, 0.04));
  border-color: var(--sec-primary-border, rgba(16, 185, 129, 0.3));
  transform: translateX(2px);
}

.quick-btn:hover .btn-chevron {
  opacity: 0.8;
  transform: translateX(2px);
}

.analytics-sidebar {
  gap: 14px;
}
</style>
