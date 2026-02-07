<script setup lang="ts">
/**
 * DiffActionBar - Floating Accept All / Deny All bar
 *
 * Appears when there are pending diff blocks in the editor.
 * Positioned fixed at bottom-right per reference design.
 */
import { computed } from 'vue'
import { useAIStore } from '@/stores/ai'

const emit = defineEmits<{
  acceptAll: []
  rejectAll: []
}>()

const aiStore = useAIStore()

const pendingCount = computed(() => {
  return aiStore.diffBlocks.filter((b) => b.status === 'pending').length
})

const isVisible = computed(() => pendingCount.value > 0)

// Detect platform for keyboard shortcut display
const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
const modKey = isMac ? '\u2318' : 'Ctrl'
const shiftKey = '\u21E7'
const enterKey = '\u21B5'
const escKey = '\u238B'
</script>

<template>
  <Transition name="float">
    <div v-if="isVisible" class="diff-action-bar">
      <button class="action-btn accept-all" @click="emit('acceptAll')">
        <span class="btn-text">Accept All</span>
        <span class="shortcut">{{ modKey }}{{ shiftKey }}{{ enterKey }}</span>
      </button>

      <button class="action-btn deny-all" @click="emit('rejectAll')">
        <span class="btn-text">Deny All</span>
        <span class="shortcut">{{ modKey }}{{ shiftKey }}{{ escKey }}</span>
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.diff-action-bar {
  position: absolute;
  bottom: 16px;
  right: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  z-index: 100;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}

.action-btn:hover {
  transform: translateY(-1px);
}

.action-btn:active {
  transform: translateY(0);
}

.shortcut {
  opacity: 0.7;
  font-size: 10px;
  font-weight: 400;
}

/* Accept All - forest green */
.accept-all {
  background: #5a9e6f;
  color: white;
}

.accept-all:hover {
  background: #4a8e5f;
  box-shadow: 0 6px 16px rgba(90, 158, 111, 0.35);
}

/* Deny All - coral red */
.deny-all {
  background: #d46a6a;
  color: white;
}

.deny-all:hover {
  background: #c45a5a;
  box-shadow: 0 6px 16px rgba(212, 106, 106, 0.35);
}

/* Transition */
.float-enter-active,
.float-leave-active {
  transition: all 0.25s ease;
}

.float-enter-from,
.float-leave-to {
  opacity: 0;
  transform: translateY(16px);
}
</style>
