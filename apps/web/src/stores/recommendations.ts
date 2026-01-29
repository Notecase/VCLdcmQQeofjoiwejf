/**
 * Recommendations Store
 *
 * Pinia store for managing AI-powered recommendation state.
 * Integrates with the recommendation API to generate mindmaps, flashcards,
 * concepts, exercises, resources, and slides.
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authFetch, authFetchSSE } from '@/utils/api'

// ============================================================================
// Types
// ============================================================================

export interface MindmapNode {
  id: string
  label: string
  level: number
  children: MindmapNode[]
}

export interface Mindmap {
  center: string
  nodes: MindmapNode[]
}

// Flashcard - matches backend FlashcardData
export interface Flashcard {
  question: string
  answer: string
}

// Concept - matches backend ConceptData
export interface Concept {
  title: string
  description: string
}

// Exercise - matches backend ExerciseData
export interface Exercise {
  title: string
  description: string
  difficulty?: 'beginner' | 'intermediate' | 'advanced'
}

// Resource - matches backend ResourceData
export interface Resource {
  type: string
  title: string
  description: string
  link?: string
}

// Slide - matches backend SlideData
export interface Slide {
  slideNumber: number
  title: string
  type: string
  imageData: string
  caption: string
}

export interface RecommendationData {
  noteId: string
  generatedAt: Date
  mindmap?: Mindmap
  flashcards?: Flashcard[]
  concepts?: Concept[]
  exercises?: Exercise[]
  resources?: Resource[]
  slides?: Slide[]
}

export type RecommendationType = 'mindmap' | 'flashcards' | 'concepts' | 'exercises' | 'resources' | 'slides'

export type GenerationStatus = 'idle' | 'generating' | 'complete' | 'error'

// ============================================================================
// Store Definition
// ============================================================================

export const useRecommendationsStore = defineStore('recommendations', () => {
  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  // Current note context
  const currentNoteId = ref<string | null>(null)

  // Recommendation data by note ID
  const recommendations = ref<Map<string, RecommendationData>>(new Map())

  // Generation status for each type
  const generationStatus = ref<Record<RecommendationType, GenerationStatus>>({
    mindmap: 'idle',
    flashcards: 'idle',
    concepts: 'idle',
    exercises: 'idle',
    resources: 'idle',
    slides: 'idle',
  })

  // Progress for slides generation
  const slidesProgress = ref<{
    currentSlide: number
    totalSlides: number
    message: string
  } | null>(null)

  // Error messages
  const errors = ref<Partial<Record<RecommendationType, string>>>({})

  // Dismissed recommendations
  const dismissedTypes = ref<Set<RecommendationType>>(new Set())

  // Active modal
  const activeModal = ref<RecommendationType | null>(null)

  // ---------------------------------------------------------------------------
  // Computed
  // ---------------------------------------------------------------------------

  const currentRecommendations = computed(() => {
    if (!currentNoteId.value) return null
    return recommendations.value.get(currentNoteId.value) || null
  })

  const hasMindmap = computed(() => !!currentRecommendations.value?.mindmap)
  const hasFlashcards = computed(() => !!currentRecommendations.value?.flashcards?.length)
  const hasConcepts = computed(() => !!currentRecommendations.value?.concepts?.length)
  const hasExercises = computed(() => !!currentRecommendations.value?.exercises?.length)
  const hasResources = computed(() => !!currentRecommendations.value?.resources?.length)
  const hasSlides = computed(() => !!currentRecommendations.value?.slides?.length)

  const isGenerating = computed(() =>
    Object.values(generationStatus.value).some(s => s === 'generating')
  )

  const visibleRecommendationTypes = computed(() => {
    const types: RecommendationType[] = ['mindmap', 'flashcards', 'concepts', 'exercises', 'resources', 'slides']
    return types.filter(t => !dismissedTypes.value.has(t))
  })

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  function setCurrentNote(noteId: string | null) {
    currentNoteId.value = noteId
    dismissedTypes.value.clear()
  }

  function getRecommendation(noteId: string): RecommendationData | null {
    return recommendations.value.get(noteId) || null
  }

  function setRecommendation(noteId: string, data: Partial<RecommendationData>) {
    const existing = recommendations.value.get(noteId) || {
      noteId,
      generatedAt: new Date(),
    }

    recommendations.value.set(noteId, {
      ...existing,
      ...data,
      generatedAt: new Date(),
    })
  }

  function setGenerationStatus(type: RecommendationType, status: GenerationStatus) {
    generationStatus.value[type] = status
    if (status === 'idle' || status === 'complete') {
      delete errors.value[type]
    }
  }

  function setError(type: RecommendationType, error: string) {
    errors.value[type] = error
    generationStatus.value[type] = 'error'
  }

  function clearError(type: RecommendationType) {
    delete errors.value[type]
    if (generationStatus.value[type] === 'error') {
      generationStatus.value[type] = 'idle'
    }
  }

  function dismissType(type: RecommendationType) {
    dismissedTypes.value.add(type)
  }

  function undismissType(type: RecommendationType) {
    dismissedTypes.value.delete(type)
  }

  function openModal(type: RecommendationType) {
    activeModal.value = type
  }

  function closeModal() {
    activeModal.value = null
  }

  function setSlidesProgress(progress: { currentSlide: number; totalSlides: number; message: string } | null) {
    slidesProgress.value = progress
  }

  // ---------------------------------------------------------------------------
  // API Actions
  // ---------------------------------------------------------------------------

  async function generateMindmap(noteId: string, noteContent?: string): Promise<Mindmap | null> {
    setGenerationStatus('mindmap', 'generating')

    console.log('🧠 [Recommendations] generateMindmap called')
    console.log('🧠 [Recommendations] noteId:', noteId)
    console.log('🧠 [Recommendations] noteContent length:', noteContent?.length || 0)
    console.log('🧠 [Recommendations] noteContent preview:', noteContent?.substring(0, 100) || 'N/A')

    if (!noteContent || noteContent.length < 50) {
      const errorMsg = `Content too short (${noteContent?.length || 0} chars, need 50+)`
      console.error('❌ [Recommendations]', errorMsg)
      setError('mindmap', errorMsg)
      return null
    }

    try {
      console.log('🧠 [Recommendations] Sending request to /api/recommend/mindmap')
      const response = await authFetch('/api/recommend/mindmap', {
        method: 'POST',
        body: JSON.stringify({ noteId, noteContent }),
      })

      console.log('🧠 [Recommendations] Response status:', response.status)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('❌ [Recommendations] HTTP error:', response.status, errorText)
        throw new Error(`HTTP ${response.status}: ${errorText}`)
      }

      const result = await response.json()
      console.log('🧠 [Recommendations] Response data:', result)

      if (result.success && result.data) {
        console.log('✅ [Recommendations] Mindmap generated successfully')
        setRecommendation(noteId, { mindmap: result.data })
        setGenerationStatus('mindmap', 'complete')
        return result.data
      }

      throw new Error(result.error || 'Failed to generate mindmap')
    } catch (error) {
      console.error('❌ [Recommendations] generateMindmap error:', error)
      setError('mindmap', String(error))
      return null
    }
  }

  async function generateFlashcards(noteId: string, noteContent?: string): Promise<Flashcard[] | null> {
    setGenerationStatus('flashcards', 'generating')

    console.log('📚 [Recommendations] generateFlashcards called')
    console.log('📚 [Recommendations] noteContent length:', noteContent?.length || 0)

    if (!noteContent || noteContent.length < 50) {
      const errorMsg = `Content too short (${noteContent?.length || 0} chars, need 50+)`
      console.error('❌ [Recommendations]', errorMsg)
      setError('flashcards', errorMsg)
      return null
    }

    try {
      const response = await authFetch('/api/recommend/flashcards', {
        method: 'POST',
        body: JSON.stringify({ noteId, noteContent }),
      })

      console.log('📚 [Recommendations] Response status:', response.status)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('❌ [Recommendations] HTTP error:', response.status, errorText)
        throw new Error(`HTTP ${response.status}: ${errorText}`)
      }

      const result = await response.json()
      console.log('📚 [Recommendations] Response data:', result)

      if (result.success && result.data) {
        console.log('✅ [Recommendations] Flashcards generated:', result.data.length, 'cards')
        setRecommendation(noteId, { flashcards: result.data })
        setGenerationStatus('flashcards', 'complete')
        return result.data
      }

      throw new Error(result.error || 'Failed to generate flashcards')
    } catch (error) {
      console.error('❌ [Recommendations] generateFlashcards error:', error)
      setError('flashcards', String(error))
      return null
    }
  }

  async function generateConcepts(noteId: string, noteContent?: string): Promise<Concept[] | null> {
    setGenerationStatus('concepts', 'generating')

    console.log('💡 [Recommendations] generateConcepts called')
    console.log('💡 [Recommendations] noteContent length:', noteContent?.length || 0)

    if (!noteContent || noteContent.length < 50) {
      const errorMsg = `Content too short (${noteContent?.length || 0} chars, need 50+)`
      console.error('❌ [Recommendations]', errorMsg)
      setError('concepts', errorMsg)
      return null
    }

    try {
      const response = await authFetch('/api/recommend/concepts', {
        method: 'POST',
        body: JSON.stringify({ noteId, noteContent }),
      })

      console.log('💡 [Recommendations] Response status:', response.status)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('❌ [Recommendations] HTTP error:', response.status, errorText)
        throw new Error(`HTTP ${response.status}: ${errorText}`)
      }

      const result = await response.json()

      if (result.success && result.data) {
        console.log('✅ [Recommendations] Concepts generated:', result.data.length, 'concepts')
        setRecommendation(noteId, { concepts: result.data })
        setGenerationStatus('concepts', 'complete')
        return result.data
      }

      throw new Error(result.error || 'Failed to generate concepts')
    } catch (error) {
      console.error('❌ [Recommendations] generateConcepts error:', error)
      setError('concepts', String(error))
      return null
    }
  }

  async function generateExercises(noteId: string, noteContent?: string): Promise<Exercise[] | null> {
    setGenerationStatus('exercises', 'generating')

    console.log('✏️ [Recommendations] generateExercises called')
    console.log('✏️ [Recommendations] noteContent length:', noteContent?.length || 0)

    if (!noteContent || noteContent.length < 50) {
      const errorMsg = `Content too short (${noteContent?.length || 0} chars, need 50+)`
      console.error('❌ [Recommendations]', errorMsg)
      setError('exercises', errorMsg)
      return null
    }

    try {
      const response = await authFetch('/api/recommend/exercises', {
        method: 'POST',
        body: JSON.stringify({ noteId, noteContent }),
      })

      console.log('✏️ [Recommendations] Response status:', response.status)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('❌ [Recommendations] HTTP error:', response.status, errorText)
        throw new Error(`HTTP ${response.status}: ${errorText}`)
      }

      const result = await response.json()

      if (result.success && result.data) {
        console.log('✅ [Recommendations] Exercises generated:', result.data.length, 'exercises')
        setRecommendation(noteId, { exercises: result.data })
        setGenerationStatus('exercises', 'complete')
        return result.data
      }

      throw new Error(result.error || 'Failed to generate exercises')
    } catch (error) {
      console.error('❌ [Recommendations] generateExercises error:', error)
      setError('exercises', String(error))
      return null
    }
  }

  async function generateResources(noteId: string, noteContent?: string): Promise<Resource[] | null> {
    setGenerationStatus('resources', 'generating')

    console.log('🔗 [Recommendations] generateResources called')
    console.log('🔗 [Recommendations] noteContent length:', noteContent?.length || 0)

    if (!noteContent || noteContent.length < 50) {
      const errorMsg = `Content too short (${noteContent?.length || 0} chars, need 50+)`
      console.error('❌ [Recommendations]', errorMsg)
      setError('resources', errorMsg)
      return null
    }

    try {
      const response = await authFetch('/api/recommend/resources', {
        method: 'POST',
        body: JSON.stringify({ noteId, noteContent }),
      })

      console.log('🔗 [Recommendations] Response status:', response.status)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('❌ [Recommendations] HTTP error:', response.status, errorText)
        throw new Error(`HTTP ${response.status}: ${errorText}`)
      }

      const result = await response.json()

      if (result.success && result.data) {
        console.log('✅ [Recommendations] Resources generated:', result.data.length, 'resources')
        setRecommendation(noteId, { resources: result.data })
        setGenerationStatus('resources', 'complete')
        return result.data
      }

      throw new Error(result.error || 'Failed to generate resources')
    } catch (error) {
      console.error('❌ [Recommendations] generateResources error:', error)
      setError('resources', String(error))
      return null
    }
  }

  async function generateSlides(
    noteId: string,
    noteContent?: string,
    numSlides = 8,
    theme?: string
  ): Promise<Slide[] | null> {
    setGenerationStatus('slides', 'generating')
    setSlidesProgress({ currentSlide: 0, totalSlides: numSlides, message: 'Starting...' })

    console.log('🎨 [Recommendations] generateSlides called')
    console.log('🎨 [Recommendations] noteContent length:', noteContent?.length || 0)
    console.log('🎨 [Recommendations] numSlides:', numSlides)

    if (!noteContent || noteContent.length < 50) {
      const errorMsg = `Content too short (${noteContent?.length || 0} chars, need 50+)`
      console.error('❌ [Recommendations]', errorMsg)
      setError('slides', errorMsg)
      setSlidesProgress(null)
      return null
    }

    try {
      const response = await authFetchSSE('/api/recommend/slides', {
        method: 'POST',
        body: JSON.stringify({ noteId, noteContent, numSlides, theme }),
      })

      console.log('🎨 [Recommendations] Response status:', response.status)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('❌ [Recommendations] HTTP error:', response.status, errorText)
        throw new Error(`HTTP ${response.status}: ${errorText}`)
      }

      // Handle SSE stream
      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let slides: Slide[] = []
      let buffer = '' // Buffer for incomplete data

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        // Append new data to buffer
        buffer += decoder.decode(value, { stream: true })

        // Process complete SSE events (terminated by double newline)
        const events = buffer.split('\n\n')
        buffer = events.pop() || '' // Keep incomplete event in buffer

        for (const event of events) {
          const lines = event.split('\n')
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6))

                if (data.type === 'progress') {
                  setSlidesProgress({
                    currentSlide: data.currentSlide,
                    totalSlides: data.totalSlides,
                    message: data.message,
                  })
                } else if (data.type === 'complete') {
                  slides = data.slides || []
                  console.log('[Recommendations] Received', slides.length, 'slides')
                } else if (data.type === 'error') {
                  throw new Error(data.error)
                }
              } catch (parseError) {
                console.error('[Recommendations] SSE parse error:', parseError)
                // Re-throw if it was an intentional error from error event
                if (parseError instanceof Error && !parseError.message.includes('JSON')) {
                  throw parseError
                }
              }
            }
          }
        }
      }

      if (slides.length > 0) {
        setRecommendation(noteId, { slides })
        setGenerationStatus('slides', 'complete')
        setSlidesProgress(null)
        return slides
      }

      throw new Error('No slides generated')
    } catch (error) {
      setError('slides', String(error))
      setSlidesProgress(null)
      return null
    }
  }

  async function generateAll(noteId: string, noteContent?: string, types?: RecommendationType[]) {
    const typesToGenerate = types || ['mindmap', 'flashcards', 'concepts', 'exercises', 'resources']

    console.log('🚀 [Recommendations] generateAll called')
    console.log('🚀 [Recommendations] noteId:', noteId)
    console.log('🚀 [Recommendations] noteContent length:', noteContent?.length || 0)
    console.log('🚀 [Recommendations] types to generate:', typesToGenerate)

    if (!noteContent || noteContent.length < 50) {
      console.error('❌ [Recommendations] generateAll: Content too short, aborting all generation')
      typesToGenerate.forEach(type => {
        setError(type, `Content too short (${noteContent?.length || 0} chars, need 50+)`)
      })
      return
    }

    const promises = typesToGenerate.map(type => {
      switch (type) {
        case 'mindmap':
          return generateMindmap(noteId, noteContent)
        case 'flashcards':
          return generateFlashcards(noteId, noteContent)
        case 'concepts':
          return generateConcepts(noteId, noteContent)
        case 'exercises':
          return generateExercises(noteId, noteContent)
        case 'resources':
          return generateResources(noteId, noteContent)
        case 'slides':
          return generateSlides(noteId, noteContent)
        default:
          return Promise.resolve(null)
      }
    })

    const results = await Promise.allSettled(promises)
    console.log('🚀 [Recommendations] generateAll completed')
    results.forEach((result, index) => {
      const type = typesToGenerate[index]
      if (result.status === 'fulfilled') {
        console.log(`✅ [Recommendations] ${type}: success`)
      } else {
        console.log(`❌ [Recommendations] ${type}: failed -`, result.reason)
      }
    })
  }

  function clearRecommendations(noteId: string) {
    recommendations.value.delete(noteId)
  }

  function clearAll() {
    recommendations.value.clear()
    currentNoteId.value = null
    dismissedTypes.value.clear()
    activeModal.value = null
    slidesProgress.value = null
    errors.value = {}
    Object.keys(generationStatus.value).forEach(key => {
      generationStatus.value[key as RecommendationType] = 'idle'
    })
  }

  // ---------------------------------------------------------------------------
  // Return
  // ---------------------------------------------------------------------------

  return {
    // State
    currentNoteId,
    recommendations,
    generationStatus,
    slidesProgress,
    errors,
    dismissedTypes,
    activeModal,

    // Computed
    currentRecommendations,
    hasMindmap,
    hasFlashcards,
    hasConcepts,
    hasExercises,
    hasResources,
    hasSlides,
    isGenerating,
    visibleRecommendationTypes,

    // Actions
    setCurrentNote,
    getRecommendation,
    setRecommendation,
    setGenerationStatus,
    setError,
    clearError,
    dismissType,
    undismissType,
    openModal,
    closeModal,
    setSlidesProgress,

    // API Actions
    generateMindmap,
    generateFlashcards,
    generateConcepts,
    generateExercises,
    generateResources,
    generateSlides,
    generateAll,
    clearRecommendations,
    clearAll,
  }
})
