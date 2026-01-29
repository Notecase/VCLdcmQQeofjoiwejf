<script setup lang="ts">
/**
 * ExercisesModal - Practice exercises viewer
 *
 * Displays exercises with difficulty levels and hints.
 */
import { computed, ref } from 'vue'
import { useRecommendationsStore, type Exercise } from '@/stores/recommendations'
import { PenTool, Plus, ChevronDown, ChevronUp, Copy, Check } from 'lucide-vue-next'
import BaseModal from './BaseModal.vue'
import { renderMathContent } from '@/utils/mathRenderer'

// Store
const store = useRecommendationsStore()

// Copy state
const copied = ref(false)

// Emits
const emit = defineEmits<{
  close: []
  addExercise: [exercise: Exercise]
}>()

// Local state
const expandedIds = ref<Set<number>>(new Set())

// Computed
const exercises = computed<Exercise[]>(() =>
  store.currentRecommendations?.exercises || []
)

// Difficulty styling
function getDifficultyColor(difficulty: string): string {
  switch (difficulty) {
    case 'beginner':
      return '#3fb950'
    case 'intermediate':
      return '#d29922'
    case 'advanced':
      return '#f85149'
    default:
      return '#8b949e'
  }
}

function toggleExpanded(index: number) {
  if (expandedIds.value.has(index)) {
    expandedIds.value.delete(index)
  } else {
    expandedIds.value.add(index)
  }
}

function isExpanded(index: number): boolean {
  return expandedIds.value.has(index)
}

function handleAddExercise(exercise: Exercise) {
  emit('addExercise', exercise)
}

// Render content with math support
function renderContent(text: string | undefined): string {
  return renderMathContent(text || '')
}

// Copy all exercises as markdown
async function copyAsMarkdown() {
  const markdown = exercises.value
    .map((ex, i) =>
      `### Exercise ${i + 1}: ${ex.title}\n*Difficulty: ${ex.difficulty || 'medium'}*\n\n${ex.description}`
    )
    .join('\n\n')

  try {
    await navigator.clipboard.writeText(markdown)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch (error) {
    console.error('Failed to copy:', error)
  }
}
</script>

<template>
  <BaseModal
    title="Practice Exercises"
    :subtitle="`${exercises.length} exercises`"
    size="md"
    @close="emit('close')"
  >
    <template #icon>
      <PenTool :size="20" />
    </template>

    <template #header-right>
      <button
        class="copy-btn"
        :class="{ copied }"
        @click="copyAsMarkdown"
        :title="copied ? 'Copied!' : 'Copy all as Markdown'"
      >
        <Check v-if="copied" :size="14" />
        <Copy v-else :size="14" />
        <span>{{ copied ? 'Copied!' : 'Copy' }}</span>
      </button>
    </template>

    <div class="exercises-list" v-if="exercises.length > 0">
      <div
        v-for="(exercise, index) in exercises"
        :key="index"
        class="exercise-item"
      >
        <div class="exercise-header" @click="toggleExpanded(index)">
          <span class="exercise-bullet">-</span>
          <div class="exercise-content">
            <p class="exercise-question math-content" v-html="renderContent(exercise.title)"></p>
            <span
              v-if="exercise.difficulty"
              class="difficulty-badge"
              :style="{
                backgroundColor: `${getDifficultyColor(exercise.difficulty)}20`,
                color: getDifficultyColor(exercise.difficulty)
              }"
            >
              {{ exercise.difficulty }}
            </span>
          </div>
          <button class="expand-btn">
            <ChevronUp v-if="isExpanded(index)" :size="16" />
            <ChevronDown v-else :size="16" />
          </button>
        </div>

        <!-- Expanded content -->
        <div v-if="isExpanded(index)" class="exercise-details">
          <div class="detail-section" v-if="exercise.description">
            <span class="detail-label">Description</span>
            <p class="detail-text math-content" v-html="renderContent(exercise.description)"></p>
          </div>

          <div class="detail-actions">
            <button class="add-btn" @click="handleAddExercise(exercise)">
              <Plus :size="14" />
              Add to Note
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="empty-state" v-else>
      <p>No exercises available.</p>
    </div>
  </BaseModal>
</template>

<style scoped>
.exercises-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.exercise-item {
  background: rgba(22, 27, 34, 0.5);
  border: 1px solid #21262d;
  border-radius: 8px;
  overflow: hidden;
}

.exercise-header {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 16px;
  cursor: pointer;
  transition: background 0.15s;
}

.exercise-header:hover {
  background: rgba(33, 38, 45, 0.5);
}

.exercise-bullet {
  color: #58a6ff;
  font-size: 16px;
  font-weight: 600;
  flex-shrink: 0;
}

.exercise-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.exercise-question {
  font-size: 13px;
  color: #e6edf3;
  line-height: 1.5;
  margin: 0;
}

.difficulty-badge {
  font-size: 10px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 2px 8px;
  border-radius: 4px;
  width: fit-content;
}

.expand-btn {
  background: none;
  border: none;
  color: #8b949e;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.expand-btn:hover {
  color: #e6edf3;
}

/* Expanded details */
.exercise-details {
  padding: 0 16px 16px 36px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-top: 1px solid #21262d;
  margin-top: 0;
  padding-top: 16px;
}

.detail-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-label {
  font-size: 10px;
  font-weight: 600;
  color: #8b949e;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.detail-text {
  font-size: 13px;
  color: #c9d1d9;
  line-height: 1.5;
  margin: 0;
}

/* Math content styles */
.math-content :deep(.math-display) {
  margin: 0.5rem 0;
}

.math-content :deep(.math-inline) {
  display: inline;
}

.math-content :deep(.math-code-block) {
  margin: 0.5rem 0;
  padding: 0.5rem;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 6px;
  font-size: 12px;
  overflow-x: auto;
}

.math-content :deep(.math-inline-code) {
  padding: 0.125rem 0.375rem;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 4px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.9em;
}

.math-content :deep(.katex) {
  font-size: 1em;
}

.math-content :deep(.katex-display) {
  margin: 0.5rem 0;
  overflow-x: auto;
  overflow-y: hidden;
}

.detail-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}

.add-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #58a6ff;
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
}

.add-btn:hover {
  background: rgba(88, 166, 255, 0.1);
}

/* Empty state */
.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: #8b949e;
}

/* Copy button */
.copy-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid #30363d;
  border-radius: 6px;
  background: transparent;
  color: #8b949e;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.copy-btn:hover {
  border-color: #58a6ff;
  color: #58a6ff;
}

.copy-btn.copied {
  border-color: #3fb950;
  color: #3fb950;
}
</style>
