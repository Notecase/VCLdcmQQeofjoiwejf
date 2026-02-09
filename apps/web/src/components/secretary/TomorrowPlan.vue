<script setup lang="ts">
import { ref } from 'vue'
import { useSecretaryStore } from '@/stores/secretary'
import { Check, Pencil, Loader2 } from 'lucide-vue-next'
import ConfirmDialog from './ConfirmDialog.vue'
import type { ScheduledTask } from '@inkdown/shared/types'

function endTime(task: ScheduledTask): string {
  const [h, m] = task.scheduledTime.split(':').map(Number)
  const totalMin = h * 60 + m + task.durationMinutes
  const endH = Math.floor(totalMin / 60) % 24
  const endM = totalMin % 60
  return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`
}

const store = useSecretaryStore()
const showConfirm = ref(false)

function handleApprove() {
  showConfirm.value = false
  store.approveTomorrow()
}
</script>

<template>
  <div class="tomorrow-plan">
    <div class="plan-header">
      <div class="header-left">
        <h3>Tomorrow</h3>
        <span
          v-if="store.isGeneratingTomorrow"
          class="generating-badge"
        >
          GENERATING...
        </span>
      </div>
      <div
        v-if="store.tomorrowPlan"
        class="actions"
      >
        <button
          class="action-btn edit"
          @click="store.selectedFilename = 'Tomorrow.md'"
        >
          <Pencil :size="14" />
          Edit
        </button>
        <button
          class="action-btn approve"
          @click="showConfirm = true"
        >
          <Check :size="14" />
          Approve
        </button>
      </div>
    </div>

    <!-- Generating state -->
    <div
      v-if="store.isGeneratingTomorrow"
      class="generating"
    >
      <Loader2
        :size="16"
        class="spin"
      />
      <span>Generating tomorrow's plan...</span>
    </div>

    <!-- Task list -->
    <div
      v-else-if="store.tomorrowPlan && store.tomorrowPlan.tasks.length > 0"
      class="task-list"
    >
      <div
        v-for="task in store.tomorrowPlan.tasks"
        :key="task.id"
        class="task-item"
      >
        <div class="task-time">{{ task.scheduledTime }} – {{ endTime(task) }}</div>
        <div class="task-title">{{ task.title }}</div>
        <span
          v-if="task.planId"
          class="task-plan-tag"
          >{{ task.planId }}</span
        >
      </div>
    </div>

    <p
      v-else
      class="empty-state"
    >
      No plan generated yet.
    </p>

    <ConfirmDialog
      v-if="showConfirm"
      title="Approve Tomorrow's Plan"
      message="This will replace today's plan with tomorrow's plan. Continue?"
      confirm-label="Approve"
      @confirm="handleApprove"
      @cancel="showConfirm = false"
    />
  </div>
</template>

<style scoped>
.tomorrow-plan {
  padding: 16px;
  border-radius: 12px;
  background: var(--card-bg, #242428);
  border: 1px solid var(--border-color, #333338);
  opacity: 0.85;
}

.plan-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.plan-header h3 {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color-secondary, #94a3b8);
  margin: 0;
}

.generating-badge {
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--sec-accent-bg, rgba(245, 158, 11, 0.12));
  color: var(--sec-accent, #f59e0b);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.5px;
  animation: pulse-badge 2s ease-in-out infinite;
}

@keyframes pulse-badge {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.actions {
  display: flex;
  gap: 8px;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--border-color, #333338);
  background: transparent;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.action-btn.edit {
  color: var(--sec-accent, #f59e0b);
  border-color: var(--sec-accent-border, rgba(245, 158, 11, 0.3));
}

.action-btn.edit:hover {
  background: var(--sec-accent-bg, rgba(245, 158, 11, 0.12));
}

.action-btn.approve {
  color: var(--sec-primary, #10b981);
  border-color: var(--sec-primary-border, rgba(16, 185, 129, 0.3));
}

.action-btn.approve:hover {
  background: var(--sec-primary-bg, rgba(16, 185, 129, 0.12));
}

.generating {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 20px 0;
  justify-content: center;
  color: var(--sec-accent, #f59e0b);
  font-size: 13px;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.task-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 13px;
}

.task-time {
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 12px;
  color: var(--text-color-secondary, #94a3b8);
  min-width: 90px;
}

.task-title {
  flex: 1;
  color: var(--text-color, #e2e8f0);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-plan-tag {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--sec-primary-bg, rgba(16, 185, 129, 0.12));
  color: var(--sec-primary, #10b981);
  font-weight: 600;
}

.empty-state {
  font-size: 13px;
  color: var(--text-color-secondary, #94a3b8);
  text-align: center;
  padding: 20px 0;
  margin: 0;
}
</style>
