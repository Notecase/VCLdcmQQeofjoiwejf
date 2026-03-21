/**
 * Mission Hub types — autonomous cross-agent workflow contracts.
 *
 * Shared between API and frontend.
 */

import type { TriggerSource, WorkflowKey } from './workflow'

// =============================================================================
// Core enums/unions
// =============================================================================

export type MissionMode = 'suggest_approve' | 'guardrailed_auto' | 'full_auto'

export type MissionStatus =
  | 'pending'
  | 'running'
  | 'awaiting_approval'
  | 'blocked'
  | 'completed'
  | 'error'
  | 'cancelled'

export type MissionStage = 'research' | 'course_draft' | 'daily_plan' | 'note_pack'

export type MissionStepStatus = 'waiting' | 'in_progress' | 'completed' | 'blocked' | 'error'

export type MissionHandoffType =
  | 'research_brief'
  | 'course_outline'
  | 'daily_plan_patch'
  | 'note_draft_set'

export type MissionApprovalRisk = 'low' | 'medium' | 'high'

export type MissionApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired'

export const DEFAULT_WORKFLOW_KEY: WorkflowKey = 'goal_mission'

export const WORKFLOW_STAGE_MAP: Record<WorkflowKey, MissionStage[]> = {
  goal_mission: ['research', 'course_draft', 'daily_plan', 'note_pack'],
  make_note_from_task: ['note_pack'],
  research_topic_from_task: ['research'],
  make_course_from_plan: ['course_draft'],
  materialize_morning_plan: ['daily_plan'],
  evening_reflection: ['daily_plan'],
  weekly_review: ['research', 'daily_plan'],
}

// =============================================================================
// Persistent entities
// =============================================================================

/** Typed subset of known mission constraint keys (stored as Record<string, unknown> in DB). */
export interface MissionConstraints {
  sourceProjectId?: string | null
  [key: string]: unknown
}

export interface Mission {
  id: string
  userId: string
  goal: string
  mode: MissionMode
  status: MissionStatus
  currentStage: MissionStage | null
  constraints: MissionConstraints
  workflowKey?: WorkflowKey
  triggerSource?: TriggerSource
  sourceTaskId?: string | null
  sourcePlanId?: string | null
  lastError?: string | null
  createdAt: string
  updatedAt: string
}

export interface MissionStep {
  id: string
  missionId: string
  stage: MissionStage
  status: MissionStepStatus
  retryCount: number
  inputRef: Record<string, unknown>
  outputRef: Record<string, unknown>
  errorMessage?: string | null
  startedAt?: string | null
  completedAt?: string | null
  createdAt: string
}

export interface MissionHandoff {
  id: string
  missionId: string
  stepId?: string | null
  type: MissionHandoffType
  summary: string
  payload: Record<string, unknown>
  createdAt: string
}

export interface MissionApproval {
  id: string
  missionId: string
  stepId?: string | null
  actionType: string
  title: string
  details: string
  payload: Record<string, unknown>
  riskLevel: MissionApprovalRisk
  status: MissionApprovalStatus
  expiresAt?: string | null
  resolvedAt?: string | null
  resolutionNote?: string | null
  createdAt: string
}

export interface MissionRunLock {
  missionId: string
  lockToken: string
  acquiredAt: string
  expiresAt: string
}

// =============================================================================
// API request/response shapes
// =============================================================================

export interface StartMissionRequest {
  goal: string
  mode?: MissionMode
  constraints?: Record<string, unknown>
  workflowKey?: WorkflowKey
  triggerSource?: TriggerSource
}

export interface StartMissionResponse {
  missionId: string
}

export interface ResolveMissionApprovalRequest {
  note?: string
}

export interface ResumeMissionResponse {
  accepted: boolean
}

// =============================================================================
// Stream envelope
// =============================================================================

export type MissionEventType =
  | 'mission-start'
  | 'step-start'
  | 'handoff-created'
  | 'approval-required'
  | 'approval-resolved'
  | 'step-complete'
  | 'mission-complete'
  | 'mission-error'

export interface MissionEventEnvelope<T = unknown> {
  seq: number
  type: MissionEventType
  missionId: string
  stepId?: string
  agent: 'mission-orchestrator' | 'research' | 'course' | 'secretary' | 'editor' | 'system'
  data: T
  ts: string
}

export interface MissionStateResponse {
  mission: Mission
  steps: MissionStep[]
  handoffs: MissionHandoff[]
  approvals: MissionApproval[]
  lastEventSeq: number
}

/**
 * Context passed to agents when they're executing within a mission.
 * Agents include this in SharedContextService writes for cross-agent tracing.
 */
export interface MissionContext {
  missionId: string
  stepId: string
  stage: MissionStage
  workflowKey?: WorkflowKey
  triggerSource?: TriggerSource
}
