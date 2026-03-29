<script setup lang="ts">
import { ref, computed } from 'vue'
import { Trophy, CheckCircle2, XCircle, RotateCcw } from 'lucide-vue-next'
import type { Lesson } from '@inkdown/shared/types'
import { useCourseStore } from '@/stores/course'
import MuyaRenderer from '@/components/shared/MuyaRenderer.vue'

const props = defineProps<{
  lesson: Lesson
}>()

const store = useCourseStore()

const quizSubmitted = ref(false)
const quizScore = ref<number | null>(null)
const quizPassed = ref(false)
const isSubmitting = ref(false)

const problems = computed(() => props.lesson.content.practiceProblems ?? [])

const localAnswers = ref<Record<string, number | string>>({})

function selectOption(problemId: string, optionIndex: number) {
  if (quizSubmitted.value) return
  localAnswers.value[problemId] = optionIndex
}

function updateShortAnswer(problemId: string, value: string) {
  if (quizSubmitted.value) return
  localAnswers.value[problemId] = value
}

const allAnswered = computed(() => {
  return problems.value.every(
    (p) => localAnswers.value[p.id] !== undefined && localAnswers.value[p.id] !== ''
  )
})

async function handleSubmit() {
  if (!allAnswered.value || isSubmitting.value) return
  isSubmitting.value = true

  const result = await store.submitQuiz(props.lesson.id, localAnswers.value)
  if (result) {
    quizScore.value = result.score
    quizPassed.value = result.passed
  } else {
    // Fallback: compute locally
    let correct = 0
    for (const p of problems.value) {
      if (p.type === 'multiple-choice' && p.correctIndex !== undefined) {
        if (localAnswers.value[p.id] === p.correctIndex) correct++
      }
    }
    const mcCount = problems.value.filter((p) => p.type === 'multiple-choice').length
    quizScore.value = mcCount > 0 ? Math.round((correct / mcCount) * 100) : 0
    quizPassed.value = quizScore.value >= 70
  }

  quizSubmitted.value = true
  isSubmitting.value = false
}

function resetQuiz() {
  localAnswers.value = {}
  quizSubmitted.value = false
  quizScore.value = null
  quizPassed.value = false
}

function isCorrect(problemId: string): boolean | null {
  if (!quizSubmitted.value) return null
  const problem = problems.value.find((p) => p.id === problemId)
  if (!problem || problem.type !== 'multiple-choice' || problem.correctIndex === undefined)
    return null
  return localAnswers.value[problemId] === problem.correctIndex
}
</script>

<template>
  <div class="quiz-lesson">
    <h2 class="lesson-title">
      <Trophy :size="20" />
      {{ lesson.title }}
    </h2>

    <!-- Intro -->
    <MuyaRenderer
      v-if="lesson.content.markdown && !quizSubmitted"
      :markdown="lesson.content.markdown"
    />

    <!-- Score Banner -->
    <div
      v-if="quizSubmitted && quizScore !== null"
      class="score-banner"
      :class="{ passed: quizPassed, failed: !quizPassed }"
    >
      <div class="score-content">
        <div class="score-value">{{ quizScore }}%</div>
        <div class="score-label">
          <template v-if="quizPassed">
            <CheckCircle2 :size="18" />
            Passed! Great work.
          </template>
          <template v-else>
            <XCircle :size="18" />
            Not yet. You need 70% to pass.
          </template>
        </div>
      </div>
      <button
        class="retry-btn"
        @click="resetQuiz"
      >
        <RotateCcw :size="14" />
        Retake
      </button>
    </div>

    <!-- Questions -->
    <div class="questions-list">
      <div
        v-for="(problem, idx) in problems"
        :key="problem.id"
        class="question-card"
        :class="{
          correct: isCorrect(problem.id) === true,
          incorrect: isCorrect(problem.id) === false,
        }"
      >
        <div class="question-header">
          <span class="question-num">Question {{ idx + 1 }} of {{ problems.length }}</span>
          <span
            v-if="quizSubmitted && isCorrect(problem.id) === true"
            class="result-icon correct"
          >
            <CheckCircle2 :size="16" />
          </span>
          <span
            v-else-if="quizSubmitted && isCorrect(problem.id) === false"
            class="result-icon incorrect"
          >
            <XCircle :size="16" />
          </span>
        </div>

        <p class="question-text">{{ problem.question }}</p>

        <!-- Multiple Choice -->
        <div
          v-if="problem.type === 'multiple-choice' && problem.options"
          class="options-list"
        >
          <button
            v-for="(option, optIdx) in problem.options"
            :key="optIdx"
            class="option-btn"
            :class="{
              selected: localAnswers[problem.id] === optIdx,
              'correct-answer': quizSubmitted && problem.correctIndex === optIdx,
              'wrong-answer':
                quizSubmitted &&
                localAnswers[problem.id] === optIdx &&
                problem.correctIndex !== optIdx,
            }"
            :disabled="quizSubmitted"
            @click="selectOption(problem.id, optIdx)"
          >
            <span class="option-letter">{{ String.fromCharCode(65 + optIdx) }}</span>
            <span class="option-text">{{ option }}</span>
          </button>
        </div>

        <!-- Short Answer -->
        <div
          v-else-if="problem.type === 'short-answer'"
          class="short-answer"
        >
          <textarea
            :value="(localAnswers[problem.id] as string) ?? ''"
            class="answer-textarea"
            placeholder="Type your answer..."
            rows="3"
            :disabled="quizSubmitted"
            @input="updateShortAnswer(problem.id, ($event.target as HTMLTextAreaElement).value)"
          />
        </div>

        <!-- Explanation -->
        <div
          v-if="quizSubmitted"
          class="explanation"
        >
          <span class="explanation-label">Explanation:</span>
          {{ problem.explanation }}
        </div>
      </div>
    </div>

    <!-- Submit -->
    <div
      v-if="!quizSubmitted"
      class="submit-area"
    >
      <button
        class="submit-btn"
        :disabled="!allAnswered || isSubmitting"
        @click="handleSubmit"
      >
        {{ isSubmitting ? 'Submitting...' : 'Submit Quiz' }}
      </button>
      <span
        v-if="!allAnswered"
        class="submit-hint"
      >
        Answer all questions to submit
      </span>
    </div>
  </div>
