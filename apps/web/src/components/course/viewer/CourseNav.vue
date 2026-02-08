<script setup lang="ts">
import { ref } from 'vue'
import { ChevronDown, ChevronRight, CheckCircle2 } from 'lucide-vue-next'
import type { CourseModule } from '@inkdown/shared/types'
import LessonTypeIcon from '../shared/LessonTypeIcon.vue'
import ProgressBar from '../shared/ProgressBar.vue'

defineProps<{
  modules: CourseModule[]
  selectedModuleIndex: number
  selectedLessonIndex: number
}>()

const emit = defineEmits<{
  select: [moduleIndex: number, lessonIndex: number]
}>()

const collapsedModules = ref<Record<number, boolean>>({})

function toggleModule(idx: number) {
  collapsedModules.value[idx] = !collapsedModules.value[idx]
}

function isCollapsed(idx: number) {
  return !!collapsedModules.value[idx]
}

function moduleProgress(mod: CourseModule): number {
  if (mod.lessons.length === 0) return 0
  const completed = mod.lessons.filter(l => l.status === 'completed').length
  return Math.round((completed / mod.lessons.length) * 100)
}
</script>

<template>
  <nav class="course-nav">
    <div class="nav-header">
      <span class="nav-title">Modules</span>
    </div>

    <div class="modules-list">
      <div
        v-for="(mod, mIdx) in modules"
        :key="mod.id"
        class="module-section"
        :class="{ active: mIdx === selectedModuleIndex }"
      >
        <!-- Module header -->
        <button class="module-toggle" @click="toggleModule(mIdx)">
          <ChevronDown v-if="!isCollapsed(mIdx)" :size="14" />
          <ChevronRight v-else :size="14" />
          <span class="module-name">{{ mod.title }}</span>
        </button>

        <!-- Module progress -->
        <div class="module-progress">
          <ProgressBar
            :value="moduleProgress(mod)"
            color="#10b981"
            :height="3"
          />
        </div>

        <!-- Lessons -->
        <div v-if="!isCollapsed(mIdx)" class="lessons-list">
          <button
            v-for="(lesson, lIdx) in mod.lessons"
            :key="lesson.id"
            class="lesson-btn"
            :class="{
              selected: mIdx === selectedModuleIndex && lIdx === selectedLessonIndex,
              completed: lesson.status === 'completed',
            }"
            @click="emit('select', mIdx, lIdx)"
          >
            <span class="lesson-icon">
              <CheckCircle2 v-if="lesson.status === 'completed'" :size="14" class="check-icon" />
              <LessonTypeIcon v-else :type="lesson.type" :size="14" />
            </span>
            <span class="lesson-name">{{ lesson.title }}</span>
          </button>
        </div>
      </div>
    </div>
  </nav>
</template>

<style scoped>
.course-nav {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--sidebar-bg, #010409);
  overflow-y: auto;
}

.course-nav::-webkit-scrollbar {
  width: 4px;
}

.course-nav::-webkit-scrollbar-thumb {
  background: var(--border-color, #333338);
  border-radius: 2px;
}

.nav-header {
  padding: 16px 16px 12px;
}

.nav-title {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-color-secondary, #64748b);
}

.modules-list {
  display: flex;
  flex-direction: column;
  padding: 8px 0;
}

.module-section {
  border-bottom: 1px solid var(--border-color, #1e1e24);
}

.module-section:last-child {
  border-bottom: none;
}

.module-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 10px 16px 4px;
  border: none;
  background: none;
  color: var(--text-color, #e2e8f0);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  text-align: left;
}

.module-toggle:hover {
  color: #f59e0b;
}

.module-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.module-progress {
  padding: 4px 16px 6px;
}

.lessons-list {
  display: flex;
  flex-direction: column;
  padding: 0 8px 8px;
}

.lesson-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  border: none;
  border-radius: var(--radius-sm, 6px);
  background: transparent;
  color: var(--text-color-secondary, #94a3b8);
  font-size: 13px;
  cursor: pointer;
  text-align: left;
  transition: all var(--transition-fast, 150ms ease);
}

.lesson-btn:hover {
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-color, #e2e8f0);
}

.lesson-btn.selected {
  background: rgba(245, 158, 11, 0.12);
  color: #f59e0b;
}

.lesson-btn.completed {
  color: #10b981;
}

.lesson-btn.completed .lesson-name {
  text-decoration: line-through;
  text-decoration-color: rgba(16, 185, 129, 0.4);
}

.lesson-icon {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.check-icon {
  color: #10b981;
}

.lesson-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
