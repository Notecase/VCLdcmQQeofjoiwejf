<script setup lang="ts">
import { ref, computed } from 'vue'
import { Sparkles, Plus, X } from 'lucide-vue-next'
import type { CourseDifficulty, CourseSettings } from '@inkdown/shared/types'

const emit = defineEmits<{
  submit: [
    payload: {
      topic: string
      difficulty: CourseDifficulty
      settings: Partial<CourseSettings>
      focusAreas: string[]
    },
  ]
}>()

const topic = ref('')
const difficulty = ref<CourseDifficulty>('intermediate')
const focusAreaInput = ref('')
const focusAreas = ref<string[]>([])
const includeVideos = ref(true)
const includeSlides = ref(true)
const includePractice = ref(true)
const includeQuizzes = ref(true)
const estimatedWeeks = ref(4)
const hoursPerWeek = ref(5)
const quickTest = ref(false)
const showAdvanced = ref(false)

const isValid = computed(() => topic.value.trim().length >= 3)

function addFocusArea() {
  const area = focusAreaInput.value.trim()
  if (area && !focusAreas.value.includes(area)) {
    focusAreas.value.push(area)
    focusAreaInput.value = ''
  }
}

function removeFocusArea(index: number) {
  focusAreas.value.splice(index, 1)
}

function handleFocusAreaKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    addFocusArea()
  }
}

function handleSubmit() {
  if (!isValid.value) return
  emit('submit', {
    topic: topic.value.trim(),
    difficulty: difficulty.value,
    settings: {
      includeVideos: includeVideos.value,
      includeSlides: includeSlides.value,
      includePractice: includePractice.value,
      includeQuizzes: includeQuizzes.value,
      estimatedWeeks: estimatedWeeks.value,
      hoursPerWeek: hoursPerWeek.value,
      focusAreas: focusAreas.value,
      maxSlidesPerLesson: 12,
      quickTest: quickTest.value || undefined,
    },
    focusAreas: focusAreas.value,
  })
}
</script>

<template>
  <div class="topic-input-form">
    <div class="form-header">
      <h2>Create a New Course</h2>
      <p class="form-description">
        Enter a topic and we'll generate a comprehensive course with lectures, practice problems,
        quizzes, and more.
      </p>
    </div>

    <!-- Topic -->
    <div class="form-group">
      <label class="form-label">Topic</label>
      <input
        v-model="topic"
        type="text"
        class="form-input"
        placeholder="e.g., Machine Learning Fundamentals, React.js Advanced Patterns"
        @keydown.enter="handleSubmit"
      />
    </div>

    <!-- Difficulty -->
    <div class="form-group">
      <label class="form-label">Difficulty Level</label>
      <div class="difficulty-selector">
        <button
          v-for="level in ['beginner', 'intermediate', 'advanced'] as const"
          :key="level"
          class="difficulty-btn"
          :class="{ active: difficulty === level }"
          @click="difficulty = level"
        >
          {{ level.charAt(0).toUpperCase() + level.slice(1) }}
        </button>
      </div>
    </div>

    <!-- Focus Areas -->
    <div class="form-group">
      <label class="form-label">Focus Areas <span class="optional">(optional)</span></label>
      <div class="focus-area-input-row">
        <input
          v-model="focusAreaInput"
          type="text"
          class="form-input"
          placeholder="Add a focus area..."
          @keydown="handleFocusAreaKeydown"
        />
        <button
          class="add-btn"
          :disabled="!focusAreaInput.trim()"
          @click="addFocusArea"
        >
          <Plus :size="16" />
        </button>
      </div>
      <div
        v-if="focusAreas.length > 0"
        class="focus-tags"
      >
        <span
          v-for="(area, idx) in focusAreas"
          :key="idx"
          class="focus-tag"
        >
          {{ area }}
          <button
            class="remove-tag"
            @click="removeFocusArea(idx)"
          >
            <X :size="12" />
          </button>
        </span>
      </div>
    </div>

    <!-- Advanced Settings Toggle -->
    <button
      class="toggle-advanced"
      @click="showAdvanced = !showAdvanced"
    >
      {{ showAdvanced ? 'Hide' : 'Show' }} Advanced Settings
    </button>

    <!-- Advanced Settings -->
    <div
      v-if="showAdvanced"
      class="advanced-settings"
    >
      <div class="settings-grid">
        <label class="checkbox-label">
          <input
            v-model="includeVideos"
            type="checkbox"
          />
          <span>Include Videos</span>
        </label>
        <label class="checkbox-label">
          <input
            v-model="includeSlides"
            type="checkbox"
          />
          <span>Include Slides</span>
        </label>
        <label class="checkbox-label">
          <input
            v-model="includePractice"
            type="checkbox"
          />
          <span>Include Practice</span>
        </label>
        <label class="checkbox-label">
          <input
            v-model="includeQuizzes"
            type="checkbox"
          />
          <span>Include Quizzes</span>
        </label>
        <label class="checkbox-label quick-test-label">
          <input
            v-model="quickTest"
            type="checkbox"
          />
          <span>Quick Test Mode</span>
        </label>
      </div>

      <div class="range-group">
        <label class="form-label">
          Duration: {{ estimatedWeeks }} weeks, {{ hoursPerWeek }} hrs/week
        </label>
        <div class="range-row">
          <span class="range-label">Weeks</span>
          <input
            v-model.number="estimatedWeeks"
            type="range"
            min="1"
            max="12"
            step="1"
          />
          <span class="range-value">{{ estimatedWeeks }}</span>
        </div>
        <div class="range-row">
          <span class="range-label">Hrs/week</span>
          <input
            v-model.number="hoursPerWeek"
            type="range"
            min="1"
            max="20"
            step="1"
          />
          <span class="range-value">{{ hoursPerWeek }}</span>
        </div>
      </div>
    </div>

    <!-- Submit -->
    <button
      class="generate-btn"
      :disabled="!isValid"
      @click="handleSubmit"
    >
      <Sparkles :size="16" />
      Generate Course
    </button>
  </div>
