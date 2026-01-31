<script setup lang="ts">
/**
 * ThinkingStepsAccordion - Timeline Design
 *
 * Features:
 * - Vertical timeline with connected dots
 * - Current step prominent with pulse animation
 * - Completed steps as compact items
 * - Auto-collapse when all steps complete
 * - Color-coded by step type
 */
import { ref, computed, watch } from 'vue'
import { useAIStore, type ThinkingStep } from '@/stores/ai'
import {
  ChevronDown,
  Loader2,
  CheckCircle2,
  XCircle,
  Brain,
  Search,
  BookOpen,
  PenLine,
  Database,
  Wrench,
  Microscope,
  Compass,
  Sparkles,
  X,
} from 'lucide-vue-next'

const store = useAIStore()

// Local state
const expanded = ref(true)

// Computed
const steps = computed(() => store.thinkingSteps)
const hasSteps = computed(() => steps.value.length > 0)
const hasRunningStep = computed(() => steps.value.some((s) => s.status === 'running'))
const allComplete = computed(() => hasSteps.value && !hasRunningStep.value)
const isProcessing = computed(() => store.isProcessing)

// Auto-expand when new step arrives
watch(
  () => steps.value.length,
  (newLen, oldLen) => {
    if (newLen > oldLen) {
      expanded.value = true
    }
  }
)

// Auto-collapse when all complete (after delay)
watch(allComplete, (complete) => {
  if (complete && hasSteps.value) {
    setTimeout(() => {
      // Only collapse if still complete
      if (store.thinkingSteps.every((s) => s.status !== 'running')) {
        expanded.value = false
      }
    }, 2000)
  }
})

// Get icon for step type
function getStepIcon(type: ThinkingStep['type']) {
  switch (type) {
    case 'thought':
      return Brain
    case 'search':
      return Search
    case 'read':
      return BookOpen
    case 'write':
      return PenLine
    case 'create':
      return Database
    case 'tool':
      return Wrench
    case 'analyze':
      return Microscope
    case 'explore':
      return Compass
    case 'reasoning':
      return Sparkles
    default:
      return Brain
  }
}

// Get color for step type
function getStepColor(type: ThinkingStep['type']): string {
  switch (type) {
    case 'thought':
      return '#a78bfa' // Purple
    case 'search':
      return '#60a5fa' // Blue
    case 'read':
      return '#34d399' // Green
    case 'write':
      return '#fbbf24' // Amber
    case 'create':
      return '#f472b6' // Pink
    case 'tool':
      return '#fb923c' // Orange
    case 'analyze':
      return '#22d3ee' // Cyan
    case 'explore':
      return '#a3e635' // Lime
    case 'reasoning':
      return '#c084fc' // Purple variant
    default:
      return '#8b949e' // Gray
  }
}

function formatDuration(ms: number | undefined): string {
  if (!ms) return ''
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function toggleExpanded() {
  expanded.value = !expanded.value
}

function clearSteps() {
  store.clearThinkingSteps()
}
</script>

<template>
  <div
    v-if="hasSteps || isProcessing"
    class="thinking-timeline"
    :class="{ collapsed: !expanded, complete: allComplete }"
  >
    <!-- Header -->
    <button class="timeline-header" @click="toggleExpanded" type="button">
      <div class="header-left">
        <div class="header-indicator">
          <div v-if="hasRunningStep" class="pulse-ring" />
          <div class="indicator-dot" :class="{ active: hasRunningStep, complete: allComplete }" />
        </div>
        <span class="header-text">
          {{ hasRunningStep ? 'Thinking...' : `${steps.length} step${steps.length !== 1 ? 's' : ''} completed` }}
        </span>
      </div>
      <div class="header-right">
        <button
          v-if="!isProcessing && hasSteps"
          class="clear-btn"
          title="Clear steps"
          @click.stop="clearSteps"
          type="button"
        >
          <X :size="12" />
        </button>
        <ChevronDown :size="14" class="chevron" :class="{ rotated: !expanded }" />
      </div>
    </button>

    <!-- Timeline steps -->
    <Transition name="expand">
      <div v-if="expanded" class="timeline-body">
        <div
          v-for="(step, index) in steps"
          :key="step.id"
          class="timeline-step"
          :class="{
            running: step.status === 'running',
            error: step.status === 'error',
            last: index === steps.length - 1,
          }"
        >
          <!-- Connector -->
          <div class="step-connector">
            <div
              class="connector-dot"
              :style="{ backgroundColor: getStepColor(step.type) }"
            >
              <Loader2 v-if="step.status === 'running'" :size="8" class="dot-spinner" />
            </div>
            <div v-if="index < steps.length - 1" class="connector-line" />
          </div>

          <!-- Step content -->
          <div class="step-content">
            <div class="step-main">
              <component
                :is="getStepIcon(step.type)"
                :size="12"
                class="step-icon"
                :style="{ color: getStepColor(step.type) }"
              />
              <span class="step-description">{{ step.description }}</span>
            </div>
            <div class="step-meta">
              <span v-if="step.durationMs" class="step-duration">
                {{ formatDuration(step.durationMs) }}
              </span>
              <XCircle v-if="step.status === 'error'" :size="12" class="error-icon" />
              <CheckCircle2
                v-else-if="step.status === 'complete'"
                :size="12"
                class="complete-icon"
              />
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.thinking-timeline {
  background: var(--chat-card-bg);
  border: 1px solid var(--chat-card-border);
  border-radius: 12px;
  margin-bottom: 16px;
  overflow: hidden;
  transition: all var(--transition-normal) ease;
}

