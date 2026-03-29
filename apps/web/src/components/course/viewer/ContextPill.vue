<script setup lang="ts">
/**
 * ContextPill — Shows truncated highlighted text as context in the chat composer.
 */
import { computed } from 'vue'
import { Highlighter, X } from 'lucide-vue-next'

const props = defineProps<{
  text: string
}>()

defineEmits<{
  dismiss: []
}>()

const truncated = computed(() => {
  const max = 80
  return props.text.length > max ? `${props.text.slice(0, max)}...` : props.text
})
</script>

<template>
  <div class="context-pill">
    <Highlighter
      :size="13"
      class="pill-icon"
    />
    <span class="pill-text">{{ truncated }}</span>
    <button
      class="pill-dismiss"
      title="Remove context"
      @click="$emit('dismiss')"
    >
      <X :size="12" />
    </button>
  </div>
</template>

<style scoped>
.context-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  font-size: 12px;
  color: var(--text-color-secondary, #94a3b8);
  line-height: 1.4;
}

.pill-icon {
  flex-shrink: 0;
  color: var(--sec-accent, #f59e0b);
}

.pill-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pill-dismiss {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: var(--text-color-secondary, #64748b);
  cursor: pointer;
  transition: all 0.15s;
}

.pill-dismiss:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-color, #e2e8f0);
}
</style>
