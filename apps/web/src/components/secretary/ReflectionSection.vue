<script setup lang="ts">
import { ref } from 'vue'
import { useSecretaryStore } from '@/stores/secretary'
import type { ReflectionMood } from '@inkdown/shared/types'

const store = useSecretaryStore()

const selectedMood = ref<ReflectionMood | null>(null)
const reflectionText = ref('')
const isSubmitting = ref(false)

const moods: Array<{ value: ReflectionMood; label: string; emoji: string }> = [
  { value: 'great', label: 'Great', emoji: '\u{1F60A}' },
  { value: 'good', label: 'Good', emoji: '\u{1F642}' },
  { value: 'okay', label: 'Okay', emoji: '\u{1F610}' },
  { value: 'struggling', label: 'Struggling', emoji: '\u{1F615}' },
  { value: 'overwhelmed', label: 'Overwhelmed', emoji: '\u{1F62B}' },
]

async function submitReflection() {
  if (!selectedMood.value) return
  isSubmitting.value = true
  await store.submitReflection(selectedMood.value, reflectionText.value)
  selectedMood.value = null
  reflectionText.value = ''
  isSubmitting.value = false
}
</script>

<template>
  <div class="reflection-section">
    <h3 class="section-title">End-of-Day Reflection</h3>

    <!-- Mood Selector -->
    <div class="mood-selector">
      <button
        v-for="mood in moods"
        :key="mood.value"
        class="mood-btn"
        :class="{ active: selectedMood === mood.value }"
        @click="selectedMood = mood.value"
      >
        <span class="mood-emoji">{{ mood.emoji }}</span>
        <span class="mood-label">{{ mood.label }}</span>
      </button>
    </div>

    <!-- Text Input -->
    <textarea
      v-model="reflectionText"
      class="reflection-input"
      placeholder="How did today go? Any thoughts or learnings..."
      rows="3"
    />

    <!-- Submit -->
    <button
      class="submit-btn"
      :disabled="!selectedMood || isSubmitting"
      @click="submitReflection"
    >
      {{ isSubmitting ? 'Saving...' : 'Save Reflection' }}
    </button>
  </div>
</template>

<style scoped>
.reflection-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border-radius: 12px;
  background: var(--card-bg, #242428);
  border: 1px solid var(--border-color, #333338);
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color, #e2e8f0);
  margin: 0;
}

.mood-selector {
  display: flex;
  gap: 8px;
}

.mood-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid var(--border-color, #333338);
  background: transparent;
  cursor: pointer;
  transition: all 0.15s;
  flex: 1;
}

.mood-btn:hover {
  background: rgba(255, 255, 255, 0.04);
}

.mood-btn.active {
  background: var(--sec-primary-bg, rgba(16, 185, 129, 0.12));
  border-color: var(--sec-primary, #10b981);
}

.mood-emoji {
  font-size: 20px;
}

.mood-label {
  font-size: 10px;
  color: var(--text-color-secondary, #94a3b8);
}

.reflection-input {
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--border-color, #333338);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-color, #e2e8f0);
  font-size: 13px;
  font-family: inherit;
  resize: none;
  outline: none;
  line-height: 1.5;
}

.reflection-input:focus {
  border-color: var(--sec-primary, #10b981);
}

.reflection-input::placeholder {
  color: var(--text-color-secondary, #94a3b8);
  opacity: 0.5;
}

.submit-btn {
  padding: 8px 16px;
  border-radius: 8px;
  border: none;
  background: var(--sec-primary, #10b981);
  color: white;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s;
  align-self: flex-end;
}

.submit-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.submit-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
</style>
