<script setup lang="ts">
/**
 * Flashcard Deck Component
 *
 * Interactive flashcard study interface with:
 * - 3D flip animation
 * - Progress tracking
 * - Mark as Known/Review
 * - Shuffle mode
 *
 * Phase 3.4 Implementation
 */

import { ref, computed, type PropType } from 'vue'
import type { FlashcardDeck } from '@/services/recommendation.service'

const props = defineProps({
  deck: {
    type: Object as PropType<FlashcardDeck>,
    required: true,
  },
})

const emit = defineEmits<{
  // eslint-disable-next-line no-unused-vars
  (event: 'complete', stats: { known: number; review: number; total: number }): void
}>()

// State
const currentIndex = ref(0)
const flipped = ref(false)
const shuffled = ref(false)
const knownCards = ref<Set<string>>(new Set())
const reviewCards = ref<Set<string>>(new Set())

// Computed
const cards = computed(() => {
  if (!shuffled.value) return props.deck.cards
  return [...props.deck.cards].sort(() => Math.random() - 0.5)
})

const currentCard = computed(() => cards.value[currentIndex.value])

const progress = computed(() => ({
  current: currentIndex.value + 1,
  total: cards.value.length,
  known: knownCards.value.size,
  review: reviewCards.value.size,
}))

const isComplete = computed(() => currentIndex.value >= cards.value.length)

const difficultyColor = computed(() => {
  const difficulty = currentCard.value?.difficulty
  if (difficulty === 'easy') return 'var(--sec-primary, #10b981)'
  if (difficulty === 'hard') return '#ef4444'
  return 'var(--sec-accent, #f59e0b)'
})

// Methods
function flipCard() {
  flipped.value = !flipped.value
}

function nextCard() {
  if (currentIndex.value < cards.value.length - 1) {
    currentIndex.value++
    flipped.value = false
  } else {
    // Session complete
    emit('complete', {
      known: knownCards.value.size,
      review: reviewCards.value.size,
      total: cards.value.length,
    })
  }
}

function prevCard() {
  if (currentIndex.value > 0) {
    currentIndex.value--
    flipped.value = false
  }
}

function markKnown() {
  if (!currentCard.value) return
  knownCards.value.add(currentCard.value.id)
  reviewCards.value.delete(currentCard.value.id)
  nextCard()
}

function markReview() {
  if (!currentCard.value) return
  reviewCards.value.add(currentCard.value.id)
  knownCards.value.delete(currentCard.value.id)
  nextCard()
}

function toggleShuffle() {
  shuffled.value = !shuffled.value
  restart()
}

function restart() {
  currentIndex.value = 0
  flipped.value = false
  knownCards.value.clear()
  reviewCards.value.clear()
}
</script>

<template>
  <div class="flashcard-deck">
    <!-- Header -->
    <div class="deck-header">
      <h3>{{ deck.title }}</h3>
      <div class="deck-controls">
        <button
          :class="{ active: shuffled }"
          title="Shuffle"
          @click="toggleShuffle"
        >
          🔀
        </button>
        <button
          title="Restart"
          @click="restart"
        >
          🔄
        </button>
      </div>
    </div>

    <!-- Progress -->
    <div class="progress-bar">
      <div
        class="progress-fill"
        :style="{ width: `${(progress.current / progress.total) * 100}%` }"
      />
    </div>
    <div class="progress-text">
      {{ progress.current }} / {{ progress.total }}
      <span class="stats"> ✓ {{ progress.known }} | ↻ {{ progress.review }} </span>
    </div>

    <!-- Card -->
    <div
      v-if="!isComplete && currentCard"
      class="card-container"
      @click="flipCard"
    >
      <div
        class="card"
        :class="{ flipped }"
      >
        <div class="card-face front">
          <span
            class="difficulty-badge"
            :style="{ backgroundColor: difficultyColor }"
          >
            {{ currentCard.difficulty }}
          </span>
          <p class="card-content">{{ currentCard.front }}</p>
          <span class="hint">Click to flip</span>
        </div>
        <div class="card-face back">
          <p class="card-content">{{ currentCard.back }}</p>
          <div
            v-if="currentCard.tags.length"
            class="tags"
          >
            <span
              v-for="tag in currentCard.tags"
              :key="tag"
              class="tag"
              >{{ tag }}</span
            >
          </div>
        </div>
      </div>
    </div>

    <!-- Complete State -->
    <div
      v-else-if="isComplete"
      class="complete-state"
    >
      <div class="complete-icon">🎉</div>
      <h4>Session Complete!</h4>
      <div class="final-stats">
        <div class="stat known">
          <span class="value">{{ progress.known }}</span>
          <span class="label">Known</span>
        </div>
        <div class="stat review">
          <span class="value">{{ progress.review }}</span>
          <span class="label">Review</span>
        </div>
      </div>
      <button
        class="restart-btn"
        @click="restart"
      >
        Study Again
      </button>
    </div>

    <!-- Actions -->
    <div
      v-if="!isComplete"
      class="card-actions"
    >
      <button
        class="nav-btn"
        :disabled="currentIndex === 0"
        @click="prevCard"
      >
        ← Prev
      </button>
      <button
        class="action-btn review"
        @click="markReview"
      >
        ↻ Review Later
      </button>
      <button
        class="action-btn known"
        @click="markKnown"
      >
        ✓ Got It
      </button>
      <button
        class="nav-btn"
        @click="nextCard"
      >
        Next →
      </button>
    </div>
  </div>
