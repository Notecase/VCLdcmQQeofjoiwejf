/**
 * AI Utilities
 *
 * Utilities for section-aware editing pipeline.
 */

// Structure Parser
export {
  parseMarkdownStructure,
  getBlockById,
  getBlocksByLineRange,
  getSectionAtLine,
  findBlocksByHeading,
  findBlocksByContent,
  getBlockByPosition,
  getParagraphsInSection,
} from './structureParser'

export type { BlockType, BlockNode, OutlineItem, ParsedNote } from './structureParser'

// Target Identifier
export {
  identifyTargets,
  selectTargetsById,
  selectTargetsByLineNumber,
  getSectionWithContent,
} from './targetIdentifier'

export type {
  MatchType,
  TargetResult,
  ClarificationOption,
  IdentifyOptions,
} from './targetIdentifier'

// Context Extractor
export {
  extractContext,
  extractInsertionContext,
  extractEditedContent,
  validateEditScope,
  EDIT_START_MARKER,
  EDIT_END_MARKER,
  CONTEXT_BEFORE_MARKER,
  CONTEXT_BEFORE_END_MARKER,
  CONTEXT_AFTER_MARKER,
  CONTEXT_AFTER_END_MARKER,
} from './contextExtractor'

export type { ExtractedContext, ExtractionOptions } from './contextExtractor'

// Surgical Merger
export {
  mergeEditedSection,
  mergeInsertedContent,
  applyMultipleEdits,
  validateMerge,
} from './surgicalMerger'

export type { MergeResult, MergeOptions } from './surgicalMerger'

// Insertion Position Inferrer
export { inferInsertionPosition, getPositionDescription } from './insertionInferrer'

export type { InsertionPosition } from './insertionInferrer'

// Intent Detection
export { isCreateOperation } from './intentDetection'

// Conversation History
export {
  windowMessages,
  buildInvocationMessages,
  type ThreadMessage,
  type WindowOptions,
} from './conversation-history'
