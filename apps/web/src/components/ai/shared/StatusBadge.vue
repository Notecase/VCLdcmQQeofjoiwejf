<script setup lang="ts">
/**
 * StatusBadge - Status indicator for tool calls and thinking steps
 * Displays pending, running, complete, or error states with appropriate styling
 */
import { computed } from 'vue'
import { Loader2, Check, X, Clock } from 'lucide-vue-next'

const props = defineProps<{
  status: 'pending' | 'running' | 'complete' | 'error' | 'accepted' | 'rejected'
  showLabel?: boolean
}>()

const statusConfig = computed(() => {
  switch (props.status) {
    case 'pending':
      return {
        icon: Clock,
        label: 'Pending',
        class: 'pending',
      }
    case 'running':
      return {
        icon: Loader2,
        label: 'Running',
        class: 'running',
      }
    case 'complete':
    case 'accepted':
      return {
        icon: Check,
        label: props.status === 'accepted' ? 'Accepted' : 'Complete',
        class: 'complete',
      }
    case 'error':
    case 'rejected':
      return {
        icon: X,
        label: props.status === 'rejected' ? 'Rejected' : 'Error',
        class: 'error',
      }
    default:
      return {
        icon: Clock,
        label: 'Unknown',
        class: 'pending',
      }
  }
})
</script>

<template>
  <span
    class="status-badge"
    :class="statusConfig.class"
  >
    <component
      :is="statusConfig.icon"
      :size="12"
      :class="{ spin: status === 'running' }"
    />
    <span
      v-if="showLabel"
      class="status-label"
      >{{ statusConfig.label }}</span
    >
  </span>
</template>

<style scoped>
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 500;
  transition: all var(--transition-fast) ease;
}

.status-badge.pending {
  background: rgba(110, 118, 129, 0.15);
  color: var(--text-muted);
}

.status-badge.running {
  background: rgba(88, 166, 255, 0.15);
  color: var(--stream-cursor);
}

.status-badge.complete {
  background: var(--role-assistant-bg);
  color: var(--role-assistant-color);
}

.status-badge.error {
  background: var(--diff-remove-bg);
  color: var(--diff-remove-border);
}

.status-label {
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
