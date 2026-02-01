<script setup lang="ts">
/**
 * DiffActionBar - Floating bar with Accept All / Deny All buttons
 *
 * Appears at bottom center when diff blocks are active.
 * Disappears when all hunks are resolved.
 */
import { computed } from 'vue'
import { CheckCheck, XCircle } from 'lucide-vue-next'

const props = defineProps<{
  pendingCount: number
  totalCount: number
}>()

const emit = defineEmits<{
  acceptAll: []
  rejectAll: []
}>()

const isVisible = computed(() => props.pendingCount > 0)
</script>

<template>
  <Teleport to="body">
    <Transition name="slide-up">
      <div v-if="isVisible" class="diff-action-bar">
        <span class="pending-count">{{ pendingCount }} change{{ pendingCount !== 1 ? 's' : '' }} remaining</span>

        <button
          class="action-btn accept-all"
          @click="emit('acceptAll')"
        >
          <CheckCheck :size="16" />
          Accept All
        </button>

        <button
          class="action-btn reject-all"
          @click="emit('rejectAll')"
        >
          <XCircle :size="16" />
          Deny All
        </button>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.diff-action-bar {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 20px;
  background: var(--float-btn-bg, rgba(22, 27, 34, 0.95));
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--border-color, rgba(48, 54, 61, 0.8));
  border-radius: 12px;
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.4),
    0 4px 12px rgba(0, 0, 0, 0.2);
  z-index: 1000;
}

.pending-count {
  color: var(--text-color-secondary, #8b949e);
  font-size: 13px;
  font-weight: 500;
  padding-right: 12px;
  border-right: 1px solid var(--border-color, rgba(48, 54, 61, 0.5));
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.action-btn.accept-all {
  background: var(--diff-add-border, #3fb950);
  color: white;
}

.action-btn.accept-all:hover {
  background: #2ea043;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(46, 160, 67, 0.4);
}

.action-btn.reject-all {
  background: rgba(248, 81, 73, 0.15);
  color: #f85149;
  border: 1px solid rgba(248, 81, 73, 0.3);
}

.action-btn.reject-all:hover {
  background: rgba(248, 81, 73, 0.25);
  transform: translateY(-1px);
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(20px);
}
</style>
