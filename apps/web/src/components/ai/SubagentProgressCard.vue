<script setup lang="ts">
/**
 * SubagentProgressCard - Inline card showing one subagent's lifecycle status.
 *
 * - Running: spinner + name + elapsed time + live text preview with streaming cursor
 * - Complete: check + name + elapsed time (auto-collapses after 2s if many)
 * - Error: X + name + error state
 */
import { ref, computed, watch, onUnmounted } from 'vue'
import type { SubagentTracker } from '@/stores/ai'
import { Loader2, CheckCircle2, XCircle, Bot, ChevronDown } from 'lucide-vue-next'
import StreamingCursor from './shared/StreamingCursor.vue'

const props = defineProps<{
  subagent: SubagentTracker
  autoCollapse?: boolean
}>()

const expanded = ref(true)
const elapsedDisplay = ref('')
let intervalId: ReturnType<typeof setInterval> | undefined

function updateElapsed() {
  const sub = props.subagent
  if (sub.elapsedMs !== undefined) {
    elapsedDisplay.value = formatMs(sub.elapsedMs)
    return
  }
  if (sub.startedAt) {
    elapsedDisplay.value = formatMs(Date.now() - sub.startedAt)
  }
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

// Tick elapsed time while running
intervalId = setInterval(updateElapsed, 250)
updateElapsed()

onUnmounted(() => {
  if (intervalId) clearInterval(intervalId)
})

// Auto-collapse on complete
watch(
  () => props.subagent.status,
  (newStatus) => {
    if (newStatus === 'complete' && props.autoCollapse) {
      setTimeout(() => {
        expanded.value = false
      }, 2000)
    }
    if (newStatus === 'complete' || newStatus === 'error') {
      if (intervalId) clearInterval(intervalId)
      updateElapsed()
    }
  }
)

const lastMessagePreview = computed(() => {
  const msg = props.subagent.lastMessage
  if (!msg) return ''
  // Show last 120 chars, trimmed
  const trimmed = msg.trim()
  if (trimmed.length <= 120) return trimmed
  return '...' + trimmed.slice(-120)
})

const statusClass = computed(() => props.subagent.status)
</script>

<template>
  <div
    class="subagent-progress-card"
    :class="statusClass"
  >
    <button
      class="card-header"
      type="button"
      @click="expanded = !expanded"
    >
      <div class="header-left">
        <div class="status-icon">
          <Loader2
            v-if="subagent.status === 'running'"
            :size="14"
            class="spin"
          />
          <CheckCircle2
            v-else-if="subagent.status === 'complete'"
            :size="14"
          />
          <XCircle
            v-else-if="subagent.status === 'error'"
            :size="14"
          />
          <Bot
            v-else
            :size="14"
          />
        </div>
        <span class="agent-name">{{ subagent.name }}</span>
        <span
          class="status-badge"
          :class="statusClass"
        >
          {{ subagent.status }}
        </span>
        <span
          v-if="elapsedDisplay"
          class="elapsed"
        >
          {{ elapsedDisplay }}
        </span>
      </div>
      <ChevronDown
        :size="12"
        class="chevron"
        :class="{ collapsed: !expanded }"
      />
    </button>

    <Transition name="collapse">
      <div
        v-if="expanded && lastMessagePreview"
        class="card-body"
      >
        <span class="preview-text">{{ lastMessagePreview }}</span>
        <StreamingCursor v-if="subagent.status === 'running'" />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.subagent-progress-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border-color, #30363d);
  border-radius: 10px;
  overflow: hidden;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.subagent-progress-card.running {
  border-color: rgba(124, 158, 248, 0.3);
}

.subagent-progress-card.complete {
  border-color: rgba(63, 185, 80, 0.2);
  opacity: 0.85;
}

.subagent-progress-card.error {
  border-color: rgba(248, 81, 73, 0.3);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 8px 12px;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background 0.15s ease;
}

.card-header:hover {
  background: rgba(255, 255, 255, 0.03);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.status-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.running .status-icon {
  color: var(--primary-color, #7c9ef8);
}

.complete .status-icon {
  color: var(--role-assistant-color, #3fb950);
}

.error .status-icon {
  color: var(--diff-remove-border, #f85149);
}

.agent-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary, #e6edf3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.status-badge {
  font-size: 10px;
  font-weight: 500;
  padding: 1px 6px;
  border-radius: 8px;
  text-transform: capitalize;
  flex-shrink: 0;
}

.status-badge.running {
  background: rgba(124, 158, 248, 0.12);
  color: var(--primary-color, #7c9ef8);
}

.status-badge.complete {
  background: rgba(63, 185, 80, 0.1);
  color: var(--role-assistant-color, #3fb950);
}

.status-badge.error {
  background: rgba(248, 81, 73, 0.1);
  color: var(--diff-remove-border, #f85149);
}

.status-badge.pending {
  background: rgba(110, 118, 129, 0.15);
  color: var(--text-muted, #8b949e);
}

.elapsed {
  font-size: 10px;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  color: var(--text-muted, #8b949e);
  flex-shrink: 0;
}

.chevron {
  color: var(--text-muted, #8b949e);
  flex-shrink: 0;
  transition: transform 0.2s ease;
  opacity: 0.6;
}

.chevron.collapsed {
  transform: rotate(-90deg);
}

.card-body {
  padding: 0 12px 8px;
  font-size: 12px;
  color: var(--text-secondary, #8b949e);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}

.preview-text {
  white-space: pre-wrap;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Collapse transition */
.collapse-enter-active,
.collapse-leave-active {
  transition: all 0.25s ease;
  overflow: hidden;
}

.collapse-enter-from,
.collapse-leave-to {
  opacity: 0;
  max-height: 0;
  padding-bottom: 0;
}

.collapse-enter-to,
.collapse-leave-from {
  max-height: 100px;
}
</style>
