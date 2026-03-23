<script setup lang="ts">
/**
 * SubagentPanel - Header + progress bar + card container for specialist agents.
 *
 * Renders subagent-start events as collapsible streaming cards
 * with an overall progress bar and synthesis indicator.
 */
import { computed } from 'vue'
import type { SubagentTracker } from '@/stores/ai'
import SubagentCard from './SubagentCard.vue'
import SynthesisIndicator from '../SynthesisIndicator.vue'

const props = defineProps<{
  subagents: SubagentTracker[]
  isSynthesizing: boolean
}>()

const total = computed(() => props.subagents.length)
const completed = computed(() => props.subagents.filter((s) => s.status === 'complete').length)
const percent = computed(() =>
  total.value === 0 ? 0 : Math.round((completed.value / total.value) * 100)
)

// Auto-collapse completed cards when 5+ agents
const shouldAutoCollapse = computed(() => total.value >= 5)
</script>

<template>
  <div
    v-if="total > 0"
    class="subagent-panel"
  >
    <!-- Header -->
    <div class="panel-header">
      <span class="header-title">Specialist agents</span>
      <span class="header-count"> {{ completed }}/{{ total }} completed </span>
    </div>

    <!-- Progress bar -->
    <div class="progress-track">
      <div
        class="progress-fill"
        :style="{ width: `${percent}%` }"
      />
    </div>

    <!-- Agent cards -->
    <div class="cards-container">
      <SubagentCard
        v-for="sub in subagents"
        :key="sub.id"
        :subagent="sub"
        :auto-collapse="shouldAutoCollapse"
      />
    </div>

    <!-- Synthesis indicator -->
    <SynthesisIndicator
      v-if="isSynthesizing"
      :count="total"
    />
  </div>
</template>

<style scoped>
.subagent-panel {
  margin-bottom: 8px;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.header-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary, #e6edf3);
}

.header-count {
  font-size: 10px;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  color: var(--text-muted, #6e7681);
}

.progress-track {
  width: 100%;
  height: 2px;
  background: var(--task-progress-track, rgba(48, 54, 61, 0.6));
  border-radius: 1px;
  overflow: hidden;
  margin-bottom: 8px;
}

.progress-fill {
  height: 100%;
  background: var(--primary-color, #7c9ef8);
  border-radius: 1px;
  transition: width 0.3s ease;
}

.cards-container {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
</style>
