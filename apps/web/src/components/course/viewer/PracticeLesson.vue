<script setup lang="ts">
import { computed } from 'vue'
import { CheckCircle2, XCircle, Edit3 } from 'lucide-vue-next'
import type { Lesson } from '@inkdown/shared/types'
import { useCourseStore } from '@/stores/course'
import MuyaRenderer from '@/components/shared/MuyaRenderer.vue'

const props = defineProps<{
  lesson: Lesson
}>()

const store = useCourseStore()

const problems = computed(() => props.lesson.content.practiceProblems ?? [])

function selectOption(problemId: string, optionIndex: number) {
  if (store.practiceSubmitted) return
  store.handleAnswer(problemId, optionIndex)
}

function updateShortAnswer(problemId: string, value: string) {
  if (store.practiceSubmitted) return
  store.handleAnswer(problemId, value)
}

function isCorrect(problemId: string): boolean | null {
  if (!store.practiceSubmitted) return null
  const problem = problems.value.find(p => p.id === problemId)
  if (!problem) return null
  const answer = store.practiceAnswers[problemId]
  if (problem.type === 'multiple-choice' && problem.correctIndex !== undefined) {
    return answer === problem.correctIndex
  }
  // Short answer: always show as reviewed (no auto-grading)
  return null
}

const allAnswered = computed(() => {
  return problems.value.every(p => store.practiceAnswers[p.id] !== undefined && store.practiceAnswers[p.id] !== '')
})
</script>

<template>
  <div class="practice-lesson">
    <h2 class="lesson-title">
      <Edit3 :size="20" />
      {{ lesson.title }}
    </h2>

    <!-- Markdown intro -->
    <MuyaRenderer v-if="lesson.content.markdown" :markdown="lesson.content.markdown" />

    <!-- Problems -->
    <div class="problems-list">
      <div
        v-for="(problem, idx) in problems"
        :key="problem.id"
        class="problem-card"
        :class="{
          correct: isCorrect(problem.id) === true,
          incorrect: isCorrect(problem.id) === false,
        }"
      >
        <div class="problem-header">
          <span class="problem-num">Problem {{ idx + 1 }}</span>
          <span v-if="store.practiceSubmitted && isCorrect(problem.id) === true" class="result-badge correct">
            <CheckCircle2 :size="13" /> Correct
          </span>
          <span v-else-if="store.practiceSubmitted && isCorrect(problem.id) === false" class="result-badge incorrect">
            <XCircle :size="13" /> Incorrect
          </span>
        </div>

        <p class="problem-question">{{ problem.question }}</p>

        <!-- Multiple Choice -->
        <div v-if="problem.type === 'multiple-choice' && problem.options" class="options-list">
          <button
            v-for="(option, optIdx) in problem.options"
            :key="optIdx"
            class="option-btn"
            :class="{
              selected: store.practiceAnswers[problem.id] === optIdx,
              'correct-answer': store.practiceSubmitted && problem.correctIndex === optIdx,
              'wrong-answer': store.practiceSubmitted && store.practiceAnswers[problem.id] === optIdx && problem.correctIndex !== optIdx,
            }"
            :disabled="store.practiceSubmitted"
            @click="selectOption(problem.id, optIdx)"
          >
            <span class="option-letter">{{ String.fromCharCode(65 + optIdx) }}</span>
            <span class="option-text">{{ option }}</span>
          </button>
        </div>

        <!-- Short Answer -->
        <div v-else-if="problem.type === 'short-answer'" class="short-answer">
          <textarea
            :value="(store.practiceAnswers[problem.id] as string) ?? ''"
            class="answer-textarea"
            placeholder="Type your answer..."
            rows="3"
            :disabled="store.practiceSubmitted"
            @input="updateShortAnswer(problem.id, ($event.target as HTMLTextAreaElement).value)"
          />
        </div>

        <!-- Explanation (shown after submit) -->
        <div v-if="store.practiceSubmitted" class="explanation">
          <span class="explanation-label">Explanation:</span>
          {{ problem.explanation }}
        </div>

        <!-- Sample Answer for short answer -->
        <div v-if="store.practiceSubmitted && problem.sampleAnswer" class="sample-answer">
          <span class="sample-label">Sample Answer:</span>
          {{ problem.sampleAnswer }}
        </div>
      </div>
    </div>

    <!-- Submit Button -->
    <div v-if="!store.practiceSubmitted" class="submit-area">
      <button
        class="submit-btn"
        :disabled="!allAnswered"
        @click="store.submitPractice()"
      >
        Check Answers
      </button>
      <span v-if="!allAnswered" class="submit-hint">
        Answer all problems to check your work
      </span>
    </div>

    <div v-else class="reset-area">
      <button class="reset-btn" @click="store.resetPractice()">
        Try Again
      </button>
    </div>
  </div>
</template>

<style scoped>
.practice-lesson {
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

.problems-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.problem-card {
  padding: 20px;
  border-radius: var(--radius-card, 12px);
  background: var(--glass-bg, rgba(30, 30, 30, 0.6));
  backdrop-filter: blur(var(--glass-blur, 12px));
  -webkit-backdrop-filter: blur(var(--glass-blur, 12px));
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
  transition: border-color var(--transition-normal, 250ms ease);
}

.problem-card.correct {
  border-color: rgba(16, 185, 129, 0.4);
}

.problem-card.incorrect {
  border-color: rgba(248, 81, 73, 0.4);
}

.problem-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.problem-num {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #f59e0b;
}

.result-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 12px;
}

.result-badge.correct {
  color: #10b981;
  background: rgba(16, 185, 129, 0.12);
}

.result-badge.incorrect {
  color: #f85149;
  background: rgba(248, 81, 73, 0.12);
}

.problem-question {
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
  border-color: #f59e0b;
  background: rgba(245, 158, 11, 0.08);
}

.option-btn.correct-answer {
  border-color: #10b981;
  background: rgba(16, 185, 129, 0.08);
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
  border-color: #f59e0b;
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

.sample-answer {
  margin-top: 8px;
  padding: 12px;
  border-radius: 8px;
  background: rgba(16, 185, 129, 0.06);
  border-left: 3px solid rgba(16, 185, 129, 0.4);
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-color-secondary, #94a3b8);
}

.sample-label {
  font-weight: 700;
  color: #10b981;
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
  background: #f59e0b;
  color: #1a1a1a;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background var(--transition-fast, 150ms ease);
}

.submit-btn:hover:not(:disabled) {
  background: #fbbf24;
}

.submit-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.submit-hint {
  font-size: 13px;
  color: var(--text-color-secondary, #64748b);
}

.reset-area {
  display: flex;
}

.reset-btn {
  padding: 10px 24px;
  border-radius: var(--radius-md, 10px);
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
  background: transparent;
  color: var(--text-color, #e2e8f0);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast, 150ms ease);
}

.reset-btn:hover {
  border-color: #f59e0b;
  color: #f59e0b;
}
</style>
