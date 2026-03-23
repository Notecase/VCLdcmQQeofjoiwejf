<script setup lang="ts">
/**
 * ActivityStream - Unified timeline merging thinking steps + tool calls.
 *
 * Replaces MessageThinkingSteps + inline ToolCallCard loop with a single
 * chronological timeline that NEVER auto-hides.
 *
 * Also renders TaskChecklist (DeepAgent decomposition) and SubagentPanel
 * (multi-mode streaming) when relevant store state is populated.
 */
import { computed, ref } from 'vue'
import { useAIStore, type ToolCall, type ThinkingStep } from '@/stores/ai'
import { ChevronDown } from 'lucide-vue-next'
import ActivityItem, { type ActivityItemData } from './ActivityItem.vue'
import TaskChecklist from './TaskChecklist.vue'
import SubagentPanel from './SubagentPanel.vue'
import StreamingCodePreview from '../StreamingCodePreview.vue'

const props = defineProps<{
  messageId: string
  toolCalls: ToolCall[]
  isStreaming: boolean
  thinkingStepsOverride?: ThinkingStep[]
}>()

const store = useAIStore()
const collapsed = ref(false)

// Thinking steps for this message — use override when provided (e.g. Secretary)
const thinkingSteps = computed(
  () => props.thinkingStepsOverride ?? store.getThinkingStepsForMessage(props.messageId)
)

// Merge thinking steps + tool calls into chronological list
const items = computed<ActivityItemData[]>(() => {
  const result: ActivityItemData[] = []

  // Add thinking steps
  for (const step of thinkingSteps.value) {
    result.push({ kind: 'thinking', step })
  }

  // Add tool calls
  for (const tool of props.toolCalls) {
    result.push({ kind: 'tool', tool })
  }

  return result
})

const hasItems = computed(() => items.value.length > 0)
const hasRunningItem = computed(() =>
  items.value.some((item) => {
    if (item.kind === 'thinking') return item.step.status === 'running'
    if (item.kind === 'tool') return item.tool.status === 'running'
    return false
  })
)

const totalDuration = computed(() => {
  let totalMs = 0
  for (const item of items.value) {
    if (item.kind === 'thinking' && item.step.durationMs) {
      totalMs += item.step.durationMs
    }
  }
  if (totalMs === 0) return ''
  if (totalMs < 1000) return `${totalMs}ms`
  return `${(totalMs / 1000).toFixed(1)}s`
})

// Code preview for artifact streaming
const codePreview = computed(() => store.codePreview)
const showCodePreview = computed(() => codePreview.value.active && hasRunningItem.value)

// DeepAgent tasks
const subTasks = computed(() => store.subTasks)
const hasSubTasks = computed(() => subTasks.value.length > 0)

// Subagents
const activeSubagents = computed(() => store.activeSubagents)
const hasSubagents = computed(() => activeSubagents.value.length > 0)
const isSynthesizing = computed(() => store.isSynthesizing)

// Show the stream if any content exists
const hasContent = computed(() => hasItems.value || hasSubTasks.value || hasSubagents.value)
</script>

<template>
  <div
    v-if="hasContent"
    class="activity-stream"
  >
    <!-- Collapsible header -->
    <button
      class="stream-header"
      type="button"
      @click="collapsed = !collapsed"
    >
      <div class="header-left">
        <div
          class="header-dot"
          :class="{ running: hasRunningItem }"
        />
        <span
          v-if="hasRunningItem"
          class="header-label"
        >
          Working...
        </span>
        <span
          v-else
          class="header-label"
        >
          {{ items.length }} step{{ items.length !== 1 ? 's' : '' }}
          <span
            v-if="totalDuration"
            class="header-duration"
          >
            · {{ totalDuration }}
          </span>
        </span>
      </div>
      <ChevronDown
        :size="12"
        class="header-chevron"
        :class="{ collapsed }"
      />
    </button>

    <!-- Content -->
    <Transition name="collapse">
      <div
        v-if="!collapsed"
        class="stream-content"
      >
        <!-- Task checklist (DeepAgent decomposition) -->
        <TaskChecklist
          v-if="hasSubTasks"
          :tasks="subTasks"
        />

        <!-- Subagent panel (multi-mode streaming) -->
        <SubagentPanel
          v-if="hasSubagents"
          :subagents="activeSubagents"
          :is-synthesizing="isSynthesizing"
        />

        <!-- Individual activity items -->
        <div
          v-if="hasItems"
          class="items-list"
        >
          <ActivityItem
            v-for="(item, index) in items"
            :key="item.kind === 'thinking' ? item.step.id : item.tool.id"
            :item="item"
            :is-last="index === items.length - 1 && !showCodePreview"
          />
        </div>

        <!-- Code preview during artifact generation -->
        <StreamingCodePreview
          v-if="showCodePreview"
          :phase="codePreview.phase"
          :preview="codePreview.preview"
          :total-chars="codePreview.totalChars"
          class="artifact-preview"
        />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.activity-stream {
  margin-bottom: 12px;
  border-bottom: 1px solid var(--chat-separator, rgba(48, 54, 61, 0.3));
  padding-bottom: 8px;
}

/* Header */
.stream-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 4px 0;
  background: transparent;
  border: none;
  cursor: pointer;
  margin-bottom: 6px;
}

.stream-header:hover .header-label {
  color: var(--text-primary, #e6edf3);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-muted, #6e7681);
  transition: all 0.2s ease;
}

.header-dot.running {
  background: var(--stream-cursor, #ffffff);
  box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.15);
  animation: header-pulse 2s ease-in-out infinite;
}

@keyframes header-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.15);
  }
  50% {
    box-shadow: 0 0 0 5px rgba(255, 255, 255, 0.08);
  }
}

.header-label {
  font-size: 11px;
  color: var(--text-muted, #6e7681);
  transition: color 0.15s ease;
}

.header-duration {
  color: var(--text-muted, #6e7681);
}

.header-chevron {
  color: var(--text-muted, #6e7681);
  transition: transform 0.2s ease;
}

.header-chevron.collapsed {
  transform: rotate(-90deg);
}

/* Content */
.stream-content {
  padding-left: 0;
}

.items-list {
  padding: 4px 0;
}

.artifact-preview {
  margin-top: 8px;
  margin-left: 20px;
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
}

.collapse-enter-to,
.collapse-leave-from {
  max-height: 2000px;
}
</style>
