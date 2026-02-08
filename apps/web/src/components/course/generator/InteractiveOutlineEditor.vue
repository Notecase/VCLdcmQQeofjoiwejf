<script setup lang="ts">
import { ref, watch } from 'vue'
import {
  Check, X, Plus, Trash2, ChevronDown, ChevronRight,
  GripVertical, Clock,
} from 'lucide-vue-next'
import type { CourseOutline, CourseOutlineModule, CourseOutlineLesson, LessonType } from '@inkdown/shared/types'
import LessonTypeIcon from '../shared/LessonTypeIcon.vue'

const props = defineProps<{
  outline: CourseOutline
}>()

const emit = defineEmits<{
  approve: [modifiedOutline: CourseOutline]
  reject: [feedback: string]
}>()

// Deep clone for local editing
const localOutline = ref<CourseOutline>(JSON.parse(JSON.stringify(props.outline)))
const expandedModules = ref<Set<string>>(new Set(props.outline.modules.map(m => m.id)))
const isRejecting = ref(false)
const feedback = ref('')

watch(() => props.outline, (val) => {
  localOutline.value = JSON.parse(JSON.stringify(val))
}, { deep: true })

function toggleModule(id: string) {
  if (expandedModules.value.has(id)) {
    expandedModules.value.delete(id)
  } else {
    expandedModules.value.add(id)
  }
}

function updateModuleTitle(mod: CourseOutlineModule, title: string) {
  mod.title = title
}

function updateLessonTitle(lesson: CourseOutlineLesson, title: string) {
  lesson.title = title
}

function updateLessonType(lesson: CourseOutlineLesson, type: LessonType) {
  lesson.type = type
}

function removeModule(idx: number) {
  localOutline.value.modules.splice(idx, 1)
  localOutline.value.modules.forEach((m, i) => { m.order = i + 1 })
}

function removeLesson(mod: CourseOutlineModule, lessonIdx: number) {
  mod.lessons.splice(lessonIdx, 1)
  mod.lessons.forEach((l, i) => { l.order = i + 1 })
}

function addModule() {
  const newMod: CourseOutlineModule = {
    id: crypto.randomUUID(),
    title: 'New Module',
    description: '',
    order: localOutline.value.modules.length + 1,
    lessons: [],
  }
  localOutline.value.modules.push(newMod)
  expandedModules.value.add(newMod.id)
}

function addLesson(mod: CourseOutlineModule) {
  const newLesson: CourseOutlineLesson = {
    id: crypto.randomUUID(),
    title: 'New Lesson',
    type: 'lecture',
    estimatedMinutes: 30,
    keyTopics: [],
    learningObjectives: [],
    order: mod.lessons.length + 1,
  }
  mod.lessons.push(newLesson)
}

function moveModule(fromIdx: number, direction: 'up' | 'down') {
  const toIdx = direction === 'up' ? fromIdx - 1 : fromIdx + 1
  if (toIdx < 0 || toIdx >= localOutline.value.modules.length) return
  const mods = localOutline.value.modules
  const temp = mods[fromIdx]
  mods[fromIdx] = mods[toIdx]
  mods[toIdx] = temp
  mods.forEach((m, i) => { m.order = i + 1 })
}

function handleApprove() {
  emit('approve', JSON.parse(JSON.stringify(localOutline.value)))
}

function handleReject() {
  if (feedback.value.trim()) {
    emit('reject', feedback.value.trim())
    feedback.value = ''
    isRejecting.value = false
  }
}

const lessonTypes: LessonType[] = ['lecture', 'video', 'slides', 'practice', 'quiz']

const totalLessons = ref(0)
watch(() => localOutline.value.modules, (mods) => {
  totalLessons.value = mods.reduce((sum, m) => sum + m.lessons.length, 0)
}, { deep: true, immediate: true })
</script>

