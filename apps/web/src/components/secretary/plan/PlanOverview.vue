<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ChevronDown, ChevronUp } from 'lucide-vue-next'
import { renderMathMarkdown } from '@/utils/mathRenderer'
import type { LearningRoadmap } from '@inkdown/shared/types'

const props = defineProps<{
  plan: LearningRoadmap
  instructions: string
  roadmapContent: string
}>()

const isExpanded = ref(false)

/** Strip outer markdown code fences (```...```) that some AI generations include */
function stripOuterCodeFence(text: string): string {
  const trimmed = text.trim()
  const m = trimmed.match(/^```\w*\n([\s\S]*?)\n```\s*$/)
  return m ? m[1] : trimmed
}

const renderedRoadmap = computed(() => {
  if (!props.roadmapContent) return ''
  return renderMathMarkdown(stripOuterCodeFence(props.roadmapContent))
})

const emit = defineEmits<{
  'update:instructions': [content: string]
}>()

const localInstructions = ref(props.instructions)
let saveTimer: ReturnType<typeof setTimeout> | null = null

watch(
  () => props.instructions,
  (val) => {
    localInstructions.value = val
  }
)

function onInstructionsInput() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    emit('update:instructions', localInstructions.value)
  }, 1000)
}

function onInstructionsBlur() {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  if (localInstructions.value !== props.instructions) {
    emit('update:instructions', localInstructions.value)
  }
}

interface PhaseInfo {
  name: string
  lessonStart: number
  lessonEnd: number
  status: 'completed' | 'active' | 'upcoming'
}

const phases = computed<PhaseInfo[]>(() => {
  const content = props.roadmapContent ? stripOuterCodeFence(props.roadmapContent) : ''
  if (!content) return []

  const result: PhaseInfo[] = []
  const completed = props.plan.progress?.completedLessons ?? 0

  for (const line of content.split('\n')) {
    const m = line
      .trim()
      .match(/^##\s+(?:Phase\s+\d+:\s*)?(.+?)\s*\((?:Lessons?|Days?)\s+(\d+)\s*[-–]\s*(\d+)\)\s*$/)
    if (m) {
      const lessonStart = parseInt(m[2], 10)
      const lessonEnd = parseInt(m[3], 10)
      let status: PhaseInfo['status'] = 'upcoming'
      if (completed >= lessonEnd) status = 'completed'
      else if (completed >= lessonStart - 1) status = 'active'
      result.push({ name: m[1].trim(), lessonStart, lessonEnd, status })
    }
  }
  return result
})

const scheduleLine = computed(() => {
  const parts: string[] = []
  const days = props.plan.schedule?.studyDays
  if (days?.length) {
    parts.push(days.includes('Daily') ? 'Daily' : days.join(', '))
  }
  if (props.plan.schedule?.hoursPerDay) {
    parts.push(`${props.plan.schedule.hoursPerDay}h/lesson`)
  }
  if (phases.value.length) {
    parts.push(`${phases.value.length} phases`)
  }
  return parts.join(' · ')
})
</script>

<template>
  <section class="plan-overview">
    <div class="overview-grid">
      <div class="overview-left">
        <div class="description-header">
          <span class="section-label">Description</span>
          <button
            v-if="roadmapContent"
            class="expand-toggle"
            @click="isExpanded = !isExpanded"
          >
            <component
              :is="isExpanded ? ChevronUp : ChevronDown"
              :size="14"
            />
            {{ isExpanded ? 'Collapse' : 'Show full plan' }}
          </button>
        </div>

        <div
          v-if="!isExpanded"
          class="description-summary"
        >
          <span
            v-if="scheduleLine"
            class="schedule-line"
            >{{ scheduleLine }}</span
          >

          <div
            v-if="phases.length"
            class="phase-map"
          >
            <div
              v-for="(phase, i) in phases"
              :key="i"
              class="phase-row"
              :class="'phase-' + phase.status"
            >
              <span class="phase-index">{{ i + 1 }}</span>
              <span class="phase-name">{{ phase.name }}</span>
              <span class="phase-indicator">
                {{ phase.status === 'completed' ? '✓' : phase.status === 'active' ? '●' : '' }}
              </span>
              <span class="phase-range">Lessons {{ phase.lessonStart }}–{{ phase.lessonEnd }}</span>
            </div>
          </div>
          <p
            v-else
            class="phase-fallback"
          >
            {{ plan.name }}
          </p>

          <div
            v-if="plan.currentTopic"
            class="current-now"
          >
            <span class="now-label">Now:</span>
            <span class="now-value">{{ plan.currentTopic }}</span>
          </div>
        </div>

        <div
          v-else
          class="roadmap-full"
          v-html="renderedRoadmap"
        />
      </div>

      <div class="overview-right">
        <span class="section-label">Instructions</span>
        <textarea
          v-model="localInstructions"
          class="instructions-editor"
          placeholder="Add formatting rules, tone, depth, audience, equations style... The AI reads these whenever generating content for this plan."
          rows="8"
          @input="onInstructionsInput"
          @blur="onInstructionsBlur"
        />
        <span class="instructions-hint">Auto-saves on edit</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.plan-overview {
  display: flex;
  flex-direction: column;
}

.section-label {
  font-size: var(--pw-label-size, 12px);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-color-secondary, #94a3b8);
  display: block;
  margin-bottom: 10px;
}

.overview-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 32px;
}

