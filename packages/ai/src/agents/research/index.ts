/**
 * Research Agent barrel exports
 */

export {
  ResearchAgent,
  createResearchAgent,
  type ResearchAgentConfig,
  type ResearchThreadState,
} from './agent'
export { createResearchTools, type ResearchToolContext } from './tools'
export {
  getResearchSystemPrompt,
  RESEARCH_SUBAGENT_PROMPT,
  WRITER_SUBAGENT_PROMPT,
} from './prompts'
