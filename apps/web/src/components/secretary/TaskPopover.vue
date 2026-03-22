<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { BookOpen, FileText, Search, CheckCircle } from 'lucide-vue-next'

const props = defineProps<{
  open: boolean
  triggerRect: DOMRect | null
}>()

const emit = defineEmits<{
  close: []
  action: [actionId: string]
}>()

const actions = [
  { id: 'study_now', label: 'Study now', icon: BookOpen },
  { id: 'make_note', label: 'Make note', icon: FileText },
  { id: 'research_deeper', label: 'Research deeper', icon: Search },
  { id: 'mark_complete', label: 'Mark complete', icon: CheckCircle },
]

const isMobile = computed(() => window.innerWidth <= 900)

const popoverStyle = computed(() => {
  if (!props.triggerRect || isMobile.value) return {}
  return {
    top: `${props.triggerRect.bottom + 6}px`,
    right: `${window.innerWidth - props.triggerRect.right}px`,
  }
})

function onBackdropClick() {
  emit('close')
}

function onActionClick(actionId: string) {
  emit('action', actionId)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <Transition name="popover">
      <div
        v-if="open"
        class="popover-backdrop"
        :class="{ mobile: isMobile }"
        @click.self="onBackdropClick"
      >
        <div
          class="popover-panel"
          :class="{ mobile: isMobile }"
          :style="popoverStyle"
        >
          <button
            v-for="action in actions"
            :key="action.id"
            class="popover-action"
            @click="onActionClick(action.id)"
          >
            <component
              :is="action.icon"
              :size="15"
            />
            <span>{{ action.label }}</span>
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.popover-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9000;
}

.popover-backdrop.mobile {
  background: rgba(0, 0, 0, 0.3);
}

.popover-panel {
  position: fixed;
  width: 200px;
  padding: 6px;
  border-radius: var(--sec-radius-md, 10px);
  background: rgba(32, 32, 34, 0.94);
  border: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(24px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.36);
  display: flex;
  flex-direction: column;
  gap: 2px;
  animation: popover-in 0.18s cubic-bezier(0.16, 1, 0.3, 1);
}

.popover-panel.mobile {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  top: auto;
  width: 100%;
  border-radius: 16px 16px 0 0;
  padding: 8px 8px 16px;
  animation: popover-slide-up 0.24s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes popover-in {
  from {
    opacity: 0;
    transform: translateY(-4px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes popover-slide-up {
  from {
    opacity: 0;
    transform: translateY(100%);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.popover-action {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: none;
  border-radius: var(--sec-radius-sm, 8px);
  background: transparent;
  color: var(--text-color, #e2e8f0);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.12s ease;
}

.popover-action:hover {
  background: var(--sec-surface-card-hover, rgba(255, 255, 255, 0.06));
}

.popover-action:first-child {
  color: var(--sec-primary, #10b981);
  font-weight: 600;
}

.popover-enter-active,
.popover-leave-active {
  transition: opacity 0.15s ease;
}

.popover-enter-from,
.popover-leave-to {
  opacity: 0;
}
</style>