@media (max-width: 700px) {
  .overview-grid {
    grid-template-columns: 1fr;
    gap: 24px;
  }
}

.description-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.description-header .section-label {
  margin-bottom: 0;
}

.expand-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border: 1px solid var(--sec-glass-border);
  border-radius: 6px;
  background: transparent;
  color: var(--text-color-secondary, #94a3b8);
  font-size: 11px;
  cursor: pointer;
  transition: all var(--sec-transition-fast) ease;
}

.expand-toggle:hover {
  border-color: var(--sec-glass-border-hover);
  color: var(--text-color, #e2e8f0);
}

.overview-left {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.roadmap-full {
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-color, #e2e8f0);
  max-height: 500px;
  overflow-y: auto;
  overflow-x: hidden;
  word-break: break-word;
  overflow-wrap: anywhere;
  padding-right: 8px;
  background: transparent;
}

.roadmap-full :deep(h1),
.roadmap-full :deep(h2),
.roadmap-full :deep(h3) {
  color: var(--text-color, #e2e8f0);
  margin-top: 16px;
  margin-bottom: 8px;
}

.roadmap-full :deep(h1) {
  font-size: 18px;
}
.roadmap-full :deep(h2) {
  font-size: 15px;
}
.roadmap-full :deep(h3) {
  font-size: 14px;
}

.roadmap-full :deep(ul),
.roadmap-full :deep(ol) {
  padding-left: 20px;
  margin: 8px 0;
}

.roadmap-full :deep(li) {
  margin-bottom: 4px;
}

.roadmap-full :deep(strong) {
  color: var(--sec-primary, #10b981);
}

.roadmap-full :deep(pre) {
  background: var(--sec-surface-1, rgba(255, 255, 255, 0.03));
  border-radius: 6px;
  padding: 12px;
  overflow-x: auto;
}

.roadmap-full :deep(pre code) {
  background: transparent;
}

.description-summary {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.schedule-line {
  font-size: 12px;
  color: var(--text-color-secondary, #94a3b8);
  letter-spacing: 0.01em;
}

.phase-map {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.phase-row {
  display: grid;
  grid-template-columns: 20px 1fr auto auto;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
  font-size: 13px;
}

.phase-index {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: 11px;
  font-weight: 600;
  background: var(--sec-surface-1, rgba(255, 255, 255, 0.05));
  color: var(--text-color-secondary, #94a3b8);
  flex-shrink: 0;
}

.phase-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.phase-indicator {
  width: 16px;
  text-align: center;
  font-size: 12px;
}

.phase-range {
  font-size: 11px;
  color: var(--text-color-secondary, #94a3b8);
  white-space: nowrap;
}

/* Phase status styles */
.phase-completed {
  color: var(--text-color-secondary, #94a3b8);
  opacity: 0.7;
}

.phase-completed .phase-indicator {
  color: var(--sec-primary, #10b981);
  opacity: 1;
}

.phase-completed .phase-index {
  background: rgba(16, 185, 129, 0.15);
  color: var(--sec-primary, #10b981);
}

.phase-active {
  color: var(--text-color, #e2e8f0);
  border-left: 2px solid var(--sec-primary, #10b981);
  padding-left: 8px;
  margin-left: -10px;
}

.phase-active .phase-indicator {
  color: var(--sec-primary, #10b981);
}

.phase-active .phase-index {
  background: rgba(16, 185, 129, 0.2);
  color: var(--sec-primary, #10b981);
}

.phase-active .phase-name {
  font-weight: 600;
}

.phase-upcoming {
  color: var(--text-color-secondary, #94a3b8);
  opacity: 0.5;
}

.phase-fallback {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-color, #e2e8f0);
  margin: 0;
}

.current-now {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 13px;
}

.now-label {
  font-weight: 700;
  color: var(--sec-accent, #f59e0b);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  flex-shrink: 0;
}

.now-value {
  color: var(--text-color, #e2e8f0);
  font-weight: 500;
}

.overview-right {
  display: flex;
  flex-direction: column;
}

.instructions-editor {
  width: 100%;
  min-height: 140px;
  padding: 12px 14px;
  border: 1px solid var(--pw-instructions-border, var(--sec-glass-border));
  border-radius: var(--sec-radius-sm, 8px);
  background: var(--pw-instructions-bg, var(--sec-surface-1));
  color: var(--text-color, #e2e8f0);
  font-family: inherit;
  font-size: 13px;
  line-height: 1.6;
  resize: vertical;
  outline: none;
  transition: border-color var(--sec-transition-fast) ease;
}

.instructions-editor::placeholder {
  color: var(--text-color-secondary, #94a3b8);
  opacity: 0.6;
}

.instructions-editor:focus {
  border-color: var(--sec-primary-border, rgba(16, 185, 129, 0.3));
}

.instructions-hint {
  font-size: 11px;
  color: var(--text-color-secondary, #94a3b8);
  margin-top: 6px;
  opacity: 0.7;
}
</style>
