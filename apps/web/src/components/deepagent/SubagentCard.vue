<script setup lang="ts">
/**
 * SubagentCard - Expandable card showing sub-agent input/output.
 *
 * Collapsible with chevron toggle.
 * Status badge: running=blue spinner, completed=green check, error=red x.
 */
import { ref } from 'vue'
import type { SubagentInfo } from '@inkdown/shared/types'
import { ChevronDown, Loader2, CheckCircle, XCircle, Bot } from 'lucide-vue-next'

defineProps<{
  subagent: SubagentInfo
}>()

const expanded = ref(false)
</script>

<template>
  <div class="subagent-card" :class="[subagent.status]">
    <button class="card-header" type="button" @click="expanded = !expanded">
      <div class="header-left">
        <Bot :size="14" class="agent-icon" />
        <span class="agent-name">{{ subagent.name }}</span>
        <span
          class="status-badge"
          :class="[subagent.status]"
        >
          <Loader2 v-if="subagent.status === 'running'" :size="10" class="spin" />
          <CheckCircle v-else-if="subagent.status === 'completed'" :size="10" />
          <XCircle v-else-if="subagent.status === 'error'" :size="10" />
          <span class="badge-text">{{ subagent.status }}</span>
        </span>
      </div>
      <ChevronDown :size="14" class="chevron" :class="{ collapsed: !expanded }" />
    </button>

    <Transition name="collapse">
      <div v-if="expanded" class="card-body">
        <p v-if="subagent.description" class="agent-description">{{ subagent.description }}</p>

        <div v-if="subagent.input" class="section">
          <span class="section-label">Input</span>
          <pre class="section-content">{{ subagent.input }}</pre>
        </div>

        <div v-if="subagent.output" class="section">
          <span class="section-label">Output</span>
          <pre class="section-content output">{{ subagent.output }}</pre>
        </div>

        <div v-if="subagent.status === 'running' && !subagent.output" class="running-hint">
          <Loader2 :size="14" class="spin" />
          <span>Agent is working...</span>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.subagent-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border-color, #30363d);
  border-radius: 10px;
  overflow: hidden;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.subagent-card.running {
  border-color: rgba(88, 166, 255, 0.3);
  box-shadow: 0 0 0 1px rgba(88, 166, 255, 0.1);
}

.subagent-card.error {
  border-color: rgba(248, 81, 73, 0.3);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 10px 14px;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background 0.15s ease;
}

.card-header:hover {
  background: rgba(255, 255, 255, 0.04);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.agent-icon {
  color: var(--text-color-secondary, #8b949e);
  flex-shrink: 0;
}

.subagent-card.running .agent-icon {
  color: #58a6ff;
}

.subagent-card.completed .agent-icon {
  color: #3fb950;
}

.agent-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-color, #e6edf3);
}

/* Status badge */
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 500;
}

.status-badge.running {
  background: rgba(88, 166, 255, 0.1);
  color: #58a6ff;
}

.status-badge.completed {
  background: rgba(63, 185, 80, 0.1);
  color: #3fb950;
}

.status-badge.error {
  background: rgba(248, 81, 73, 0.1);
  color: #f85149;
}

.badge-text {
  text-transform: capitalize;
}

.chevron {
  color: rgba(139, 148, 158, 0.6);
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.chevron.collapsed {
  transform: rotate(-90deg);
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Body */
.card-body {
  padding: 0 14px 14px;
  border-top: 1px solid var(--border-color, #30363d);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.agent-description {
  margin: 12px 0 0;
  font-size: 12px;
  color: var(--text-color-secondary, #8b949e);
  line-height: 1.5;
}

.section {
  margin-top: 4px;
}

.section:first-child {
  margin-top: 12px;
}

.section-label {
  display: block;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgba(139, 148, 158, 0.6);
  margin-bottom: 6px;
}

.section-content {
  font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, monospace;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-color-secondary, #8b949e);
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--border-color, #30363d);
  border-radius: 6px;
  padding: 10px 12px;
  margin: 0;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow-y: auto;
}

.section-content.output {
  color: var(--text-color, #e6edf3);
  background: rgba(63, 185, 80, 0.05);
  border-color: rgba(63, 185, 80, 0.2);
}

.running-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 0 0;
  font-size: 12px;
  color: #58a6ff;
}

/* Scrollbar */
.section-content::-webkit-scrollbar {
  width: 4px;
  height: 4px;
}

.section-content::-webkit-scrollbar-track {
  background: transparent;
}

.section-content::-webkit-scrollbar-thumb {
  background: var(--border-color, #30363d);
  border-radius: 2px;
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
  padding-top: 0;
  padding-bottom: 0;
}

.collapse-enter-to,
.collapse-leave-from {
  max-height: 600px;
}
</style>
