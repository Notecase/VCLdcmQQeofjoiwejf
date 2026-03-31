/**
 * AI Eval Framework — Type Definitions
 *
 * All types for the evaluation framework that tests EditorDeep agent output
 * across multiple quality dimensions.
 */

import type { EditorDeepAgentEvent } from '../agents/editor-deep/types'

// =============================================================================
// Test Case Types
// =============================================================================

export type TestCategory =
  | 'note-creation'
  | 'edit-proposals'
  | 'artifacts'
  | 'tables'
  | 'tool-selection'
  | 'citation-heavy'

export type Difficulty = 'basic' | 'intermediate' | 'advanced'

export interface AgentContext {
  currentNoteId?: string
  workspaceId?: string
  projectId?: string
  selectedText?: string
  selectedBlockIds?: string[]
  preloadedContent?: string
}

export interface BehaviorExpectations {
  mustCallTools?: string[]
  mustNotCallTools?: string[]
  mustReadBeforeEdit?: boolean
  mustSearchWhenTimeSensitive?: boolean
}

export interface QualityExpectations {
  minWordCount?: number
  maxWordCount?: number
  maxBulletRatio?: number
  requireSourcesSection?: boolean
  editMinimality?: 'small' | 'medium' | 'large'
  requiresWebSearch?: boolean
  expectedArtifactType?: string
  expectedTableCount?: number
  behavior?: BehaviorExpectations
}

export interface EvalTestCase {
  id: string
  category: TestCategory
  difficulty: Difficulty
  title: string
  prompt: string
  context: AgentContext
  expectations: QualityExpectations
  tags?: string[]
}

// =============================================================================
// Captured Output Types
// =============================================================================

export interface ToolCallRecord {
  id: string
  toolName: string
  arguments: Record<string, unknown>
  result?: unknown
  durationMs?: number
}

export interface EditProposalRecord {
  noteId?: string
  original?: string
  proposed: string
  blockIndex?: number
}

export interface ArtifactRecord {
  id: string
  title?: string
  html: string
  css?: string
  javascript?: string
  type?: string
}

export interface CapturedOutput {
  finalText: string
  generatedContent: string
  toolCalls: ToolCallRecord[]
  editProposals: EditProposalRecord[]
  artifacts: ArtifactRecord[]
  events: EditorDeepAgentEvent[]
  metrics: CaptureMetrics
}

export interface CaptureMetrics {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  latencyMs: number
  costCents: number
}

// =============================================================================
// Evaluation Result Types
// =============================================================================

export type EvaluatorType = 'structural' | 'llm-judge' | 'functional'

export type DimensionName =
  | 'bullet-ratio'
  | 'citation-placement'
  | 'formatting-compliance'
  | 'word-count'
  | 'edit-minimality'
  | 'content-preservation'
  | 'tool-behavior'
  | 'depth'
  | 'structure'
  | 'citation-integrity'
  | 'synthesis'
  | 'intent-alignment'
  | 'voice-preservation'
  | 'design-quality'
  | 'artifact-rendering'
  | 'table-validity'

export interface FixSignal {
  component:
    | 'system-prompt'
    | 'tool-definition'
    | 'model-config'
    | 'post-processing'
    | 'agent-logic'
  suggestion: string
  priority: 'low' | 'medium' | 'high'
}

export interface DimensionResult {
  dimension: DimensionName
  evaluator: EvaluatorType
  score: number // 1-5 scale
  passed: boolean
  threshold: number
  evidence: string
  diagnosis?: string
  fixSignal?: FixSignal
}

// =============================================================================
// Calibration Types
// =============================================================================

export interface CalibrationExample {
  dimension: DimensionName
  score: number // Human-assigned score (1-5)
  prompt: string
  output: string
  reasoning: string
}

export interface CalibrationCheck {
  dimension: DimensionName
  calibrated: boolean
  meanDeviation: number
  maxDeviation: number
  results: Array<{
    expectedScore: number
    judgeScore: number
    deviation: number
  }>
}

// =============================================================================
// Aggregate Result Types
// =============================================================================

export interface EvalResult {
  testCaseId: string
  testCase: EvalTestCase
  output: CapturedOutput
  dimensions: DimensionResult[]
  compositeScore: number
  passed: boolean
  fixSignals: FixSignal[]
  timestamp: string
  error?: string
}

export interface CategoryReport {
  category: TestCategory
  caseCount: number
  passCount: number
  failCount: number
  averageScore: number
  dimensionAverages: Record<string, number>
}

export interface EvalSuiteReport {
  timestamp: string
  model: string
  judgeModel: string
  totalCases: number
  passedCases: number
  failedCases: number
  compositeAverage: number
  launchReady: boolean
  launchThreshold: number
  categories: CategoryReport[]
  topIssues: Array<{
    dimension: DimensionName
    affectedCases: number
    averageScore: number
    suggestedFix: FixSignal
  }>
  calibration: CalibrationCheck[]
  results: EvalResult[]
  metrics: {
    totalInputTokens: number
    totalOutputTokens: number
    totalCostCents: number
    totalDurationMs: number
  }
}

// =============================================================================
// Configuration Types
// =============================================================================

export interface CompositeWeights {
  'bullet-ratio': number
  'citation-placement': number
  'formatting-compliance': number
  'word-count': number
  depth: number
  structure: number
  'citation-integrity': number
  synthesis: number
  'intent-alignment': number
  'voice-preservation': number
  [key: string]: number
}

export const DEFAULT_WEIGHTS: CompositeWeights = {
  'bullet-ratio': 0.08,
  'citation-placement': 0.08,
  'formatting-compliance': 0.06,
  'word-count': 0.05,
  depth: 0.18,
  structure: 0.12,
  'citation-integrity': 0.1,
  synthesis: 0.12,
  'intent-alignment': 0.14,
  'voice-preservation': 0.07,
}

export const EDIT_PROPOSAL_WEIGHTS: CompositeWeights = {
  ...DEFAULT_WEIGHTS,
  'edit-minimality': 0.15,
  'content-preservation': 0.15,
  depth: 0.1,
  synthesis: 0.05,
  'citation-placement': 0.03,
  'citation-integrity': 0.05,
}

export const ARTIFACT_WEIGHTS: CompositeWeights = {
  ...DEFAULT_WEIGHTS,
  'design-quality': 0.2,
  'artifact-rendering': 0.2,
  depth: 0.05,
  synthesis: 0.05,
  'citation-placement': 0.02,
  'citation-integrity': 0.02,
}

export const LAUNCH_THRESHOLD = 3.5
