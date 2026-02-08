<script setup lang="ts">
import { ref, watch } from 'vue'
import { GripVertical, Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-vue-next'
import type { CourseOutline, CourseOutlineModule, CourseOutlineLesson, LessonType } from '@inkdown/shared/types'
import LessonTypeIcon from '../shared/LessonTypeIcon.vue'

const props = defineProps<{
  outline: CourseOutline
}>()

const emit = defineEmits<{
  update: [outline: CourseOutline]
}>()

// Deep clone for local editing
const localOutline = ref<CourseOutline>(JSON.parse(JSON.stringify(props.outline)))
const expandedModules = ref<Set<string>>(new Set(props.outline.modules.map(m => m.id)))

watch(() => props.outline, (val) => {
  localOutline.value = JSON.parse(JSON.stringify(val))
}, { deep: true })

function emitUpdate() {
  emit('update', JSON.parse(JSON.stringify(localOutline.value)))
}

function toggleModule(id: string) {
  if (expandedModules.value.has(id)) {
    expandedModules.value.delete(id)
  } else {
    expandedModules.value.add(id)
  }
}

function updateModuleTitle(mod: CourseOutlineModule, title: string) {
  mod.title = title
  emitUpdate()
}

function updateModuleDescription(mod: CourseOutlineModule, desc: string) {
  mod.description = desc
  emitUpdate()
}

function updateLessonTitle(lesson: CourseOutlineLesson, title: string) {
  lesson.title = title
  emitUpdate()
}

function updateLessonType(lesson: CourseOutlineLesson, type: LessonType) {
  lesson.type = type
  emitUpdate()
}

function removeModule(idx: number) {
  localOutline.value.modules.splice(idx, 1)
  // Re-order
  localOutline.value.modules.forEach((m, i) => { m.order = i + 1 })
  emitUpdate()
}

function removeLesson(mod: CourseOutlineModule, lessonIdx: number) {
  mod.lessons.splice(lessonIdx, 1)
  mod.lessons.forEach((l, i) => { l.order = i + 1 })
  emitUpdate()
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
  emitUpdate()
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
  emitUpdate()
}

function moveModule(fromIdx: number, direction: 'up' | 'down') {
  const toIdx = direction === 'up' ? fromIdx - 1 : fromIdx + 1
  if (toIdx < 0 || toIdx >= localOutline.value.modules.length) return
  const mods = localOutline.value.modules
  const temp = mods[fromIdx]
  mods[fromIdx] = mods[toIdx]
  mods[toIdx] = temp
  mods.forEach((m, i) => { m.order = i + 1 })
  emitUpdate()
}

const lessonTypes: LessonType[] = ['lecture', 'video', 'slides', 'practice', 'quiz']
</script>

<template>
  <div class="outline-editor">
    <div class="editor-header">
      <h4>Edit Outline</h4>
      <span class="module-count">{{ localOutline.modules.length }} modules</span>
    </div>

    <div class="modules-list">
      <div
        v-for="(mod, modIdx) in localOutline.modules"
        :key="mod.id"
        class="module-card"
      >
        <!-- Module Header -->
        <div class="module-header" @click="toggleModule(mod.id)">
          <div class="module-drag">
            <button
              class="reorder-btn"
              :disabled="modIdx === 0"
              @click.stop="moveModule(modIdx, 'up')"
            >
              <GripVertical :size="14" />
            </button>
          </div>
          <div class="module-expand">
            <ChevronDown v-if="expandedModules.has(mod.id)" :size="14" />
            <ChevronRight v-else :size="14" />
          </div>
          <input
            :value="mod.title"
            class="inline-edit module-title-input"
            @input="updateModuleTitle(mod, ($event.target as HTMLInputElement).value)"
            @click.stop
          >
          <span class="lesson-count">{{ mod.lessons.length }} lessons</span>
          <button class="icon-btn danger" @click.stop="removeModule(modIdx)">
            <Trash2 :size="14" />
          </button>
        </div>

        <!-- Module Body -->
        <div v-if="expandedModules.has(mod.id)" class="module-body">
          <textarea
            :value="mod.description"
            class="inline-edit module-desc"
            placeholder="Module description..."
            rows="2"
            @input="updateModuleDescription(mod, ($event.target as HTMLTextAreaElement).value)"
          />

          <!-- Lessons -->
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
              <button class="icon-btn danger" @click="removeLesson(mod, lessonIdx)">
                <Trash2 :size="12" />
              </button>
            </div>
          </div>

          <button class="add-lesson-btn" @click="addLesson(mod)">
            <Plus :size="14" />
            Add Lesson
          </button>
        </div>
      </div>
    </div>

    <button class="add-module-btn" @click="addModule">
      <Plus :size="16" />
      Add Module
    </button>
  </div>
</template>

<style scoped>
.outline-editor {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.editor-header h4 {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color, #e2e8f0);
  margin: 0;
}

.module-count {
  font-size: 12px;
  color: var(--text-color-secondary, #64748b);
}

.modules-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.module-card {
  border-radius: var(--radius-md, 10px);
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
  background: var(--glass-bg, rgba(30, 30, 30, 0.6));
  backdrop-filter: blur(var(--glass-blur, 12px));
  -webkit-backdrop-filter: blur(var(--glass-blur, 12px));
  overflow: hidden;
  transition: border-color var(--transition-normal, 250ms ease);
}

.module-card:hover {
  border-color: var(--glass-border-hover, rgba(255, 255, 255, 0.15));
}

.module-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  cursor: pointer;
  transition: background var(--transition-fast, 150ms ease);
}

.module-header:hover {
  background: var(--glass-bg-hover, rgba(50, 50, 50, 0.65));
}

.module-drag, .module-expand {
  display: flex;
  align-items: center;
  color: var(--text-color-secondary, #64748b);
}

.reorder-btn {
  display: flex;
  align-items: center;
  border: none;
  background: none;
  color: inherit;
  cursor: grab;
  padding: 0;
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

.lesson-count {
  font-size: 11px;
  color: var(--text-color-secondary, #64748b);
  white-space: nowrap;
}

.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
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
  padding: 0 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.module-desc {
  width: 100%;
  resize: vertical;
  font-family: inherit;
  line-height: 1.5;
}

.lessons-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
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

.add-lesson-btn,
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

.add-lesson-btn:hover,
.add-module-btn:hover {
  border-color: #f59e0b;
  color: #f59e0b;
}
</style>
