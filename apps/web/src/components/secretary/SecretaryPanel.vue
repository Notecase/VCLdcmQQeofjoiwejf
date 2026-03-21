<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useSecretaryStore } from '@/stores/secretary'
import { Crosshair, ChevronRight, RefreshCw, Settings, Map, Wrench } from 'lucide-vue-next'
import MiniCalendar from './MiniCalendar.vue'
import StreakBadge from './StreakBadge.vue'
import ProgressChart from './ProgressChart.vue'
import {
  computeDailyCompletionRates,
  computeStreak,
  computeWeeklySummary,
} from '@/utils/secretaryAnalytics'

const store = useSecretaryStore()
const router = useRouter()

const streak = computed(() => computeStreak(store.historyEntries))
const weekly = computed(() => computeWeeklySummary(store.historyEntries))
const dailyStats = computed(() => computeDailyCompletionRates(store.historyEntries))

const focusItems = computed(() => {
  return store.activePlans.map((plan) => ({
    id: plan.id,
    name: plan.name,
    task: plan.currentTopic || 'No current topic',
  }))
})
</script>

<template>
  <aside class="secretary-panel">
    <!-- Section 1: Today's Focus -->
    <section class="panel-section">
      <h4 class="section-title">
        <Crosshair :size="14" />
        Today's Focus
      </h4>

      <div
        v-if="focusItems.length > 0"
        class="focus-list"
      >
        <div
          v-for="item in focusItems"
          :key="item.id"
          class="focus-item"
        >
          <span class="focus-badge">{{ item.id }}</span>
          <span class="focus-task">{{ item.task }}</span>
        </div>
      </div>

      <p
        v-else
        class="empty-text"
      >
        No active plans
      </p>

      <div
        v-if="store.attentionItems.length > 0"
        class="attention-badge"
      >
        {{ store.attentionItems.length }} item{{ store.attentionItems.length > 1 ? 's' : '' }} need
        attention
      </div>
    </section>

    <!-- Section 2: Stats -->
    <section class="panel-section">
      <StreakBadge
        :current-streak="streak.current"
        :longest-streak="streak.longest"
        :weekly-completed="weekly.completedTasks"
        :weekly-total="weekly.totalTasks"
      />
    </section>

    <!-- Section 3: Completion Rate -->
    <section class="panel-section">
      <ProgressChart :stats="dailyStats" />
    </section>

    <!-- Section 4: This Week -->
    <section class="panel-section">
      <h4 class="section-title">This Week</h4>
      <MiniCalendar />
    </section>

    <!-- Section 5: Quick Actions -->
    <section class="panel-section">
      <h4 class="section-title">Quick Actions</h4>
      <div class="quick-actions">
        <button
          class="action-link"
          @click="router.push('/calendar/plans')"
        >
          <Map :size="14" />
          View Plans
          <ChevronRight
            :size="14"
            class="action-chevron"
          />
        </button>
        <button
          class="action-link"
          @click="store.openMemoryFile('AI.md')"
        >
          <Settings :size="14" />
          Preferences
          <ChevronRight
            :size="14"
            class="action-chevron"
          />
        </button>
        <button
          class="action-link"
          @click="router.push('/settings')"
        >
          <Wrench :size="14" />
          Settings
          <ChevronRight
            :size="14"
            class="action-chevron"
          />
        </button>
        <button
          class="action-link"
          @click="store.initialize()"
        >
          <RefreshCw :size="14" />
          Refresh Data
          <ChevronRight
            :size="14"
            class="action-chevron"
          />
        </button>
      </div>
    </section>
  </aside>
</template>

<style scoped>
.secretary-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 8px 0 12px;
}

.panel-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: var(--text-color, #e2e8f0);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.focus-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.focus-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.focus-badge {
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--sec-primary-bg, rgba(16, 185, 129, 0.12));
  color: var(--sec-primary, #10b981);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  flex-shrink: 0;
}

.focus-task {
  font-size: 13px;
  color: var(--text-color, #e2e8f0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.attention-badge {
  padding: 6px 12px;
  border-radius: var(--sec-radius-md, 10px);
  border: 1px solid rgba(245, 158, 11, 0.24);
  background: rgba(245, 158, 11, 0.08);
  color: #f5c56b;
  font-size: 12px;
  font-weight: 600;
}

.empty-text {
  margin: 0;
  color: var(--text-color-secondary, #94a3b8);
  font-size: 12px;
}

.quick-actions {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.action-link {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: var(--sec-radius-md, 10px);
  border: none;
  background: transparent;
  color: var(--text-color, #e2e8f0);
  font-size: 13px;
  cursor: pointer;
  transition: background var(--sec-transition-fast, 180ms) ease;
}

.action-link:hover {
  background: var(--sec-surface-card, rgba(255, 255, 255, 0.03));
}

.action-chevron {
  margin-left: auto;
  color: var(--text-color-secondary, #94a3b8);
}
</style>
