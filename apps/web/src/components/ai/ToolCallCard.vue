<script setup lang="ts">
/**
 * ToolCallCard - Inline collapsible card for tool executions
 *
 * Features:
 * - Compact card showing tool execution
 * - Icon based on tool type
 * - Shows arguments in collapsed view
 * - Expandable to show full result
 * - Loading spinner during execution
 * - Success/error indication
 */
import { ref, computed } from 'vue'
import type { ToolCall } from '@/stores/ai'
import {
  ChevronDown,
  Loader2,
  Search,
  BookOpen,
  PenLine,
  Database,
  Wrench,
  Microscope,
  Compass,
  Brain,
  Globe,
  FileText,
  Folder,
  Code,
  Terminal,
  Settings,
} from 'lucide-vue-next'
import StatusBadge from './shared/StatusBadge.vue'

const props = defineProps<{
  tool: ToolCall
}>()

const expanded = ref(false)

// Determine if tool is currently running
const isRunning = computed(() => props.tool.status === 'running')

// Map tool name to appropriate icon
const toolIcon = computed(() => {
  const name = props.tool.toolName.toLowerCase()

  // Search tools
  if (name.includes('search') || name.includes('find') || name.includes('query')) {
    return Search
  }
  // Read tools
  if (name.includes('read') || name.includes('get') || name.includes('fetch')) {
    return BookOpen
  }
  // Write tools
  if (name.includes('write') || name.includes('edit') || name.includes('update')) {
    return PenLine
  }
  // Database tools
  if (name.includes('database') || name.includes('db') || name.includes('table')) {
    return Database
  }
  // Web tools
  if (name.includes('web') || name.includes('browse') || name.includes('url')) {
    return Globe
  }
  // File tools
  if (name.includes('file') || name.includes('document')) {
    return FileText
  }
  // Folder tools
  if (name.includes('folder') || name.includes('directory')) {
    return Folder
  }
  // Code tools
  if (name.includes('code') || name.includes('execute') || name.includes('run')) {
    return Code
  }
  // Terminal tools
  if (name.includes('terminal') || name.includes('shell') || name.includes('command')) {
    return Terminal
  }
  // Analysis tools
  if (name.includes('analyze') || name.includes('analysis')) {
    return Microscope
  }
  // Exploration tools
  if (name.includes('explore') || name.includes('navigate')) {
    return Compass
  }
  // Settings tools
  if (name.includes('setting') || name.includes('config')) {
    return Settings
  }
  // Thinking tools
  if (name.includes('think') || name.includes('reason')) {
    return Brain
  }

  // Default to wrench for generic tools
  return Wrench
})

// Format tool name for display
const displayName = computed(() => {
  // Convert snake_case or camelCase to Title Case with spaces
  return props.tool.toolName
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^\s/, '')
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
    .trim()
})

// Check if tool has arguments
const hasArgs = computed(() => {
  return props.tool.arguments && Object.keys(props.tool.arguments).length > 0
})

// Format arguments for display
const formattedArgs = computed(() => {
  if (!hasArgs.value) return ''
  try {
    return JSON.stringify(props.tool.arguments, null, 2)
  } catch {
    return String(props.tool.arguments)
  }
})

// Format result for display
const formattedResult = computed(() => {
  if (!props.tool.result) return ''
  try {
    if (typeof props.tool.result === 'string') {
      return props.tool.result
    }
    return JSON.stringify(props.tool.result, null, 2)
  } catch {
    return String(props.tool.result)
  }
})

// Toggle expanded state
function toggle() {
  expanded.value = !expanded.value
}
</script>

<template>
  <div
    class="tool-card"
    :class="{ running: isRunning, expanded, [tool.status]: true }"
  >
    <button
      class="tool-header"
      type="button"
      @click="toggle"
    >
      <div class="tool-info">
        <component
          :is="toolIcon"
          :size="14"
          class="tool-icon"
        />
        <span class="tool-name">{{ displayName }}</span>
      </div>
      <div class="tool-status">
        <Loader2
          v-if="isRunning"
          :size="12"
          class="spin"
        />
        <StatusBadge
          v-else
          :status="tool.status"
        />
        <ChevronDown
          :size="14"
          class="chevron"
          :class="{ rotated: !expanded }"
        />
      </div>
    </button>

    <Transition name="collapse">
      <div
        v-if="expanded"
        class="tool-body"
      >
        <div
          v-if="hasArgs"
          class="tool-section"
        >
          <span class="section-label">Input</span>
          <pre class="tool-code">{{ formattedArgs }}</pre>
        </div>
        <div
          v-if="tool.result"
          class="tool-section"
        >
          <span class="section-label">Output</span>
          <pre class="tool-code result">{{ formattedResult }}</pre>
        </div>
        <div
          v-if="tool.status === 'error' && !tool.result"
          class="tool-section error"
        >
          <span class="section-label">Error</span>
          <span class="error-text">Tool execution failed</span>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.tool-card {
  background: var(--tool-card-bg);
  border: 1px solid var(--tool-card-border);
  border-radius: 10px;
  overflow: hidden;
  transition:
    border-color var(--transition-normal) ease,
    box-shadow var(--transition-normal) ease;
}

.tool-card:hover {
  border-color: var(--tool-card-border-hover);
}

.tool-card.running {
  border-color: var(--tool-running-border);
  box-shadow: 0 0 0 1px var(--tool-running-glow);
}

.tool-card.error {
  border-color: var(--diff-remove-border);
}

/* Header */
.tool-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 10px 14px;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background var(--transition-fast) ease;
}

.tool-header:hover {
  background: rgba(255, 255, 255, 0.02);
}

.tool-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tool-icon {
  color: var(--text-muted);
  flex-shrink: 0;
}

.tool-card.running .tool-icon {
  color: var(--stream-cursor);
}

.tool-card.complete .tool-icon {
  color: var(--role-assistant-color);
}

.tool-card.error .tool-icon {
  color: var(--diff-remove-border);
}

.tool-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}

.tool-status {
  display: flex;
  align-items: center;
  gap: 8px;
}

.chevron {
  color: var(--text-muted);
  transition: transform var(--transition-fast) ease;
}

.chevron.rotated {
  transform: rotate(-90deg);
}

.spin {
  animation: spin 1s linear infinite;
  color: var(--stream-cursor);
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Body */
.tool-body {
  padding: 0 14px 14px;
  border-top: 1px solid var(--border-subtle);
  margin-top: 0;
}

.tool-section {
  margin-top: 12px;
}

.tool-section:first-child {
  margin-top: 14px;
}

.section-label {
  display: block;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
  margin-bottom: 6px;
}

.tool-code {
  font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-secondary);
  background: var(--surface-1);
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  padding: 10px 12px;
  margin: 0;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow-y: auto;
}

.tool-code.result {
  color: var(--text-primary);
  background: rgba(63, 185, 80, 0.05);
  border-color: rgba(63, 185, 80, 0.2);
}

.tool-section.error .error-text {
  font-size: 12px;
  color: var(--diff-remove-border);
}

/* Collapse transition */
.collapse-enter-active,
.collapse-leave-active {
  transition: all var(--transition-normal) var(--ease-out-expo);
  overflow: hidden;
}

.collapse-enter-from,
.collapse-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}

.collapse-enter-to,
.collapse-leave-from {
  max-height: 500px;
}

/* Scrollbar */
.tool-code::-webkit-scrollbar {
  width: 4px;
  height: 4px;
}

.tool-code::-webkit-scrollbar-track {
  background: transparent;
}

.tool-code::-webkit-scrollbar-thumb {
  background: var(--border-subtle);
  border-radius: 2px;
}
</style>
