<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    value: number
    max?: number
    height?: number
    color?: string
    showLabel?: boolean
  }>(),
  {
    max: 100,
    height: 6,
    color: '#b4883a',
    showLabel: false,
  }
)

const percentage = computed(() => {
  if (props.max === 0) return 0
  return Math.min(Math.round((props.value / props.max) * 100), 100)
})
</script>

<template>
  <div class="progress-bar-wrapper">
    <div
      class="progress-track"
      :style="{ height: `${height}px` }"
    >
      <div
        class="progress-fill"
        :style="{ width: `${percentage}%`, background: color }"
      />
    </div>
    <span
      v-if="showLabel"
      class="progress-label"
      >{{ percentage }}%</span
    >
  </div>
</template>

<style scoped>
.progress-bar-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
}

.progress-track {
  flex: 1;
  background: var(--glass-bg-light, rgba(40, 40, 40, 0.5));
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
  border-radius: var(--radius-full, 9999px);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: var(--radius-full, 9999px);
  transition: width var(--transition-slow, 400ms ease);
}

.progress-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-color-secondary, #94a3b8);
  min-width: 32px;
  text-align: right;
}
</style>
