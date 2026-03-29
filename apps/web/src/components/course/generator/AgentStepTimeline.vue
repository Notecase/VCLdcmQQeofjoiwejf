<script setup lang="ts">
import { computed, ref } from 'vue'
import { CheckCircle2, Loader2, Circle, ChevronDown, ChevronRight } from 'lucide-vue-next'
import type { CourseAgentStep, GenerationStageType } from '@inkdown/shared/types'

const props = defineProps<{
  steps: CourseAgentStep[]
  currentStage: GenerationStageType
}>()

const expandedSteps = ref<Set<string>>(new Set())

interface DisplayStep {
  id: string
  name: string
  description: string
  status: 'pending' | 'running' | 'completed' | 'error'
  thinkingText?: string
}

const defaultSteps: DisplayStep[] = [
  { id: '1', name: 'Deep Research', description: 'Researching topic with AI', status: 'pending' },
  {
    id: '2',
    name: 'Knowledge Indexing',
    description: 'Building knowledge base',
    status: 'pending',
  },
  { id: '3', name: 'Topic Analysis', description: 'Analyzing key concepts', status: 'pending' },
  {
    id: '4',
    name: 'Outline Generation',
    description: 'Creating course structure',
    status: 'pending',
  },
  { id: '5', name: 'Outline Review', description: 'Awaiting your approval', status: 'pending' },
  {
    id: '6',
    name: 'Content Generation',
    description: 'Writing lessons & practice',
    status: 'pending',
  },
  { id: '7', name: 'Multimedia', description: 'Matching videos & slides', status: 'pending' },
  { id: '8', name: 'Final Assembly', description: 'Building final course', status: 'pending' },
]

const stageToStepMap: Record<GenerationStageType, number> = {
  research: 0,
  indexing: 1,
  analysis: 2,
  planning: 3,
  approval: 4,
  content: 5,
  multimedia: 6,
  review: 7,
  complete: 8,
}

const displaySteps = computed<DisplayStep[]>(() => {
  if (props.steps.length > 0) {
    return props.steps.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      status: s.status,
      thinkingText: s.thinkingText,
    }))
  }

  const activeIdx = stageToStepMap[props.currentStage] ?? 0
  return defaultSteps.map((step, idx) => ({
    ...step,
    status:
      idx < activeIdx
        ? ('completed' as const)
        : idx === activeIdx
          ? ('running' as const)
          : ('pending' as const),
  }))
})

function toggleStep(id: string) {
  if (expandedSteps.value.has(id)) {
    expandedSteps.value.delete(id)
  } else {
    expandedSteps.value.add(id)
  }
}
</script>

<template>
  <div class="agent-timeline">
    <div
      v-for="(step, idx) in displaySteps"
      :key="step.id"
      class="timeline-item"
      :class="step.status"
    >
      <!-- Connector line -->
      <div class="timeline-rail">
        <div
          class="timeline-dot"
          :class="step.status"
        >
          <CheckCircle2
            v-if="step.status === 'completed'"
            :size="16"
          />
          <Loader2
            v-else-if="step.status === 'running'"
            :size="16"
            class="spinning"
          />
          <Circle
            v-else
            :size="16"
          />
        </div>
        <div
          v-if="idx < displaySteps.length - 1"
          class="timeline-line"
          :class="step.status"
        />
      </div>

      <!-- Step content -->
      <div
        class="timeline-content"
        :class="{ expandable: !!step.thinkingText }"
        @click="step.thinkingText ? toggleStep(step.id) : undefined"
      >
        <div class="step-header">
          <span class="step-name">{{ step.name }}</span>
          <template v-if="step.thinkingText">
            <ChevronDown
              v-if="expandedSteps.has(step.id)"
              :size="14"
              class="expand-icon"
            />
            <ChevronRight
              v-else
              :size="14"
              class="expand-icon"
            />
          </template>
        </div>
        <span class="step-desc">{{ step.description }}</span>

        <!-- Expanded thinking text -->
        <div
          v-if="step.thinkingText && expandedSteps.has(step.id)"
          class="step-thinking"
        >
          {{ step.thinkingText }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.agent-timeline {
  display: flex;
  flex-direction: column;
}

.timeline-item {
  display: flex;
  gap: 12px;
  min-height: 48px;
}

.timeline-rail {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 24px;
  flex-shrink: 0;
}

.timeline-dot {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  flex-shrink: 0;
  transition: all var(--transition-normal, 250ms ease);
}

.timeline-dot.completed {
  color: var(--status-completed, #22c55e);
}

.timeline-dot.running {
  color: var(--status-running, #f59e0b);
  background: var(--sec-accent-bg, rgba(245, 158, 11, 0.1));
  animation: pulse-glow 2s ease-in-out infinite;
}

.timeline-dot.pending {
  color: var(--status-pending, #6b7280);
}

.timeline-dot.error {
  color: var(--status-error, #ef4444);
}

.timeline-line {
  width: 2px;
  flex: 1;
  min-height: 16px;
  background: var(--glass-border, rgba(255, 255, 255, 0.08));
  transition: background var(--transition-normal, 250ms ease);
}

.timeline-line.completed {
  background: var(--status-completed, #22c55e);
}

.timeline-line.running {
  background: linear-gradient(
    to bottom,
    var(--status-running, #f59e0b),
    var(--glass-border, rgba(255, 255, 255, 0.08))
  );
}

.timeline-content {
  flex: 1;
  padding-bottom: 16px;
  min-width: 0;
}

.timeline-content.expandable {
  cursor: pointer;
}

.step-header {
  display: flex;
  align-items: center;
  gap: 6px;
}

.step-name {
  font-size: 13px;
  font-weight: 600;
  line-height: 24px;
  transition: color var(--transition-fast, 150ms ease);
}

.timeline-item.completed .step-name {
  color: var(--status-completed, #22c55e);
}

.timeline-item.running .step-name {
  color: var(--status-running, #f59e0b);
}

.timeline-item.pending .step-name {
  color: var(--text-color-secondary, #64748b);
}

.timeline-item.error .step-name {
  color: var(--status-error, #ef4444);
}

.expand-icon {
  color: var(--text-color-secondary, #64748b);
}

.step-desc {
  display: block;
  font-size: 12px;
  color: var(--text-color-secondary, #94a3b8);
  line-height: 1.4;
  margin-top: 2px;
}

.step-thinking {
  margin-top: 8px;
  padding: 10px 12px;
  border-radius: var(--radius-sm, 6px);
  background: var(--glass-bg, rgba(30, 30, 30, 0.6));
  backdrop-filter: blur(var(--glass-blur, 12px));
  -webkit-backdrop-filter: blur(var(--glass-blur, 12px));
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-color-secondary, #94a3b8);
  white-space: pre-wrap;
  max-height: 160px;
  overflow-y: auto;
}

.step-thinking::-webkit-scrollbar {
  width: 4px;
}

.step-thinking::-webkit-scrollbar-thumb {
  background: var(--glass-border, rgba(255, 255, 255, 0.08));
  border-radius: 2px;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.spinning {
  animation: spin 1s linear infinite;
}
</style>
