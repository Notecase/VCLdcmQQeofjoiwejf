/**
 * Recommendation Types
 *
 * TypeScript interfaces for the recommendation system.
 * Ported from Note3's recommendation.ts
 */

// ============================================================================
// Mindmap Types
// ============================================================================

export interface MindmapNode {
  id: string
  label: string
  children?: MindmapNode[]
}

export interface MindmapData {
  center: string
  nodes: MindmapNode[]
}

// ============================================================================
// Flashcard Types
// ============================================================================

export interface FlashcardData {
  question: string
  answer: string
}

// ============================================================================
// Concept Types
// ============================================================================

export interface ConceptData {
  title: string
  description: string
}

// ============================================================================
// Exercise Types
// ============================================================================

export interface ExerciseData {
  title: string
  description: string
  difficulty?: 'beginner' | 'intermediate' | 'advanced'
}

// ============================================================================
// Resource Types
// ============================================================================

export type ResourceType =
  | 'Book'
  | 'Course'
  | 'Video'
  | 'Paper'
  | 'Tutorial'
  | 'Interactive'
  | 'Article'
  | 'Website'

export interface ResourceData {
  type: ResourceType
  title: string
  description: string
  link?: string
}

// ============================================================================
// Slide Types
// ============================================================================

export type SlideType = 'architecture' | 'concept' | 'process' | 'graph' | 'comparison' | 'overview'

export interface SlideData {
  slideNumber: number
  title: string
  type: SlideType
  imageData: string // Base64 encoded PNG image
  caption: string
}

export interface SlideOutline {
  slideNumber: number
  title: string
  type: SlideType
  keyPoints: string[]
  visualElements: string[]
  imagePrompt: string
  visualStyle: {
    theme: 'Technical/Engineering' | 'Organic/Biological' | 'History/Paper' | 'Modern/Abstract'
    primaryColor: string
    accentColor: string
    backgroundTexture: string
  }
}

export interface SlideGenerationProgress {
  currentSlide: number
  totalSlides: number
  status: 'planning' | 'generating' | 'complete' | 'error'
  message: string
}

// ============================================================================
// Recommendation Data
// ============================================================================

export interface RecommendationData {
  mindmap?: MindmapData
  flashcards?: FlashcardData[]
  concepts?: ConceptData[]
  exercises?: ExerciseData[]
  resources?: ResourceData[]
  slides?: SlideData[]
}

export interface RecommendationCache {
  noteId: string
  data: RecommendationData
  timestamp: number
}

export type RecommendationType =
  | 'mindmap'
  | 'flashcards'
  | 'concepts'
  | 'exercises'
  | 'resources'
  | 'slides'

// ============================================================================
// API Types
// ============================================================================

export interface GenerateRecommendationRequest {
  noteId: string
  noteContent?: string
  types?: RecommendationType[]
}

export interface GenerateRecommendationResponse {
  success: boolean
  data?: RecommendationData
  error?: string
  cached?: boolean
}

export interface GenerateSlidesRequest {
  noteId: string
  noteContent?: string
  numSlides?: number
  theme?: SlideOutline['visualStyle']['theme']
}

export interface GenerateSlidesResponse {
  success: boolean
  slides?: SlideData[]
  error?: string
}
