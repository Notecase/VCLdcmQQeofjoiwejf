/**
 * AI Agent exports — Unified Agent Mesh
 *
 * Active agents: EditorDeep, Secretary, Research (+ Explain, Course deferred)
 * ChatAgent and NoteAgent removed (capabilities extracted to registry + utils/note-creator)
 * PlannerAgent kept for planning.decompose capability
 */

// CRITICAL: Register capabilities so generateDelegationTools() can find them.
// Without this, all delegation tools silently resolve to empty when agents are
// imported via @inkdown/ai/agents (which does NOT go through the root index.ts).
import '../registry/capabilities'

// ============================================================================
// State Types
// ============================================================================

export interface BaseAgentState {
  messages: Array<{
    role: 'user' | 'assistant' | 'system' | 'tool'
    content: string
  }>
}

export interface PlannerAgentState extends BaseAgentState {
  goal: string
  constraints?: string[]
  plan?: {
    summary: string
    steps: Array<{
      id: number
      description: string
      status: 'pending' | 'in_progress' | 'completed' | 'failed'
      result?: string
    }>
  }
}

export interface CourseAgentState extends BaseAgentState {
  sourceNoteIds: string[]
  status: 'analyzing' | 'outlining' | 'generating' | 'complete'
  outline?: {
    title: string
    description: string
    modules: Array<{
      index: number
      title: string
      lessons: Array<{
        title: string
        type: 'lesson' | 'exercise' | 'quiz'
      }>
    }>
  }
  generatedContent?: Array<{
    moduleIndex: number
    content: string
  }>
}

// ============================================================================
// Editor Deep Agent (AI SDK v6 ToolLoopAgent)
// ============================================================================

export {
  EditorDeepAgent,
  createEditorDeepAgent,
  EditorConversationHistoryService,
  EditorLongTermMemory,
  type EditorDeepAgentConfig,
  type EditorDeepAgentRequest,
  type EditorDeepAgentEvent,
  type EditorDeepAgentEventType,
  type EditorRunState,
} from './editor-deep'

// ============================================================================
// Planner Agent
// ============================================================================

export {
  PlannerAgent,
  createPlannerAgent,
  CreatePlanSchema,
  UpdatePlanSchema,
  ExecuteStepSchema,
  type PlannerAgentConfig,
  type CreatePlanInput,
  type UpdatePlanInput,
  type ExecuteStepInput,
  type PlannerAgentResponse,
  type Plan,
  type PlanStep,
} from './planner.agent'

// ============================================================================
// Secretary Agent (AI Planner / Roadmap Manager)
// ============================================================================

export {
  SecretaryAgent,
  createSecretaryAgent,
  MemoryService,
  ChatPersistenceService,
  SecretaryHistoryService,
  type SecretaryAgentConfig,
  type MemoryContext,
} from './secretary'

// ============================================================================
// Research Agent (Deep Research Workflow)
// ============================================================================

export {
  ResearchAgent,
  createResearchAgent,
  type ResearchAgentConfig,
  type ResearchThreadState,
} from './research'

// ============================================================================
// Explain Agent (Course AI Tutor)
// ============================================================================

export { ExplainAgent, createExplainAgent, type ExplainAgentConfig } from './explain'

// ============================================================================
// Course Orchestrator (AI Course Generation Pipeline)
// ============================================================================

export {
  CourseOrchestrator,
  createCourseOrchestrator,
  type CourseOrchestratorConfig,
} from './course'

// ============================================================================
// Automation Agent (Scheduled Content Generation)
// ============================================================================

export {
  runAutomation,
  streamAutomation,
  buildAutomationContext,
  type AutomationInput,
  type AutomationResult,
  type AutomationEvent,
  type AutomationContextInput,
} from './automation'

// ============================================================================
// Subagents (Specialized Task Execution)
// ============================================================================

export {
  // Artifact Subagent
  ArtifactSubagent,
  createArtifactSubagent,
  ARTIFACT_SUBAGENT_PROMPT,
  type ArtifactSubagentConfig,
  type ArtifactData,
  type ArtifactSubagentResult,
  // Table Subagent
  TableSubagent,
  createTableSubagent,
  TABLE_SUBAGENT_PROMPT,
  type TableSubagentConfig,
  type TableSubagentContext,
  type TableColumn,
  type TableData,
  type TableSubagentResult,
} from './subagents'

// ============================================================================
// Agent Factory
// ============================================================================

import { SupabaseClient } from '@supabase/supabase-js'
import { PlannerAgent } from './planner.agent'
import { SecretaryAgent } from './secretary'
import { ResearchAgent } from './research'
import { ExplainAgent } from './explain'

/** Active agent types (Unified Agent Mesh) */
export type AgentType = 'secretary' | 'research' | 'explain'

/** Legacy types kept for backwards compat */
type LegacyAgentType = 'planner'

export interface AgentConfig {
  supabase: SupabaseClient
  userId: string
  model?: string
}

/**
 * Create an agent by type
 */
export function createAgent(
  type: AgentType | LegacyAgentType,
  config: AgentConfig
): SecretaryAgent | ResearchAgent | ExplainAgent | PlannerAgent {
  switch (type) {
    case 'secretary':
      return new SecretaryAgent(config)
    case 'research':
      return new ResearchAgent(config)
    case 'explain':
      return new ExplainAgent({ model: config.model })
    case 'planner':
      return new PlannerAgent(config)
    default:
      throw new Error(`Unknown agent type: ${type}`)
  }
}

/**
 * Agent metadata for UI — Unified Agent Mesh (3 active agents + 8 capabilities)
 */
export const AGENT_METADATA: Record<
  AgentType,
  {
    name: string
    description: string
    capabilities: string[]
  }
> = {
  secretary: {
    name: 'Secretary Agent',
    description: 'AI daily planner, roadmap manager, and learning assistant',
    capabilities: ['roadmap', 'daily-plan', 'memory', 'schedule', 'preferences'],
  },
  research: {
    name: 'Research Agent',
    description: 'Deep research with web search, file generation, and task tracking',
    capabilities: ['research', 'web-search', 'files', 'todos', 'interrupts', 'subagents'],
  },
  explain: {
    name: 'Explain Agent',
    description: 'AI tutor for course lessons — explain-only mode',
    capabilities: ['explain', 'tutor', 'quiz-guard'],
  },
}
