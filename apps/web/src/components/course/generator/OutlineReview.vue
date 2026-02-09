<script setup lang="ts">
import { ref } from 'vue'
import { Check, X, ChevronDown, ChevronRight, Clock } from 'lucide-vue-next'
import type { CourseOutline } from '@inkdown/shared/types'
import LessonTypeIcon from '../shared/LessonTypeIcon.vue'

defineProps<{
  outline: CourseOutline
  submitting?: boolean
}>()

const emit = defineEmits<{
  approve: [outline?: CourseOutline]
  reject: [feedback: string]
}>()

const isRejecting = ref(false)
const feedback = ref('')
const expandedModules = ref<Record<string, boolean>>({})

function toggleModule(moduleId: string) {
  expandedModules.value[moduleId] = !expandedModules.value[moduleId]
}

function isExpanded(moduleId: string) {
  return expandedModules.value[moduleId] !== false
}

function handleApprove() {
  emit('approve')
}

function handleReject() {
  if (feedback.value.trim()) {
    emit('reject', feedback.value.trim())
    feedback.value = ''
    isRejecting.value = false
  }
}
</script>

<template>
  <div class="outline-review">
    <div class="review-header">
      <h3>Review Course Outline</h3>
      <p class="review-subtitle">
        {{ outline.title }} &mdash; {{ outline.difficulty }} &mdash; ~{{
          outline.estimatedHours
        }}
        hours
      </p>
    </div>

    <!-- Description -->
    <div class="outline-description">
      {{ outline.description }}
    </div>

    <!-- Learning Objectives -->
    <div
      v-if="outline.learningObjectives.length > 0"
      class="objectives-section"
    >
      <div class="section-label">Learning Objectives</div>
      <ul class="objectives-list">
        <li
          v-for="(obj, idx) in outline.learningObjectives"
          :key="idx"
        >
          {{ obj }}
        </li>
      </ul>
    </div>

    <!-- Prerequisites -->
    <div
      v-if="outline.prerequisites.length > 0"
      class="prereq-section"
    >
      <div class="section-label">Prerequisites</div>
      <div class="prereq-tags">
        <span
          v-for="(p, idx) in outline.prerequisites"
          :key="idx"
          class="prereq-tag"
          >{{ p }}</span
        >
      </div>
    </div>

    <!-- Modules -->
    <div class="modules-tree">
      <div
        v-for="mod in outline.modules"
        :key="mod.id"
        class="module-block"
      >
        <button
          class="module-header"
          @click="toggleModule(mod.id)"
        >
          <ChevronDown
            v-if="isExpanded(mod.id)"
            :size="16"
          />
          <ChevronRight
            v-else
            :size="16"
          />
          <span class="module-title">{{ mod.order + 1 }}. {{ mod.title }}</span>
          <span class="module-lesson-count">{{ mod.lessons.length }} lessons</span>
        </button>

        <div
          v-if="isExpanded(mod.id)"
          class="module-body"
        >
          <p class="module-desc">{{ mod.description }}</p>
          <div class="lesson-list">
            <div
              v-for="lesson in mod.lessons"
              :key="lesson.id"
              class="lesson-item"
            >
              <LessonTypeIcon
                :type="lesson.type"
                :size="14"
              />
              <span class="lesson-title">{{ lesson.title }}</span>
              <span class="lesson-meta">
                <Clock :size="11" />
                {{ lesson.estimatedMinutes }}m
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Actions -->
    <div class="review-actions">
      <button
        class="approve-btn"
        :disabled="submitting"
        @click="handleApprove"
      >
        <Check :size="16" />
        {{ submitting ? 'Approving...' : 'Approve Outline' }}
      </button>
      <button
        class="reject-btn"
        :class="{ active: isRejecting }"
        :disabled="submitting"
        @click="isRejecting = !isRejecting"
      >
        <X :size="16" />
        Request Changes
      </button>
    </div>

    <!-- Rejection feedback -->
    <div
      v-if="isRejecting"
      class="reject-form"
    >
      <textarea
        v-model="feedback"
        class="reject-textarea"
        placeholder="Describe what changes you'd like to the outline..."
        rows="4"
      />
      <button
        class="submit-reject-btn"
        :disabled="submitting || !feedback.trim()"
        @click="handleReject"
      >
        Submit Feedback
      </button>
    </div>
  </div>
</template>

<style scoped>
.outline-review {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.review-header h3 {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-color, #e2e8f0);
  margin: 0 0 4px;
}

.review-subtitle {
  font-size: 13px;
  color: var(--text-color-secondary, #94a3b8);
  margin: 0;
}

.outline-description {
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-color, #e2e8f0);
  padding: 14px;
  border-radius: var(--radius-md, 10px);
  background: var(--glass-bg, rgba(30, 30, 30, 0.6));
  backdrop-filter: blur(var(--glass-blur, 12px));
  -webkit-backdrop-filter: blur(var(--glass-blur, 12px));
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
}

.section-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color-secondary, #64748b);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 6px;
}

.objectives-list {
  margin: 0;
  padding: 0 0 0 18px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.objectives-list li {
  font-size: 13px;
  color: var(--text-color, #e2e8f0);
  line-height: 1.5;
}

.prereq-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.prereq-tag {
  padding: 3px 10px;
  border-radius: var(--radius-full, 9999px);
  background: rgba(99, 102, 241, 0.12);
  backdrop-filter: blur(8px);
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
  color: #818cf8;
  font-size: 12px;
  font-weight: 500;
}

.modules-tree {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.module-block {
  border-radius: var(--radius-md, 10px);
  overflow: hidden;
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
  background: var(--glass-bg, rgba(30, 30, 30, 0.6));
  backdrop-filter: blur(var(--glass-blur, 12px));
  -webkit-backdrop-filter: blur(var(--glass-blur, 12px));
  transition: border-color var(--transition-normal, 250ms ease);
}

.module-block:hover {
  border-color: var(--glass-border-hover, rgba(255, 255, 255, 0.15));
}

.module-header {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 12px 14px;
  border: none;
  background: transparent;
  color: var(--text-color, #e2e8f0);
  cursor: pointer;
  text-align: left;
  font-size: 14px;
  font-weight: 600;
  transition: background var(--transition-fast, 150ms ease);
}

.module-header:hover {
  background: var(--glass-bg-hover, rgba(50, 50, 50, 0.65));
}

.module-lesson-count {
  margin-left: auto;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-color-secondary, #64748b);
}

.module-body {
  padding: 8px 14px 14px 38px;
  background: transparent;
}

.module-desc {
  font-size: 13px;
  color: var(--text-color-secondary, #94a3b8);
  margin: 0 0 10px;
  line-height: 1.5;
}

.lesson-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.lesson-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 13px;
  color: var(--text-color, #e2e8f0);
  transition: background 0.15s;
}

.lesson-item:hover {
  background: rgba(255, 255, 255, 0.03);
}

.lesson-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lesson-meta {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  color: var(--text-color-secondary, #64748b);
  flex-shrink: 0;
}

.review-actions {
  display: flex;
  gap: 10px;
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

.approve-btn:hover:not(:disabled) {
  background: #059669;
}

.approve-btn:disabled,
.reject-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
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

.reject-btn:hover:not(:disabled),
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
  border-radius: 8px;
  border: none;
  background: #f85149;
  color: white;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.submit-reject-btn:hover:not(:disabled) {
  background: #da3633;
}

.submit-reject-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