<template>
  <div class="interactive-outline-editor">
    <!-- Header -->
    <div class="editor-header">
      <div class="header-info">
        <h3>Review & Edit Outline</h3>
        <span class="outline-meta">
          {{ localOutline.modules.length }} modules, {{ totalLessons }} lessons
        </span>
      </div>
    </div>

    <!-- Title edit -->
    <div class="outline-title-row">
      <input
        v-model="localOutline.title"
        class="outline-title-input"
        placeholder="Course title..."
      >
      <span class="difficulty-badge" :class="localOutline.difficulty">
        {{ localOutline.difficulty }}
      </span>
    </div>

    <!-- Modules tree -->
    <div class="modules-tree">
      <div
        v-for="(mod, modIdx) in localOutline.modules"
        :key="mod.id"
        class="module-block"
      >
        <!-- Module header -->
        <div class="module-header">
          <button
            class="reorder-btn"
            :disabled="modIdx === 0"
            title="Move up"
            @click="moveModule(modIdx, 'up')"
          >
            <GripVertical :size="14" />
          </button>
          <button class="expand-btn" @click="toggleModule(mod.id)">
            <ChevronDown v-if="expandedModules.has(mod.id)" :size="14" />
            <ChevronRight v-else :size="14" />
          </button>
          <input
            :value="mod.title"
            class="inline-edit module-title-input"
            @input="updateModuleTitle(mod, ($event.target as HTMLInputElement).value)"
          >
          <span class="lesson-count-badge">{{ mod.lessons.length }}</span>
          <button class="icon-btn danger" title="Remove module" @click="removeModule(modIdx)">
            <Trash2 :size="13" />
          </button>
        </div>

        <!-- Module body (lessons) -->
        <div v-if="expandedModules.has(mod.id)" class="module-body">
          <div class="lessons-list">
            <div
              v-for="(lesson, lessonIdx) in mod.lessons"
              :key="lesson.id"
              class="lesson-row"
            >
              <LessonTypeIcon :type="lesson.type" :size="14" />
              <input
                :value="lesson.title"
                class="inline-edit lesson-title-input"
                @input="updateLessonTitle(lesson, ($event.target as HTMLInputElement).value)"
              >
              <select
                :value="lesson.type"
                class="type-select"
                @change="updateLessonType(lesson, ($event.target as HTMLSelectElement).value as LessonType)"
              >
                <option v-for="t in lessonTypes" :key="t" :value="t">{{ t }}</option>
              </select>
              <span class="lesson-duration">
                <Clock :size="11" />
                {{ lesson.estimatedMinutes }}m
              </span>
              <button class="icon-btn danger" @click="removeLesson(mod, lessonIdx)">
                <Trash2 :size="12" />
              </button>
            </div>
          </div>

          <button class="add-btn-row" @click="addLesson(mod)">
            <Plus :size="14" />
            Add Lesson
          </button>
        </div>
      </div>
    </div>

    <!-- Add module -->
    <button class="add-module-btn" @click="addModule">
      <Plus :size="16" />
      Add Module
    </button>

    <!-- Actions -->
    <div class="action-bar">
      <button class="approve-btn" @click="handleApprove">
        <Check :size="16" />
        Approve & Generate
      </button>
      <button
        class="reject-btn"
        :class="{ active: isRejecting }"
        @click="isRejecting = !isRejecting"
      >
        <X :size="16" />
        Request Changes
      </button>
    </div>

    <!-- Rejection feedback -->
    <div v-if="isRejecting" class="reject-form">
      <textarea
        v-model="feedback"
        class="reject-textarea"
        placeholder="Describe what changes you'd like..."
        rows="3"
      />
      <button
        class="submit-reject-btn"
        :disabled="!feedback.trim()"
        @click="handleReject"
      >
        Submit Feedback
      </button>
    </div>
  </div>
</template>

