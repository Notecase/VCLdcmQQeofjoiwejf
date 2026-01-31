<script setup lang="ts">
/**
 * FloatingDiffActionBar - Compact floating action bar for bulk diff actions
 *
 * Features:
 * - Progress indicator with segmented bar
 * - Accept All / Reject All buttons
 * - Apply / Discard final actions
 * - Platform-aware keyboard hints
 */
import { computed } from 'vue'
import { CheckCheck, XCircle, Save, Trash2 } from 'lucide-vue-next'
import KeyboardShortcut from './shared/KeyboardShortcut.vue'

const props = defineProps<{
  pendingCount: number
  totalCount: number
  acceptedCount: number
  rejectedCount: number
}>()

const emit = defineEmits<{
  acceptAll: []
  rejectAll: []
  apply: []
  discard: []
}>()

const resolvedCount = computed(() => props.acceptedCount + props.rejectedCount)
const canApply = computed(() => props.pendingCount === 0 && props.acceptedCount > 0)

// Progress percentages
const acceptedPercent = computed(() =>
  props.totalCount > 0 ? (props.acceptedCount / props.totalCount) * 100 : 0
)
const rejectedPercent = computed(() =>
  props.totalCount > 0 ? (props.rejectedCount / props.totalCount) * 100 : 0
)
</script>

<template>
  <Teleport to="body">
    <Transition name="slide-up">
      <div v-if="totalCount > 0" class="floating-action-bar">
        <!-- Progress section -->
        <div class="progress-section">
          <div class="progress-header">
            <span class="progress-text">{{ resolvedCount }} / {{ totalCount }}</span>
            <span class="progress-label">reviewed</span>
          </div>
          <div class="progress-bar">
            <div
              class="progress-fill accepted"
              :style="{ width: `${acceptedPercent}%` }"
            />
            <div
              class="progress-fill rejected"
              :style="{
                width: `${rejectedPercent}%`,
                left: `${acceptedPercent}%`,
              }"
            />
          </div>
        </div>

        <div class="divider" />

        <!-- Bulk action buttons -->
        <div class="action-section">
          <button
            class="bar-btn accept-all"
            :disabled="pendingCount === 0"
            title="Accept All Pending"
            type="button"
            @click="emit('acceptAll')"
          >
            <CheckCheck :size="14" />
            <span class="btn-label">Accept All</span>
          </button>
          <button
            class="bar-btn reject-all"
            :disabled="pendingCount === 0"
            title="Reject All Pending"
            type="button"
            @click="emit('rejectAll')"
          >
            <XCircle :size="14" />
            <span class="btn-label">Reject All</span>
          </button>
        </div>

        <div class="divider" />

        <!-- Final actions -->
        <div class="final-section">
          <button
            class="bar-btn apply"
            :disabled="!canApply"
            :title="canApply ? 'Apply accepted changes' : 'Review all changes first'"
            type="button"
            @click="emit('apply')"
          >
            <Save :size="14" />
            <span class="btn-label">Apply</span>
          </button>
          <button
            class="bar-btn discard"
            title="Discard all changes"
            type="button"
            @click="emit('discard')"
          >
            <Trash2 :size="14" />
            <span class="btn-label">Discard</span>
          </button>
        </div>

        <div class="divider hide-mobile" />

        <!-- Keyboard hints -->
        <div class="keyboard-hints">
          <span class="hint">
            <KeyboardShortcut keys="Tab" />
            <span class="hint-label">Next</span>
          </span>
          <span class="hint">
            <KeyboardShortcut keys="Cmd+Enter" />
            <span class="hint-label">Accept</span>
          </span>
          <span class="hint">
            <KeyboardShortcut keys="Cmd+Backspace" />
            <span class="hint-label">Reject</span>
          </span>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.floating-action-bar {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 18px;
  background: var(--surface-2);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.35),
    0 0 0 1px rgba(255, 255, 255, 0.04) inset;
  z-index: 1000;
  max-width: calc(100vw - 48px);
}

/* Progress section */
.progress-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 100px;
}

.progress-header {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.progress-text {
  font-size: 13px;
  font-weight: 600;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  color: var(--text-primary);
}

.progress-label {
  font-size: 11px;
  color: var(--text-muted);
}

.progress-bar {
  position: relative;
  height: 4px;
  background: var(--surface-3);
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  position: absolute;
  top: 0;
  height: 100%;
  transition: width var(--transition-normal) ease;
}

.progress-fill.accepted {
  left: 0;
  background: var(--role-assistant-color);
}

.progress-fill.rejected {
  background: var(--diff-remove-border);
}

/* Divider */
.divider {
  width: 1px;
  height: 28px;
  background: var(--border-subtle);
}

/* Action sections */
.action-section,
.final-section {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* Buttons */
.bar-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  font-size: 12px;
  font-weight: 500;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all var(--transition-fast) ease;
  white-space: nowrap;
}

.bar-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.bar-btn:active:not(:disabled) {
  transform: scale(0.97);
}

.bar-btn.accept-all {
  background: rgba(63, 185, 80, 0.12);
  color: var(--role-assistant-color);
}

.bar-btn.accept-all:hover:not(:disabled) {
  background: rgba(63, 185, 80, 0.2);
}

.bar-btn.reject-all {
  background: var(--diff-remove-bg);
  color: var(--diff-remove-border);
}

.bar-btn.reject-all:hover:not(:disabled) {
  background: var(--diff-remove-line-bg);
}

.bar-btn.apply {
  background: var(--stream-cursor);
  color: white;
}

.bar-btn.apply:hover:not(:disabled) {
  filter: brightness(1.1);
}

.bar-btn.discard {
  background: transparent;
  color: var(--text-muted);
  border: 1px solid var(--border-subtle);
}

.bar-btn.discard:hover {
  background: var(--surface-3);
  color: var(--text-secondary);
}

/* Keyboard hints */
.keyboard-hints {
  display: flex;
  gap: 10px;
}

.hint {
  display: flex;
  align-items: center;
  gap: 4px;
}

.hint-label {
  font-size: 10px;
  color: var(--text-muted);
}

/* Slide-up animation */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all var(--transition-slow) var(--ease-out-expo);
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(20px);
}

/* Responsive */
@media (max-width: 900px) {
  .floating-action-bar {
    gap: 10px;
    padding: 10px 14px;
    bottom: 16px;
  }

  .keyboard-hints {
    display: none;
  }

  .hide-mobile {
    display: none;
  }

  .progress-section {
    min-width: 80px;
  }
}

@media (max-width: 600px) {
  .floating-action-bar {
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
    padding: 10px 12px;
  }

  .divider {
    display: none;
  }

  .progress-section {
    width: 100%;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }

  .progress-bar {
    flex: 1;
    margin-left: 12px;
  }

  .btn-label {
    display: none;
  }

  .bar-btn {
    padding: 8px 10px;
  }
}
</style>
