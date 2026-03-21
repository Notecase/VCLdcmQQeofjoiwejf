<script setup lang="ts">
/**
 * PreActionQuestionCard — Proactive AI question card
 *
 * Displayed inline in the chat stream when the AI asks a clarifying question
 * before creating a note or making a major edit. Design follows the rounded,
 * clean card style with numbered options and keyboard navigation.
 */
import { ref, computed } from 'vue'
import {
  MessageCircleQuestion,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  Pencil,
  X,
} from 'lucide-vue-next'

const props = defineProps<{
  question: {
    id: string
    question: string
    options: Array<{ id: string; label: string; description?: string }>
    allowFreeText?: boolean
    context?: string
  }
}>()

const emit = defineEmits<{
  select: [optionLabel: string]
  freeText: [text: string]
  skip: []
}>()

const hoveredIndex = ref<number | null>(null)
const freeTextValue = ref('')
const showFreeText = ref(false)

// Pagination: show 4 options per page
const PAGE_SIZE = 4
const currentPage = ref(0)
const totalPages = computed(() => Math.ceil(props.question.options.length / PAGE_SIZE))
const visibleOptions = computed(() => {
  const start = currentPage.value * PAGE_SIZE
  return props.question.options.slice(start, start + PAGE_SIZE)
})

function selectOption(label: string) {
  emit('select', label)
}

function submitFreeText() {
  const text = freeTextValue.value.trim()
  if (text) {
    emit('freeText', text)
  }
}

function prevPage() {
  if (currentPage.value > 0) currentPage.value--
}

function nextPage() {
  if (currentPage.value < totalPages.value - 1) currentPage.value++
}
</script>

<template>
  <div class="pre-action-card">
    <!-- Header -->
    <div class="card-header">
      <div class="header-left">
        <MessageCircleQuestion
          :size="16"
          class="header-icon"
        />
        <p class="header-question">{{ question.question }}</p>
      </div>
      <div class="header-right">
        <!-- Pagination -->
        <template v-if="totalPages > 1">
          <button
            class="nav-btn"
            type="button"
            :disabled="currentPage === 0"
            @click="prevPage"
          >
            <ChevronLeft :size="14" />
          </button>
          <span class="page-indicator">{{ currentPage + 1 }} of {{ totalPages }}</span>
          <button
            class="nav-btn"
            type="button"
            :disabled="currentPage >= totalPages - 1"
            @click="nextPage"
          >
            <ChevronRight :size="14" />
          </button>
        </template>
        <button
          class="close-btn"
          type="button"
          aria-label="Skip question"
          @click="emit('skip')"
        >
          <X :size="14" />
        </button>
      </div>
    </div>

    <!-- Options list -->
    <div class="options-list">
      <button
        v-for="(option, i) in visibleOptions"
        :key="option.id"
        class="option-row"
        :class="{ hovered: hoveredIndex === i }"
        type="button"
        @mouseenter="hoveredIndex = i"
        @mouseleave="hoveredIndex = null"
        @click="selectOption(option.label)"
      >
        <span class="option-number">{{ currentPage * PAGE_SIZE + i + 1 }}</span>
        <span class="option-label">{{ option.label }}</span>
        <ArrowRight
          v-if="hoveredIndex === i"
          :size="14"
          class="option-arrow"
        />
      </button>

      <!-- Free text option -->
      <div
        v-if="question.allowFreeText && !showFreeText"
        class="option-row free-text-trigger"
        @click="showFreeText = true"
      >
        <Pencil
          :size="14"
          class="option-number-icon"
        />
        <span class="option-label placeholder">Something else</span>
        <button
          class="skip-btn"
          type="button"
          @click.stop="emit('skip')"
        >
          Skip
        </button>
      </div>

      <!-- Free text input (expanded) -->
      <div
        v-if="showFreeText"
        class="free-text-row"
      >
        <input
          v-model="freeTextValue"
          class="free-text-input"
          type="text"
          placeholder="Type your preference..."
          autofocus
          @keydown.enter="submitFreeText"
          @keydown.escape="showFreeText = false"
        />
        <button
          class="skip-btn"
          type="button"
          @click="emit('skip')"
        >
          Skip
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pre-action-card {
  margin: 8px 0;
  border-radius: 14px;
  border: 1px solid var(--border-color, #30363d);
  background: var(--bg-color-secondary, #161b22);
  overflow: hidden;
}

.card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px 12px;
}

.header-left {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
  flex: 1;
}

.header-icon {
  color: var(--primary-color, #7c9ef8);
  margin-top: 1px;
  flex-shrink: 0;
  opacity: 0.85;
}

.header-question {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color, #e6edf3);
  line-height: 1.5;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.nav-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--text-color-secondary, #8b949e);
  cursor: pointer;
  transition: all 0.12s;
}

.nav-btn:hover:not(:disabled) {
  color: var(--text-color, #e6edf3);
  background: rgba(255, 255, 255, 0.06);
}

.nav-btn:disabled {
  opacity: 0.3;
  cursor: default;
}

.page-indicator {
  font-size: 12px;
  color: var(--text-color-secondary, #8b949e);
  white-space: nowrap;
}

.close-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--text-color-secondary, #8b949e);
  cursor: pointer;
  margin-left: 4px;
  transition: all 0.12s;
}

.close-btn:hover {
  color: var(--text-color, #e6edf3);
  background: rgba(255, 255, 255, 0.06);
}

/* Options */
.options-list {
  padding: 0 6px 6px;
}

.option-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 14px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--text-color, #e6edf3);
  cursor: pointer;
  text-align: left;
  transition: background 0.12s;
  font-size: 14px;
  position: relative;
}

.option-row + .option-row {
  border-top: 1px solid rgba(255, 255, 255, 0.04);
}

.option-row.hovered,
.option-row:hover {
  background: rgba(255, 255, 255, 0.05);
}

.option-number {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid var(--border-color, #30363d);
  background: rgba(255, 255, 255, 0.03);
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color-secondary, #8b949e);
  flex-shrink: 0;
}

.option-row.hovered .option-number,
.option-row:hover .option-number {
  border-color: var(--primary-color, #7c9ef8);
  color: var(--primary-color, #7c9ef8);
  background: rgba(124, 158, 248, 0.08);
}

.option-number-icon {
  color: var(--text-color-secondary, #8b949e);
  opacity: 0.7;
  flex-shrink: 0;
}

.option-label {
  flex: 1;
  min-width: 0;
}

.option-label.placeholder {
  color: var(--text-color-secondary, #8b949e);
  opacity: 0.7;
}

.option-arrow {
  color: var(--text-color-secondary, #8b949e);
  flex-shrink: 0;
  opacity: 0.6;
}

/* Free text */
.free-text-trigger {
  cursor: pointer;
}

.free-text-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
}

.free-text-input {
  flex: 1;
  height: 36px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid var(--border-color, #30363d);
  background: rgba(255, 255, 255, 0.03);
  color: var(--text-color, #e6edf3);
  font-size: 13px;
  outline: none;
  transition: border-color 0.12s;
}

.free-text-input:focus {
  border-color: var(--primary-color, #7c9ef8);
}

.free-text-input::placeholder {
  color: var(--text-color-secondary, #8b949e);
  opacity: 0.6;
}

.skip-btn {
  padding: 6px 14px;
  border-radius: 8px;
  border: 1px solid var(--border-color, #30363d);
  background: transparent;
  color: var(--text-color-secondary, #8b949e);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.12s;
}

.skip-btn:hover {
  border-color: var(--text-color-secondary, #8b949e);
  color: var(--text-color, #e6edf3);
}
</style>
