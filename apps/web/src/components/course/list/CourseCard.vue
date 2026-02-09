<script setup lang="ts">
import { computed } from 'vue'
import { Clock, BookOpen, Trash2, Loader2 } from 'lucide-vue-next'
import type { Course } from '@inkdown/shared/types'
import ProgressBar from '../shared/ProgressBar.vue'

const props = defineProps<{
  course: Course
}>()

const emit = defineEmits<{
  open: [courseId: string]
  delete: [courseId: string]
}>()

const difficultyColor = computed(() => {
  switch (props.course.difficulty) {
    case 'beginner':
      return '#10b981'
    case 'intermediate':
      return '#f59e0b'
    case 'advanced':
      return '#f85149'
    default:
      return '#94a3b8'
  }
})

const statusLabel = computed(() => {
  switch (props.course.status) {
    case 'generating':
      return 'Generating...'
    case 'ready':
      return 'Ready'
    case 'archived':
      return 'Archived'
    default:
      return props.course.status
  }
})

const isReady = computed(() => props.course.status === 'ready')
</script>

<template>
  <div
    class="course-card"
    :class="{ clickable: isReady }"
    @click="isReady ? emit('open', course.id) : undefined"
  >
    <!-- Header - Status row with actions -->
    <div class="card-header">
      <span
        class="status-badge"
        :class="course.status"
      >
        <Loader2
          v-if="course.status === 'generating'"
          :size="12"
          class="spinning"
        />
        {{ statusLabel }}
      </span>
      <button
        class="delete-btn"
        title="Delete course"
        @click.stop="emit('delete', course.id)"
      >
        <Trash2 :size="14" />
      </button>
    </div>

    <!-- Level badge -->
    <span
      class="difficulty-badge"
      :style="{ color: difficultyColor, borderColor: difficultyColor }"
    >
      {{ course.difficulty }}
    </span>

    <!-- Title & Topic -->
    <h4 class="card-title">{{ course.title }}</h4>
    <p class="card-topic">{{ course.topic }}</p>

    <!-- Description -->
    <p class="card-description">{{ course.description }}</p>

    <!-- Meta -->
    <div class="card-meta">
      <span class="meta-item">
        <Clock :size="13" />
        {{ course.estimatedHours ?? 0 }}h
      </span>
      <span class="meta-item">
        <BookOpen :size="13" />
        {{ (course.learningObjectives ?? []).length }} objectives
      </span>
    </div>

    <!-- Progress - always show area for consistent height -->
    <div class="card-progress">
      <ProgressBar
        v-if="isReady"
        :value="course.progress"
        :show-label="true"
        color="#f59e0b"
        :height="5"
      />
    </div>
  </div>
</template>

<style scoped>
.course-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 18px;
  height: 100%; /* Fill wrapper for uniform height */
  min-height: 200px; /* Minimum card height */
  border-radius: var(--radius-card, 12px);
  background: var(--glass-bg, rgba(30, 30, 30, 0.6));
  backdrop-filter: blur(var(--glass-blur, 12px));
  -webkit-backdrop-filter: blur(var(--glass-blur, 12px));
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
  box-shadow: var(--shadow-md, 0 4px 12px rgba(0, 0, 0, 0.25));
  transition: all var(--transition-normal, 250ms ease);
}

.course-card.clickable {
  cursor: pointer;
}

.course-card.clickable:hover {
  background: var(--glass-bg-hover, rgba(50, 50, 50, 0.65));
  border-color: var(--glass-border-hover, rgba(255, 255, 255, 0.15));
  box-shadow: var(--shadow-lg, 0 8px 24px rgba(0, 0, 0, 0.3));
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.difficulty-badge {
  font-size: 11px;
  font-weight: 600;
  text-transform: capitalize;
  padding: 2px 8px;
  border-radius: var(--radius-full, 9999px);
  border: 1px solid;
  backdrop-filter: blur(8px);
}

.status-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 12px;
}

.status-badge.ready {
  color: #10b981;
  background: rgba(16, 185, 129, 0.12);
}

.status-badge.generating {
  color: #3b82f6;
  background: rgba(59, 130, 246, 0.12);
}

.status-badge.archived {
  color: var(--text-color-secondary, #64748b);
  background: rgba(100, 116, 139, 0.12);
}

.card-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-color, #e2e8f0);
  margin: 0;
  line-height: 1.3;
}

.card-topic {
  font-size: 12px;
  color: #f59e0b;
  margin: -4px 0 0;
  font-weight: 500;
}

.card-description {
  font-size: 13px;
  color: var(--text-color-secondary, #94a3b8);
  line-height: 1.5;
  margin: 0;
  flex-grow: 1; /* Push meta and progress to bottom */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-meta {
  display: flex;
  gap: 14px;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-color-secondary, #64748b);
}

.card-progress {
  margin-top: auto; /* Push to bottom */
  min-height: 20px; /* Reserve space even when empty */
  padding-top: 8px;
}

/* Delete button - hidden by default, shown on card hover */
.delete-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm, 6px);
  color: var(--text-color-secondary, #64748b);
  cursor: pointer;
  transition: all var(--transition-fast, 150ms ease);
  opacity: 0; /* Hidden by default */
}

.course-card:hover .delete-btn {
  opacity: 1; /* Show on hover */
}

.delete-btn:hover {
  background: rgba(248, 81, 73, 0.12);
  color: #f85149;
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
