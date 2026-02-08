<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Plus, Loader2, GraduationCap } from 'lucide-vue-next'
import { useCourseStore } from '@/stores/course'
import { useLayoutStore } from '@/stores'
import type { CourseDifficulty, CourseStatus } from '@inkdown/shared/types'
import NavigationDock from '@/components/ui/NavigationDock.vue'
import CourseCard from '@/components/course/list/CourseCard.vue'
import CourseFilters from '@/components/course/list/CourseFilters.vue'

const router = useRouter()
const courseStore = useCourseStore()
const layoutStore = useLayoutStore()

const sidebarWidthStyle = computed(() => ({
  '--sidebar-width': `${layoutStore.sidebarWidth}px`,
}))

const statusFilter = ref<CourseStatus | 'all'>('all')
const difficultyFilter = ref<CourseDifficulty | 'all'>('all')

const filteredCourses = computed(() => {
  return courseStore.courses.filter((c) => {
    if (statusFilter.value !== 'all' && c.status !== statusFilter.value) return false
    if (difficultyFilter.value !== 'all' && c.difficulty !== difficultyFilter.value) return false
    return true
  })
})

function openCourse(courseId: string) {
  router.push({ name: 'courseViewer', params: { id: courseId } })
}

function handleDelete(courseId: string) {
  courseStore.deleteCourse(courseId)
}

function goToGenerator() {
  router.push({ name: 'courseGenerator' })
}

onMounted(() => {
  courseStore.fetchCourses()
})
</script>

<template>
  <div class="course-list-view">
    <!-- Header -->
    <header class="list-header" :style="sidebarWidthStyle">
      <div class="dock-area">
        <NavigationDock :pill-mode="!layoutStore.sidebarVisible" />
      </div>
      <div class="header-content">
        <div class="header-title">
          <h1>Courses</h1>
          <span v-if="courseStore.courses.length > 0" class="course-count">
            {{ courseStore.courses.length }} course{{ courseStore.courses.length !== 1 ? 's' : '' }}
          </span>
        </div>
        <button class="create-btn" @click="goToGenerator">
          <Plus :size="16" />
          New Course
        </button>
      </div>
    </header>

    <!-- Main -->
    <main class="list-body">
      <!-- Filters -->
      <CourseFilters
        v-if="courseStore.courses.length > 0"
        v-model:status="statusFilter"
        v-model:difficulty="difficultyFilter"
      />

      <!-- Loading -->
      <div v-if="courseStore.isLoadingCourses" class="loading-state">
        <Loader2 :size="24" class="spinning" />
        <span>Loading courses...</span>
      </div>

      <!-- Empty State -->
      <div v-else-if="courseStore.courses.length === 0" class="empty-state glass-card">
        <div class="empty-icon">
          <GraduationCap :size="48" />
        </div>
        <h3>No courses yet</h3>
        <p>Create your first AI-generated course to get started learning.</p>
        <button class="create-btn large" @click="goToGenerator">
          <Plus :size="18" />
          Create Your First Course
        </button>
      </div>

      <!-- No Filter Results -->
      <div v-else-if="filteredCourses.length === 0" class="empty-state">
        <p>No courses match the current filters.</p>
      </div>

      <!-- Course Grid -->
      <div v-else class="course-grid">
        <div v-for="course in filteredCourses" :key="course.id" class="glass-card-wrapper">
          <CourseCard
            :course="course"
            @open="openCourse"
            @delete="handleDelete"
          />
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.course-list-view {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  background: var(--app-bg, #010409);
  overflow: hidden;
}

.list-header {
  display: flex;
  align-items: center;
  height: 56px;
  flex-shrink: 0;
  padding: 8px 24px 8px 0;
  gap: 16px;
}

.dock-area {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--sidebar-width, 260px);
  flex-shrink: 0;
  transition: width 0.25s ease;
}

.header-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.header-title {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.header-title h1 {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-color, #e2e8f0);
  margin: 0;
}

.course-count {
  font-size: 12px;
  color: var(--text-color-secondary, #94a3b8);
}

.create-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 8px;
  border: none;
  background: #f59e0b;
  color: #1a1a1a;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.create-btn:hover {
  background: #fbbf24;
}

.create-btn.large {
  padding: 12px 24px;
  font-size: 14px;
  border-radius: 10px;
}

.list-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 40px 40px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.list-body::-webkit-scrollbar {
  width: 6px;
}

.list-body::-webkit-scrollbar-thumb {
  background: var(--border-color, #333338);
  border-radius: 3px;
}

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 60px 0;
  color: var(--text-color-secondary, #94a3b8);
  font-size: 14px;
}

/* Glass Card Wrapper for CourseCards */
.glass-card-wrapper {
  border-radius: var(--radius-card, 12px);
  background: var(--glass-bg, rgba(30, 30, 30, 0.6));
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.1));
  backdrop-filter: blur(var(--glass-blur, 12px));
  transition: all 0.2s;
}

.glass-card-wrapper:hover {
  border-color: rgba(245, 158, 11, 0.3);
  backdrop-filter: blur(16px);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
}

/* Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 60px 40px;
  text-align: center;
}

.empty-state.glass-card {
  border-radius: var(--radius-panel, 16px);
  background: var(--glass-bg, rgba(30, 30, 30, 0.6));
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.1));
  backdrop-filter: blur(var(--glass-blur, 12px));
  max-width: 480px;
  margin: 40px auto 0;
}

.empty-state h3 {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-color, #e2e8f0);
  margin: 0;
}

.empty-state p {
  font-size: 14px;
  color: var(--text-color-secondary, #94a3b8);
  margin: 0;
  line-height: 1.5;
}

.empty-icon {
  margin-bottom: 8px;
  color: var(--text-color-secondary, #64748b);
  opacity: 0.6;
}

.course-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.spinning {
  animation: spin 1s linear infinite;
}
</style>
