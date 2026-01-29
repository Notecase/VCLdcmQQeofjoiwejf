<script setup lang="ts">
/**
 * FlashcardsModal - Interactive flashcard viewer
 *
 * Features:
 * - Card flip animation
 * - Navigation between cards
 * - Keyboard controls (space to flip, arrows to navigate)
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRecommendationsStore, type Flashcard } from '@/stores/recommendations'
import { BookOpen, ChevronLeft, ChevronRight, Copy, Check } from 'lucide-vue-next'
import BaseModal from './BaseModal.vue'
import { renderMathContent } from '@/utils/mathRenderer'

// Store
const store = useRecommendationsStore()

// Copy state
const copied = ref(false)

// Emits
const emit = defineEmits<{
  close: []
}>()

// Local state
const currentIndex = ref(0)
const isFlipped = ref(false)

// Computed
const flashcards = computed<Flashcard[]>(() => store.currentRecommendations?.flashcards || [])

const currentCard = computed(() => flashcards.value[currentIndex.value])
const cardCount = computed(() => flashcards.value.length)

// Rendered content with math support
const renderedQuestion = computed(() => renderMathContent(currentCard.value?.question || ''))
const renderedAnswer = computed(() => renderMathContent(currentCard.value?.answer || ''))

// Actions
function flipCard() {
  isFlipped.value = !isFlipped.value
}

function nextCard() {
  if (currentIndex.value < cardCount.value - 1) {
    currentIndex.value++
    isFlipped.value = false
  }
}

function prevCard() {
  if (currentIndex.value > 0) {
    currentIndex.value--
    isFlipped.value = false
  }
}

function goToCard(index: number) {
  currentIndex.value = index
  isFlipped.value = false
}

// Keyboard navigation
function handleKeydown(e: KeyboardEvent) {
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault()
    flipCard()
  } else if (e.key === 'ArrowRight') {
    nextCard()
  } else if (e.key === 'ArrowLeft') {
    prevCard()
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})

// Copy all flashcards as markdown
async function copyAsMarkdown() {
  const markdown = flashcards.value
    .map((card, i) => `### Card ${i + 1}\n**Q:** ${card.question}\n**A:** ${card.answer}`)
    .join('\n\n')

  try {
    await navigator.clipboard.writeText(markdown)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch (error) {
    console.error('Failed to copy:', error)
  }
}
</script>

<template>
  <BaseModal
    title="Flashcards"
    :subtitle="`${currentIndex + 1} / ${cardCount}`"
    size="md"
    @close="emit('close')"
  >
    <template #icon>
      <BookOpen :size="20" />
    </template>

    <template #header-right>
      <button
        class="copy-btn"
        :class="{ copied }"
        :title="copied ? 'Copied!' : 'Copy all as Markdown'"
        @click="copyAsMarkdown"
      >
        <Check
          v-if="copied"
          :size="14"
        />
        <Copy
          v-else
          :size="14"
        />
        <span>{{ copied ? 'Copied!' : 'Copy' }}</span>
      </button>
    </template>

    <div
      v-if="flashcards.length > 0"
      class="flashcards-container"
    >
      <!-- Card -->
      <div
        class="card-wrapper"
        :class="{ flipped: isFlipped }"
        @click="flipCard"
      >
        <div class="card-inner">
          <!-- Front -->
          <div class="card-face card-front">
            <span class="card-label">QUESTION</span>
            <div
              class="card-content math-content"
              v-html="renderedQuestion"
            ></div>
            <span class="card-hint">Click or press Space to flip</span>
          </div>

          <!-- Back -->
          <div class="card-face card-back">
            <span class="card-label answer">ANSWER</span>
            <div
              class="card-content math-content"
              v-html="renderedAnswer"
            ></div>
          </div>
        </div>
      </div>

      <!-- Pagination dots -->
      <div class="pagination">
        <button
          v-for="(_, idx) in flashcards"
          :key="idx"
          class="dot"
          :class="{ active: idx === currentIndex }"
          @click="goToCard(idx)"
        />
      </div>
    </div>

    <div
      v-else
      class="empty-state"
    >
      <p>No flashcards available.</p>
    </div>

    <template #footer>
      <button
        class="nav-btn"
        :disabled="currentIndex === 0"
        @click="prevCard"
      >
        <ChevronLeft :size="18" />
      </button>
      <span class="footer-text">Use arrow keys to navigate</span>
      <button
        class="nav-btn"
        :disabled="currentIndex === cardCount - 1"
        @click="nextCard"
      >
        <ChevronRight :size="18" />
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
.flashcards-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
}

/* Card */
.card-wrapper {
  width: 100%;
  max-width: 400px;
  height: 280px;
  perspective: 1000px;
  cursor: pointer;
}

.card-inner {
  position: relative;
  width: 100%;
  height: 100%;
  transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
  transform-style: preserve-3d;
}

.card-wrapper.flipped .card-inner {
  transform: rotateY(180deg);
}

.card-face {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 24px;
  border-radius: 16px;
  backface-visibility: hidden;
  background: rgba(22, 27, 34, 0.7);
  backdrop-filter: blur(12px);
  border: 1px solid #30363d;
}

.card-back {
  transform: rotateY(180deg);
}

.card-label {
  font-size: 10px;
  font-weight: 600;
  color: #58a6ff;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.card-label.answer {
  color: #3fb950;
}

.card-content {
  font-size: 16px;
  color: #e6edf3;
  text-align: center;
  line-height: 1.6;
  overflow-y: auto;
  max-height: 180px;
}

/* Math content styles */
.math-content :deep(.math-display) {
  margin: 0.5rem 0;
}

.math-content :deep(.math-inline) {
  display: inline;
}

.math-content :deep(.math-code-block) {
  text-align: left;
  margin: 0.5rem 0;
  padding: 0.5rem;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 6px;
  font-size: 13px;
  overflow-x: auto;
}

.math-content :deep(.math-inline-code) {
  padding: 0.125rem 0.375rem;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 4px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.9em;
}

.math-content :deep(.katex) {
  font-size: 1.1em;
}

.math-content :deep(.katex-display) {
  margin: 0.5rem 0;
  overflow-x: auto;
  overflow-y: hidden;
}

.card-hint {
  font-size: 11px;
  color: #6e7681;
}

/* Pagination */
.pagination {
  display: flex;
  justify-content: center;
  gap: 8px;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #30363d;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
}

.dot:hover {
  background: #484f58;
}

.dot.active {
  background: #58a6ff;
  transform: scale(1.25);
}

/* Empty state */
.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: #8b949e;
}

/* Footer */
.nav-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #21262d;
  border: 1px solid #30363d;
  color: #8b949e;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}

.nav-btn:hover:not(:disabled) {
  background: #30363d;
  color: #e6edf3;
}

.nav-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.footer-text {
  font-size: 12px;
  color: #6e7681;
}

/* Copy button */
.copy-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid #30363d;
  border-radius: 6px;
  background: transparent;
  color: #8b949e;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.copy-btn:hover {
  border-color: #58a6ff;
  color: #58a6ff;
}

.copy-btn.copied {
  border-color: #3fb950;
  color: #3fb950;
}
</style>
