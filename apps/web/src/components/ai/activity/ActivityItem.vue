<script setup lang="ts">
/**
 * ActivityItem - Single row in the ActivityStream timeline.
 *
 * Renders a thinking step or tool call as a connector-dot + icon + description + status.
 * Tool items are clickable to expand arguments/result.
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { ThinkingStep, ToolCall } from '@/stores/ai'
import {
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  Brain,
  Search,
  BookOpen,
  PenLine,
  Database,
  Wrench,
  Microscope,
  Compass,
  Sparkles,
  Globe,
  FileText,
  Folder,
  Code,
  Terminal,
  Settings,
} from 'lucide-vue-next'

export type ActivityItemData =
  | { kind: 'thinking'; step: ThinkingStep }
  | { kind: 'tool'; tool: ToolCall }

const props = defineProps<{
  item: ActivityItemData
  isLast: boolean
}>()

const expanded = ref(false)
const elapsedDisplay = ref('')
let intervalId: ReturnType<typeof setInterval> | undefined

// Elapsed time tracking for running items
function updateElapsed() {
  if (props.item.kind === 'thinking') {
    const step = props.item.step
    if (step.durationMs) {
      elapsedDisplay.value = formatMs(step.durationMs)
    } else if (step.status === 'running') {
      elapsedDisplay.value = formatMs(Date.now() - step.startedAt.getTime())
    }
  }
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

onMounted(() => {
  updateElapsed()
  intervalId = setInterval(updateElapsed, 250)
})

onUnmounted(() => {
  if (intervalId) clearInterval(intervalId)
})

const isRunning = computed(() => {
  if (props.item.kind === 'thinking') return props.item.step.status === 'running'
  if (props.item.kind === 'tool') return props.item.tool.status === 'running'
  return false
})

const isComplete = computed(() => {
  if (props.item.kind === 'thinking') return props.item.step.status === 'complete'
  if (props.item.kind === 'tool') return props.item.tool.status === 'complete'
  return false
})

const isError = computed(() => {
  if (props.item.kind === 'thinking') return props.item.step.status === 'error'
  if (props.item.kind === 'tool') return props.item.tool.status === 'error'
  return false
})

const description = computed(() => {
  if (props.item.kind === 'thinking') return props.item.step.description
  if (props.item.kind === 'tool') return formatToolName(props.item.tool.toolName)
  return ''
})

const dotColor = computed(() => {
  if (props.item.kind === 'thinking') return getStepColor(props.item.step.type)
  if (props.item.kind === 'tool') return getToolColor(props.item.tool)
  return '#8b949e'
})

const duration = computed(() => {
  if (props.item.kind === 'thinking') {
    return props.item.step.durationMs ? formatMs(props.item.step.durationMs) : elapsedDisplay.value
  }
  return ''
})

// Step icon mapping (reused from MessageThinkingSteps)
function getStepIcon(type: ThinkingStep['type']) {
  switch (type) {
    case 'thought': return Brain
    case 'search': return Search
    case 'read': return BookOpen
    case 'write': return PenLine
    case 'create': return Database
    case 'tool': return Wrench
    case 'analyze': return Microscope
    case 'explore': return Compass
    case 'reasoning': return Sparkles
    default: return Brain
  }
}

function getStepColor(type: ThinkingStep['type']): string {
  switch (type) {
    case 'thought': return '#a78bfa'
    case 'search': return '#60a5fa'
    case 'read': return '#34d399'
    case 'write': return '#fbbf24'
    case 'create': return '#f472b6'
    case 'tool': return '#fb923c'
    case 'analyze': return '#22d3ee'
    case 'explore': return '#a3e635'
    case 'reasoning': return '#c084fc'
    default: return '#8b949e'
  }
}

function getToolIcon(toolName: string) {
  const name = toolName.toLowerCase()
  if (name.includes('search') || name.includes('find') || name.includes('query')) return Search
  if (name.includes('read') || name.includes('get') || name.includes('fetch')) return BookOpen
  if (name.includes('write') || name.includes('edit') || name.includes('update')) return PenLine
  if (name.includes('database') || name.includes('db') || name.includes('table')) return Database
  if (name.includes('web') || name.includes('browse') || name.includes('url')) return Globe
  if (name.includes('file') || name.includes('document')) return FileText
  if (name.includes('folder') || name.includes('directory')) return Folder
  if (name.includes('code') || name.includes('execute') || name.includes('run')) return Code
  if (name.includes('terminal') || name.includes('shell') || name.includes('command')) return Terminal
  if (name.includes('analyze') || name.includes('analysis')) return Microscope
  if (name.includes('explore') || name.includes('navigate')) return Compass
  if (name.includes('setting') || name.includes('config')) return Settings
  if (name.includes('think') || name.includes('reason')) return Brain
  return Wrench
}

function getToolColor(tool: ToolCall): string {
  if (tool.status === 'error') return '#f85149'
  if (tool.status === 'complete') return '#3fb950'
  if (tool.status === 'running') return '#60a5fa'
  return '#8b949e'
}

function formatToolName(name: string): string {
  return name
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^\s/, '')
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
    .trim()
}

const icon = computed(() => {
  if (props.item.kind === 'thinking') return getStepIcon(props.item.step.type)
  if (props.item.kind === 'tool') return getToolIcon(props.item.tool.toolName)
  return Brain
})

const iconColor = computed(() => {
  if (props.item.kind === 'thinking') return getStepColor(props.item.step.type)
  return getToolColor(props.item.tool as ToolCall)
})

// Tool expansion
const hasToolDetails = computed(() => {
  if (props.item.kind !== 'tool') return false
  const tool = props.item.tool
  return (tool.arguments && Object.keys(tool.arguments).length > 0) || tool.result
})

const formattedArgs = computed(() => {
  if (props.item.kind !== 'tool') return ''
  try {
    return JSON.stringify(props.item.tool.arguments, null, 2)
  } catch {
    return String(props.item.tool.arguments)
  }
})

const formattedResult = computed(() => {
  if (props.item.kind !== 'tool' || !props.item.tool.result) return ''
  try {
    if (typeof props.item.tool.result === 'string') return props.item.tool.result
    return JSON.stringify(props.item.tool.result, null, 2)
  } catch {
    return String(props.item.tool.result)
  }
})

function toggleExpand() {
  if (hasToolDetails.value) {
    expanded.value = !expanded.value
  }
}
</script>

<template>
  <div
    class="activity-item"
    :class="{
      running: isRunning,
      complete: isComplete,
      error: isError,
      clickable: hasToolDetails,
    }"
    @click="toggleExpand"
  >
    <!-- Connector -->
    <div class="item-connector">
      <div
        class="connector-dot"
        :class="{ running: isRunning }"
        :style="{ backgroundColor: dotColor }"
      >
        <Loader2
          v-if="isRunning"
          :size="6"
          class="dot-spinner"
        />
      </div>
      <div
        v-if="!isLast"
        class="connector-line"
      />
    </div>

    <!-- Content -->
    <div class="item-content">
      <div class="item-main">
        <component
          :is="icon"
          :size="12"
          class="item-icon"
          :style="{ color: iconColor }"
        />
        <span
          class="item-description"
          :class="{ running: isRunning }"
        >
          {{ description }}
        </span>
      </div>
      <div class="item-meta">
        <span
          v-if="duration"
          class="item-duration"
        >
          {{ duration }}
        </span>
        <XCircle
          v-if="isError"
          :size="12"
          class="status-error"
        />
        <CheckCircle2
          v-else-if="isComplete"
          :size="12"
          class="status-complete"
        />
        <ChevronDown
          v-if="hasToolDetails"
          :size="12"
          class="expand-chevron"
          :class="{ rotated: !expanded }"
        />
      </div>
    </div>
  </div>

  <!-- Expanded tool details -->
  <Transition name="collapse">
    <div
      v-if="expanded && item.kind === 'tool'"
      class="item-details"
    >
      <div
        v-if="formattedArgs"
        class="detail-section"
      >
        <span class="detail-label">Input</span>
        <pre class="detail-code">{{ formattedArgs }}</pre>
      </div>
      <div
        v-if="formattedResult"
        class="detail-section"
      >
        <span class="detail-label">Output</span>
        <pre class="detail-code result">{{ formattedResult }}</pre>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.activity-item {
  display: flex;
  gap: 8px;
  min-height: 22px;
  padding-top: 4px;
}

.activity-item:first-child {
  padding-top: 0;
}

.activity-item.clickable {
  cursor: pointer;
}

.activity-item.clickable:hover .item-description {
  color: var(--text-primary, #e6edf3);
}

/* Connector */
.item-connector {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 12px;
  flex-shrink: 0;
}

