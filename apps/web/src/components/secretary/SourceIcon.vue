<script setup lang="ts">
import { computed } from 'vue'
import { Sparkles } from 'lucide-vue-next'
import type { TaskSource } from '@inkdown/shared/types'

const props = withDefaults(
  defineProps<{
    source: TaskSource
    size?: number
  }>(),
  { size: 13 },
)

const config = computed(() => {
  const configs: Record<TaskSource, { label: string; bg: string; color: string }> = {
    ai: { label: '', bg: 'rgba(16, 185, 129, 0.15)', color: '#34d399' },
    gcal: { label: 'G', bg: 'rgba(66, 133, 244, 0.15)', color: '#4285f4' },
    notion: { label: 'N', bg: 'rgba(255, 255, 255, 0.08)', color: 'var(--text-color, #e2e8f0)' },
    notes: { label: '\u270E', bg: 'rgba(255, 204, 0, 0.12)', color: '#ffcc00' },
    obsidian: { label: 'O', bg: 'rgba(139, 92, 246, 0.12)', color: '#a78bfa' },
    manual: { label: '\u2022', bg: 'rgba(100, 116, 139, 0.12)', color: '#94a3b8' },
  }
  return configs[props.source] || configs.ai
})
</script>

<template>
  <span
    class="source-icon"
    :style="{
      width: `${size}px`,
      height: `${size}px`,
      background: config.bg,
      color: config.color,
      fontSize: `${Math.round(size * 0.54)}px`,
    }"
    :title="source"
  >
    <Sparkles
      v-if="source === 'ai'"
      :size="Math.round(size * 0.62)"
    />
    <template v-else>{{ config.label }}</template>
  </span>
</template>

<style scoped>
.source-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
  font-weight: 700;
  flex-shrink: 0;
  line-height: 1;
}
</style>
