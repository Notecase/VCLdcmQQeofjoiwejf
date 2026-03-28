<script setup lang="ts">
import { onMounted, watch, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSecretaryStore } from '@/stores/secretary'
import { useNotificationsStore } from '@/stores/notifications'
import PlanHeader from '@/components/secretary/plan/PlanHeader.vue'
import PlanOverview from '@/components/secretary/plan/PlanOverview.vue'
import PlanSchedule from '@/components/secretary/plan/PlanSchedule.vue'
import PlanArtifacts from '@/components/secretary/plan/PlanArtifacts.vue'
import type { PlanScheduleItem } from '@inkdown/shared/types'

const route = useRoute()
const router = useRouter()
const store = useSecretaryStore()
const notifications = useNotificationsStore()

const planId = computed(() => route.params.planId as string)

async function loadWorkspace() {
  if (!planId.value) return
  try {
    // Ensure secretary store is initialized
    if (!store.isInitialized) {
      await store.initialize()
    }
    await store.loadPlanWorkspace(planId.value)
  } catch {
    // Error already shown by store
  }
}

onMounted(loadWorkspace)
watch(planId, loadWorkspace)

function handlePause() {
  notifications.info('Plan pause/resume coming soon')
}

function handleDelete() {
  notifications.info('Plan deletion coming soon')
}

function handleRun() {
  store.runPlanNow(planId.value)
}

function handleUpdateInstructions(content: string) {
  store.savePlanInstructions(planId.value, content)
}

function handleCreateSchedule(
  schedule: Omit<PlanScheduleItem, 'id' | 'createdAt' | 'runCount' | 'planId'>
) {
  store.createPlanSchedule(planId.value, schedule)
}

function handleUpdateSchedule(id: string, updates: Partial<PlanScheduleItem>) {
  store.updatePlanSchedule(planId.value, id, updates)
}

function handleDeleteSchedule(id: string) {
  store.deletePlanSchedule(planId.value, id)
}

function handleToggleSchedule(id: string, enabled: boolean) {
  store.togglePlanSchedule(planId.value, id, enabled)
}

async function handleRunSchedule(scheduleId: string) {
  await store.runScheduleNow(planId.value, scheduleId)
}

function handleGenerate(workflow: string) {
  store.runPlanNow(
    planId.value,
    workflow as 'make_note_from_task' | 'research_topic_from_task' | 'make_course_from_plan'
  )
}
</script>

<template>
  <div class="plan-workspace-view">
    <!-- Loading state -->
    <div
      v-if="store.isLoadingWorkspace"
      class="loading-state"
    >
      <div class="loading-spinner" />
      <span>Loading workspace...</span>
    </div>

    <!-- Error / not found -->
    <div
      v-else-if="!store.currentWorkspace"
      class="empty-state"
    >
      <p>Plan not found or failed to load.</p>
      <button
        class="back-btn"
        @click="router.push('/calendar')"
      >
        Back to Calendar
      </button>
    </div>

    <!-- Main content -->
    <div
      v-else
      class="workspace-content"
    >
      <PlanHeader
        :plan="store.currentWorkspace.plan"
        @pause="handlePause"
        @delete="handleDelete"
        @run="handleRun"
      />

      <PlanOverview
        :plan="store.currentWorkspace.plan"
        :instructions="store.currentWorkspace.instructions"
        :roadmap-content="store.currentWorkspace.roadmapContent"
        @update:instructions="handleUpdateInstructions"
      />

      <PlanSchedule
        :schedules="store.currentWorkspace.schedules"
        :plan-id="planId"
        :running-schedule-id="store.runningScheduleId"
        :running-steps="store.runningScheduleSteps"
        @create="handleCreateSchedule"
        @update="handleUpdateSchedule"
        @delete="handleDeleteSchedule"
        @toggle="handleToggleSchedule"
        @run="handleRunSchedule"
      />

      <PlanArtifacts
        :artifacts="store.currentWorkspace.artifacts"
        :project-notes="store.currentWorkspace.projectNotes || []"
        :plan-id="planId"
        @generate="handleGenerate"
      />
    </div>
  </div>
</template>

<style scoped>
.plan-workspace-view {
  height: 100vh;
  padding: 40px 24px 0;
  background: var(--app-bg, #010409);
  display: flex;
  justify-content: center;
  overflow-y: auto;
}

.workspace-content {
  width: 100%;
  max-width: var(--pw-max-width, 800px);
  display: flex;
  flex-direction: column;
  gap: var(--pw-section-gap, 40px);
}

.workspace-content::after {
  content: '';
  display: block;
  min-height: 24px;
  flex-shrink: 0;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 80px 0;
  color: var(--text-color-secondary, #94a3b8);
  font-size: 14px;
}

.loading-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--sec-glass-border);
  border-top-color: var(--sec-primary, #10b981);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 80px 0;
  color: var(--text-color-secondary, #94a3b8);
}

.empty-state p {
  font-size: 14px;
  margin: 0;
}

.back-btn {
  padding: 8px 18px;
  border: 1px solid var(--sec-glass-border);
  border-radius: var(--sec-radius-sm, 8px);
  background: transparent;
  color: var(--text-color, #e2e8f0);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--sec-transition-fast) ease;
}

.back-btn:hover {
  background: rgba(255, 255, 255, 0.04);
  border-color: var(--sec-glass-border-hover);
}

@media (max-width: 600px) {
  .plan-workspace-view {
    padding: 20px 16px 60px;
  }
}
</style>
