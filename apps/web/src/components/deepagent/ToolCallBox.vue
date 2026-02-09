<script setup lang="ts">
/**
 * ToolCallBox - Expandable card for individual tool calls.
 *
 * Collapsed: [StatusIcon] tool_name [chevron]
 * Expanded: Arguments section + Result section
 */
import { ref, computed } from 'vue'
import type { ResearchToolCall } from '@inkdown/shared/types'
import { CircleCheckBig, Loader2, AlertCircle, Terminal, ChevronDown } from 'lucide-vue-next'

const props = defineProps<{
  toolCall: ResearchToolCall
}>()

const expanded = ref(false)

const statusIcon = computed(() => {
  switch (props.toolCall.status) {
    case 'complete':
      return CircleCheckBig
    case 'running':
    case 'pending':
      return Loader2
    case 'error':
      return AlertCircle
    default:
      return Terminal
  }
})

const statusClass = computed(() => {
  switch (props.toolCall.status) {
    case 'complete':
      return 'status-complete'
    case 'running':
    case 'pending':
      return 'status-pending'
    case 'error':
      return 'status-error'
    default:
      return 'status-default'
  }
})

const argEntries = computed(() => Object.entries(props.toolCall.arguments || {}))

// Track which arg values are expanded
const expandedArgs = ref<Set<string>>(new Set())

function toggleArg(key: string) {
  if (expandedArgs.value.has(key)) {
    expandedArgs.value.delete(key)
  } else {
    expandedArgs.value.add(key)
  }
}

function formatArgValue(value: unknown): string {
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2)
}

function isLongValue(value: unknown): boolean {
  const str = formatArgValue(value)
  return str.length > 80 || str.includes('\n')
}
</script>

<template>
  <div
    class="tool-call-box"
    :class="{ expanded }"
  >
    <button
      class="tool-header"
      type="button"
      @click="expanded = !expanded"
    >
      <div class="tool-header-left">
        <component
          :is="statusIcon"
          :size="14"
          class="tool-status-icon"
          :class="[
            statusClass,
            { spin: toolCall.status === 'running' || toolCall.status === 'pending' },
          ]"
        />
        <span class="tool-name">{{ toolCall.toolName }}</span>
      </div>
      <ChevronDown
        :size="14"
        class="tool-chevron"
        :class="{ collapsed: !expanded }"
      />
    </button>

    <Transition name="collapse">
      <div
        v-if="expanded"
        class="tool-body"
      >
        <!-- Arguments -->
        <div
          v-if="argEntries.length > 0"
          class="tool-section"
        >
          <span class="section-header">ARGUMENTS</span>
          <div class="arg-list">
            <div
              v-for="[key, val] in argEntries"
              :key="key"
              class="arg-item"
            >
              <button
                v-if="isLongValue(val)"
                class="arg-key clickable"
                type="button"
                @click="toggleArg(key)"
              >
                <span class="arg-key-text">{{ key }}</span>
                <ChevronDown
                  :size="10"
                  class="arg-chevron"
                  :class="{ collapsed: !expandedArgs.has(key) }"
                />
              </button>
              <span
                v-else
                class="arg-key"
              >
                <span class="arg-key-text">{{ key }}</span>
              </span>
              <Transition name="collapse">
                <pre
                  v-if="!isLongValue(val) || expandedArgs.has(key)"
                  class="arg-value"
                  >{{ formatArgValue(val) }}</pre
                >
              </Transition>
            </div>
          </div>
        </div>

        <!-- Result -->
        <div
          v-if="toolCall.result"
          class="tool-section"
        >
          <span class="section-header">RESULT</span>
          <pre class="result-content">{{ toolCall.result }}</pre>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.tool-call-box {
  border-radius: 8px;
  overflow: hidden;
  transition: background-color 0.15s ease;
}

.tool-call-box:hover,
.tool-call-box.expanded {
  background: rgba(255, 255, 255, 0.04);
}

.tool-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 8px 12px;
  background: transparent;
  border: none;
  cursor: pointer;
}

.tool-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tool-status-icon {
  flex-shrink: 0;
}

.tool-status-icon.status-complete {
  color: #3fb950;
}

.tool-status-icon.status-pending {
  color: rgba(139, 148, 158, 0.6);
}

.tool-status-icon.status-error {
  color: #f85149;
}

.tool-status-icon.status-default {
  color: rgba(139, 148, 158, 0.6);
}

.tool-name {
  font-size: 13px;
  font-weight: 500;
  font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, monospace;
  color: var(--text-color, #e6edf3);
}

.tool-chevron {
  color: rgba(139, 148, 158, 0.6);
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.tool-chevron.collapsed {
  transform: rotate(-90deg);
}

/* Body */
.tool-body {
  padding: 0 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tool-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.section-header {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(139, 148, 158, 0.6);
}

/* Arguments */
.arg-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.arg-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.arg-key {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.arg-key.clickable {
  cursor: pointer;
  background: none;
  border: none;
  padding: 0;
  text-align: left;
}

.arg-key-text {
  font-size: 11px;
  font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, monospace;
  font-weight: 500;
  color: var(--text-color-secondary, #8b949e);
  background: rgba(255, 255, 255, 0.06);
  padding: 1px 6px;
  border-radius: 4px;
}

.arg-chevron {
  color: rgba(139, 148, 158, 0.6);
  transition: transform 0.15s ease;
}

.arg-chevron.collapsed {
  transform: rotate(-90deg);
}

.arg-value {
  font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, monospace;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-color-secondary, #8b949e);
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--border-color, #30363d);
  border-radius: 6px;
  padding: 8px 10px;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow-y: auto;
}

/* Result */
.result-content {
  font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, monospace;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-color-secondary, #8b949e);
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--border-color, #30363d);
  border-radius: 6px;
  padding: 8px 10px;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 300px;
  overflow-y: auto;
}

/* Animations */
.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

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
  max-height: 600px;
}
</style>
