<script setup lang="ts">
import { computed } from 'vue'
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-vue-next'

const props = defineProps<{
  name: string
  status: string
  startedAt?: string
  completedAt?: string
}>()

const initial = computed(() => props.name.charAt(0).toUpperCase())

const displayName = computed(() =>
  props.name.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
)

const statusColor = computed(() => {
  switch (props.status) {
    case 'running':
      return 'var(--status-running, #f59e0b)'
    case 'completed':
      return 'var(--status-completed, #22c55e)'
    case 'error':
      return 'var(--status-error, #ef4444)'
    default:
      return 'var(--status-pending, #6b7280)'
  }
})

const elapsed = computed(() => {
  if (!props.startedAt) return null
  const start = new Date(props.startedAt).getTime()
  const end = props.completedAt ? new Date(props.completedAt).getTime() : Date.now()
  const secs = Math.round((end - start) / 1000)
  if (secs < 60) return `${secs}s`
  return `${Math.floor(secs / 60)}m ${secs % 60}s`
})
</script>

<template>
  <div
    class="subagent-card"
    :class="status"
  >
    <div
      class="agent-icon"
      :style="{ borderColor: statusColor }"
    >
      <span class="agent-initial">{{ initial }}</span>
    </div>

    <div class="agent-info">
      <span class="agent-name">{{ displayName }}</span>
      <span
        v-if="elapsed"
        class="agent-elapsed"
        >{{ elapsed }}</span
      >
    </div>

    <div
      class="agent-status-badge"
      :class="status"
    >
      <Loader2
        v-if="status === 'running'"
        :size="12"
        class="spinning"
      />
      <CheckCircle2
        v-else-if="status === 'completed'"
        :size="12"
      />
      <AlertCircle
        v-else-if="status === 'error'"
        :size="12"
      />
      <span>{{ status }}</span>
    </div>
  </div>
</template>

<style scoped>
.subagent-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: var(--radius-card, 12px);
  background: var(--glass-bg, rgba(30, 30, 30, 0.6));
  backdrop-filter: blur(var(--glass-blur, 12px));
  -webkit-backdrop-filter: blur(var(--glass-blur, 12px));
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
  transition: all var(--transition-normal, 250ms ease);
}

.subagent-card.running {
  border-color: rgba(245, 158, 11, 0.25);
}

.subagent-card.completed {
  border-color: rgba(34, 197, 94, 0.2);
}

.subagent-card.error {
  border-color: rgba(239, 68, 68, 0.25);
}

.agent-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 2px solid;
  background: rgba(255, 255, 255, 0.04);
  flex-shrink: 0;
}

.agent-initial {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-color, #e2e8f0);
}

.agent-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.agent-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color, #e2e8f0);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-elapsed {
  font-size: 11px;
  color: var(--text-color-secondary, #64748b);
}

.agent-status-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: var(--radius-full, 9999px);
  font-size: 11px;
  font-weight: 500;
  text-transform: capitalize;
  flex-shrink: 0;
}

.agent-status-badge.running {
  color: var(--status-running, #f59e0b);
  background: rgba(245, 158, 11, 0.12);
}

.agent-status-badge.completed {
  color: var(--status-completed, #22c55e);
  background: rgba(34, 197, 94, 0.12);
}

.agent-status-badge.error {
  color: var(--status-error, #ef4444);
  background: rgba(239, 68, 68, 0.12);
}

.agent-status-badge.pending {
  color: var(--status-pending, #6b7280);
  background: rgba(107, 114, 128, 0.12);
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.spinning {
  animation: spin 1s linear infinite;
}
</style>
