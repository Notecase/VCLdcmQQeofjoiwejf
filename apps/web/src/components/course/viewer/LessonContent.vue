<script setup lang="ts">
import type { Lesson } from '@inkdown/shared/types'
import LectureLesson from './LectureLesson.vue'
import VideoLesson from './VideoLesson.vue'
import SlidesLesson from './SlidesLesson.vue'
import PracticeLesson from './PracticeLesson.vue'
import QuizLesson from './QuizLesson.vue'

defineProps<{
  lesson: Lesson
}>()
</script>

<template>
  <div class="lesson-content-wrapper">
    <LectureLesson
      v-if="lesson.type === 'lecture'"
      :lesson="lesson"
    />
    <VideoLesson
      v-else-if="lesson.type === 'video'"
      :lesson="lesson"
    />
    <SlidesLesson
      v-else-if="lesson.type === 'slides'"
      :lesson="lesson"
    />
    <PracticeLesson
      v-else-if="lesson.type === 'practice'"
      :lesson="lesson"
    />
    <QuizLesson
      v-else-if="lesson.type === 'quiz'"
      :lesson="lesson"
    />
    <div
      v-else
      class="unknown-type"
    >
      <p>Unknown lesson type: {{ lesson.type }}</p>
    </div>
  </div>
</template>

<style scoped>
.lesson-content-wrapper {
  width: 100%;
}

.unknown-type {
  padding: 40px;
  text-align: center;
  color: var(--text-color-secondary, #94a3b8);
}
</style>
