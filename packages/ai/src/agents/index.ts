/**
 * LangGraph Agent exports
 *
 * AI agents for Inkdown:
 * - ChatAgent: Conversational AI with RAG and citations
 * - NoteAgent: Note manipulation (create, update, organize, summarize, expand)
 * - SecretaryAgent: Intent classification and task routing (8 intents)
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
// Secretary Agent
// ============================================================================

export {
  SecretaryAgent,
  createSecretaryAgent,
  SecretaryAgentInputSchema,
  type SecretaryAgentConfig,
  type SecretaryAgentInput,
  type SecretaryAgentResponse,
  type IntentType,
  type IntentClassification,
} from './secretary.agent'

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
import { SecretaryAgent } from './secretary.agent'
import { PlannerAgent } from './planner.agent'
// AgenticAgent is exported above but not used in factory (standalone usage)

export type AgentType = 'chat' | 'note' | 'secretary' | 'planner' | 'agentic'

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
): ChatAgent | NoteAgent | SecretaryAgent | PlannerAgent {
  switch (type) {
    case 'chat':
      return new ChatAgent(config)
    case 'note':
      return new NoteAgent(config)
    case 'secretary':
      return new SecretaryAgent(config)
    case 'planner':
      return new PlannerAgent(config)
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
  secretary: {
    name: 'Secretary Agent',
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
}
