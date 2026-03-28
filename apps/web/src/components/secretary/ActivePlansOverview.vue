<script setup lang="ts">
import { BookOpen, Plus } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import { useSecretaryStore } from '@/stores/secretary'
import type { LearningRoadmap } from '@inkdown/shared/types'

const store = useSecretaryStore()
const router = useRouter()

function formatDateRange(plan: LearningRoadmap): string {
  return `${plan.dateRange.start} — ${plan.dateRange.end} · ${plan.schedule.hoursPerDay}h/day`
}

function progressLabel(plan: LearningRoadmap): string {
  return `${plan.progress.completedLessons}/${plan.progress.totalLessons} lessons (${plan.progress.percentComplete}%)`
}

function openPlanWorkspace(plan: LearningRoadmap) {
  router.push(`/calendar/plan/${plan.id}`)
}

function viewDetails(event: Event, plan: LearningRoadmap) {
  event.stopPropagation()
  router.push(`/calendar/plan/${plan.id}`)
}
</script>

<template>
  <section class="active-plans">
    <span class="section-label">Active Plans</span>

    <div class="plans-row">
      <article
        v-for="plan in store.activePlans"
        :key="plan.id"
        class="plan-card"
        @click="openPlanWorkspace(plan)"
      >
        <div class="card-header">
          <span class="plan-abbrev">{{ plan.id }}</span>
          <span class="plan-name">{{ plan.name }}</span>
        </div>

        <div class="card-topic">
          <BookOpen :size="14" />
          <span>{{ plan.currentTopic || 'No topic set' }}</span>
        </div>

        <div class="card-progress">
          <div class="progress-track">
            <div
              class="progress-fill"
              :style="{ width: `${plan.progress.percentComplete}%` }"
            />
          </div>
        </div>

        <div class="card-meta">
          <span class="progress-label">{{ progressLabel(plan) }}</span>
        </div>

        <div class="card-dates">{{ formatDateRange(plan) }}</div>

        <button
          class="view-details"
          @click="viewDetails($event, plan)"
        >
          View Details
        </button>
      </article>

      <!-- Create Plan card -->
      <article
        class="plan-card create-plan-card"
        @click="router.push('/calendar/plan/new')"
      >
        <div class="create-plan-content">
          <Plus :size="24" />
          <span class="create-plan-label">Create Plan</span>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.active-plans {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-color-secondary, #94a3b8);
}

.plans-row {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding-bottom: 8px;
}

.plans-row::-webkit-scrollbar {
  height: 3px;
}

.plans-row::-webkit-scrollbar-thumb {
  background: var(--border-color, #333338);
  border-radius: 999px;
}

.plan-card {
  min-width: 280px;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  border-radius: var(--sec-radius-md, 10px);
  border: 1px solid var(--border-color, #333338);
  background: var(--card-bg, #242428);
  cursor: pointer;
  transition:
    transform var(--sec-transition-fast) ease,
    border-color var(--sec-transition-fast) ease,
    background var(--sec-transition-fast) ease;
}

.plan-card:hover {
  transform: translateY(-1px);
  border-color: var(--sec-glass-border-hover);
  background: var(--sec-surface-card-hover);
}

.card-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.plan-abbrev {
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--sec-primary-bg, rgba(16, 185, 129, 0.12));
  color: var(--sec-primary, #10b981);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  white-space: nowrap;
  flex-shrink: 0;
}

.plan-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color, #e2e8f0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-topic {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-color-secondary, #94a3b8);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-progress {
  height: 5px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.05);
  overflow: hidden;
}

.progress-track {
  height: 100%;
  width: 100%;
}

.progress-fill {
  height: 5px;
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    var(--sec-primary, #10b981),
    var(--sec-primary-light, #34d399)
  );
  transition: width 0.5s ease;
}

.card-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.progress-label {
  font-size: 12px;
  color: var(--sec-primary, #10b981);
  font-weight: 600;
}

.card-dates {
  font-size: 11px;
  color: var(--text-color-secondary, #94a3b8);
}

.view-details {
  padding: 0;
  border: none;
  background: none;
  color: var(--sec-primary, #10b981);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  text-align: left;
  transition: opacity 0.15s ease;
}

.view-details:hover {
  opacity: 0.8;
}

.create-plan-card {
  border-style: dashed !important;
  border-color: var(--border-color, #333338) !important;
  background: transparent !important;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 180px;
}

.create-plan-card:hover {
  border-color: var(--sec-primary, #10b981) !important;
  background: rgba(16, 185, 129, 0.04) !important;
}

.create-plan-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--text-color-secondary, #94a3b8);
  transition: color var(--sec-transition-fast) ease;
}

.create-plan-card:hover .create-plan-content {
  color: var(--sec-primary, #10b981);
}

.create-plan-label {
  font-size: 13px;
  font-weight: 600;
}
</style>
