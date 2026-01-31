<script setup lang="ts">
/**
 * RecommendTab - AI-powered recommendations panel
 *
 * Displays billboard cards for different recommendation types:
 * - Mind Map, Flashcards, Concepts, Exercises, Resources, Slides
 * Each card can generate content and open modals for viewing.
 *
 * Features a circle trigger button for manual analysis (like Note3).
 */
import { computed, watch, ref, onUnmounted, onMounted } from 'vue'
import { useRecommendationsStore, type RecommendationType } from '@/stores/recommendations'
import { useLearningResourcesStore, type LearningResourceType } from '@/stores/learningResources'
import { useEditorStore } from '@/stores'
import {
  Loader2,
  Brain,
  BookOpen,
  Lightbulb,
  PenTool,
  Link2,
  Presentation,
  Save,
  Check,
} from 'lucide-vue-next'

// Stores
const recommendStore = useRecommendationsStore()
const learningStore = useLearningResourcesStore()
const editorStore = useEditorStore()

// State
const isAnalyzing = ref(false)
const apiStatus = ref<'unknown' | 'online' | 'offline'>('unknown')
const apiError = ref<string | null>(null)
const contentTooShort = ref(false)
const savedTypes = ref<Set<RecommendationType>>(new Set())
const savingTypes = ref<Set<RecommendationType>>(new Set())

// Thinking animation messages (cycling)
const thinkingMessages = [
  'Reading your note content...',
  'Understanding key concepts...',
  'Analyzing relationships...',
  'Generating recommendations...',
  'Creating visual structure...',
]
const thinkingMessageIndex = ref(0)
const thinkingMessage = computed(() => thinkingMessages[thinkingMessageIndex.value])
let thinkingInterval: ReturnType<typeof setInterval> | null = null

function startThinkingAnimation() {
  thinkingMessageIndex.value = 0
  thinkingInterval = setInterval(() => {
    thinkingMessageIndex.value = (thinkingMessageIndex.value + 1) % thinkingMessages.length
  }, 1500)
}

function stopThinkingAnimation() {
  if (thinkingInterval) {
    clearInterval(thinkingInterval)
    thinkingInterval = null
  }
}

onUnmounted(() => {
  stopThinkingAnimation()
})

/**
 * Check if the API backend is reachable
 */
async function checkAPIHealth(): Promise<boolean> {
  try {
    console.log('🔌 [RecommendTab] Checking API health...')
    // Use the health endpoint (mounted at /health, not /api/health)
    const response = await fetch('/health', {
      method: 'GET',
      signal: AbortSignal.timeout(5000), // 5 second timeout
    })

    if (response.ok) {
      console.log('✅ [RecommendTab] API is online')
      apiStatus.value = 'online'
      apiError.value = null
      return true
    } else {
      console.warn('⚠️ [RecommendTab] API returned non-OK status:', response.status)
      apiStatus.value = 'offline'
      apiError.value = `API returned status ${response.status}`
      return false
    }
  } catch (error) {
    console.error('❌ [RecommendTab] API health check failed:', error)
    apiStatus.value = 'offline'
    if (error instanceof TypeError && error.message.includes('fetch')) {
      apiError.value = 'Cannot connect to backend. Is the API server running?'
    } else {
      apiError.value = String(error)
    }
    return false
  }
}

onMounted(() => {
  // Check API health on mount
  checkAPIHealth()

  // Initialize current note in the store if there's already an active note
  if (noteId.value) {
    console.log('🔧 [RecommendTab] Initializing current note on mount:', noteId.value)
    recommendStore.setCurrentNote(noteId.value)
  }
})

// Computed
const activeNote = computed(() => editorStore.currentDocument)
const noteId = computed(() => activeNote.value?.id)

// Watch for note changes
watch(noteId, (id) => {
  if (id) {
    recommendStore.setCurrentNote(id)
    // Reset content warning when switching notes
    contentTooShort.value = false
  }
})

/**
 * Get the best available note content
 * Tries multiple sources to ensure we have content (like Note3's extractNoteContent)
 */
