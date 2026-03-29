<script setup lang="ts">
/**
 * SlidesModal - Generated slides gallery viewer
 *
 * Features:
 * - Main slide preview (16:9)
 * - Thumbnail strip navigation
 * - Download single/all slides
 * - Keyboard navigation
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRecommendationsStore, type Slide } from '@/stores/recommendations'
import { Presentation, ChevronLeft, ChevronRight, Download, FileDown } from 'lucide-vue-next'
import BaseModal from './BaseModal.vue'
import { renderMathContent } from '@/utils/mathRenderer'

// Store
const store = useRecommendationsStore()

// Emits
const emit = defineEmits<{
  close: []
}>()

// Local state
const currentIndex = ref(0)

// Computed
const slides = computed<Slide[]>(() => store.currentRecommendations?.slides || [])

const currentSlide = computed(() => slides.value[currentIndex.value])
const slideCount = computed(() => slides.value.length)

// Navigation
function nextSlide() {
  if (currentIndex.value < slideCount.value - 1) {
    currentIndex.value++
  }
}

function prevSlide() {
  if (currentIndex.value > 0) {
    currentIndex.value--
  }
}

function goToSlide(index: number) {
  currentIndex.value = index
}

// Keyboard navigation
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowRight') {
    nextSlide()
  } else if (e.key === 'ArrowLeft') {
    prevSlide()
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})

// Download functions
function downloadCurrentSlide() {
  if (!currentSlide.value?.imageData) return

  const link = document.createElement('a')
  link.href = `data:image/png;base64,${currentSlide.value.imageData}`
  link.download = `slide-${currentIndex.value + 1}.png`
  link.click()
}

async function downloadAllSlides() {
  // Simple download of all slides as individual images
  // For PDF, would need jsPDF library
  for (let i = 0; i < slides.value.length; i++) {
    const slide = slides.value[i]
    if (slide.imageData) {
      const link = document.createElement('a')
      link.href = `data:image/png;base64,${slide.imageData}`
      link.download = `slide-${i + 1}.png`
      link.click()
      // Small delay between downloads
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
  }
}

// Type badge color
function getTypeColor(type: string): string {
  switch (type) {
    case 'title':
      return '#58a6ff'
    case 'content':
      return 'var(--sec-primary-light, #3fb950)'
    case 'conclusion':
      return 'var(--sec-accent-dark, #d29922)'
    default:
      return '#8b949e'
  }
}

// Render content with math support
function renderContent(text: string | undefined): string {
  return renderMathContent(text || '')
}
</script>

<template>
  <BaseModal
    title="Generated Slides"
    :subtitle="`${currentIndex + 1} / ${slideCount}`"
    size="lg"
    @close="emit('close')"
  >
    <template #icon>
      <Presentation :size="20" />
    </template>

    <div
      v-if="slides.length > 0"
      class="slides-container"
    >
      <!-- Main slide preview -->
      <div class="slide-preview">
        <div class="slide-image-container">
          <img
            v-if="currentSlide?.imageData"
            :src="`data:image/png;base64,${currentSlide.imageData}`"
            :alt="currentSlide.title"
            class="slide-image"
          />
          <div
            v-else
            class="slide-placeholder"
          >
            <Presentation :size="48" />
            <p
              class="math-content"
              v-html="renderContent(currentSlide?.title || 'Slide Preview')"
            ></p>
            <p
              class="slide-content math-content"
              v-html="renderContent(currentSlide?.caption)"
            ></p>
          </div>
        </div>

        <!-- Slide info -->
        <div class="slide-info">
          <span
            class="slide-style"
            :style="{ color: getTypeColor(currentSlide?.type || 'content') }"
          >
            {{ currentSlide?.type }}
          </span>
          <span
            class="slide-title math-content"
            v-html="renderContent(currentSlide?.title)"
          ></span>
        </div>
      </div>

      <!-- Thumbnail strip -->
      <div class="thumbnail-strip">
        <button
          v-for="(slide, idx) in slides"
          :key="idx"
          class="thumbnail"
          :class="{ active: idx === currentIndex }"
          @click="goToSlide(idx)"
        >
          <span class="thumbnail-number">{{ idx + 1 }}</span>
          <img
            v-if="slide.imageData"
            :src="`data:image/png;base64,${slide.imageData}`"
            :alt="`Slide ${idx + 1}`"
          />
        </button>
      </div>
    </div>

    <div
      v-else
      class="empty-state"
    >
      <p>No slides available.</p>
    </div>

    <template #footer>
      <div class="footer-left">
        <button
          class="footer-btn secondary"
          @click="downloadCurrentSlide"
        >
          <Download :size="14" />
          Download PNG
        </button>
      </div>

      <div class="footer-center">
        <button
          class="nav-btn"
          :disabled="currentIndex === 0"
          @click="prevSlide"
        >
          <ChevronLeft :size="18" />
        </button>
        <button
          class="nav-btn"
          :disabled="currentIndex === slideCount - 1"
          @click="nextSlide"
        >
          <ChevronRight :size="18" />
        </button>
      </div>

      <div class="footer-right">
        <button
          class="footer-btn primary"
          @click="downloadAllSlides"
        >
          <FileDown :size="14" />
          Download All
        </button>
      </div>
    </template>
  </BaseModal>
</template>

<style scoped>
.slides-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Main preview */
.slide-preview {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.slide-image-container {
  aspect-ratio: 16 / 9;
  background: var(--modal-card-bg);
  backdrop-filter: blur(var(--modal-backdrop-blur));
  -webkit-backdrop-filter: blur(var(--modal-backdrop-blur));
  border: 1px solid var(--modal-border);
  border-radius: var(--modal-radius);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--modal-shadow);
}

