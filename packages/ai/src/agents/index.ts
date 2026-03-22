/**
 * AI Agent exports — Inkdown AI SDK v6
 *
 * Active agents (all on AI SDK v6):
 * - EditorDeepAgent: Production editor AI with 12 tools (ToolLoopAgent)
 * - ChatAgent: Conversational AI with RAG and citations
 * - NoteAgent: Note manipulation (create, update, organize, summarize, expand)
 * - PlannerAgent: Goal decomposition and task planning
 * - SecretaryAgent: AI planner / roadmap manager
 * - ResearchAgent: Deep research workflow
 * - ExplainAgent: Course AI tutor
 * - CourseOrchestrator: AI course generation
 *
 * @deprecated EditorAgent, InkdownDeepAgent, AgenticAgent — scheduled for removal
 */

// ============================================================================
// State Types
// ============================================================================

export interface BaseAgentState {
  messages: Array<{
    role: 'user' | 'assistant' | 'system' | 'tool'
    content: string
  }>
}

export interface ChatAgentState extends BaseAgentState {
  context?: {
    documentContent?: string
    documentTitle?: string
    noteIds?: string[]
  }
  retrievedChunks?: Array<{
    noteId: string
    title: string
    chunkText: string
    similarity: number
  }>
}

export interface NoteAgentState extends BaseAgentState {
  action: 'create' | 'update' | 'organize' | 'summarize' | 'expand'
  noteId?: string
  projectId?: string
  result?: {
    success: boolean
    noteId?: string
    content?: string
    error?: string
  }
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
// Chat Agent
// ============================================================================

export {
  ChatAgent,
  createChatAgent,
  ChatAgentInputSchema,
  type ChatAgentConfig,
  type ChatAgentInput,
  type ChatAgentResponse,
  type ChatAgentMessage,
  type RetrievedChunk,
  type Citation,
} from './chat.agent'

// ============================================================================
// Note Agent
// ============================================================================

export {
  NoteAgent,
  createNoteAgent,
  NoteAgentInputSchema,
  type NoteAgentConfig,
  type NoteAgentInput,
  type NoteAgentResponse,
  type NoteAction,
} from './note.agent'

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
// Subagents (Specialized Task Execution)
// ============================================================================

export {
  // Note Subagent
  NoteSubagent,
  createNoteSubagent,
  NOTE_SUBAGENT_PROMPT,
  type NoteSubagentConfig,
  type NoteSubagentContext,
  type NoteSubagentResult,
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
import { ChatAgent } from './chat.agent'
import { NoteAgent } from './note.agent'
import { PlannerAgent } from './planner.agent'
import { SecretaryAgent } from './secretary'
import { ResearchAgent } from './research'
import { ExplainAgent } from './explain'

export type AgentType =
  | 'chat'
  | 'note'
  | 'planner'
  | 'secretary'
  | 'research'
  | 'explain'

export interface AgentConfig {
  supabase: SupabaseClient
  userId: string
  model?: string
  /** @deprecated Only needed by Secretary/Research until Phase B migration completes */
  openaiApiKey?: string
}

/**
 * Create an agent by type
 */
export function createAgent(
  type: AgentType,
  config: AgentConfig
): ChatAgent | NoteAgent | PlannerAgent | SecretaryAgent | ResearchAgent | ExplainAgent {
  switch (type) {
    case 'chat':
      return new ChatAgent(config)
    case 'note':
      return new NoteAgent(config)
    case 'planner':
      return new PlannerAgent(config)
    case 'secretary':
      return new SecretaryAgent(config)
    case 'research':
      return new ResearchAgent(config)
    case 'explain':
      return new ExplainAgent({ model: config.model })
    default:
      throw new Error(`Unknown agent type: ${type}`)
  }
}

/**
 * Agent metadata for UI
 */
export const AGENT_METADATA: Record<
  AgentType,
  {
    name: string
    description: string
    capabilities: string[]
  }
> = {
  chat: {
    name: 'Chat Agent',
    description: 'Conversational AI with RAG and citations',
    capabilities: ['chat', 'rag', 'citations', 'context'],
  },
  note: {
    name: 'Note Agent',
    description: 'Create, update, and organize notes',
    capabilities: ['create', 'update', 'organize', 'summarize', 'expand'],
  },
  planner: {
    name: 'Planner Agent',
    description: 'Goal decomposition and task planning',
    capabilities: ['plan', 'decompose', 'track', 'guide'],
  },
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