</template>

<style scoped>
.flashcard-deck {
  width: 100%;
  max-width: 500px;
  margin: 0 auto;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  border-radius: 16px;
  padding: 20px;
  color: white;
}

.deck-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.deck-header h3 {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
}

.deck-controls {
  display: flex;
  gap: 8px;
}

.deck-controls button {
  width: 32px;
  height: 32px;
  border: none;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.deck-controls button:hover {
  background: rgba(255, 255, 255, 0.2);
}

.deck-controls button.active {
  background: #6366f1;
}

.progress-bar {
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #6366f1, #8b5cf6);
  transition: width 0.3s ease;
}

.progress-text {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  margin: 8px 0 16px;
}

.stats {
  font-size: 11px;
}

.card-container {
  perspective: 1000px;
  height: 280px;
  cursor: pointer;
}

.card {
  width: 100%;
  height: 100%;
  position: relative;
  transform-style: preserve-3d;
  transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

.card.flipped {
  transform: rotateY(180deg);
}

.card-face {
  position: absolute;
  width: 100%;
  height: 100%;
  backface-visibility: hidden;
  border-radius: 12px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.front {
  background: linear-gradient(135deg, #4c1d95 0%, #5b21b6 100%);
}

.back {
  background: linear-gradient(135deg, #065f46 0%, #047857 100%);
  transform: rotateY(180deg);
}

.difficulty-badge {
  position: absolute;
  top: 12px;
  right: 12px;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
}

.card-content {
  font-size: 18px;
  line-height: 1.5;
  text-align: center;
  margin: 0;
}

.hint {
  position: absolute;
  bottom: 12px;
  font-size: 11px;
  opacity: 0.5;
}

.tags {
  position: absolute;
  bottom: 12px;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: center;
}

.tag {
  padding: 2px 8px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 10px;
  font-size: 10px;
}

.card-actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}

.nav-btn {
  flex: 0 0 auto;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.nav-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.2);
}

.nav-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.action-btn {
  flex: 1;
  padding: 12px;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn.review {
  background: var(--sec-accent, #f59e0b);
  color: #000;
}

.action-btn.known {
  background: var(--sec-primary, #10b981);
  color: #fff;
}

.action-btn:hover {
  transform: translateY(-2px);
}

.complete-state {
  text-align: center;
  padding: 40px 20px;
}

.complete-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.complete-state h4 {
  margin: 0 0 24px;
  font-size: 20px;
}

.final-stats {
  display: flex;
  justify-content: center;
  gap: 32px;
  margin-bottom: 24px;
}

.stat {
  text-align: center;
}

.stat .value {
  display: block;
  font-size: 32px;
  font-weight: 700;
}

.stat.known .value {
  color: var(--sec-primary, #10b981);
}
.stat.review .value {
  color: var(--sec-accent, #f59e0b);
}

.stat .label {
  font-size: 12px;
  opacity: 0.6;
}

.restart-btn {
  padding: 12px 32px;
  background: #6366f1;
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.restart-btn:hover {
  background: #4f46e5;
}
</style>
