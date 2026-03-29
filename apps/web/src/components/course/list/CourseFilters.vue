<script setup lang="ts">
import type { CourseDifficulty, CourseStatus } from '@inkdown/shared/types'

const statusFilter = defineModel<CourseStatus | 'all'>('status', { default: 'all' })
const difficultyFilter = defineModel<CourseDifficulty | 'all'>('difficulty', { default: 'all' })

const statuses: Array<{ value: CourseStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'ready', label: 'Ready' },
  { value: 'generating', label: 'Generating' },
  { value: 'archived', label: 'Archived' },
]

const difficulties: Array<{ value: CourseDifficulty | 'all'; label: string }> = [
  { value: 'all', label: 'All Levels' },
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
]
</script>

<template>
  <div class="course-filters">
    <div class="filter-group">
      <span class="filter-label">Status</span>
      <div class="filter-pills">
        <button
          v-for="s in statuses"
          :key="s.value"
          class="filter-pill"
          :class="{ active: statusFilter === s.value }"
          @click="statusFilter = s.value"
        >
          {{ s.label }}
        </button>
      </div>
    </div>

    <div class="filter-group">
      <span class="filter-label">Level</span>
      <div class="filter-pills">
        <button
          v-for="d in difficulties"
          :key="d.value"
          class="filter-pill"
          :class="{ active: difficultyFilter === d.value }"
          @click="difficultyFilter = d.value"
        >
          {{ d.label }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.course-filters {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.filter-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color-secondary, #64748b);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.filter-pills {
  display: flex;
  gap: 4px;
}

.filter-pill {
  padding: 4px 12px;
  border-radius: var(--radius-full, 9999px);
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
  background: var(--glass-bg-light, rgba(40, 40, 40, 0.5));
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  color: var(--text-color-secondary, #94a3b8);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast, 150ms ease);
}

.filter-pill.active {
  border-color: var(--sec-accent, #f59e0b);
  background: var(--sec-accent-bg, rgba(245, 158, 11, 0.12));
  color: var(--sec-accent, #f59e0b);
}

.filter-pill:hover:not(.active) {
  border-color: var(--glass-border-hover, rgba(255, 255, 255, 0.15));
  background: var(--glass-bg-hover, rgba(50, 50, 50, 0.65));
}
</style>
