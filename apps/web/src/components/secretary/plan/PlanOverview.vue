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

// Build structured summary pieces from typed plan fields + phase headings
const metaParts = computed(() => {
  const p = props.plan
  const parts: string[] = []
  if (p.progress?.totalDays) parts.push(`${p.progress.totalDays} days`)
  if (p.schedule?.hoursPerDay) parts.push(`${p.schedule.hoursPerDay}h/day`)
  if (p.schedule?.studyDays?.length) {
    const days = p.schedule.studyDays
    parts.push(days.length === 1 ? days[0] : days.join(', '))
  }
  return parts
})

const phaseSummary = computed(() => {
  const content = props.roadmapContent ? stripOuterCodeFence(props.roadmapContent) : ''
  const phases: string[] = []
  if (content) {
    for (const line of content.split('\n')) {
      const m = line.trim().match(/^##\s+(?:Phase\s+\d+:\s*)?(.+?)(?:\s*\(Days?\s+[\d–-]+\))?\s*$/)
      if (m) phases.push(m[1].trim())
    }
  }
  return phases.length > 0 ? `Covers: ${phases.join(', ')}` : ''
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
          <div
            v-if="metaParts.length"
            class="meta-pills"
          >
            <span
              v-for="part in metaParts"
              :key="part"
              class="meta-pill"
              >{{ part }}</span
            >
          </div>
          <p
            v-if="phaseSummary"
            class="phase-summary"
          >
            {{ phaseSummary }}
          </p>
          <p
            v-if="!metaParts.length && !phaseSummary"
            class="phase-summary"
          >
            {{ plan.name }}
          </p>
        </div>

        <div
          v-else
          class="roadmap-full"
          v-html="renderedRoadmap"
        />

        <div
          v-if="plan.currentTopic && !isExpanded"
          class="current-topic-block"
        >
          <span class="topic-label">Current topic</span>
          <span class="topic-value">{{ plan.currentTopic }}</span>
        </div>
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
  gap: 8px;
}

.meta-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.meta-pill {
  font-size: 12px;
  padding: 2px 10px;
  border-radius: 12px;
  background: var(--sec-surface-1, rgba(255, 255, 255, 0.05));
  color: var(--text-color-secondary, #94a3b8);
  border: 1px solid var(--sec-glass-border, rgba(255, 255, 255, 0.06));
}

.phase-summary {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-color, #e2e8f0);
  margin: 0;
}

.current-topic-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.topic-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--sec-accent, #f59e0b);
}

.topic-value {
  font-size: 14px;
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
