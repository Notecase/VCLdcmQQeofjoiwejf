/**
 * Workflow Types
 *
 * TypeScript interfaces for the workflow actions system.
 */

// ============================================================================
// Action Types
// ============================================================================

export type WorkflowActionType =
  | 'generate_study_note'
  | 'create_summary'
  | 'extract_key_terms'
  | 'compare_sources'
  | 'generate_qa'
  | 'find_conflicts'
  | 'extract_citations'
  | 'build_timeline'

export interface WorkflowAction {
  id: WorkflowActionType
  name: string
  description: string
  icon: string
  requiresSources: boolean
  minSources?: number
}

export const WORKFLOW_ACTIONS: WorkflowAction[] = [
  {
    id: 'generate_study_note',
    name: 'Generate Study Note',
    description: 'Create comprehensive study notes from all your sources',
    icon: 'book-open',
    requiresSources: true,
    minSources: 1,
  },
  {
    id: 'create_summary',
    name: 'Create Summary',
    description: 'Condense all sources into key points',
    icon: 'file-text',
    requiresSources: true,
    minSources: 1,
  },
  {
    id: 'extract_key_terms',
    name: 'Extract Key Terms',
    description: 'Build a glossary of definitions from your sources',
    icon: 'list',
    requiresSources: true,
    minSources: 1,
  },
  {
    id: 'compare_sources',
    name: 'Compare Sources',
    description: 'Find agreements and disagreements between sources',
    icon: 'git-compare',
    requiresSources: true,
    minSources: 2,
  },
  {
    id: 'generate_qa',
    name: 'Q&A Generator',
    description: 'Create study questions from your sources',
    icon: 'help-circle',
    requiresSources: true,
    minSources: 1,
  },
  {
    id: 'find_conflicts',
    name: 'Find Conflicts',
    description: 'Identify contradictory information across sources',
    icon: 'alert-triangle',
    requiresSources: true,
    minSources: 2,
  },
  {
    id: 'extract_citations',
    name: 'Extract Citations',
    description: 'Pull all references and citations from sources',
    icon: 'quote',
    requiresSources: true,
    minSources: 1,
  },
  {
    id: 'build_timeline',
    name: 'Build Timeline',
    description: 'Extract dates and events chronologically',
    icon: 'clock',
    requiresSources: true,
    minSources: 1,
  },
]

// ============================================================================
// Execution Types
// ============================================================================

export interface ExecuteActionRequest {
  noteId: string
  actionType: WorkflowActionType
  options?: Record<string, unknown>
}

export interface ExecuteActionResponse {
  success: boolean
  result?: ActionResult
  error?: string
}

export type ActionResult =
  | StudyNoteResult
  | SummaryResult
  | KeyTermsResult
  | ComparisonResult
  | QAResult
  | ConflictsResult
  | CitationsResult
  | TimelineResult

export interface StudyNoteResult {
  type: 'study_note'
  content: string
  wordCount: number
  sourcesUsed: string[]
}

export interface SummaryResult {
  type: 'summary'
  content: string
  keyPoints: string[]
  sourcesUsed: string[]
}

export interface KeyTerm {
  term: string
  definition: string
  sources: Array<{
    sourceId: string
    title: string
    quote?: string
  }>
}

export interface KeyTermsResult {
  type: 'key_terms'
  terms: KeyTerm[]
}

export interface SourceAgreement {
  topic: string
  sources: string[]
  summary: string
}

export interface SourceDifference {
  topic: string
  comparisons: Array<{
    sourceId: string
    title: string
    position: string
  }>
}

export interface ComparisonResult {
  type: 'comparison'
  agreements: SourceAgreement[]
  differences: SourceDifference[]
  uniqueInsights: Array<{
    sourceId: string
    title: string
    insight: string
  }>
}

export interface QAItem {
  question: string
  answer: string
  sourceId: string
  sourceTitle: string
  difficulty?: 'easy' | 'medium' | 'hard'
}

export interface QAResult {
  type: 'qa'
  questions: QAItem[]
}

export interface Conflict {
  topic: string
  conflictingSources: Array<{
    sourceId: string
    title: string
    claim: string
    quote?: string
  }>
  analysis: string
}

export interface ConflictsResult {
  type: 'conflicts'
  conflicts: Conflict[]
  hasConflicts: boolean
}

export interface Citation {
  text: string
  authors?: string[]
  year?: number
  source?: string
  foundIn: {
    sourceId: string
    sourceTitle: string
  }
}

export interface CitationsResult {
  type: 'citations'
  citations: Citation[]
}

export interface TimelineEvent {
  date: string
  event: string
  description?: string
  sourceId: string
  sourceTitle: string
}

export interface TimelineResult {
  type: 'timeline'
  events: TimelineEvent[]
}

// ============================================================================
// Progress Types
// ============================================================================

export interface ActionProgress {
  actionType: WorkflowActionType
  status: 'starting' | 'processing' | 'complete' | 'error'
  progress: number  // 0-100
  message: string
  error?: string
}
