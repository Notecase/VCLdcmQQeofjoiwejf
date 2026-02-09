import {
  QA_SUBAGENT_PROMPT,
  EDIT_SUBAGENT_PROMPT,
  ARTIFACT_SUBAGENT_PROMPT,
  DATA_SUBAGENT_PROMPT,
  MEMORY_SUBAGENT_PROMPT,
} from './prompts'

export function createEditorSubagents() {
  return [
    {
      name: 'qa_subagent',
      description: 'Answers questions about the current note and summarizes content.',
      systemPrompt: QA_SUBAGENT_PROMPT,
    },
    {
      name: 'edit_subagent',
      description: 'Handles paragraph and table edits in notes.',
      systemPrompt: EDIT_SUBAGENT_PROMPT,
    },
    {
      name: 'artifact_subagent',
      description: 'Creates and saves note-linked artifacts.',
      systemPrompt: ARTIFACT_SUBAGENT_PROMPT,
    },
    {
      name: 'data_subagent',
      description: 'Runs structured database actions (db_*).',
      systemPrompt: DATA_SUBAGENT_PROMPT,
    },
    {
      name: 'memory_subagent',
      description: 'Reads/writes long-term user memory for editor workflows.',
      systemPrompt: MEMORY_SUBAGENT_PROMPT,
    },
  ]
}
