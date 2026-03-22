/**
 * AI Services exports
 *
 * This module provides services for embedding, RAG, chunking,
 * recommendations, and workflow orchestration.
 */

// Shared Context Service
export { SharedContextService, type SharedContextReadOptions } from './shared-context.service'

// Mission Orchestrator Service
export {
  MissionOrchestratorService,
  MISSION_STAGE_ORDER,
  createDefaultMissionSteps,
  buildDailyPlanMarkdown,
  createMissionApprovalForStage,
  isTransientMissionError,
  toMissionEvent,
  type StartMissionInput,
  type ResolveApprovalInput,
} from './mission-orchestrator'

// Recommendation Service
export {
  RecommendationService,
  generateMindmap,
  generateFlashcards,
  generateConcepts,
  generateExercises,
  generateResources,
  generateSlides,
  analyzeNoteForRecommendations,
  generateRecommendation,
  clearRecommendationCache,
  clearAllRecommendationCache,
} from './recommendations'

export type {
  MindmapData,
  MindmapNode,
  FlashcardData,
  ConceptData,
  ExerciseData,
  ResourceData,
  SlideData,
  SlideOutline,
  SlideGenerationProgress,
  RecommendationData,
  RecommendationCache,
  RecommendationType,
  ResourceType,
  SlideType,
  GenerateRecommendationRequest,
  GenerateRecommendationResponse,
  GenerateSlidesRequest,
  GenerateSlidesResponse,
} from './recommendations.types'

// Orchestration Service
export {
  OrchestrationService,
  createOrchestrationService,
  WORKFLOW_TEMPLATES,
} from './orchestration'

export type {
  WorkflowTemplate,
  WorkflowResult,
  WorkflowState,
  WorkflowExecution,
  WorkflowProgress,
  OrchestrationRequest,
  TemplateStep,
  TemplateParameter,
  DataMapping,
  Transformation,
  BlockInfo,
  StepType,
  ParameterType,
} from './orchestration.types'

// Services (to be implemented)
// export { EmbeddingService } from './embedding'
// export { RAGService } from './rag'
// export { ChunkingService } from './chunking'

/**
 * Embedding result from the embedding service
 */
export interface EmbeddingResult {
  embedding: number[]
  model: string
  tokenCount: number
  dimensions: number
}

/**
 * Text chunk for embedding
 */
export interface TextChunk {
  index: number
  text: string
  startPosition: number
  endPosition: number
  tokenCount?: number
}

/**
 * Chunking options
 */
export interface ChunkingOptions {
  maxTokens?: number
  overlap?: number
  splitOnSentences?: boolean
}

/**
 * RAG retrieval result
 */
export interface RAGResult {
  noteId: string
  title: string
  chunkText: string
  similarity: number
  metadata?: Record<string, unknown>
}

/**
 * RAG retrieval options
 */
export interface RAGOptions {
  limit?: number
  threshold?: number
  projectId?: string
  noteIds?: string[]
}

/**
 * Default chunking configuration
 */
export const DEFAULT_CHUNKING_OPTIONS: Required<ChunkingOptions> = {
  maxTokens: 500,
  overlap: 50,
  splitOnSentences: true,
}

/**
 * Default RAG configuration
 */
export const DEFAULT_RAG_OPTIONS: Required<RAGOptions> = {
  limit: 5,
  threshold: 0.7,
  projectId: undefined as unknown as string,
  noteIds: [],
}

/**
 * Embedding model configurations
 */
export const EMBEDDING_MODELS = {
  'text-embedding-3-large': {
    provider: 'openai',
    dimensions: 3072, // Can be reduced to 1536
    maxInput: 8191,
  },
  'text-embedding-3-small': {
    provider: 'openai',
    dimensions: 1536,
    maxInput: 8191,
  },
} as const

export type EmbeddingModel = keyof typeof EMBEDDING_MODELS
