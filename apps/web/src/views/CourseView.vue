<script setup lang="ts">
/**
 * CourseView — Course viewer with left sidebar navigation.
 * Left: NavigationDock + CourseNav (modules). Center: lesson content.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCourseStore } from '@/stores/course'
import { useCourseExplainStore } from '@/stores/courseExplain'
import { useLayoutStore } from '@/stores'
import { useTextSelection } from '@/composables/useTextSelection'
import { ArrowLeft, Loader2, CheckCircle2, Clock } from 'lucide-vue-next'
import NavigationDock from '@/components/ui/NavigationDock.vue'
import CourseNav from '@/components/course/viewer/CourseNav.vue'
import LessonContent from '@/components/course/viewer/LessonContent.vue'
import LessonTypeIcon from '@/components/course/shared/LessonTypeIcon.vue'
import ProgressBar from '@/components/course/shared/ProgressBar.vue'
import CourseExplainSidebar from '@/components/course/viewer/CourseExplainSidebar.vue'

const route = useRoute()
const router = useRouter()
const store = useCourseStore()
const layoutStore = useLayoutStore()
const explainStore = useCourseExplainStore()
const contentAreaRef = ref<HTMLElement>()
const { selection } = useTextSelection(contentAreaRef)
const progressColor = computed(
  () =>
    getComputedStyle(document.documentElement).getPropertyValue('--sec-accent').trim() || '#b4883a'
)

const sidebarWidthStyle = computed(() => ({
  '--sidebar-width': `${layoutStore.sidebarWidth}px`,
}))

// Wire text selection to explain store
watch(selection, (sel) => {
  if (sel) explainStore.setHighlightedText(sel.text, sel.surroundingContext, sel.sectionHeading)
})

// Clear chat on lesson switch
watch(
  () => store.currentLesson?.id,
  () => {
    explainStore.clearMessages()
    explainStore.clearHighlightedText()
  }
)

onMounted(() => {
  const courseId = route.params.id as string
  if (courseId) {
    store.fetchCourse(courseId)
  }
})

function goBack() {
  router.push({ name: 'courseList' })
}

function handleSelectLesson(moduleIndex: number, lessonIndex: number) {
  store.selectLesson(moduleIndex, lessonIndex)
}

function handleCompleteLesson() {
  if (store.currentLesson) {
    store.completeLesson(store.currentLesson.id)
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
</script>

<template>
  <div class="course-view">
    <!-- Top Header -->
    <header
      class="course-top-bar"
      :style="sidebarWidthStyle"
    >
      <div class="dock-area">
        <NavigationDock :pill-mode="!layoutStore.sidebarVisible" />
      </div>
      <button
        class="back-btn"
        @click="goBack"
      >
        <ArrowLeft :size="16" />
        Courses
      </button>
      <div
        v-if="store.activeCourse"
        class="top-bar-info"
      >
        <span class="course-name">{{ store.activeCourse.title }}</span>
        <div class="top-progress">
          <ProgressBar
            :value="store.courseProgress"
            :color="progressColor"
            :height="4"
          />
          <span class="progress-text">{{ store.courseProgress }}%</span>
        </div>
      </div>
    </header>

    <!-- Loading -->
    <div
      v-if="!store.activeCourse"
      class="loading-state"
    >
      <Loader2
        :size="24"
        class="spinning"
      />
      <span>Loading course...</span>
    </div>

    <!-- Body: Left Sidebar + Content -->
    <div
      v-else
      class="course-body"
    >
      <!-- Left Sidebar: Modules -->
      <aside
        v-if="layoutStore.sidebarVisible"
        class="course-sidebar"
      >
        <CourseNav
          :modules="store.activeModules"
          :selected-module-index="store.selectedModuleIndex"
          :selected-lesson-index="store.selectedLessonIndex"
          @select="handleSelectLesson"
        />
      </aside>

      <!-- Main Content -->
      <div class="course-main">
        <div
          ref="contentAreaRef"
          class="content-scroll"
        >
          <div class="content-inner">
            <!-- Lesson info bar: type badge + duration | Mark Complete -->
            <div
              v-if="store.currentLesson"
              class="lesson-info-bar"
            >
              <div class="lesson-info-left">
                <span class="lesson-type-badge">
                  <LessonTypeIcon
                    :type="store.currentLesson.type"
                    :size="13"
                  />
                  {{ capitalize(store.currentLesson.type) }}
                </span>
                <span class="lesson-duration">
                  <Clock :size="12" />
                  {{ store.currentLesson.duration }}
                </span>
              </div>
              <button
                v-if="store.currentLesson.status !== 'completed'"
                class="complete-btn"
                @click="handleCompleteLesson"
              >
                <CheckCircle2 :size="14" />
                Mark Complete
              </button>
              <span
                v-else
                class="completed-badge"
              >
                <CheckCircle2 :size="14" />
                Completed
              </span>
            </div>

            <LessonContent
              v-if="store.currentLesson"
              :lesson="store.currentLesson"
            />
            <div
              v-else
              class="no-lesson"
            >
              <p>Select a lesson from the sidebar to begin.</p>
            </div>
          </div>
        </div>
      </div>

      <!-- AI Tutor Sidebar -->
      <CourseExplainSidebar
        v-if="layoutStore.rightPanelVisible"
        :lesson="store.currentLesson ?? null"
        :course-title="store.activeCourse?.title"
        :module-title="store.currentModule?.title"
        @close="layoutStore.toggleRightPanel()"
      />
    </div>
  </div>
</template>

<style scoped>
.course-view {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  background: var(--app-bg, #010409);
  overflow: hidden;
}

/* ============================================
 * TOP HEADER BAR
 * ============================================ */

