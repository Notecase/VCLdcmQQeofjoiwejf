/**
 * @inkdown/ai - AI Provider and Agent Abstraction
 *
 * This package provides:
 * - Centralized model registry and AI SDK v6 provider factory
 * - Gemini native SDK for slide image generation
 * - AI SDK v6 agents (ToolLoopAgent, streamText, generateText)
 * - Tool definitions for agent actions (30 tools)
 * - Token usage tracking
 * - Recommendation system (mindmaps, flashcards, concepts, exercises, resources, slides)
 * - Workflow orchestration with pre-built templates
 */

// =============================================================================
// Model Registry and AI SDK Factory
// =============================================================================

export { MODEL_REGISTRY, selectModel, getModel } from './providers/model-registry'
export type {
  ModelEntry,
  ModelProvider,
  ModelCapability,
  AITaskType,
} from './providers/model-registry'

// AI SDK v6 Provider Factory
export {
  createAIModel,
  createAIEmbeddingModel,
  getModelForTask,
  getEmbeddingModel,
  resolveModel,
  resetAIProviders,
} from './providers/ai-sdk-factory'

// AI SDK v6 Usage Tracking
export { trackAISDKUsage, recordAISDKUsage } from './providers/ai-sdk-usage'
export type { AISDKTrackingMeta, AISDKUsage } from './providers/ai-sdk-usage'

// Token Tracker
export { tokenTracker, computeCost } from './providers/token-tracker'
export type { TokenUsageEvent, SessionUsage } from './providers/token-tracker'

// Request Context & Usage Persistence
export { requestContext, getCurrentUserId } from './providers/request-context'
export { initUsagePersister } from './providers/usage-persister'

// Gemini Provider (slides — native SDK)
export { GeminiProvider, createGeminiProvider } from './providers/gemini'

// =============================================================================
// Tool Types and Exports
// =============================================================================

export type { ToolContext, ToolResult } from './tools/core.tools'

// Tool registry
export {
  allTools,
  toolNames,
  getToolByName,
  getToolsByCategory,
  executeTool,
  TOOL_METADATA,
} from './tools'

// Core tool exports
export { coreEditingTools, databaseTools, artifactTools, secretaryTools } from './tools'

// =============================================================================
// Agent Types (to be implemented in Phase D)
// =============================================================================

export type {
  BaseAgentState,
  ChatAgentState,
  NoteAgentState,
  PlannerAgentState,
  CourseAgentState,
} from './agents'

// =============================================================================
// Service Types
// =============================================================================

export type {
  EmbeddingResult,
  TextChunk,
  ChunkingOptions,
  RAGResult,
  RAGOptions,
  EmbeddingModel,
} from './services'

export { DEFAULT_CHUNKING_OPTIONS, DEFAULT_RAG_OPTIONS, EMBEDDING_MODELS } from './services'

// =============================================================================
// Recommendation Service
// =============================================================================

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
} from './services'

export type {
  MindmapData,
  MindmapNode,
  FlashcardData,
  ConceptData,
  ExerciseData,
  ResourceData,
  SlideData,
  RecommendationData,
  RecommendationCache,
  RecommendationType,
} from './services'

// =============================================================================
// Orchestration Service
// =============================================================================

export { OrchestrationService, createOrchestrationService, WORKFLOW_TEMPLATES } from './services'

export type {
  WorkflowTemplate,
  WorkflowResult,
  WorkflowState,
  WorkflowProgress,
  OrchestrationRequest,
} from './services'

// =============================================================================
// Slide Themes and Prompts
// =============================================================================

export { THEMES, THEME_LIST, getTheme, getDefaultTheme, detectTheme } from './slides/themes'

export type { ThemeName, SlideTheme } from './slides/themes'

export { getSlidePrompt, buildSlidePrompt, buildOutlinePrompt } from './slides/prompts'

export type { SlideVisualStyle } from './slides/prompts'

// =============================================================================
// Sources Module
// =============================================================================

export {
  SourceStorage,
  createSourceStorage,
  SourceProcessor,
  createSourceProcessor,
  extractPDFContent,
  isPDFBuffer,
  getPDFInfo,
  fetchLinkContent,
  isValidURL,
  isYouTubeURL,
  extractYouTubeVideoId,
  sourceRowToSource,
  chunkRowToChunk,
} from './sources'

export type {
  Source,
  SourceType,
  SourceStatus,
  SourceChunk,
  ProcessingOptions,
  ProcessingResult,
  PDFProcessingResult,
  PDFPage,
  LinkProcessingResult,
  SourceSearchOptions,
  SourceSearchResult,
  AddSourceRequest,
  AddSourceResponse,
  ListSourcesRequest,
  ListSourcesResponse,
  DeleteSourceRequest,
  DeleteSourceResponse,
  GetSourceContentRequest,
  GetSourceContentResponse,
  SearchSourcesRequest,
  SearchSourcesResponse,
  SourceProcessingProgress,
} from './sources'

// =============================================================================
// Workflows Module
// =============================================================================

export { WorkflowActions, createWorkflowActions, WORKFLOW_ACTIONS } from './workflows'

export type {
  WorkflowActionType,
  WorkflowAction,
  ExecuteActionRequest,
  ExecuteActionResponse,
  ActionResult,
  StudyNoteResult,
  SummaryResult,
  KeyTerm,
  KeyTermsResult,
  ComparisonResult,
  QAResult,
  ConflictsResult,
  CitationsResult,
  TimelineResult,
  ActionProgress,
} from './workflows'
