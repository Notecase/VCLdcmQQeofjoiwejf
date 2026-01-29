<script setup lang="ts">
/**
 * ConceptsModal - Advanced concepts viewer
 *
 * Displays concepts with descriptions and related topics.
 */
import { computed, ref } from 'vue'
import { useRecommendationsStore, type Concept } from '@/stores/recommendations'
import { Lightbulb, Plus, Copy, Check } from 'lucide-vue-next'
import BaseModal from './BaseModal.vue'
import { renderMathContent } from '@/utils/mathRenderer'

// Store
const store = useRecommendationsStore()

// Copy state
const copied = ref(false)

// Emits
const emit = defineEmits<{
  close: []
  addConcept: [concept: Concept]
}>()

// Computed
const concepts = computed<Concept[]>(() => store.currentRecommendations?.concepts || [])

function handleAddConcept(concept: Concept) {
  emit('addConcept', concept)
}

// Render content with math support
function renderContent(text: string | undefined): string {
  return renderMathContent(text || '')
}

// Copy all concepts as markdown
async function copyAsMarkdown() {
  const markdown = concepts.value
    .map((concept) => `**${concept.title}**: ${concept.description}`)
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
    title="Advanced Concepts"
    :subtitle="`${concepts.length} concepts`"
    size="md"
    @close="emit('close')"
  >
    <template #icon>
      <Lightbulb :size="20" />
    </template>

    <template #header-right>
      <button
        class="copy-btn"
        :class="{ copied }"
        @click="copyAsMarkdown"
        :title="copied ? 'Copied!' : 'Copy all as Markdown'"
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
      class="concepts-list"
      v-if="concepts.length > 0"
    >
      <div
        v-for="(concept, index) in concepts"
        :key="index"
        class="concept-item"
      >
        <div class="concept-header">
          <span class="concept-dash">-</span>
          <span
            class="concept-title math-content"
            v-html="renderContent(concept.title)"
          ></span>
        </div>

        <p
          class="concept-description math-content"
          v-html="renderContent(concept.description)"
        ></p>

        <button
          class="add-btn"
          @click="handleAddConcept(concept)"
        >
          <Plus :size="14" />
          Add
        </button>
      </div>
    </div>

    <div
      class="empty-state"
      v-else
    >
      <p>No concepts available.</p>
    </div>
  </BaseModal>
</template>

<style scoped>
.concepts-list {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.concept-item {
  position: relative;
}

.concept-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.concept-dash {
  font-size: 20px;
  font-weight: 600;
  color: #58a6ff;
}

.concept-title {
  font-size: 14px;
  font-weight: 500;
  color: #e6edf3;
}

.concept-description {
  font-size: 13px;
  color: #8b949e;
  line-height: 1.6;
  margin-bottom: 12px;
}

/* Math content styles */
.math-content :deep(.math-display) {
  margin: 0.5rem 0;
}

.math-content :deep(.math-inline) {
  display: inline;
}

.math-content :deep(.math-code-block) {
  margin: 0.5rem 0;
  padding: 0.5rem;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 6px;
  font-size: 12px;
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
  font-size: 1em;
}

.math-content :deep(.katex-display) {
  margin: 0.5rem 0;
  overflow-x: auto;
  overflow-y: hidden;
}

.add-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #58a6ff;
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 0;
  opacity: 0;
  transition: opacity 0.15s;
}

.concept-item:hover .add-btn {
  opacity: 1;
}

.add-btn:hover {
  text-decoration: underline;
}

/* Empty state */
.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: #8b949e;
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