.course-top-bar {
  display: flex;
  align-items: center;
  height: 56px;
  flex-shrink: 0;
  padding: 8px 16px 8px 0;
  gap: 12px;
  background: var(--app-bg, #010409);
}

.dock-area {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--sidebar-width, 260px);
  flex-shrink: 0;
  transition: width 0.25s ease;
}

.back-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  border-radius: 6px;
  border: 1px solid var(--border-color, #333338);
  background: transparent;
  color: var(--text-color-secondary, #94a3b8);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
}

.back-btn:hover {
  border-color: var(--text-color-secondary, #64748b);
  color: var(--text-color, #e2e8f0);
}

.top-bar-info {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: 1;
  min-width: 0;
}

.course-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color, #e2e8f0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.top-progress {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 120px;
  flex-shrink: 0;
}

.progress-text {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-color-secondary, #94a3b8);
}

/* ============================================
 * LOADING STATE
 * ============================================ */

.loading-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-color-secondary, #94a3b8);
  font-size: 14px;
}

/* ============================================
 * BODY: Left Sidebar + Content
 * ============================================ */

.course-body {
  display: flex;
  flex: 1;
  min-height: 0;
}

.course-sidebar {
  width: var(--sidebar-width, 260px);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  background: var(--sidebar-bg, #010409);
}

.course-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 0 16px 16px 16px;
}

.content-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 32px 24px 60px;
  background: var(--editorBgColor, var(--card-bg, #282828));
  border-radius: 16px;
  box-shadow: 0 0 0 1px var(--glass-border, rgba(255, 255, 255, 0.04));
}

.content-scroll::-webkit-scrollbar {
  width: 6px;
}

.content-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.content-scroll::-webkit-scrollbar-thumb {
  background: var(--border-color, #333338);
  border-radius: 3px;
}

.content-inner {
  max-width: 800px;
  margin: 0 auto;
}

.no-lesson {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 60px;
  color: var(--text-color-secondary, #64748b);
  font-size: 14px;
}

.no-lesson p {
  margin: 0;
}

/* ============================================
 * LESSON INFO BAR
 * ============================================ */

.lesson-info-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-color, #333338);
}

.lesson-info-left {
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
  background: var(--sec-accent-bg, rgba(180, 136, 58, 0.1));
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
  color: var(--sec-accent, #f59e0b);
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
  border: 1px solid var(--sec-primary, #3b7d68);
  background: var(--sec-primary-bg, rgba(59, 125, 104, 0.1));
  color: var(--sec-primary, #3b7d68);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast, 150ms ease);
}

.complete-btn:hover {
  background: var(--sec-primary, #3b7d68);
  color: white;
}

.completed-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 500;
  color: var(--sec-primary, #3b7d68);
}

/* ============================================
 * ANIMATIONS
 * ============================================ */

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
