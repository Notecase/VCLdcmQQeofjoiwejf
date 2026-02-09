<script setup lang="ts">
import { ref, computed } from 'vue'
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Presentation } from 'lucide-vue-next'
import type { Lesson } from '@inkdown/shared/types'
import { useCourseStore } from '@/stores/course'

const props = defineProps<{
  lesson: Lesson
}>()

const store = useCourseStore()
const showNotes = ref(false)

const slides = computed(() => props.lesson.content.slides ?? [])
const currentSlideData = computed(() => slides.value[store.currentSlide] ?? null)
const totalSlides = computed(() => slides.value.length)

function prevSlide() {
  if (store.currentSlide > 0) {
    store.currentSlide--
  }
}

function nextSlide() {
  if (store.currentSlide < totalSlides.value - 1) {
    store.currentSlide++
  }
}

function goToSlide(idx: number) {
  store.currentSlide = idx
}
</script>

<template>
  <div class="slides-lesson">
    <h2 class="lesson-title">
      <Presentation :size="20" />
      {{ lesson.title }}
    </h2>

    <div
      v-if="slides.length > 0"
      class="slides-viewer"
    >
      <!-- Current Slide -->
      <div class="slide-display">
        <div
          v-if="currentSlideData"
          class="slide-content"
        >
          <h3 class="slide-title">{{ currentSlideData.title }}</h3>
          <p
            v-if="currentSlideData.subtitle"
            class="slide-subtitle"
          >
            {{ currentSlideData.subtitle }}
          </p>
          <ul
            v-if="currentSlideData.bullets?.length"
            class="slide-bullets"
          >
            <li
              v-for="(bullet, idx) in currentSlideData.bullets"
              :key="idx"
            >
              {{ bullet }}
            </li>
          </ul>
          <div
            v-if="currentSlideData.visual"
            class="slide-visual"
          >
            {{ currentSlideData.visual }}
          </div>
        </div>

        <!-- Navigation Overlay -->
        <div class="slide-nav">
          <button
            class="nav-btn"
            :disabled="store.currentSlide === 0"
            @click="prevSlide"
          >
            <ChevronLeft :size="20" />
          </button>
          <span class="slide-counter">{{ store.currentSlide + 1 }} / {{ totalSlides }}</span>
          <button
            class="nav-btn"
            :disabled="store.currentSlide >= totalSlides - 1"
            @click="nextSlide"
          >
            <ChevronRight :size="20" />
          </button>
        </div>
      </div>

      <!-- Thumbnail Strip -->
      <div class="thumbnail-strip">
        <button
          v-for="(slide, idx) in slides"
          :key="slide.id"
          class="thumbnail"
          :class="{ active: idx === store.currentSlide }"
          @click="goToSlide(idx)"
        >
          <span class="thumb-num">{{ idx + 1 }}</span>
          <span class="thumb-title">{{ slide.title }}</span>
        </button>
      </div>

      <!-- Speaker Notes -->
      <div
        v-if="currentSlideData?.notes"
        class="notes-section"
      >
        <button
          class="notes-toggle"
          @click="showNotes = !showNotes"
        >
          <span>Speaker Notes</span>
          <ChevronUp
            v-if="showNotes"
            :size="14"
          />
          <ChevronDown
            v-else
            :size="14"
          />
        </button>
        <div
          v-if="showNotes"
          class="notes-text"
        >
          {{ currentSlideData.notes }}
        </div>
      </div>
    </div>

    <div
      v-else
      class="no-slides"
    >
      <Presentation :size="40" />
      <p>No slides available for this lesson</p>
    </div>
  </div>
</template>

<style scoped>
.slides-lesson {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.lesson-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 22px;
  font-weight: 700;
  color: var(--text-color, #e2e8f0);
  margin: 0;
}

.slides-viewer {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.slide-display {
  position: relative;
  border-radius: var(--radius-card, 12px);
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
  overflow: hidden;
  background: var(--glass-bg, rgba(30, 30, 30, 0.6));
  backdrop-filter: blur(var(--glass-blur, 12px));
  -webkit-backdrop-filter: blur(var(--glass-blur, 12px));
}

.slide-content {
  padding: 40px 48px;
  min-height: 320px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.slide-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-color, #e2e8f0);
  margin: 0;
}

.slide-subtitle {
  font-size: 16px;
  color: var(--text-color-secondary, #94a3b8);
  margin: 0;
  line-height: 1.5;
}

.slide-bullets {
  margin: 8px 0 0;
  padding: 0 0 0 24px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.slide-bullets li {
  font-size: 16px;
  color: var(--text-color, #e2e8f0);
  line-height: 1.6;
}

.slide-visual {
  margin-top: 12px;
  padding: 16px;
  border-radius: 8px;
  background: rgba(245, 158, 11, 0.06);
  border: 1px dashed rgba(245, 158, 11, 0.3);
  font-size: 14px;
  color: var(--text-color-secondary, #94a3b8);
  text-align: center;
  font-style: italic;
}

.slide-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 12px;
  border-top: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
  background: var(--glass-bg-light, rgba(40, 40, 40, 0.5));
}

.nav-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-sm, 6px);
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
  background: var(--glass-bg, rgba(30, 30, 30, 0.6));
  color: var(--text-color, #e2e8f0);
  cursor: pointer;
  transition: all var(--transition-fast, 150ms ease);
}

.nav-btn:hover:not(:disabled) {
  border-color: #f59e0b;
  color: #f59e0b;
}

.nav-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.slide-counter {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color-secondary, #94a3b8);
  min-width: 60px;
  text-align: center;
}

.thumbnail-strip {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding: 4px 0;
}

.thumbnail-strip::-webkit-scrollbar {
  height: 4px;
}

.thumbnail-strip::-webkit-scrollbar-thumb {
  background: var(--border-color, #333338);
  border-radius: 2px;
}

.thumbnail {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: var(--radius-sm, 6px);
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
  background: var(--glass-bg, rgba(30, 30, 30, 0.6));
  color: var(--text-color-secondary, #94a3b8);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: all var(--transition-fast, 150ms ease);
}

.thumbnail:hover {
  border-color: var(--text-color-secondary, #64748b);
}

.thumbnail.active {
  border-color: #f59e0b;
  background: rgba(245, 158, 11, 0.1);
  color: #f59e0b;
}

.thumb-num {
  font-weight: 700;
  font-size: 11px;
}

.thumb-title {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.notes-section {
  border-radius: var(--radius-md, 10px);
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
  background: var(--glass-bg, rgba(30, 30, 30, 0.6));
  backdrop-filter: blur(var(--glass-blur, 12px));
  -webkit-backdrop-filter: blur(var(--glass-blur, 12px));
  overflow: hidden;
}

.notes-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 10px 16px;
  border: none;
  background: transparent;
  color: var(--text-color, #e2e8f0);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background var(--transition-fast, 150ms ease);
}

.notes-toggle:hover {
  background: var(--glass-bg-hover, rgba(50, 50, 50, 0.65));
}

.notes-text {
  padding: 14px 16px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-color-secondary, #94a3b8);
  background: transparent;
  border-top: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
  white-space: pre-wrap;
}

.no-slides {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 60px;
  color: var(--text-color-secondary, #64748b);
}

.no-slides p {
  margin: 0;
  font-size: 14px;
}
</style>