function getEditorContent(): string {
  // Source 1: Get from active tab's document (most up-to-date with unsaved changes)
  const tabContent = editorStore.activeTab?.document?.content
  if (tabContent && tabContent.length > 0) {
    console.log('📝 [RecommendTab] Got content from activeTab:', tabContent.length, 'chars')
    return tabContent
  }

  // Source 2: Get from currentDocument
  const currentContent = editorStore.currentDocument?.content
  if (currentContent && currentContent.length > 0) {
    console.log(
      '📝 [RecommendTab] Got content from currentDocument:',
      currentContent.length,
      'chars'
    )
    return currentContent
  }

  // Source 3: Get from computed activeNote
  const noteContent = activeNote.value?.content
  if (noteContent && noteContent.length > 0) {
    console.log('📝 [RecommendTab] Got content from activeNote:', noteContent.length, 'chars')
    return noteContent
  }

  console.warn('⚠️ [RecommendTab] No content found from any source')
  return ''
}

/**
 * Manual analysis trigger (like Note3's circle button)
 * Extracts note content and generates all recommendations in parallel
 */
async function handleManualAnalysis() {
  if (!activeNote.value || isAnalyzing.value) return

  console.log('🔍 [RecommendTab] Starting analysis for note:', activeNote.value.id)
  console.log('🔍 [RecommendTab] Note title:', activeNote.value.title)

  isAnalyzing.value = true
  startThinkingAnimation()

  try {
    // Get note content using the robust extraction method
    const noteContent = getEditorContent()

    console.log('🔍 [RecommendTab] Content length:', noteContent.length)
    console.log('🔍 [RecommendTab] Content preview:', noteContent.substring(0, 200))

    if (!noteContent || noteContent.length < 50) {
      console.warn('⚠️ [RecommendTab] Note content too short for analysis (minimum 50 characters)')
      console.warn('⚠️ [RecommendTab] Current length:', noteContent.length)
      contentTooShort.value = true
      return
    }

    contentTooShort.value = false

    // Generate all recommendations in parallel
    console.log('🚀 [RecommendTab] Generating recommendations...')
    console.log('🚀 [RecommendTab] Passing noteContent of length:', noteContent.length)

    // CRITICAL: Ensure current note is set in the store before generating
    console.log('🔧 [RecommendTab] Setting current note in store:', activeNote.value.id)
    recommendStore.setCurrentNote(activeNote.value.id)
    console.log('🔧 [RecommendTab] Store currentNoteId after set:', recommendStore.currentNoteId)

    await recommendStore.generateAll(activeNote.value.id, noteContent, [
      'mindmap',
      'flashcards',
      'concepts',
      'exercises',
      'resources',
    ])

    console.log('✅ [RecommendTab] Generation complete')
    console.log('✅ [RecommendTab] Current recommendations:', recommendStore.currentRecommendations)
    console.log('✅ [RecommendTab] Has mindmap:', recommendStore.hasMindmap)
    console.log('✅ [RecommendTab] Has concepts:', recommendStore.hasConcepts)
    console.log('✅ [RecommendTab] Errors:', recommendStore.errors)
  } catch (error) {
    console.error('❌ [RecommendTab] Error during analysis:', error)
  } finally {
    isAnalyzing.value = false
    stopThinkingAnimation()
  }
}

// Recommendation card definitions
const recommendationCards = computed(() => [
  {
    id: 'mindmap' as RecommendationType,
    title: 'Mind Map',
    icon: Brain,
    badge: 'NEW',
    badgeClass: 'new',
    description:
      'Visualize your study guide as an interactive mindmap. See connections between concepts and understand the big picture.',
    tags: ['Visual', 'Structure', 'Overview'],
    hasData: recommendStore.hasMindmap,
  },
  {
    id: 'flashcards' as RecommendationType,
    title: 'Flashcards',
    icon: BookOpen,
    badge: 'NEW',
    badgeClass: 'new',
    description: 'Interactive flashcards to memorize key concepts and test your knowledge.',
    tags: ['Memory', 'Practice', 'Quiz'],
    hasData: recommendStore.hasFlashcards,
  },
  {
    id: 'concepts' as RecommendationType,
    title: 'Advanced Concepts',
    icon: Lightbulb,
    badge: 'UPDATE',
    badgeClass: 'update',
    description:
      'Explore advanced topics and related concepts. Each concept builds on your current understanding.',
    tags: ['Deep Dive', 'Learning', 'Theory'],
    hasData: recommendStore.hasConcepts,
  },
  {
    id: 'exercises' as RecommendationType,
    title: 'Practice Exercises',
    icon: PenTool,
    badge: 'UPDATE',
    badgeClass: 'update',
    description: 'Practice problems and exercises to reinforce your learning.',
    tags: ['Practice', 'Problems', 'Application'],
    hasData: recommendStore.hasExercises,
  },
  {
    id: 'resources' as RecommendationType,
    title: 'Learning Resources',
    icon: Link2,
    badge: null,
    badgeClass: '',
    description: 'Curated learning resources including papers, books, videos, and courses.',
    tags: ['Resources', 'References', 'External'],
    hasData: recommendStore.hasResources,
  },
  {
    id: 'slides' as RecommendationType,
    title: 'Visual Slides',
    icon: Presentation,
    badge: 'BETA',
    badgeClass: 'beta',
    description: 'Generate beautiful visual slides from your notes using AI image generation.',
    tags: ['Visual', 'Presentation', 'AI'],
    hasData: recommendStore.hasSlides,
  },
])

