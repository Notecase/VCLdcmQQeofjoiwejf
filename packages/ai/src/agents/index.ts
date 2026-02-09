/**
 * LangGraph Agent exports
 *
 * AI agents for Inkdown:
 * - ChatAgent: Conversational AI with RAG and citations
 * - NoteAgent: Note manipulation (create, update, organize, summarize, expand)
 * - EditorAgent: Intent classification and task routing (8 intents)
 * - PlannerAgent: Goal decomposition and task planning
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
  type ChatMessage,
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
// Editor Agent
// ============================================================================

export {
  EditorAgent,
  createEditorAgent,
  EditorAgentInputSchema,
  type EditorAgentConfig,
  type EditorAgentInput,
  type EditorAgentResponse,
  type IntentType,
  type IntentClassification,
} from './editor.agent'

// ============================================================================
// Editor Deep Agent (DeepAgents runtime for normal editor)
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
// Agentic Agent (Autonomous Task Execution)
// ============================================================================

export { AgenticAgent, createAgenticAgent } from './agentic.agent'

// ============================================================================
// Deep Agent (Compound Request Orchestration)
// ============================================================================

export {
  InkdownDeepAgent,
  createInkdownDeepAgent,
  type DeepAgentConfig,
  type DeepAgentEvent,
  type DeepAgentEventType,
  type SubTask,
  type DecompositionResult,
} from './deep-agent'

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

export type {
  AgentStep,
  AgentStepType,
  AgenticResult,
  AgenticStatus,
  AgenticProgress,
  AgenticTask,
  ResearchResult,
  ValidationResult,
  DataSchema,
  DatabaseColumn,
  ColumnSpec,
  Constraint,
  ConstraintType,
  DataSource,
  StepStatus,
  StepResult,
  Source,
  ValidationIssue,
  IssueSeverity,
  BlockInfo,
  PlanTaskRequest,
  ExecuteTaskRequest,
} from './agentic.types'

// ============================================================================
// Agent Factory
// ============================================================================

import { SupabaseClient } from '@supabase/supabase-js'
import { ChatAgent } from './chat.agent'
import { NoteAgent } from './note.agent'
import { EditorAgent } from './editor.agent'
import { PlannerAgent } from './planner.agent'
import { InkdownDeepAgent } from './deep-agent'
import { SecretaryAgent } from './secretary'
import { ResearchAgent } from './research'
import { ExplainAgent } from './explain'
// AgenticAgent is exported above but not used in factory (standalone usage)

export type AgentType =
  | 'chat'
  | 'note'
  | 'editor'
  | 'planner'
  | 'agentic'
  | 'deep'
  | 'secretary'
  | 'research'
  | 'explain'

export interface AgentConfig {
  supabase: SupabaseClient
  userId: string
  openaiApiKey: string
  model?: string
}

/**
 * Create an agent by type
 */
export function createAgent(
  type: AgentType,
  config: AgentConfig
):
  | ChatAgent
  | NoteAgent
  | EditorAgent
  | PlannerAgent
  | InkdownDeepAgent
  | SecretaryAgent
  | ResearchAgent
  | ExplainAgent {
  switch (type) {
    case 'chat':
      return new ChatAgent(config)
    case 'note':
      return new NoteAgent(config)
    case 'editor':
      return new EditorAgent(config)
    case 'planner':
      return new PlannerAgent(config)
    case 'deep':
      return new InkdownDeepAgent(config)
    case 'secretary':
      return new SecretaryAgent(config)
    case 'research':
      return new ResearchAgent(config)
    case 'explain':
      return new ExplainAgent({ openaiApiKey: config.openaiApiKey, model: config.model })
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
  editor: {
    name: 'Editor Agent',
    description: 'Intent classification and task routing',
    capabilities: ['classify', 'route', 'tools', 'memory'],
  },
  planner: {
    name: 'Planner Agent',
    description: 'Goal decomposition and task planning',
    capabilities: ['plan', 'decompose', 'track', 'guide'],
  },
  agentic: {
    name: 'Agentic Agent',
    description: 'Autonomous task execution with research and creation',
    capabilities: ['research', 'extract', 'create', 'populate', 'validate'],
  },
  deep: {
    name: 'Deep Agent',
    description: 'Compound request orchestration with task decomposition',
    capabilities: ['decompose', 'delegate', 'orchestrate', 'artifacts', 'tables'],
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