<style scoped>
.interactive-outline-editor {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.editor-header h3 {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-color, #e2e8f0);
  margin: 0;
}

.outline-meta {
  font-size: 12px;
  color: var(--text-color-secondary, #64748b);
  margin-top: 2px;
}

.outline-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.outline-title-input {
  flex: 1;
  padding: 8px 12px;
  border-radius: var(--radius-sm, 6px);
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
  background: var(--glass-bg, rgba(30, 30, 30, 0.6));
  color: var(--text-color, #e2e8f0);
  font-size: 16px;
  font-weight: 600;
  outline: none;
  transition: border-color var(--transition-fast, 150ms ease);
}

.outline-title-input:focus {
  border-color: var(--status-running, #f59e0b);
}

.difficulty-badge {
  padding: 3px 10px;
  border-radius: var(--radius-full, 9999px);
  font-size: 11px;
  font-weight: 600;
  text-transform: capitalize;
}

.difficulty-badge.beginner {
  color: #10b981;
  background: rgba(16, 185, 129, 0.12);
}

.difficulty-badge.intermediate {
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.12);
}

.difficulty-badge.advanced {
  color: #f85149;
  background: rgba(248, 81, 73, 0.12);
}

.modules-tree {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.module-block {
  border-radius: var(--radius-md, 10px);
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
  background: var(--glass-bg, rgba(30, 30, 30, 0.6));
  backdrop-filter: blur(var(--glass-blur, 12px));
  -webkit-backdrop-filter: blur(var(--glass-blur, 12px));
  overflow: hidden;
  transition: border-color var(--transition-normal, 250ms ease);
}

.module-block:hover {
  border-color: var(--glass-border-hover, rgba(255, 255, 255, 0.15));
}

.module-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
}

.reorder-btn,
.expand-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: none;
  color: var(--text-color-secondary, #64748b);
  cursor: pointer;
  padding: 2px;
}

.reorder-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.inline-edit {
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-color, #e2e8f0);
  font-size: 13px;
  padding: 2px 6px;
  border-radius: var(--radius-xs, 4px);
  outline: none;
  transition: border-color var(--transition-fast, 150ms ease), background var(--transition-fast, 150ms ease);
}

.inline-edit:hover,
.inline-edit:focus {
  border-color: var(--glass-border, rgba(255, 255, 255, 0.08));
  background: rgba(255, 255, 255, 0.03);
}

.module-title-input {
  flex: 1;
  font-weight: 600;
}

.lesson-count-badge {
  padding: 1px 7px;
  border-radius: var(--radius-full, 9999px);
  background: var(--glass-bg-light, rgba(40, 40, 40, 0.5));
  font-size: 10px;
  font-weight: 600;
  color: var(--text-color-secondary, #94a3b8);
}

.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm, 6px);
  cursor: pointer;
  color: var(--text-color-secondary, #64748b);
  transition: all var(--transition-fast, 150ms ease);
}

.icon-btn.danger:hover {
  background: rgba(248, 81, 73, 0.12);
  color: #f85149;
}

.module-body {
  padding: 0 12px 12px 36px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.lessons-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding-left: 8px;
  border-left: 2px solid var(--glass-border, rgba(255, 255, 255, 0.08));
}

.lesson-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
}

.lesson-title-input {
  flex: 1;
}

.type-select {
  padding: 2px 6px;
  border-radius: var(--radius-xs, 4px);
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
  background: var(--glass-bg, rgba(30, 30, 30, 0.6));
  color: var(--text-color-secondary, #94a3b8);
  font-size: 11px;
  outline: none;
}

.lesson-duration {
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 11px;
  color: var(--text-color-secondary, #64748b);
  flex-shrink: 0;
}

.add-btn-row,
.add-module-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: var(--radius-sm, 6px);
  border: 1px dashed var(--glass-border, rgba(255, 255, 255, 0.08));
  background: transparent;
  color: var(--text-color-secondary, #94a3b8);
  font-size: 12px;
  cursor: pointer;
  transition: all var(--transition-fast, 150ms ease);
}

.add-btn-row:hover,
.add-module-btn:hover {
  border-color: var(--status-running, #f59e0b);
  color: var(--status-running, #f59e0b);
}

.action-bar {
  display: flex;
  gap: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
}

.approve-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
  border-radius: var(--radius-md, 10px);
  border: none;
  background: #10b981;
  color: white;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background var(--transition-fast, 150ms ease);
}

.approve-btn:hover {
  background: #059669;
}

.reject-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
  border-radius: var(--radius-md, 10px);
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
  background: transparent;
  color: var(--text-color-secondary, #94a3b8);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast, 150ms ease);
}

.reject-btn:hover,
.reject-btn.active {
  border-color: #f85149;
  color: #f85149;
}

.reject-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.reject-textarea {
  padding: 12px;
  border-radius: var(--radius-sm, 6px);
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
  background: var(--glass-bg, rgba(30, 30, 30, 0.6));
  color: var(--text-color, #e2e8f0);
  font-size: 13px;
  resize: vertical;
  outline: none;
  font-family: inherit;
  transition: border-color var(--transition-fast, 150ms ease);
}

.reject-textarea:focus {
  border-color: #f85149;
}

.reject-textarea::placeholder {
  color: var(--text-color-secondary, #64748b);
}

.submit-reject-btn {
  align-self: flex-end;
  padding: 8px 16px;
  border-radius: var(--radius-sm, 6px);
  border: none;
  background: #f85149;
  color: white;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background var(--transition-fast, 150ms ease);
}

.submit-reject-btn:hover:not(:disabled) {
  background: #da3633;
}

.submit-reject-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
