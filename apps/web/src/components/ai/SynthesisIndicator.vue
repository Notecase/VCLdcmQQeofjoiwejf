<script setup lang="ts">
/**
 * SynthesisIndicator - Shown when all subagents complete but final response isn't done.
 *
 * Displays a pulsing "Combining results from N subagents..." message.
 */
import { Loader2 } from 'lucide-vue-next'

defineProps<{
  count: number
}>()
</script>

<template>
  <div class="synthesis-indicator">
    <Loader2
      :size="14"
      class="spin"
    />
    <span class="synthesis-text">
      Combining results from {{ count }} subagent{{ count !== 1 ? 's' : '' }}...
    </span>
  </div>
</template>

<style scoped>
.synthesis-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  color: var(--primary-color, #7c9ef8);
  opacity: 0.7;
  animation: pulse-opacity 2s ease-in-out infinite;
}

.synthesis-text {
  font-size: 12px;
  font-weight: 500;
}

.spin {
  animation: spin 1s linear infinite;
  flex-shrink: 0;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes pulse-opacity {
  0%,
  100% {
    opacity: 0.7;
  }
  50% {
    opacity: 1;
  }
}
</style>
