/**
 * Subagent Exports
 *
 * Specialized subagents used by the DeepAgent orchestrator for task execution.
 */

// Artifact Subagent - for create_artifact tasks
export {
  ArtifactSubagent,
  createArtifactSubagent,
  ARTIFACT_SUBAGENT_PROMPT,
  type ArtifactSubagentConfig,
  type ArtifactData,
  type ArtifactSubagentResult,
} from './artifact.subagent'

// Table Subagent - for database_action tasks
export {
  TableSubagent,
  createTableSubagent,
  TABLE_SUBAGENT_PROMPT,
  type TableSubagentConfig,
  type TableSubagentContext,
  type TableColumn,
  type TableData,
  type TableSubagentResult,
} from './table.subagent'
