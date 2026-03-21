<script setup lang="ts">
/**
 * CourseGeneratorView — Two-column layout during generation.
 * Pre-generation: centered topic input form.
 * During generation: left = agent step timeline, right = details/todos/outline.
 */
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft } from 'lucide-vue-next'
import { useCourseStore } from '@/stores/course'
import { useLayoutStore } from '@/stores'
import { isDemoMode } from '@/utils/demo'
import type { CourseDifficulty, CourseOutline, CourseSettings } from '@inkdown/shared/types'
import NavigationDock from '@/components/ui/NavigationDock.vue'
import CourseTopicInput from '@/components/course/generator/CourseTopicInput.vue'
import GenerationProgress from '@/components/course/generator/GenerationProgress.vue'
import ResearchProgress from '@/components/course/generator/ResearchProgress.vue'
import OutlineReview from '@/components/course/generator/OutlineReview.vue'
import ContentGenerationSidebar from '@/components/course/generator/ContentGenerationSidebar.vue'
import LessonPreviewCard from '@/components/course/generator/LessonPreviewCard.vue'

const router = useRouter()
const courseStore = useCourseStore()
const layoutStore = useLayoutStore()
const sidebarWidthStyle = computed(() => ({
  '--sidebar-width': `${layoutStore.sidebarWidth}px`,
}))

type ViewMode = 'input' | 'active'

const viewMode = computed<ViewMode>(() => {
  if (courseStore.isGenerating || courseStore.isAwaitingApproval) return 'active'
  // Keep active layout when error occurred during generation (preserves thinking/progress)
  if (courseStore.generationError && courseStore.generationThreadId) return 'active'
  return 'input'
})

/** Agent step definitions for the timeline */
interface AgentStep {
  key: string
  label: string
  description: string
}

const agentSteps: AgentStep[] = [
  { key: 'research', label: 'Deep Research', description: 'Searching and analyzing sources' },
  { key: 'indexing', label: 'Indexing Sources', description: 'Building knowledge index' },
  { key: 'analysis', label: 'Analysis', description: 'Analyzing gathered information' },
  { key: 'planning', label: 'Planning Outline', description: 'Structuring course modules' },
  { key: 'approval', label: 'Awaiting Approval', description: 'Review the proposed outline' },
  { key: 'content', label: 'Generating Content', description: 'Writing lessons and materials' },
  { key: 'multimedia', label: 'Adding Multimedia', description: 'Creating slides and visuals' },
  { key: 'review', label: 'Quality Review', description: 'Final quality checks' },
  { key: 'complete', label: 'Complete', description: 'Course is ready' },
]

const currentStepIndex = computed(() =>
  agentSteps.findIndex((s) => s.key === courseStore.generationStage)
)

function stepStatus(idx: number): 'done' | 'active' | 'pending' {
  if (idx < currentStepIndex.value) return 'done'
  if (idx === currentStepIndex.value) return 'active'
  return 'pending'
}

/** Show content tree instead of pipeline timeline during content generation stages */
const showContentTree = computed(() => {
  const stage = courseStore.generationStage
  return (
    (stage === 'content' || stage === 'multimedia' || stage === 'saving' || stage === 'assembly')
    && courseStore.pendingOutline !== null
  )
})

/** Data for the currently selected lesson preview */
const selectedLessonData = computed(() => {
  const title = courseStore.selectedPreviewLesson
  if (!title) return null
  return courseStore.generatedLessonMap.get(title) ?? null
})

function handleLessonSelect(lessonTitle: string) {
  courseStore.selectedPreviewLesson = lessonTitle
}

function handleSubmit(payload: {
  topic: string
  difficulty: CourseDifficulty
  settings: Partial<CourseSettings>
  focusAreas: string[]
}) {
  courseStore.startGeneration(
    payload.topic,
    payload.difficulty,
    payload.settings,
    payload.focusAreas
  )
}

function handleApprove(modifiedOutline?: CourseOutline) {
  courseStore.approveOutline(modifiedOutline)
}

function handleReject(feedback: string) {
  courseStore.rejectOutline(feedback)
}

function handleCancel() {
  courseStore.cancelGeneration()
}

function handleDismissError() {
  courseStore.generationError = null
  courseStore.generationThreadId = null
}

function goBack() {
  router.push({ name: 'courseList' })
}

// Redirect away from generator in demo mode
onMounted(() => {
  if (isDemoMode()) {
    router.replace({ name: 'courseList' })
  }
})
</script>

