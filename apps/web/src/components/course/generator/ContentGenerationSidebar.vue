<script setup lang="ts">
/**
 * ContentGenerationSidebar — Course outline tree showing per-lesson generation status.
 * Replaces the pipeline timeline during content/multimedia/saving stages.
 */
import { computed, ref } from 'vue'
import {
  ChevronDown,
  ChevronRight,
  BookOpen,
  Presentation,
  Code2,
  ClipboardList,
  CheckCircle2,
  Loader2,
  Circle,
} from 'lucide-vue-next'
import type { CourseOutline, LessonType } from '@inkdown/shared/types'

const props = defineProps<{
  outline: CourseOutline
  generatedLessons: Map<
    string,
    {
      title: string
      moduleTitle: string
      moduleId: string
      type: LessonType
      markdownPreview: string
      status: 'done'
    }
  >
  selectedLesson: string | null
  generatedCount: number
  totalLessons: number
}>()

const emit = defineEmits<{
  select: [lessonTitle: string]
}>()

// Track collapsed modules (all start expanded)
const collapsedModules = ref<Set<string>>(new Set())

function toggleModule(moduleId: string) {
  if (collapsedModules.value.has(moduleId)) {
    collapsedModules.value.delete(moduleId)
  } else {
    collapsedModules.value.add(moduleId)
  }
}

// Infer currently generating lesson: first lesson in outline order not in generatedLessons
const currentlyGenerating = computed(() => {
  for (const mod of props.outline.modules) {
    for (const les of mod.lessons) {
      if (!props.generatedLessons.has(les.title)) {
        return les.title
      }
    }
  }
  return null
})

function lessonStatus(title: string): 'done' | 'generating' | 'pending' {
  if (props.generatedLessons.has(title)) return 'done'
  if (title === currentlyGenerating.value) return 'generating'
  return 'pending'
}

function moduleDoneCount(mod: { lessons: { title: string }[] }): number {
  return mod.lessons.filter((l) => props.generatedLessons.has(l.title)).length
}

function lessonTypeIcon(type: LessonType) {
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

function handleLessonClick(title: string) {
  if (props.generatedLessons.has(title)) {
    emit('select', title)
  }
}
</script>

<template>
  <div class="content-sidebar">
    <div class="sidebar-header">
      <h3>Course Outline</h3>
      <span class="lesson-counter">{{ generatedCount }}/{{ totalLessons }}</span>
    </div>

    <div class="module-tree">
      <div
        v-for="mod in outline.modules"
        :key="mod.id"
        class="module-group"
      >
        <!-- Module Header -->
        <button
          class="module-header"
          @click="toggleModule(mod.id)"
        >
          <component
            :is="collapsedModules.has(mod.id) ? ChevronRight : ChevronDown"
            :size="14"
            class="chevron"
          />
          <span class="module-title">{{ mod.title }}</span>
          <span class="module-badge">{{ moduleDoneCount(mod) }}/{{ mod.lessons.length }}</span>
        </button>

        <!-- Lessons -->
        <div
          v-if="!collapsedModules.has(mod.id)"
          class="lesson-list"
        >
          <button
            v-for="les in mod.lessons"
            :key="les.id"
            class="lesson-row"
            :class="{
              done: lessonStatus(les.title) === 'done',
              generating: lessonStatus(les.title) === 'generating',
              selected: selectedLesson === les.title,
            }"
            :disabled="lessonStatus(les.title) === 'pending'"
            @click="handleLessonClick(les.title)"
          >
            <component
              :is="lessonTypeIcon(les.type)"
              :size="14"
              class="lesson-icon"
            />
            <span class="lesson-title">{{ les.title }}</span>
            <CheckCircle2
              v-if="lessonStatus(les.title) === 'done'"
              :size="14"
              class="status-done"
            />
            <Loader2
              v-else-if="lessonStatus(les.title) === 'generating'"
              :size="14"
              class="status-generating spinning"
            />
            <Circle
              v-else
              :size="14"
              class="status-pending"
            />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.content-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 0 16px;
  border-bottom: 1px solid var(--border-color, #333338);
  margin-bottom: 12px;
  flex-shrink: 0;
}

.sidebar-header h3 {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color, #e2e8f0);
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.lesson-counter {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color-secondary, #94a3b8);
  background: var(--glass-bg-light, rgba(40, 40, 40, 0.5));
  padding: 2px 8px;
  border-radius: 10px;
}

.module-tree {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.module-tree::-webkit-scrollbar {
  width: 4px;
}

.module-tree::-webkit-scrollbar-thumb {
  background: var(--border-color, #333338);
  border-radius: 2px;
}

.module-group {
  display: flex;
  flex-direction: column;
}

.module-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 8px;
  border: none;
  background: transparent;
  color: var(--text-color, #e2e8f0);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border-radius: 6px;
  transition: background 0.15s;
}

.module-header:hover {
  background: var(--glass-bg-light, rgba(40, 40, 40, 0.5));
}

.chevron {
  color: var(--text-color-secondary, #64748b);
  flex-shrink: 0;
}

.module-title {
  flex: 1;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.module-badge {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-color-secondary, #64748b);
  background: var(--glass-bg-light, rgba(40, 40, 40, 0.5));
  padding: 1px 6px;
  border-radius: 8px;
  flex-shrink: 0;
}

.lesson-list {
  display: flex;
  flex-direction: column;
  padding-left: 20px;
  gap: 1px;
}

.lesson-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border: none;
  background: transparent;
  color: var(--text-color-secondary, #64748b);
  font-size: 12px;
  cursor: default;
  border-radius: 6px;
  transition: all 0.15s;
  text-align: left;
}

.lesson-row.done {
  cursor: pointer;
  color: var(--text-color, #e2e8f0);
}

.lesson-row.done:hover {
  background: var(--glass-bg-light, rgba(40, 40, 40, 0.5));
}

.lesson-row.selected {
  background: rgba(245, 158, 11, 0.1);
  color: #f59e0b;
}

.lesson-row.generating {
  color: #f59e0b;
}

.lesson-row:disabled {
  opacity: 0.5;
}

.lesson-icon {
  flex-shrink: 0;
  opacity: 0.7;
}

.lesson-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-done {
  color: #10b981;
  flex-shrink: 0;
}

.status-generating {
  color: #f59e0b;
  flex-shrink: 0;
}

.status-pending {
  color: var(--text-color-secondary, #64748b);
  opacity: 0.4;
  flex-shrink: 0;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.spinning {
  animation: spin 1s linear infinite;
}
</style>