const visibleCards = computed(() =>
  recommendationCards.value.filter((card) =>
    recommendStore.visibleRecommendationTypes.includes(card.id)
  )
)

// Actions
async function handleGenerate(type: RecommendationType) {
  if (!noteId.value) return

  // Get content for individual generation too
  const noteContent = getEditorContent()
  console.log(`🔍 [RecommendTab] Generating ${type} for note:`, noteId.value)
  console.log(`🔍 [RecommendTab] Content length:`, noteContent.length)

  if (!noteContent || noteContent.length < 50) {
    console.warn(`⚠️ [RecommendTab] Content too short for ${type} generation`)
    contentTooShort.value = true
    return
  }

  contentTooShort.value = false

  // CRITICAL: Ensure current note is set in the store before generating
  recommendStore.setCurrentNote(noteId.value)

  let result: unknown = null
  switch (type) {
    case 'mindmap':
      result = await recommendStore.generateMindmap(noteId.value, noteContent)
      break
    case 'flashcards':
      result = await recommendStore.generateFlashcards(noteId.value, noteContent)
      break
    case 'concepts':
      result = await recommendStore.generateConcepts(noteId.value, noteContent)
      break
    case 'exercises':
      result = await recommendStore.generateExercises(noteId.value, noteContent)
      break
    case 'resources':
      result = await recommendStore.generateResources(noteId.value, noteContent)
      break
    case 'slides':
      result = await recommendStore.generateSlides(noteId.value, noteContent)
      break
  }

  console.log(`✅ [RecommendTab] ${type} result:`, result)
  console.log(`✅ [RecommendTab] Store error for ${type}:`, recommendStore.errors[type])

  // Open modal after generation
  recommendStore.openModal(type)
}

function handleView(type: RecommendationType) {
  recommendStore.openModal(type)
}

function handleDismiss(type: RecommendationType) {
  recommendStore.dismissType(type)
}

function getStatus(type: RecommendationType) {
  return recommendStore.generationStatus[type]
}

function getError(type: RecommendationType) {
  return recommendStore.errors[type]
}

function isLoading(type: RecommendationType) {
  return getStatus(type) === 'generating'
}

/**
 * Map recommendation type to learning resource type
 */
function mapToResourceType(type: RecommendationType): LearningResourceType | null {
  const mapping: Record<RecommendationType, LearningResourceType | null> = {
    mindmap: 'mindmap',
    flashcards: 'flashcards',
    concepts: 'key_terms', // Concepts become key_terms
    exercises: 'exercises',
    resources: 'resources',
    slides: null, // Slides are handled differently
  }
  return mapping[type]
}

/**
 * Get data for saving from recommendation store
 */
function getResourceData(type: RecommendationType): { data: unknown; itemCount: number } | null {
  const recommendations = recommendStore.currentRecommendations
  if (!recommendations) return null

  switch (type) {
    case 'mindmap':
      if (recommendations.mindmap) {
        return {
          data: recommendations.mindmap,
          itemCount: recommendations.mindmap.nodes?.length ?? 0,
        }
      }
      break
    case 'flashcards':
      if (recommendations.flashcards) {
        return {
          data: { cards: recommendations.flashcards },
          itemCount: recommendations.flashcards.length,
        }
      }
      break
    case 'concepts':
      if (recommendations.concepts) {
        // Convert concepts to key_terms format
        return {
          data: {
            terms: recommendations.concepts.map((c) => ({
              term: c.title,
              definition: c.description,
            })),
          },
          itemCount: recommendations.concepts.length,
        }
      }
      break
    case 'exercises':
      if (recommendations.exercises) {
        return {
          data: {
            exercises: recommendations.exercises.map((e) => ({
              title: e.title,
              description: e.description,
              difficulty: e.difficulty || 'medium',
            })),
          },
          itemCount: recommendations.exercises.length,
        }
      }
      break
    case 'resources':
      if (recommendations.resources) {
        return {
          data: {
            resources: recommendations.resources.map((r) => ({
              type: r.type,
              title: r.title,
              description: r.description,
              url: r.link,
            })),
          },
          itemCount: recommendations.resources.length,
        }
      }
      break
  }
  return null
}