</template>

<style scoped>
.topic-input-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 560px;
  margin: 0 auto;
}

.form-header h2 {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-color, #e2e8f0);
  margin: 0 0 6px;
}

.form-description {
  font-size: 14px;
  color: var(--text-color-secondary, #94a3b8);
  margin: 0;
  line-height: 1.5;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color, #e2e8f0);
}

.optional {
  font-weight: 400;
  color: var(--text-color-secondary, #94a3b8);
}

.form-input {
  padding: 10px 14px;
  border-radius: var(--radius-sm, 6px);
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
  background: var(--glass-bg, rgba(30, 30, 30, 0.6));
  backdrop-filter: blur(var(--glass-blur, 12px));
  -webkit-backdrop-filter: blur(var(--glass-blur, 12px));
  color: var(--text-color, #e2e8f0);
  font-size: 14px;
  outline: none;
  transition: border-color var(--transition-fast, 150ms ease);
}

.form-input:focus {
  border-color: #f59e0b;
}

.form-input::placeholder {
  color: var(--text-color-secondary, #64748b);
}

.difficulty-selector {
  display: flex;
  gap: 8px;
}

.difficulty-btn {
  flex: 1;
  padding: 8px 12px;
  border-radius: var(--radius-sm, 6px);
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
  background: var(--glass-bg, rgba(30, 30, 30, 0.6));
  color: var(--text-color-secondary, #94a3b8);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast, 150ms ease);
}

.difficulty-btn.active {
  border-color: #f59e0b;
  background: rgba(245, 158, 11, 0.12);
  color: #f59e0b;
}

.difficulty-btn:hover:not(.active) {
  border-color: var(--text-color-secondary, #64748b);
}

.focus-area-input-row {
  display: flex;
  gap: 8px;
}

.focus-area-input-row .form-input {
  flex: 1;
}

.add-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-sm, 6px);
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
  background: var(--glass-bg, rgba(30, 30, 30, 0.6));
  color: var(--text-color-secondary, #94a3b8);
  cursor: pointer;
  transition: all var(--transition-fast, 150ms ease);
}

.add-btn:hover:not(:disabled) {
  border-color: #f59e0b;
  color: #f59e0b;
}

.add-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.focus-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}

.focus-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: var(--radius-full, 9999px);
  background: rgba(245, 158, 11, 0.12);
  backdrop-filter: blur(8px);
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
  color: #f59e0b;
  font-size: 12px;
  font-weight: 500;
}

.remove-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border: none;
  background: transparent;
  color: #f59e0b;
  cursor: pointer;
  border-radius: 50%;
  padding: 0;
  transition: background 0.15s;
}

.remove-tag:hover {
  background: rgba(245, 158, 11, 0.2);
}

.toggle-advanced {
  align-self: flex-start;
  padding: 0;
  border: none;
  background: none;
  color: var(--text-color-secondary, #94a3b8);
  font-size: 13px;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.toggle-advanced:hover {
  color: var(--text-color, #e2e8f0);
}

.advanced-settings {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  border-radius: var(--radius-md, 10px);
  background: var(--glass-bg, rgba(30, 30, 30, 0.6));
  backdrop-filter: blur(var(--glass-blur, 12px));
  -webkit-backdrop-filter: blur(var(--glass-blur, 12px));
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
}

.settings-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-color, #e2e8f0);
  cursor: pointer;
}

.checkbox-label input[type='checkbox'] {
  accent-color: #f59e0b;
}

.quick-test-label {
  color: var(--text-color-secondary, #94a3b8);
  font-style: italic;
  font-size: 12px;
}

.range-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.range-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.range-label {
  font-size: 12px;
  color: var(--text-color-secondary, #94a3b8);
  min-width: 60px;
}

.range-row input[type='range'] {
  flex: 1;
  accent-color: #f59e0b;
}

.range-value {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color, #e2e8f0);
  min-width: 24px;
  text-align: right;
}

.generate-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 24px;
  border-radius: var(--radius-md, 10px);
  border: none;
  background: #f59e0b;
  color: #1a1a1a;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast, 150ms ease);
}

.generate-btn:hover:not(:disabled) {
  background: #fbbf24;
}

.generate-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
