<script setup lang="ts">
/**
 * ToolCallCard — displays a tool invocation with status, name, and expandable I/O.
 */
import { ref, computed } from 'vue'
import { Loader2, Check, X, ChevronDown, ChevronRight } from 'lucide-vue-next'
import type { ToolCallInfo } from '@/stores/claudeCode'

const props = defineProps<{
  toolCall: ToolCallInfo
}>()

const expanded = ref(false)

const durationText = computed(() => {
  if (!props.toolCall.completedAt) return ''
  const ms = props.toolCall.completedAt - props.toolCall.startedAt
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
})

/** Human-readable tool name */
const displayName = computed(() => {
  const name = props.toolCall.name
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
})
</script>

<template>
  <div
    class="tool-card"
    :class="{ error: toolCall.status === 'error' }"
  >
    <div
      class="tool-header"
      @click="expanded = !expanded"
    >
      <div class="tool-status">
        <Loader2
          v-if="toolCall.status === 'running'"
          :size="12"
          class="spin"
        />
        <Check
          v-else-if="toolCall.status === 'completed'"
          :size="12"
          class="status-ok"
        />
        <X
          v-else
          :size="12"
          class="status-err"
        />
      </div>
      <span class="tool-name">{{ displayName }}</span>
      <span
        v-if="durationText"
        class="tool-duration"
        >{{ durationText }}</span
      >
      <component
        :is="expanded ? ChevronDown : ChevronRight"
        :size="12"
        class="tool-chevron"
      />
    </div>

    <div
      v-if="expanded"
      class="tool-details"
    >
      <div
        v-if="Object.keys(toolCall.input).length"
        class="tool-section"
      >
        <div class="section-label">Input</div>
        <pre class="section-content">{{ JSON.stringify(toolCall.input, null, 2) }}</pre>
      </div>
      <div
        v-if="toolCall.output"
        class="tool-section"
      >
        <div class="section-label">Output</div>
        <pre class="section-content">{{ toolCall.output.slice(0, 2000) }}</pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tool-card {
  border: 1px solid var(--border-secondary, #2a2a2a);
  border-radius: 6px;
  margin: 4px 0;
  overflow: hidden;
  font-size: 12px;
}

.tool-card.error {
  border-color: var(--error-border, #5c2020);
}

.tool-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  cursor: pointer;
  background: var(--bg-secondary, #1a1a1a);
}

.tool-header:hover {
  background: var(--bg-hover, #222);
}

.tool-status {
  display: flex;
  align-items: center;
}

.spin {
  animation: spin 1s linear infinite;
  color: var(--text-secondary, #8b8b8b);
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.status-ok {
  color: var(--accent-green, #4a9);
}

.status-err {
  color: var(--error-text, #e55);
}

.tool-name {
  flex: 1;
  font-weight: 500;
  color: var(--text-primary, #d4d4d4);
}

.tool-duration {
  color: var(--text-secondary, #8b8b8b);
}

.tool-chevron {
  color: var(--text-secondary, #8b8b8b);
}

.tool-details {
  border-top: 1px solid var(--border-secondary, #2a2a2a);
  padding: 8px 10px;
}

.tool-section + .tool-section {
  margin-top: 8px;
}

.section-label {
  font-size: 10px;
  text-transform: uppercase;
  color: var(--text-secondary, #8b8b8b);
  margin-bottom: 4px;
}

.section-content {
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  font-size: 11px;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--text-primary, #d4d4d4);
  max-height: 200px;
  overflow-y: auto;
  margin: 0;
}
</style>