<template>
  <div class="generator-view">
    <!-- Header -->
    <header
      class="generator-header"
      :style="sidebarWidthStyle"
    >
      <div class="dock-area">
        <NavigationDock :pill-mode="!layoutStore.sidebarVisible" />
      </div>
      <div class="header-content">
        <button
          class="back-btn"
          @click="goBack"
        >
          <ArrowLeft :size="16" />
          Courses
        </button>
        <div class="header-title">
          <h1>Course Generator</h1>
        </div>
        <div class="header-right">
          <button
            v-if="courseStore.isGenerating"
            class="cancel-btn"
            @click="handleCancel"
          >
            Cancel
          </button>
          <button
            v-else-if="courseStore.generationError && courseStore.generationThreadId"
            class="cancel-btn"
            @click="handleDismissError"
          >
            Back to form
          </button>
        </div>
      </div>
    </header>

    <!-- Pre-generation: Centered Topic Input -->
    <main
      v-if="viewMode === 'input'"
      class="generator-body"
    >
      <div class="generator-content">
        <CourseTopicInput @submit="handleSubmit" />
      </div>
    </main>

    <!-- During generation: Two-column layout -->
    <div
      v-else
      class="generator-active"
    >
      <!-- Left: Content Generation Tree (during content stages) -->
      <div
        v-if="showContentTree && courseStore.pendingOutline"
        class="generator-content-tree"
      >
        <ContentGenerationSidebar
          :outline="courseStore.pendingOutline"
          :generated-lessons="courseStore.generatedLessonMap"
          :selected-lesson="courseStore.selectedPreviewLesson"
          :generated-count="courseStore.generatedLessonsCount"
          :total-lessons="courseStore.totalExpectedLessons || 0"
          @select="handleLessonSelect"
        />
      </div>

      <!-- Left: Agent Step Timeline (pre-content stages) -->
      <div
        v-else
        class="generator-timeline"
      >
        <div class="timeline-header">
          <h3>Generation Pipeline</h3>
        </div>
        <div class="timeline-steps">
          <div
            v-for="(step, idx) in agentSteps"
            :key="step.key"
            class="timeline-step"
            :class="stepStatus(idx)"
          >
            <div class="step-indicator">
              <div class="step-dot" />
              <div
                v-if="idx < agentSteps.length - 1"
                class="step-line"
              />
            </div>
            <div class="step-content">
              <span class="step-label">{{ step.label }}</span>
              <span class="step-description">{{ step.description }}</span>
            </div>
          </div>
        </div>

        <!-- Overall progress -->
        <div class="timeline-progress">
          <div class="progress-bar-track">
            <div
              class="progress-bar-fill"
              :style="{ width: `${courseStore.generationProgress}%` }"
            />
          </div>
          <span class="progress-label">{{ courseStore.generationProgress }}%</span>
        </div>
      </div>

      <!-- Right: Details Panel -->
      <div class="generator-details">
        <!-- Outline approval -->
        <div
          v-if="courseStore.isAwaitingApproval && courseStore.pendingOutline"
          class="details-section"
        >
          <OutlineReview
            :outline="courseStore.pendingOutline"
            :submitting="courseStore.isApprovingOutline"
            @approve="handleApprove"
            @reject="handleReject"
          />
        </div>

        <!-- Content generation with lesson preview -->
        <div
          v-else-if="showContentTree"
          class="details-section"
        >
          <!-- Progress header -->
          <div class="content-progress-header glass-card">
            <h3 class="progress-title">Generating Content</h3>
            <div class="progress-bar-track">
              <div
                class="progress-bar-fill"
                :style="{ width: `${courseStore.generationProgress}%` }"
              />
            </div>
            <div class="progress-meta">
              <span>{{ courseStore.generatedLessonsCount }}/{{ courseStore.totalExpectedLessons || '?' }} lessons generated</span>
              <span class="progress-pct">{{ courseStore.generationProgress }}%</span>
            </div>
          </div>

          <!-- Error banner -->
          <div
            v-if="courseStore.generationError"
            class="error-banner"
          >
            {{ courseStore.generationError }}
          </div>

          <!-- Lesson preview -->
          <LessonPreviewCard
            v-if="selectedLessonData"
            :lesson-title="selectedLessonData.title"
            :lesson-type="selectedLessonData.type"
            :markdown-preview="selectedLessonData.markdownPreview"
            :module-title="selectedLessonData.moduleTitle"
          />
          <div
            v-else
            class="empty-preview glass-card"
          >
            <p>Select a completed lesson to preview its content.</p>
          </div>
        </div>

        <!-- Default generation progress details (pre-content stages) -->
        <div
          v-else
          class="details-section"
        >
          <GenerationProgress
            :stage="courseStore.generationStage"
            :progress="courseStore.generationProgress"
            :thinking="courseStore.generationThinking"
            :error="courseStore.generationError"
          />

          <!-- Research Sub-Progress -->
          <ResearchProgress
            v-if="courseStore.researchProgress && courseStore.generationStage === 'research'"
            :progress="courseStore.researchProgress"
            class="research-section"
          />

          <!-- Agent Todos (wired to store, uses optional chaining for Agent 3 properties) -->
          <div
            v-if="(courseStore as any).agentTodos?.length"
            class="todos-section glass-card"
          >
            <h4>Tasks</h4>
            <div class="todo-list">
              <div
                v-for="(todo, idx) in (courseStore as any).agentTodos"
                :key="idx"
                class="todo-item"
                :class="{ done: todo.done }"
              >
                <span class="todo-check">{{ todo.done ? '[x]' : '[ ]' }}</span>
                <span class="todo-text">{{ todo.text }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Error state (shown on input page only, e.g. after dismissing an error) -->
    <div
      v-if="courseStore.generationError && viewMode === 'input'"
      class="generator-error glass-card"
    >
      <p>{{ courseStore.generationError }}</p>
      <button
        class="retry-btn"
        @click="courseStore.generationError = null"
      >
        Try Again
      </button>
    </div>
  </div>
</template>

<style scoped>
.generator-view {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  background: var(--app-bg, #010409);
  overflow: hidden;
}

/* ============================================
 * HEADER
 * ============================================ */

.generator-header {
  display: flex;
  align-items: center;
  height: 56px;
  flex-shrink: 0;
  padding: 8px 16px 8px 0;
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
  gap: 16px;
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
}

.back-btn:hover {
  border-color: var(--text-color-secondary, #64748b);
  color: var(--text-color, #e2e8f0);
}

.header-title h1 {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-color, #e2e8f0);
  margin: 0;
}

.header-right {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.cancel-btn {
  padding: 6px 14px;
  border-radius: 6px;
  border: 1px solid rgba(248, 81, 73, 0.3);
  background: rgba(248, 81, 73, 0.1);
  color: #f85149;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.cancel-btn:hover {
  background: rgba(248, 81, 73, 0.2);
}

/* ============================================
 * PRE-GENERATION: Centered input
 * ============================================ */

.generator-body {
  flex: 1;
  overflow-y: auto;
  padding: 40px 40px 60px;
}

.generator-body::-webkit-scrollbar {
  width: 6px;
}

.generator-body::-webkit-scrollbar-thumb {
  background: var(--border-color, #333338);
  border-radius: 3px;
}

.generator-content {
  max-width: 700px;
  margin: 0 auto;
}

/* ============================================
 * DURING GENERATION: Two-column layout
 * ============================================ */

.generator-active {
  display: flex;
  flex: 1;
  min-height: 0;
  gap: 0;
}

/* Left: Content Generation Tree (during content stages) */
.generator-content-tree {
  width: 360px;
  flex-shrink: 0;
  overflow-y: auto;
  padding: 24px;
  border-right: 1px solid var(--border-color, #333338);
  background: var(--app-bg, #010409);
  display: flex;
  flex-direction: column;
}

.generator-content-tree::-webkit-scrollbar {
  width: 4px;
}

.generator-content-tree::-webkit-scrollbar-thumb {
  background: var(--border-color, #333338);
  border-radius: 2px;
}

/* Left: Agent Step Timeline */
.generator-timeline {
  width: 360px;
  flex-shrink: 0;
  overflow-y: auto;
  padding: 24px;
  border-right: 1px solid var(--border-color, #333338);
  background: var(--app-bg, #010409);
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.generator-timeline::-webkit-scrollbar {
  width: 4px;
}

.generator-timeline::-webkit-scrollbar-thumb {
  background: var(--border-color, #333338);
  border-radius: 2px;
}

.timeline-header h3 {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color, #e2e8f0);
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.timeline-steps {
  display: flex;
  flex-direction: column;
}

.timeline-step {
  display: flex;
  gap: 14px;
  position: relative;
}

.step-indicator {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
  width: 16px;
}

.step-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid var(--border-color, #333338);
  background: var(--app-bg, #010409);
  flex-shrink: 0;
  transition: all 0.3s;
}

.step-line {
  width: 2px;
  flex: 1;
  min-height: 24px;
  background: var(--border-color, #333338);
  transition: background 0.3s;
}

/* Step states */
.timeline-step.done .step-dot {
  background: #10b981;
  border-color: #10b981;
}

.timeline-step.done .step-line {
  background: #10b981;
}

.timeline-step.active .step-dot {
  background: #f59e0b;
  border-color: #f59e0b;
  box-shadow: 0 0 8px rgba(245, 158, 11, 0.4);
}

.timeline-step.active .step-line {
  background: linear-gradient(to bottom, #f59e0b, var(--border-color, #333338));
}

.step-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-bottom: 20px;
}

.step-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color-secondary, #64748b);
  transition: color 0.3s;
}

.timeline-step.done .step-label {
  color: #10b981;
}

.timeline-step.active .step-label {
  color: #f59e0b;
}

.step-description {
  font-size: 11px;
  color: var(--text-color-secondary, #64748b);
  opacity: 0.7;
}

.timeline-step.active .step-description {
  opacity: 1;
}

/* Progress bar at bottom of timeline */
.timeline-progress {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: auto;
  padding-top: 16px;
  border-top: 1px solid var(--border-color, #333338);
}

.progress-bar-track {
  flex: 1;
  height: 6px;
  border-radius: 3px;
  background: var(--border-color, #333338);
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  border-radius: 3px;
  background: #f59e0b;
  transition: width 0.5s ease;
}

.progress-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color-secondary, #94a3b8);
  min-width: 36px;
  text-align: right;
}

/* Right: Details Panel */
.generator-details {
  flex: 1;
  overflow-y: auto;
  padding: 24px 32px 40px;
  min-width: 0;
}

.generator-details::-webkit-scrollbar {
  width: 6px;
}

.generator-details::-webkit-scrollbar-thumb {
  background: var(--border-color, #333338);
  border-radius: 3px;
}

.details-section {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.research-section {
  margin-top: 4px;
}

/* ============================================
 * CONTENT GENERATION PROGRESS HEADER
 * ============================================ */

.content-progress-header {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.content-progress-header .progress-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-color, #e2e8f0);
  margin: 0;
}

.progress-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-color-secondary, #94a3b8);
}

.progress-pct {
  font-weight: 600;
}

.error-banner {
  padding: 12px 16px;
  border-radius: var(--radius-sm, 6px);
  background: rgba(248, 81, 73, 0.1);
  border: 1px solid rgba(248, 81, 73, 0.3);
  color: #f85149;
  font-size: 13px;
}

.empty-preview {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
}

.empty-preview p {
  color: var(--text-color-secondary, #64748b);
  font-size: 14px;
  margin: 0;
}

/* ============================================
 * TODOS (from agent)
 * ============================================ */

.glass-card {
  padding: 16px;
  border-radius: var(--radius-card, 12px);
  background: var(--glass-bg, rgba(30, 30, 30, 0.6));
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.1));
  backdrop-filter: blur(var(--glass-blur, 12px));
}

.todos-section h4 {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color, #e2e8f0);
  margin: 0 0 10px;
}

.todo-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.todo-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-color, #e2e8f0);
}

.todo-item.done {
  color: var(--text-color-secondary, #64748b);
}

.todo-item.done .todo-text {
  text-decoration: line-through;
}

.todo-check {
  font-family: monospace;
  font-size: 12px;
  color: var(--text-color-secondary, #64748b);
  flex-shrink: 0;
}

.todo-item.done .todo-check {
  color: #10b981;
}

/* ============================================
 * ERROR STATE
 * ============================================ */

.generator-error {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 20px;
  border: 1px solid rgba(248, 81, 73, 0.3);
  background: rgba(248, 81, 73, 0.08);
  backdrop-filter: blur(12px);
  z-index: 100;
}

.generator-error p {
  margin: 0;
  font-size: 13px;
  color: #f85149;
}

.retry-btn {
  padding: 6px 14px;
  border-radius: 6px;
  border: 1px solid rgba(248, 81, 73, 0.3);
  background: rgba(248, 81, 73, 0.15);
  color: #f85149;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
  white-space: nowrap;
}

.retry-btn:hover {
  background: rgba(248, 81, 73, 0.25);
}
</style>
