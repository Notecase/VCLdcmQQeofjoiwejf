<script setup lang="ts">
import { computed } from 'vue'
import { BookOpen } from 'lucide-vue-next'
import type { Lesson } from '@inkdown/shared/types'
import MuyaRenderer from '@/components/shared/MuyaRenderer.vue'

const props = defineProps<{
  lesson: Lesson
}>()

const keyTerms = computed(() => props.lesson.content.keyTerms ?? [])
const practiceProblems = computed(() => props.lesson.content.practiceProblems ?? [])
</script>

<template>
  <div class="lecture-lesson">
    <h2 class="lesson-title">
      <BookOpen :size="20" />
      {{ lesson.title }}
    </h2>

    <!-- Markdown content -->
    <MuyaRenderer
      v-if="lesson.content.markdown"
      :markdown="lesson.content.markdown"
      selectable
    />

    <!-- Key Terms -->
    <div
      v-if="keyTerms.length > 0"
      class="key-terms"
    >
      <h3 class="section-heading">Key Terms</h3>
      <div class="terms-grid">
        <div
          v-for="(kt, idx) in keyTerms"
          :key="idx"
          class="term-card"
        >
          <dt class="term-word">{{ kt.term }}</dt>
          <dd class="term-def">{{ kt.definition }}</dd>
        </div>
      </div>
    </div>

    <!-- Practice Problems -->
    <div
      v-if="practiceProblems.length > 0"
      class="practice-section"
    >
      <h3 class="section-heading">Practice Problems</h3>
      <div
        v-for="(p, idx) in practiceProblems"
        :key="p.id"
        class="practice-item"
      >
        <div class="practice-question">
          <span class="practice-num">{{ idx + 1 }}.</span>
          {{ p.question }}
        </div>
        <div
          v-if="p.sampleAnswer"
          class="practice-answer"
        >
          <span class="answer-label">Sample Answer:</span> {{ p.sampleAnswer }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.lecture-lesson {
  display: flex;
  flex-direction: column;
  gap: 24px;
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

.section-heading {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-color, #e2e8f0);
  margin: 0 0 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color, #333338);
}

.terms-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 10px;
}

.term-card {
  padding: 12px;
  border-radius: var(--radius-sm, 6px);
  background: var(--glass-bg, rgba(30, 30, 30, 0.6));
  backdrop-filter: blur(var(--glass-blur, 12px));
  -webkit-backdrop-filter: blur(var(--glass-blur, 12px));
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
  transition: border-color var(--transition-normal, 250ms ease);
}

.term-card:hover {
  border-color: var(--glass-border-hover, rgba(255, 255, 255, 0.15));
}

.term-word {
  font-size: 14px;
  font-weight: 700;
  color: var(--sec-accent, #f59e0b);
  margin-bottom: 4px;
}

.term-def {
  font-size: 13px;
  color: var(--text-color-secondary, #94a3b8);
  line-height: 1.5;
  margin: 0;
}

.practice-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.practice-item {
  padding: 12px 16px;
  border-radius: var(--radius-sm, 6px);
  background: var(--glass-bg, rgba(30, 30, 30, 0.6));
  backdrop-filter: blur(var(--glass-blur, 12px));
  -webkit-backdrop-filter: blur(var(--glass-blur, 12px));
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
}

.practice-question {
  font-size: 14px;
  color: var(--text-color, #e2e8f0);
  line-height: 1.6;
}

.practice-num {
  font-weight: 700;
  color: var(--sec-accent, #f59e0b);
  margin-right: 4px;
}

.practice-answer {
  margin-top: 8px;
  font-size: 13px;
  color: var(--text-color-secondary, #94a3b8);
  line-height: 1.5;
  padding-top: 8px;
  border-top: 1px solid var(--border-color, #1e1e24);
}

.answer-label {
  font-weight: 600;
  color: var(--sec-primary, #10b981);
}
</style>