/**
 * Save generated content as a learning resource
 */
async function handleSave(type: RecommendationType) {
  if (!noteId.value) return

  const resourceType = mapToResourceType(type)
  if (!resourceType) {
    console.warn(`[RecommendTab] Cannot save type ${type} - no mapping`)
    return
  }

  const resourceData = getResourceData(type)
  if (!resourceData) {
    console.warn(`[RecommendTab] No data to save for type ${type}`)
    return
  }

  savingTypes.value.add(type)

  try {
    await learningStore.saveResource(
      noteId.value,
      resourceType,
      resourceData.data as any,
      resourceData.itemCount
    )
    savedTypes.value.add(type)

    // Clear saved indicator after 3 seconds
    setTimeout(() => {
      savedTypes.value.delete(type)
    }, 3000)
  } catch (error) {
    console.error(`[RecommendTab] Failed to save ${type}:`, error)
  } finally {
    savingTypes.value.delete(type)
  }
}

function isSaving(type: RecommendationType): boolean {
  return savingTypes.value.has(type)
}

function isSaved(type: RecommendationType): boolean {
  return savedTypes.value.has(type)
}
</script>

<template>
  <div class="recommend-tab">
    <!-- Analysis Header with Circle Trigger -->
    <div
      v-if="activeNote"
      class="analysis-header"
    >
      <span class="analysis-label">AI Analysis</span>
      <span
        class="analysis-trigger"
        :class="{ pulse: isAnalyzing || recommendStore.isGenerating, clickable: !!activeNote }"
        title="Analyze note content and generate all recommendations"
        @click="handleManualAnalysis"
      >
        ○
      </span>
    </div>

    <!-- Thinking Animation -->
    <div
      v-if="isAnalyzing"
      class="thinking-indicator"
    >
      <div class="thinking-dots">
        <span class="dot"></span>
        <span class="dot"></span>
        <span class="dot"></span>
      </div>
      <span class="thinking-message">{{ thinkingMessage }}</span>
    </div>

    <!-- API Status Warning -->
    <div
      v-if="apiStatus === 'offline'"
      class="api-warning"
    >
      <span class="warning-icon">⚠️</span>
      <div class="warning-content">
        <span class="warning-title">Backend Unavailable</span>
        <span class="warning-message">{{ apiError || 'Cannot connect to API server' }}</span>
        <button
          class="retry-btn"
          @click="checkAPIHealth"
        >
          Retry
        </button>
      </div>
    </div>

    <!-- Content Too Short Warning -->
    <div
      v-if="contentTooShort && activeNote"
      class="content-warning"
    >
      <span class="warning-icon">📝</span>
      <div class="warning-content">
        <span class="warning-title">More Content Needed</span>
        <span class="warning-message"
          >Add more content to your note (at least 50 characters) to enable AI
          recommendations.</span
        >
      </div>
    </div>

    <!-- Context Indicator -->
    <div
      v-if="!activeNote"
      class="context-indicator"
    >
      <span class="radio-dot"></span>
      <span>Select a note to get AI recommendations</span>
    </div>

    <!-- Slides Progress -->
    <div
      v-if="recommendStore.slidesProgress"
      class="slides-progress"
    >
      <div class="progress-header">
        <Presentation :size="16" />
        <span>Generating Slides...</span>
      </div>
      <div class="progress-bar-container">
        <div
          class="progress-bar-fill"
          :style="{
            width: `${(recommendStore.slidesProgress.currentSlide / recommendStore.slidesProgress.totalSlides) * 100}%`,
          }"
        />
      </div>
      <div class="progress-text">
        {{ recommendStore.slidesProgress.message }}
        ({{ recommendStore.slidesProgress.currentSlide }} /
        {{ recommendStore.slidesProgress.totalSlides }})
      </div>
    </div>

    <!-- Recommendations List -->
    <div
      v-if="activeNote"
      class="recommendations-list"
    >
      <div
        v-for="card in visibleCards"
        :key="card.id"
        class="recommendation-card"
        :class="{ 'has-data': card.hasData, 'is-loading': isLoading(card.id) }"
      >
        <div class="card-header">
          <component
            :is="card.icon"
            :size="16"
            class="card-icon"
          />
          <span class="card-title">{{ card.title }}</span>
          <span
            v-if="card.badge"
            class="card-badge"
            :class="card.badgeClass"
          >
            {{ card.badge }}
          </span>
        </div>

        <p class="card-desc">{{ card.description }}</p>

        <!-- Error message -->
        <div
          v-if="getError(card.id)"
          class="card-error"
        >
          {{ getError(card.id) }}
        </div>

        <div class="card-tags">
          <span
            v-for="tag in card.tags"
            :key="tag"
            class="card-tag"
          >
            {{ tag }}
          </span>
        </div>

        <div class="card-actions">
          <button
            v-if="card.hasData"
            class="action-btn primary"
            @click="handleView(card.id)"
          >
            View
          </button>
          <button
            v-else
            class="action-btn primary"
            :disabled="isLoading(card.id)"
            @click="handleGenerate(card.id)"
          >
            <Loader2
              v-if="isLoading(card.id)"
              :size="14"
              class="spin"
            />
            <span v-else>Generate</span>
          </button>
          <!-- Save button (only for saveable types with data) -->
          <button
            v-if="card.hasData && mapToResourceType(card.id)"
            class="action-btn save"
            :class="{ saved: isSaved(card.id) }"
            :title="isSaved(card.id) ? 'Saved!' : 'Save to Resources'"
            :disabled="isSaving(card.id)"
            @click="handleSave(card.id)"
          >
            <Loader2
              v-if="isSaving(card.id)"
              :size="14"
              class="spin"
            />
            <Check
              v-else-if="isSaved(card.id)"
              :size="14"
            />
            <Save
              v-else
              :size="14"
            />
            <span>{{ isSaved(card.id) ? 'Saved' : 'Save' }}</span>
          </button>
          <button
            class="action-btn secondary"
            @click="handleDismiss(card.id)"
          >
            Dismiss
          </button>
        </div>
      </div>

      <!-- Empty state when all dismissed -->
      <div
        v-if="visibleCards.length === 0"
        class="empty-state"
      >
        <p>All recommendations have been dismissed.</p>
        <button
          class="reset-btn"
          @click="recommendStore.dismissedTypes.clear()"
        >
          Show All
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.recommend-tab {
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Analysis Header - borderless */
.analysis-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0 20px;
  margin-bottom: 8px;
  border-bottom: none;
}

