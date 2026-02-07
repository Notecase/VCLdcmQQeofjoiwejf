/**
 * Secretary Agent barrel exports
 */

export { SecretaryAgent, createSecretaryAgent, type SecretaryAgentConfig } from './agent'
export { MemoryService, type MemoryContext } from './memory'
export { createSecretaryTools } from './tools'
export { getSecretarySystemPrompt, PLANNER_SUBAGENT_PROMPT, RESEARCHER_SUBAGENT_PROMPT } from './prompts'
export { runPlannerSubagent, runResearcherSubagent, type SubagentConfig, type RoadmapPreview, type ResearchResult } from './subagents'
export { ChatPersistenceService } from './chat-persistence'
export { SecretaryStreamNormalizer } from './stream-normalizer'
export { lintSecretaryMemoryFiles, type SecretaryMemoryLintResult } from './memory-lint'
