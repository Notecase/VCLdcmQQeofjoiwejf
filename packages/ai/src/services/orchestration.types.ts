/**
 * Orchestration Types
 *
 * TypeScript interfaces for the workflow orchestration system.
 * Ported from Note3's orchestration.ts
 */

// ============================================================================
// Step Types
// ============================================================================

export type StepType =
  | { type: 'CreateNote' }
  | { type: 'CreateDatabase' }
  | { type: 'CreateArtifact' }
  | { type: 'DataTransform' }
  | { type: 'Validate' }
  | { type: 'AIGenerate' }
  | { type: 'Custom'; data: string }

// ============================================================================
// Parameter Types
// ============================================================================

export type ParameterType = 'String' | 'Number' | 'Boolean' | 'Array' | 'Object'

export interface TemplateParameter {
  name: string
  param_type: ParameterType
  description: string
  default?: unknown
  required: boolean
}

// ============================================================================
// Transformation Types
// ============================================================================

export type Transformation =
  | { type: 'AITransform'; config: { prompt: string } }
  | { type: 'Aggregate'; config: { operation: string; column: string } }
  | { type: 'Filter'; config: { expression: string } }
  | { type: 'Map'; config: { mapping: Record<string, string> } }
  | { type: 'GroupBy'; config: { columns: string[]; aggregations: AggregationConfig[] } }

export interface AggregationConfig {
  operation: string
  column: string
  alias?: string
}

// ============================================================================
// Data Mapping Types
// ============================================================================

export interface DataMapping {
  from_step: string
  from_field: string
  to_step: string
  to_field: string
  transform?: Transformation
}

// ============================================================================
// Template Step Types
// ============================================================================

export interface TemplateStep {
  id: string
  step_type: StepType
  config: Record<string, unknown>
  depends_on: string[]
}

// ============================================================================
// Workflow Template Types
// ============================================================================

export interface WorkflowTemplate {
  id: string
  name: string
  description: string
  tags: string[]
  icon: string
  steps: TemplateStep[]
  data_mappings: DataMapping[]
  parameters: TemplateParameter[]
}

// ============================================================================
// Block Info Types
// ============================================================================

export interface BlockInfo {
  id: string
  block_type: string
  title: string
  step_id: string
}

// ============================================================================
// Workflow State Types
// ============================================================================

export type WorkflowState =
  | 'Planning'
  | 'Executing'
  | 'DataFlow'
  | 'Validating'
  | 'Completed'
  | { Failed: string }
  | 'Paused'
  | 'Cancelled'

// ============================================================================
// Workflow Result Types
// ============================================================================

export interface WorkflowResult {
  workflow_id: string
  state: WorkflowState
  created_blocks: BlockInfo[]
  execution_time_ms: number
  steps_completed: number
  steps_failed: number
  error?: string
}

// ============================================================================
// Execution Types
// ============================================================================

export interface WorkflowExecution {
  id: string
  templateId?: string
  noteId?: string
  parameters: Record<string, unknown>
  state: WorkflowState
  steps: ExecutionStep[]
  createdAt: Date
  updatedAt: Date
}

export interface ExecutionStep {
  id: string
  templateStepId: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  result?: unknown
  error?: string
  startedAt?: Date
  completedAt?: Date
}

// ============================================================================
// API Types
// ============================================================================

export interface OrchestrationRequest {
  prompt?: string
  templateId?: string
  parameters?: Record<string, unknown>
  noteId?: string
}

export interface WorkflowProgress {
  workflowId: string
  state: WorkflowState
  currentStep?: string
  currentStepIndex: number
  totalSteps: number
  message: string
}