.slide-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.slide-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-color-secondary);
  text-align: center;
  padding: 24px;
}

.slide-placeholder p {
  margin: 0;
  font-size: 14px;
  color: var(--text-color);
}

.slide-content {
  font-size: 12px !important;
  color: var(--text-color-secondary) !important;
  max-width: 80%;
}

.slide-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.slide-style {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 2px 8px;
  background: var(--modal-card-bg);
  border-radius: 6px;
}

.slide-title {
  font-size: 14px;
  color: var(--text-color);
}

/* Thumbnail strip */
.thumbnail-strip {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 4px 0;
}

.thumbnail-strip::-webkit-scrollbar {
  height: 4px;
}

.thumbnail-strip::-webkit-scrollbar-track {
  background: transparent;
}

.thumbnail-strip::-webkit-scrollbar-thumb {
  background: var(--modal-border);
  border-radius: 2px;
}

.thumbnail {
  width: 60px;
  height: 40px;
  flex-shrink: 0;
  background: var(--modal-card-bg);
  border: 2px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  overflow: hidden;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.thumbnail:hover {
  border-color: var(--modal-border);
}

.thumbnail.active {
  border-color: #58a6ff;
}

.thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.thumbnail-number {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-color-secondary);
}

.thumbnail.active .thumbnail-number {
  color: #58a6ff;
}

.thumbnail img + .thumbnail-number {
  display: none;
}

/* Empty state */
.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-color-secondary);
}

/* Footer */
:deep(.modal-footer) {
  justify-content: space-between !important;
}

.footer-left,
.footer-center,
.footer-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.footer-center {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
}

.footer-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
  border-radius: var(--modal-radius-sm);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.footer-btn.primary {
  background: var(--sec-fab-bg, linear-gradient(135deg, #238636 0%, #2ea043 100%));
  border: none;
  color: #ffffff;
  box-shadow: var(--shadow-glow-green, 0 2px 8px rgba(35, 134, 54, 0.3));
}

.footer-btn.primary:hover {
  background: var(--sec-fab-bg, linear-gradient(135deg, #2ea043 0%, #3fb950 100%));
  box-shadow: var(--shadow-glow-green, 0 4px 12px rgba(35, 134, 54, 0.4));
}

.footer-btn.secondary {
  background: var(--modal-btn-secondary-bg);
  border: 1px solid var(--modal-border);
  color: var(--text-color-secondary);
}

.footer-btn.secondary:hover {
  background: var(--modal-btn-secondary-hover);
  color: var(--text-color);
}

.nav-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--modal-btn-secondary-bg);
  border: 1px solid var(--modal-border);
  color: var(--text-color-secondary);
  border-radius: var(--modal-radius-sm);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.nav-btn:hover:not(:disabled) {
  background: var(--modal-btn-secondary-hover);
  color: var(--text-color);
}

.nav-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Math content styles */
.math-content :deep(.math-display) {
  margin: 0.25rem 0;
}

.math-content :deep(.math-inline) {
  display: inline;
}

.math-content :deep(.katex) {
  font-size: 1em;
}

.math-content :deep(.katex-display) {
  margin: 0.25rem 0;
  overflow-x: auto;
  overflow-y: hidden;
}
</style>
