<script setup lang="ts">
import { computed } from 'vue'
import { BarChart3, Key, Link2, Terminal } from 'lucide-vue-next'
import { useCreditsStore } from '@/stores/credits'

const props = defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const creditsStore = useCreditsStore()

const sections = [
  { id: 'usage', label: 'Usage', icon: BarChart3 },
  { id: 'tokens', label: 'Capture Tokens', icon: Key },
  { id: 'connectors', label: 'Connectors', icon: Link2 },
  { id: 'api-keys', label: 'API Keys', icon: Terminal },
]

const planColor = computed(() => creditsStore.planDef.color)
</script>

<template>
  <nav class="settings-nav">
    <div class="nav-items">
      <button
        v-for="section in sections"
        :key="section.id"
        class="nav-item"
        :class="{ active: props.modelValue === section.id }"
        @click="emit('update:modelValue', section.id)"
      >
        <component :is="section.icon" :size="16" />
        <span>{{ section.label }}</span>
      </button>
    </div>

    <div class="nav-footer">
      <div class="plan-badge-wrap">
        <span class="plan-dot" :style="{ background: planColor }"></span>
        <span class="plan-name">{{ creditsStore.planLabel }}</span>
        <span v-if="creditsStore.isActive" class="plan-status">Active</span>
      </div>
    </div>
  </nav>
</template>

<style scoped>
.settings-nav {
  display: flex;
  flex-direction: column;
  width: 200px;
  flex-shrink: 0;
  border-right: 1px solid var(--border-subtle, rgba(48, 54, 61, 0.5));
  padding: 8px 0;
}

.nav-items {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0 8px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm, 6px);
  color: var(--text-color-secondary, #94a3b8);
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition: all 150ms ease;
  text-align: left;
  width: 100%;
}

.nav-item:hover {
  color: var(--text-color, #e2e8f0);
  background: var(--hover-bg, rgba(255, 255, 255, 0.06));
}

.nav-item.active {
  color: var(--text-color, #e2e8f0);
  background: var(--hover-bg, rgba(255, 255, 255, 0.08));
}

.nav-footer {
  margin-top: auto;
  padding: 12px 16px;
  border-top: 1px solid var(--border-subtle, rgba(48, 54, 61, 0.5));
}

.plan-badge-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.plan-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.plan-name {
  color: var(--text-color, #e2e8f0);
  font-weight: 600;
}

.plan-status {
  margin-left: auto;
  color: var(--text-color-secondary, #94a3b8);
  font-size: 11px;
}
</style>