.analysis-label {
  font-size: 12px;
  font-weight: 500;
  color: #8b949e;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.analysis-trigger {
  font-size: 20px;
  color: #30363d;
  cursor: default;
  transition: all 0.2s;
  user-select: none;
}

.analysis-trigger.clickable {
  color: #58a6ff;
  cursor: pointer;
}

.analysis-trigger.clickable:hover {
  opacity: 0.8;
}

.analysis-trigger.pulse {
  animation: pulse 1.5s ease-in-out infinite;
  color: #3fb950;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.6;
    transform: scale(1.1);
  }
}

/* Thinking Animation */
.thinking-indicator {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: rgba(88, 166, 255, 0.1);
  border-radius: 8px;
  border: 1px solid rgba(88, 166, 255, 0.2);
}

.thinking-dots {
  display: flex;
  gap: 4px;
}

.thinking-dots .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #58a6ff;
  animation: thinking-bounce 1.4s ease-in-out infinite;
}

.thinking-dots .dot:nth-child(1) {
  animation-delay: 0s;
}

.thinking-dots .dot:nth-child(2) {
  animation-delay: 0.2s;
}

.thinking-dots .dot:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes thinking-bounce {
  0%,
  80%,
  100% {
    transform: scale(1);
    opacity: 0.5;
  }
  40% {
    transform: scale(1.3);
    opacity: 1;
  }
}

.thinking-message {
  font-size: 13px;
  color: #58a6ff;
  transition: opacity 0.3s ease;
}

/* API Warning */
.api-warning {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 16px;
  background: rgba(248, 81, 73, 0.1);
  border-radius: 8px;
  border: 1px solid rgba(248, 81, 73, 0.3);
}

.warning-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.warning-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}

.warning-title {
  font-size: 13px;
  font-weight: 600;
  color: #f85149;
}

.warning-message {
  font-size: 12px;
  color: #8b949e;
  line-height: 1.4;
}

.retry-btn {
  margin-top: 8px;
  padding: 6px 12px;
  background: rgba(248, 81, 73, 0.2);
  border: 1px solid rgba(248, 81, 73, 0.4);
  border-radius: 6px;
  color: #f85149;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  align-self: flex-start;
}

.retry-btn:hover {
  background: rgba(248, 81, 73, 0.3);
  border-color: #f85149;
}

