<script setup lang="ts">
import { CheckCircle2, Clock } from 'lucide-vue-next'
import type { Course, CourseModule, Lesson } from '@inkdown/shared/types'
import LessonTypeIcon from '../shared/LessonTypeIcon.vue'

defineProps<{
  course: Course
  currentModule: CourseModule | null
  currentLesson: Lesson | null
}>()

const emit = defineEmits<{
  complete: []
}>()

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
</script>

<template>
  <header class="course-header">
    <!-- Breadcrumb -->
    <div class="breadcrumb">
      <span class="crumb course-crumb">{{ course.title }}</span>
      <template v-if="currentModule">
        <span class="crumb-sep">/</span>
        <span class="crumb module-crumb">{{ currentModule.title }}</span>
      </template>
      <template v-if="currentLesson">
        <span class="crumb-sep">/</span>
        <span class="crumb lesson-crumb">{{ currentLesson.title }}</span>
      </template>
    </div>

    <!-- Lesson info and action -->
    <div v-if="currentLesson" class="header-right">
      <div class="lesson-info">
        <span class="lesson-type-badge">
          <LessonTypeIcon :type="currentLesson.type" :size="13" />
          {{ capitalize(currentLesson.type) }}
        </span>
        <span class="lesson-duration">
          <Clock :size="12" />
          {{ currentLesson.duration }}
        </span>
      </div>
      <button
        v-if="currentLesson.status !== 'completed'"
        class="complete-btn"
        @click="emit('complete')"
      >
        <CheckCircle2 :size="14" />
        Mark Complete
      </button>
      <span v-else class="completed-badge">
        <CheckCircle2 :size="14" />
        Completed
      </span>
    </div>
  </header>
</template>

<style scoped>
.course-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-bottom: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
  background: var(--glass-bg, rgba(30, 30, 30, 0.6));
  backdrop-filter: blur(var(--glass-blur-heavy, 20px));
  -webkit-backdrop-filter: blur(var(--glass-blur-heavy, 20px));
  flex-shrink: 0;
}

.breadcrumb {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1;
}

.crumb {
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.course-crumb {
  color: var(--text-color-secondary, #94a3b8);
  max-width: 200px;
}

.module-crumb {
  color: var(--text-color-secondary, #94a3b8);
  max-width: 200px;
}

.lesson-crumb {
  color: var(--text-color, #e2e8f0);
  font-weight: 600;
}

.crumb-sep {
  color: var(--text-color-secondary, #64748b);
  font-size: 12px;
  flex-shrink: 0;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-shrink: 0;
}

.lesson-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.lesson-type-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: var(--radius-full, 9999px);
  background: rgba(245, 158, 11, 0.12);
  backdrop-filter: blur(8px);
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
  color: #f59e0b;
  font-size: 12px;
  font-weight: 500;
}

.lesson-duration {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 12px;
  color: var(--text-color-secondary, #94a3b8);
}

.complete-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 14px;
  border-radius: var(--radius-sm, 6px);
  border: 1px solid #10b981;
  background: rgba(16, 185, 129, 0.1);
  color: #10b981;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast, 150ms ease);
}

.complete-btn:hover {
  background: #10b981;
  color: white;
}

.completed-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 500;
  color: #10b981;
}
</style>
