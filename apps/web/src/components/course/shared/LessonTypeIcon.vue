<script setup lang="ts">
import { computed } from 'vue'
import {
  BookOpen,
  Video,
  Presentation,
  Code,
  HelpCircle,
} from 'lucide-vue-next'
import type { LessonType } from '@inkdown/shared/types'

const props = withDefaults(defineProps<{
  type: LessonType
  size?: number
}>(), {
  size: 16,
})

const iconComponent = computed(() => {
  switch (props.type) {
    case 'lecture': return BookOpen
    case 'video': return Video
    case 'slides': return Presentation
    case 'practice': return Code
    case 'quiz': return HelpCircle
    default: return BookOpen
  }
})

const label = computed(() => {
  switch (props.type) {
    case 'lecture': return 'Lecture'
    case 'video': return 'Video'
    case 'slides': return 'Slides'
    case 'practice': return 'Practice'
    case 'quiz': return 'Quiz'
    default: return props.type
  }
})
</script>

<template>
  <span class="lesson-type-icon" :title="label">
    <component :is="iconComponent" :size="size" />
  </span>
</template>

<style scoped>
.lesson-type-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-color-secondary, #94a3b8);
}
</style>