.thinking-timeline.complete {
  border-color: rgba(63, 185, 80, 0.3);
}

/* ============================================
 * HEADER
 * ============================================ */

.timeline-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 12px 14px;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background var(--transition-fast) ease;
}

.timeline-header:hover {
  background: rgba(255, 255, 255, 0.02);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.header-indicator {
  position: relative;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.indicator-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-muted);
  transition: all var(--transition-normal) ease;
}

.indicator-dot.active {
  background: var(--stream-cursor);
}

.indicator-dot.complete {
  background: var(--role-assistant-color);
}

.pulse-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 2px solid var(--stream-cursor);
  animation: pulse 1.5s ease-out infinite;
}

@keyframes pulse {
  0% {
    transform: scale(0.8);
    opacity: 1;
  }
  100% {
    transform: scale(1.8);
    opacity: 0;
  }
}

.header-text {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.clear-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--text-muted);
  cursor: pointer;
  transition: all var(--transition-fast) ease;
}

.clear-btn:hover {
  background: var(--surface-3);
  color: var(--text-primary);
}

.chevron {
  color: var(--text-muted);
  transition: transform var(--transition-fast) ease;
}

.chevron.rotated {
  transform: rotate(-90deg);
}

/* ============================================
 * TIMELINE BODY
 * ============================================ */

.timeline-body {
  padding: 0 14px 14px 14px;
  border-top: 1px solid var(--border-subtle);
}

.timeline-step {
  display: flex;
  gap: 12px;
  min-height: 36px;
  padding-top: 12px;
}

.timeline-step:first-child {
  padding-top: 14px;
}

/* Connector */
.step-connector {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 16px;
  flex-shrink: 0;
}

.connector-dot {
  width: var(--timeline-dot-size);
  height: var(--timeline-dot-size);
  border-radius: 50%;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: box-shadow var(--transition-normal) ease;
}

.timeline-step.running .connector-dot {
  box-shadow: 0 0 0 4px var(--timeline-active-glow);
}

.dot-spinner {
  color: white;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.connector-line {
  width: 2px;
  flex: 1;
  background: var(--timeline-line-color);
  margin: 6px 0;
  min-height: 12px;
}

/* Step content */
.step-content {
  flex: 1;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.step-main {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.step-icon {
  flex-shrink: 0;
}

.step-description {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.timeline-step.running .step-description {
  color: var(--text-primary);
}

.step-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.step-duration {
  font-size: 10px;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  color: var(--text-muted);
}

.error-icon {
  color: var(--diff-remove-border);
}

.complete-icon {
  color: var(--role-assistant-color);
  opacity: 0.6;
}

/* ============================================
 * TRANSITIONS
 * ============================================ */

.expand-enter-active,
.expand-leave-active {
  transition: all var(--transition-normal) var(--ease-out-expo);
  overflow: hidden;
}

.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  max-height: 0;
}

.expand-enter-to,
.expand-leave-from {
  max-height: 400px;
}
</style>
