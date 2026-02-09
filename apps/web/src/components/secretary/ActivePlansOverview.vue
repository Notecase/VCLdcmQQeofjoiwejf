<script setup lang="ts">
import { ref } from 'vue'
import { useSecretaryStore } from '@/stores/secretary'
import { BookOpen } from 'lucide-vue-next'
import RoadmapDetailModal from './RoadmapDetailModal.vue'
import type { LearningRoadmap } from '@inkdown/shared/types'

const store = useSecretaryStore()
const selectedPlan = ref<LearningRoadmap | null>(null)
</script>

<template>
  <div class="active-plans">
    <h3 class="section-title">Active Plans</h3>
    <div class="plans-grid">
      <div
        v-for="plan in store.activePlans"
        :key="plan.id"
        class="plan-card"
        @click="selectedPlan = plan"
      >
        <div class="plan-header">
          <span class="plan-badge">{{ plan.id }}</span>
          <span class="plan-name">{{ plan.name }}</span>
        </div>
        <div
          v-if="plan.currentTopic"
          class="plan-topic"
        >
          <BookOpen :size="12" />
          {{ plan.currentTopic }}
        </div>
        <div class="plan-progress">
          <div class="progress-bar">
            <div
              class="progress-fill"
              :style="{ width: `${plan.progress.percentComplete}%` }"
            />
          </div>
          <span class="progress-text">
            {{ plan.progress.currentDay }}/{{ plan.progress.totalDays }} days ({{
              plan.progress.percentComplete
            }}%)
          </span>
        </div>
        <div
          v-if="plan.dateRange.start"
          class="plan-dates"
        >
          {{ plan.dateRange.start }} &mdash; {{ plan.dateRange.end }} &middot;
          {{ plan.schedule.hoursPerDay }}h/day
        </div>
        <span class="view-link">View Details</span>
      </div>
    </div>

    <RoadmapDetailModal
      v-if="selectedPlan"
      :roadmap="selectedPlan"
      @close="selectedPlan = null"
    />
  </div>
</template>

<style scoped>
.active-plans {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color-secondary, #94a3b8);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0;
}

.plans-grid {
  display: flex;
  gap: 12px;
  overflow-x: auto;
}

.plan-card {
  min-width: 220px;
  padding: 10px 14px;
  border-radius: 10px;
  background: var(--card-bg, #242428);
  border: 1px solid var(--border-color, #333338);
  display: flex;
  flex-direction: column;
  gap: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.plan-card:hover {
  background: rgba(255, 255, 255, 0.04);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  transform: translateY(-1px);
}

.plan-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.plan-badge {
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--sec-primary-bg, rgba(16, 185, 129, 0.12));
  color: var(--sec-primary, #10b981);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.plan-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color, #e2e8f0);
}

.plan-topic {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-color-secondary, #94a3b8);
}

.plan-progress {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.progress-bar {
  height: 4px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 2px;
  background: linear-gradient(
    90deg,
    var(--sec-primary, #10b981),
    var(--sec-primary-light, #34d399)
  );
  transition: width 0.3s ease;
}

.progress-text {
  font-size: 11px;
  color: var(--text-color-secondary, #94a3b8);
}

.plan-dates {
  font-size: 11px;
  color: var(--text-color-secondary, #94a3b8);
  opacity: 0.7;
}

.view-link {
  font-size: 12px;
  color: var(--sec-primary, #10b981);
  margin-top: 2px;
}
</style>