</template>

<style scoped>
.quiz-lesson {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.lesson-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 22px;
  font-weight: 700;
  color: var(--text-color, #e2e8f0);
  margin: 0;
}

.score-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-radius: var(--radius-card, 12px);
  backdrop-filter: blur(var(--glass-blur, 12px));
  -webkit-backdrop-filter: blur(var(--glass-blur, 12px));
}

.score-banner.passed {
  background: var(--sec-primary-bg, rgba(16, 185, 129, 0.08));
  border: 1px solid var(--sec-primary-border, rgba(16, 185, 129, 0.3));
}

.score-banner.failed {
  background: rgba(248, 81, 73, 0.08);
  border: 1px solid rgba(248, 81, 73, 0.3);
}

.score-content {
  display: flex;
  align-items: center;
  gap: 16px;
}

.score-value {
  font-size: 32px;
  font-weight: 800;
}

.passed .score-value {
  color: var(--sec-primary, #10b981);
}

.failed .score-value {
  color: #f85149;
}

.score-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 15px;
  font-weight: 600;
}

.passed .score-label {
  color: var(--sec-primary, #10b981);
}

.failed .score-label {
  color: #f85149;
}

.retry-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: var(--radius-sm, 6px);
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
  background: transparent;
  color: var(--text-color, #e2e8f0);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast, 150ms ease);
}

.retry-btn:hover {
  border-color: var(--sec-accent, #f59e0b);
  color: var(--sec-accent, #f59e0b);
}

.questions-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.question-card {
  padding: 20px;
  border-radius: var(--radius-card, 12px);
  background: var(--glass-bg, rgba(30, 30, 30, 0.6));
  backdrop-filter: blur(var(--glass-blur, 12px));
  -webkit-backdrop-filter: blur(var(--glass-blur, 12px));
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
  transition: border-color var(--transition-normal, 250ms ease);
}

.question-card.correct {
  border-color: var(--sec-primary-border, rgba(16, 185, 129, 0.4));
}

.question-card.incorrect {
  border-color: rgba(248, 81, 73, 0.4);
}

.question-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.question-num {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color-secondary, #64748b);
}

.result-icon.correct {
  color: var(--sec-primary, #10b981);
}
.result-icon.incorrect {
  color: #f85149;
}

.question-text {
  font-size: 15px;
  color: var(--text-color, #e2e8f0);
  line-height: 1.6;
  margin: 0 0 14px;
}

.options-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.option-btn {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 14px;
  border-radius: var(--radius-sm, 6px);
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
  background: transparent;
  color: var(--text-color, #e2e8f0);
  font-size: 14px;
  cursor: pointer;
  text-align: left;
  transition: all var(--transition-fast, 150ms ease);
}

.option-btn:hover:not(:disabled) {
  border-color: var(--text-color-secondary, #64748b);
}

.option-btn.selected {
  border-color: var(--sec-accent, #f59e0b);
  background: var(--sec-accent-bg, rgba(245, 158, 11, 0.08));
}

.option-btn.correct-answer {
  border-color: var(--sec-primary, #10b981);
  background: var(--sec-primary-bg, rgba(16, 185, 129, 0.08));
}

.option-btn.wrong-answer {
  border-color: #f85149;
  background: rgba(248, 81, 73, 0.08);
}

.option-btn:disabled {
  cursor: default;
}

.option-letter {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.06);
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
}

.option-text {
  padding-top: 2px;
  line-height: 1.5;
}

.short-answer {
  margin-bottom: 4px;
}

.answer-textarea {
  width: 100%;
  padding: 12px;
  border-radius: var(--radius-sm, 6px);
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
  background: rgba(0, 0, 0, 0.2);
  color: var(--text-color, #e2e8f0);
  font-size: 14px;
  font-family: inherit;
  resize: vertical;
  outline: none;
  transition: border-color var(--transition-fast, 150ms ease);
  box-sizing: border-box;
}

.answer-textarea:focus {
  border-color: var(--sec-accent, #f59e0b);
}

.answer-textarea:disabled {
  opacity: 0.7;
}

.answer-textarea::placeholder {
  color: var(--text-color-secondary, #64748b);
}

.explanation {
  margin-top: 12px;
  padding: 12px;
  border-radius: 8px;
  background: rgba(59, 130, 246, 0.06);
  border-left: 3px solid rgba(59, 130, 246, 0.4);
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-color-secondary, #94a3b8);
}

.explanation-label {
  font-weight: 700;
  color: #3b82f6;
}

.submit-area {
  display: flex;
  align-items: center;
  gap: 12px;
}

.submit-btn {
  padding: 10px 24px;
  border-radius: var(--radius-md, 10px);
  border: none;
  background: var(--sec-accent, #f59e0b);
  color: #1a1a1a;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background var(--transition-fast, 150ms ease);
}

.submit-btn:hover:not(:disabled) {
  background: var(--sec-accent-light, #fbbf24);
}

.submit-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.submit-hint {
  font-size: 13px;
  color: var(--text-color-secondary, #64748b);
}
</style>
