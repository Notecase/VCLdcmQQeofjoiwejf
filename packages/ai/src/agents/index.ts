/**
 * LangGraph Agent exports
 *
 * This module provides AI agents built with LangGraph.
 * Full implementations will be added in Phase 3.
 */

// Agent types (to be implemented in Phase 3)
// export { createChatAgent } from './chat.agent'
// export { createNoteAgent } from './note.agent'
// export { createPlannerAgent } from './planner.agent'
// export { createCourseAgent } from './course.agent'

// Agent state types
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
