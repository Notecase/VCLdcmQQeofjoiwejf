/**
 * Subagent Exports
 *
 * Specialized subagents used by the DeepAgent orchestrator for task execution.
 */

// Note Subagent - for edit_note tasks
export {
  NoteSubagent,
  createNoteSubagent,
  NOTE_SUBAGENT_PROMPT,
  type NoteSubagentConfig,
  type NoteSubagentContext,
  type NoteSubagentResult,
} from './note.subagent'

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