.connector-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: box-shadow 0.2s ease;
}

.connector-dot.running {
  box-shadow: 0 0 0 3px rgba(88, 166, 255, 0.2);
  animation: pulse-ring 2s ease-in-out infinite;
}

@keyframes pulse-ring {
  0%, 100% { box-shadow: 0 0 0 3px rgba(88, 166, 255, 0.2); }
  50% { box-shadow: 0 0 0 5px rgba(88, 166, 255, 0.1); }
}

.dot-spinner {
  color: white;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.connector-line {
  width: 1px;
  flex: 1;
  background: var(--timeline-line-color, rgba(110, 118, 129, 0.3));
  margin: 3px 0;
  min-height: 6px;
}

/* Content */
.item-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.item-main {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.item-icon {
  flex-shrink: 0;
  width: 12px;
  height: 12px;
  min-width: 12px;
}

.item-description {
  font-size: 12px;
  color: var(--text-secondary, #8b949e);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color 0.15s ease;
}

.item-description.running {
  color: var(--text-primary, #e6edf3);
}

.item-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.item-duration {
  font-size: 10px;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  color: var(--text-muted, #6e7681);
}

.status-error {
  color: var(--task-failed-color, #f85149);
}

.status-complete {
  color: var(--task-complete-color, #3fb950);
  opacity: 0.6;
}

.expand-chevron {
  color: var(--text-muted, #6e7681);
  transition: transform 0.15s ease;
}

.expand-chevron.rotated {
  transform: rotate(-90deg);
}

/* Tool details */
.item-details {
  margin-left: 20px;
  margin-bottom: 4px;
}

.detail-section {
  margin-top: 6px;
}

.detail-label {
  display: block;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted, #6e7681);
  margin-bottom: 4px;
}

.detail-code {
  font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-secondary, #8b949e);
  background: var(--surface-1, #0d1117);
  border: 1px solid var(--border-subtle, rgba(48, 54, 61, 0.5));
  border-radius: 6px;
  padding: 8px 10px;
  margin: 0;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 160px;
  overflow-y: auto;
}

.detail-code.result {
  color: var(--text-primary, #e6edf3);
  background: rgba(63, 185, 80, 0.05);
  border-color: rgba(63, 185, 80, 0.2);
}

/* Collapse transition */
.collapse-enter-active,
.collapse-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}

.collapse-enter-from,
.collapse-leave-to {
  opacity: 0;
  max-height: 0;
}

.collapse-enter-to,
.collapse-leave-from {
  max-height: 400px;
}
</style>
