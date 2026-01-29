/**
 * Agentic AI Types
 *
 * TypeScript interfaces for the autonomous AI agent system.
 * Ported from Note3's agenticAI.ts
 */

// ============================================================================
// Data Schema Types
// ============================================================================

export interface ColumnSpec {
  name: string
  data_type: string
  description: string
  example?: string
}

export type ConstraintType =
  | { type: 'Required' }
  | { type: 'Unique' }
  | { type: 'Range'; min: number; max: number }
  | { type: 'Pattern'; regex: string }

export interface Constraint {
  type: ConstraintType
  description: string
}

export interface DataSchema {
  columns: ColumnSpec[]
  constraints: Constraint[]
}

// ============================================================================
// Database Types
// ============================================================================

export interface DatabaseColumn {
  name: string
  type: string
  options?: string[]
}

export type DataSource =
  | { type: 'Research'; data: Record<string, unknown>[] }
  | { type: 'AIGenerated'; prompt: string }
  | { type: 'Transformed'; source_database_id: string; transformation: string }

// ============================================================================
// Step Types
// ============================================================================

export type AgentStepType =
  | { type: 'Research'; query: string; purpose: string }
  | { type: 'ExtractData'; query: string; schema: DataSchema; count: number }
  | { type: 'CreateNote'; title: string; parent_id?: string }
  | { type: 'CreateDatabase'; title: string; columns: DatabaseColumn[] }
  | { type: 'CreateArtifact'; title: string; artifact_type: string; content_prompt: string }
  | { type: 'GenerateContent'; block_id: string; content_type: string; prompt: string }
  | { type: 'PopulateDatabase'; database_id: string; data_source: DataSource }
  | { type: 'Validate'; target: string; criteria: string[] }
  | { type: 'Reflect'; on: string; improve: boolean }

export type StepStatus = 'Pending' | 'InProgress' | 'Completed' | 'Failed' | 'Skipped'

export interface StepResult {
  success: boolean
  data?: unknown
  message: string
}

export interface AgentStep {
  id: string
  step_type: AgentStepType
  depends_on: string[]
  status: StepStatus
  result?: StepResult
  error?: string
  retry_count: number
}

// ============================================================================
// Research Types
// ============================================================================

export interface Source {
  title: string
  url: string
  snippet: string
}

export interface ResearchResult {
  query: string
  sources: Source[]
  summary: string
  data?: Record<string, unknown>[]
}

// ============================================================================
// Validation Types
// ============================================================================

export type IssueSeverity = 'Error' | 'Warning' | 'Info'

export interface ValidationIssue {
  severity: IssueSeverity
  description: string
  suggestion?: string
}

export interface ValidationResult {
  passed: boolean
  issues: ValidationIssue[]
  score: number
}

// ============================================================================
// Result Types
// ============================================================================

export interface BlockInfo {
  id: string
  block_type: string
  title: string
  step_id: string
}

export type AgenticStatus =
  | 'Planning'
  | 'Researching'
  | 'Extracting'
  | 'Creating'
  | 'Populating'
  | 'Validating'
  | 'Completed'
  | 'Failed'

export interface AgenticResult {
  task_id: string
  status: AgenticStatus
  created_blocks: BlockInfo[]
  execution_time_ms: number
  steps_completed: number
  steps_failed: number
  error?: string
}

// ============================================================================
// Task Types
// ============================================================================

export interface AgenticTask {
  id: string
  description: string
  noteId?: string
  projectId?: string
  steps: AgentStep[]
  status: AgenticStatus
  createdAt: Date
  updatedAt: Date
}

export interface PlanTaskRequest {
  task: string
  noteId?: string
  projectId?: string
}

export interface ExecuteTaskRequest extends PlanTaskRequest {
  dryRun?: boolean
}

// ============================================================================
// Progress Types
// ============================================================================

export interface AgenticProgress {
  taskId: string
  status: AgenticStatus
  currentStep?: string
  currentStepIndex: number
  totalSteps: number
  message: string
}
