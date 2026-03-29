<script setup lang="ts">
/**
 * LessonPreviewCard — Shows a preview of a generated lesson's content.
 * Displayed in the main area during content generation.
 */
import { BookOpen, Presentation, Code2, ClipboardList } from 'lucide-vue-next'
import type { LessonType } from '@inkdown/shared/types'

const props = defineProps<{
  lessonTitle: string
  lessonType: LessonType
  markdownPreview: string
  moduleTitle: string
}>()

function typeLabel(type: LessonType): string {
  switch (type) {
    case 'lecture':
      return 'Lecture'
    case 'video':
      return 'Video'
    case 'slides':
      return 'Slides'
    case 'practice':
      return 'Practice'
    case 'quiz':
      return 'Quiz'
    default:
      return 'Lesson'
  }
}

function typeIcon(type: LessonType) {
  switch (type) {
    case 'lecture':
    case 'video':
      return BookOpen
    case 'slides':
      return Presentation
    case 'practice':
      return Code2
    case 'quiz':
      return ClipboardList
    default:
      return BookOpen
  }
}
</script>

<template>
  <div class="lesson-preview">
    <!-- Header -->
    <div class="preview-header">
      <div class="type-badge">
        <component
          :is="typeIcon(props.lessonType)"
          :size="14"
        />
        <span>{{ typeLabel(props.lessonType) }}</span>
      </div>
      <h3 class="preview-title">{{ props.lessonTitle }}</h3>
      <span class="module-breadcrumb">{{ props.moduleTitle }}</span>
    </div>

    <!-- Content Preview -->
    <div class="preview-body">
      <pre class="preview-text">{{ props.markdownPreview }}</pre>
      <div
        v-if="props.markdownPreview.length >= 295"
        class="preview-fade"
      />
    </div>
  </div>
</template>

<style scoped>
.lesson-preview {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  border-radius: var(--radius-panel, 16px);
  background: var(--glass-bg, rgba(30, 30, 30, 0.6));
  backdrop-filter: blur(var(--glass-blur-heavy, 20px));
  -webkit-backdrop-filter: blur(var(--glass-blur-heavy, 20px));
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
  box-shadow: var(--shadow-md, 0 4px 12px rgba(0, 0, 0, 0.25));
}

.preview-header {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.type-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: 12px;
  background: var(--sec-accent-bg, rgba(245, 158, 11, 0.12));
  color: var(--sec-accent, #f59e0b);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  width: fit-content;
}

.preview-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-color, #e2e8f0);
  margin: 0;
}

.module-breadcrumb {
  font-size: 12px;
  color: var(--text-color-secondary, #64748b);
}

.preview-body {
  position: relative;
}

.preview-text {
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-color-secondary, #94a3b8);
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  padding: 14px;
  border-radius: var(--radius-md, 10px);
  background: var(--glass-bg-light, rgba(40, 40, 40, 0.5));
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.06));
  max-height: 400px;
  overflow-y: auto;
}

.preview-text::-webkit-scrollbar {
  width: 4px;
}

.preview-text::-webkit-scrollbar-thumb {
  background: var(--border-color, #333338);
  border-radius: 2px;
}

.preview-fade {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 48px;
  background: linear-gradient(transparent, var(--glass-bg, rgba(30, 30, 30, 0.6)));
  border-radius: 0 0 var(--radius-md, 10px) var(--radius-md, 10px);
  pointer-events: none;
}
</style>