/* Content Warning */
.content-warning {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 16px;
  background: rgba(234, 179, 8, 0.1);
  border-radius: 8px;
  border: 1px solid rgba(234, 179, 8, 0.3);
}

.content-warning .warning-title {
  color: #eab308;
}

.content-warning .warning-message {
  color: #8b949e;
}

/* Context Indicator */
.context-indicator {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 16px;
  margin-bottom: 8px;
  border-left: 3px solid #58a6ff;
  background: transparent;
}

.radio-dot {
  width: 14px;
  height: 14px;
  border: 2px solid #30363d;
  border-radius: 50%;
  background: transparent;
  flex-shrink: 0;
  margin-top: 2px;
}

.context-indicator span:last-child {
  font-size: 13px;
  color: #8b949e;
}

/* Slides Progress */
.slides-progress {
  background: rgba(22, 27, 34, 0.7);
  border: 1px solid #30363d;
  border-radius: 10px;
  padding: 16px;
}

.progress-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #e6edf3;
  margin-bottom: 12px;
}

.progress-header svg {
  color: #58a6ff;
}

.progress-bar-container {
  height: 4px;
  background: #21262d;
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 8px;
}

.progress-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #58a6ff, #a371f7);
  border-radius: 2px;
  transition: width 0.3s ease;
}

.progress-text {
  font-size: 11px;
  color: #8b949e;
}

/* Recommendations List */
.recommendations-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}

/* Cards - borderless with dividers */
.recommendation-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: transparent;
  border: none;
  padding: 20px 0;
  text-align: left;
  transition: opacity 0.2s;
}

/* Subtle divider between cards */
.recommendation-card + .recommendation-card {
  border-top: 1px solid var(--ai-divider);
}

.recommendation-card.is-loading {
  opacity: 0.7;
}

/* Card with data - subtle highlight */
.recommendation-card.has-data {
  background: rgba(63, 185, 80, 0.03);
  border-radius: 12px;
  padding: 16px;
  margin: 4px -12px;
  border-top: none;
}

.recommendation-card.has-data + .recommendation-card {
  border-top: none;
}

.recommendation-card.has-data .card-icon {
  color: #3fb950;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.card-icon {
  color: #58a6ff;
  flex-shrink: 0;
}

.card-title {
  font-size: 14px;
  font-weight: 600;
  color: #e6edf3;
}

.card-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.card-badge.new {
  background: rgba(35, 134, 54, 0.2);
  color: #3fb950;
}

.card-badge.update {
  background: rgba(88, 166, 255, 0.15);
  color: #58a6ff;
}

.card-badge.beta {
  background: rgba(163, 113, 247, 0.15);
  color: #a371f7;
}

.card-desc {
  font-size: 13px;
  color: #8b949e;
  line-height: 1.5;
  text-align: left;
}

.card-error {
  font-size: 12px;
  color: #f85149;
  background: rgba(248, 81, 73, 0.1);
  padding: 8px 12px;
  border-radius: 6px;
  border-left: 3px solid #f85149;
}

.card-tags {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-start;
  gap: 0;
  margin-top: 4px;
}

/* Tags - minimal style with dot separators */
.card-tag {
  font-size: 11px;
  color: #8b949e;
  background: transparent;
  padding: 0;
  border-radius: 0;
  border: none;
  opacity: 0.6;
}

.card-tag::before {
  content: ' · ';
  opacity: 0.4;
}

.card-tag:first-child::before {
  content: '';
}

.card-actions {
  display: flex;
  justify-content: flex-start;
  gap: 16px;
  margin-top: 8px;
}

.action-btn {
  padding: 0;
  border-radius: 0;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  gap: 6px;
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-btn.primary {
  color: #58a6ff;
}

.action-btn.primary:hover:not(:disabled) {
  opacity: 0.8;
}

.action-btn.secondary {
  color: #8b949e;
}

.action-btn.secondary:hover {
  color: #c9d1d9;
}

.action-btn.save {
  color: #3fb950;
}

.action-btn.save:hover:not(:disabled) {
  opacity: 0.8;
}

.action-btn.save.saved {
  color: #3fb950;
}

/* Empty state */
.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: #8b949e;
}

.empty-state p {
  margin-bottom: 16px;
}

.reset-btn {
  background: #21262d;
  color: #58a6ff;
  border: 1px solid #30363d;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}

.reset-btn:hover {
  background: #30363d;
  border-color: #58a6ff;
}

/* Spinner */
.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
