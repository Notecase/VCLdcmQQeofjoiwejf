/**
 * Workflows Module
 *
 * Quick actions for processing sources and generating outputs.
 */

// Types
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
  SourceAgreement,
  SourceDifference,
  ComparisonResult,
  QAItem,
  QAResult,
  Conflict,
  ConflictsResult,
  Citation,
  CitationsResult,
  TimelineEvent,
  TimelineResult,
  ActionProgress,
} from './types'

export { WORKFLOW_ACTIONS } from './types'

// Actions
export { WorkflowActions, createWorkflowActions } from './actions'
