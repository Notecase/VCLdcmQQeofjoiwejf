<script setup lang="ts">
/**
 * SubagentProgressBar - Compact progress summary above subagent card list.
 *
 * Shows "N/M complete" with a thin animated progress bar.
 */
import { computed } from 'vue'
import type { SubagentTracker } from '@/stores/ai'

const props = defineProps<{
  subagents: SubagentTracker[]
}>()

const total = computed(() => props.subagents.length)
const completed = computed(() => props.subagents.filter((s) => s.status === 'complete').length)
const percent = computed(() =>
  total.value === 0 ? 0 : Math.round((completed.value / total.value) * 100)
)
</script>

<template>
  <div
    v-if="total > 0"
    class="subagent-progress-bar"
  >
    <div class="progress-row">
      <span class="progress-label">Subagent progress</span>
      <span class="progress-count">{{ completed }}/{{ total }} complete</span>
    </div>
    <div class="progress-track">
      <div
        class="progress-fill"
        :style="{ width: `${percent}%` }"
      />
    </div>
  </div>
</template>

<style scoped>
.subagent-progress-bar {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 0 6px 0;
}

.progress-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.progress-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary, #8b949e);
}

.progress-count {
  font-size: 10px;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  color: var(--text-muted, #8b949e);
}

.progress-track {
  width: 100%;
  height: 2px;
  background: var(--border-color, #30363d);
  border-radius: 1px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--primary-color, #7c9ef8);
  border-radius: 1px;
  transition: width 0.3s ease;
}
</style>
