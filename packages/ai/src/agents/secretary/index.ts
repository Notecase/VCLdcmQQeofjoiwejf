/**
 * Secretary Agent barrel exports
 */

export { SecretaryAgent, createSecretaryAgent, type SecretaryAgentConfig } from './agent'
export { MemoryService, type MemoryContext } from './memory'
export { createSecretaryTools, type RoadmapPreview } from './tools'
export {
  getSecretarySystemPrompt,
  PLANNER_SUBAGENT_PROMPT,
  RESEARCHER_SUBAGENT_PROMPT,
} from './prompts'
export { ChatPersistenceService } from './chat-persistence'
export { lintSecretaryMemoryFiles, type SecretaryMemoryLintResult } from './memory-lint'
