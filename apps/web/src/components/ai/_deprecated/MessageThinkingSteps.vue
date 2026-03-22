<script setup lang="ts">
/**
 * MessageThinkingSteps - Inline thinking steps for chat messages
 *
 * A simplified version of ThinkingStepsAccordion designed to display
 * inside a ChatMessage component. Shows thinking steps linked to a
 * specific message ID.
 *
 * Features:
 * - Compact timeline without collapsible header
 * - Auto-hides after all steps complete (with delay)
 * - Color-coded by step type
 * - Shows StreamingCodePreview when generating artifacts
 */
import { computed, ref, watch } from 'vue'
import { useAIStore, type ThinkingStep } from '@/stores/ai'
import {
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
} from 'lucide-vue-next'
import StreamingCodePreview from './StreamingCodePreview.vue'

const props = defineProps<{
  messageId: string
}>()

const store = useAIStore()
const visible = ref(true)

// Get thinking steps for this specific message
const steps = computed(() => store.getThinkingStepsForMessage(props.messageId))
const hasRunningStep = computed(() => steps.value.some((s) => s.status === 'running'))
const codePreview = computed(() => store.codePreview)

// Show code preview only during this message's processing
const showCodePreview = computed(() => {
  if (!codePreview.value.active) return false
  // Only show if this message has a running step
  return hasRunningStep.value
})

// Auto-hide after all steps complete
watch(
  () => hasRunningStep.value,
  (running) => {
    if (!running && steps.value.length > 0) {
      setTimeout(() => {
        visible.value = false
      }, 2000)
    }
  }
)

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
</script>

<template>
  <Transition name="fade-collapse">
    <div
      v-if="visible && steps.length > 0"
      class="message-thinking"
    >
      <div
        v-for="(step, index) in steps"
        :key="step.id"
        class="thinking-step"
        :class="{
          running: step.status === 'running',
          error: step.status === 'error',
        }"
      >
        <!-- Connector -->
        <div class="step-connector">
          <div
            class="connector-dot"
            :style="{ backgroundColor: getStepColor(step.type) }"
          >
            <Loader2
              v-if="step.status === 'running'"
              :size="6"
              class="dot-spinner"
            />
          </div>
          <div
            v-if="index < steps.length - 1 || showCodePreview"
            class="connector-line"
          />
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
            <span
              v-if="step.durationMs"
              class="step-duration"
            >
              {{ formatDuration(step.durationMs) }}
            </span>
            <XCircle
              v-if="step.status === 'error'"
              :size="12"
              class="error-icon"
            />
            <CheckCircle2
              v-else-if="step.status === 'complete'"
              :size="12"
              class="complete-icon"
            />
          </div>
        </div>
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
</template>

<style scoped>
.message-thinking {
  margin-bottom: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--chat-separator, rgba(48, 54, 61, 0.5));
}

/* ============================================
 * TIMELINE STEPS
 * ============================================ */

.thinking-step {
  display: flex;
  gap: 8px;
  min-height: 22px;
  padding-top: 4px;
}

.thinking-step:first-child {
  padding-top: 0;
}

/* Connector */
.step-connector {
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
  transition: box-shadow var(--transition-normal, 0.2s) ease;
}

.thinking-step.running .connector-dot {
  box-shadow: 0 0 0 3px var(--timeline-active-glow, rgba(88, 166, 255, 0.2));
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
  width: 1px;
  flex: 1;
  background: var(--timeline-line-color, rgba(110, 118, 129, 0.3));
  margin: 3px 0;
  min-height: 6px;
}

/* Step content */
.step-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.step-main {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.step-icon {
  flex-shrink: 0;
  width: 12px;
  height: 12px;
  min-width: 12px;
}

.step-description {
  font-size: 12px;
  color: var(--text-secondary, #8b949e);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.thinking-step.running .step-description {
  color: var(--text-primary, #e6edf3);
}

.step-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.step-duration {
  font-size: 10px;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  color: var(--text-muted, #6e7681);
}

.error-icon {
  color: var(--diff-remove-border, #f85149);
}

.complete-icon {
  color: var(--role-assistant-color, #3fb950);
  opacity: 0.6;
}

/* ============================================
 * ARTIFACT PREVIEW
 * ============================================ */

.artifact-preview {
  margin-top: 8px;
  margin-left: 12px; /* Align with step content after connector */
}

/* ============================================
 * TRANSITIONS
 * ============================================ */

.fade-collapse-enter-active,
.fade-collapse-leave-active {
  transition: all 0.3s ease;
  overflow: hidden;
}

.fade-collapse-enter-from,
.fade-collapse-leave-to {
  opacity: 0;
  max-height: 0;
  margin-bottom: 0;
  padding: 0;
}

.fade-collapse-enter-to,
.fade-collapse-leave-from {
  max-height: 300px;
}
</style>
