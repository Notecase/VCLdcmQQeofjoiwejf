<script setup lang="ts">
/**
 * FloatingChatFab — Small floating button that opens the Notion-style chat popup.
 * Hides itself when popup is open. Supports drag + magnetic edge snapping.
 */
import { Shell } from 'lucide-vue-next'
import { useFloatingPosition } from '@/composables/useFloatingPosition'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const { style, isDragging, onPointerDown, wasDragged } = useFloatingPosition(48)

function handleClick() {
  if (wasDragged()) return
  emit('update:modelValue', !props.modelValue)
}
</script>

<template>
  <Transition name="fab">
    <div
      v-if="!modelValue"
      class="floating-fab"
      :style="style"
      :class="{ dragging: isDragging }"
      @pointerdown="onPointerDown"
      @click="handleClick"
    >
      <Shell :size="20" />
    </div>
  </Transition>
</template>

<style scoped>
.floating-fab {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  color: rgba(255, 255, 255, 0.85);
  cursor: pointer;
  touch-action: none;
  user-select: none;
  animation: fab-breathe 3s ease-in-out infinite;
}

.floating-fab.dragging {
  animation: none;
  cursor: grabbing;
  transform: scale(1.1);
}

.floating-fab:hover:not(.dragging) {
  transform: scale(1.08);
}

.floating-fab:active:not(.dragging) {
  transform: scale(0.95);
}

@keyframes fab-breathe {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.06);
  }
}

/* FAB fade transition */
.fab-enter-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.fab-leave-active {
  transition: all 0.15s ease-out;
}

.fab-enter-from,
.fab-leave-to {
  opacity: 0;
  transform: scale(0.8);
}
</style>
