/**
 * AI Tools exports
 *
 * This module provides tool definitions for LangGraph agents.
 * Full implementations will be added in Phase 3.
 */

import { z } from 'zod'

// Tools (to be implemented)
// export { createSearchTool } from './search.tool'
// export { createNoteTools } from './note.tools'
// export { createWebTool } from './web.tool'

/**
 * Base tool definition
 */
export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  name: string
  description: string
  schema: z.ZodType<TInput>
  execute: (input: TInput, context: ToolContext) => Promise<TOutput>
}

/**
 * Context passed to tools during execution
 */
export interface ToolContext {
  userId: string
  supabase: unknown // SupabaseClient
  config?: Record<string, unknown>
}

/**
 * Tool execution result
 */
export interface ToolResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

// =============================================================================
// Tool Schemas (for validation)
// =============================================================================

/**
 * Search tool input schema
 */
export const SearchToolSchema = z.object({
  query: z.string().describe('The search query'),
  limit: z.number().optional().describe('Maximum number of results'),
  projectId: z.string().uuid().optional().describe('Filter by project'),
})

export type SearchToolInput = z.infer<typeof SearchToolSchema>

/**
 * Note create tool input schema
 */
export const NoteCreateToolSchema = z.object({
  title: z.string().describe('Title for the new note'),
  content: z.string().describe('Content for the new note'),
  projectId: z.string().uuid().optional().describe('Project to add note to'),
})

export type NoteCreateToolInput = z.infer<typeof NoteCreateToolSchema>

/**
 * Note update tool input schema
 */
export const NoteUpdateToolSchema = z.object({
  noteId: z.string().uuid().describe('ID of the note to update'),
  title: z.string().optional().describe('New title'),
  content: z.string().optional().describe('New content'),
  append: z.boolean().optional().describe('Append to existing content'),
})

export type NoteUpdateToolInput = z.infer<typeof NoteUpdateToolSchema>

/**
 * Note read tool input schema
 */
export const NoteReadToolSchema = z.object({
  noteId: z.string().uuid().describe('ID of the note to read'),
})

export type NoteReadToolInput = z.infer<typeof NoteReadToolSchema>

/**
 * Web search tool input schema
 */
export const WebSearchToolSchema = z.object({
  query: z.string().describe('Web search query'),
  maxResults: z.number().optional().describe('Maximum results to return'),
})

export type WebSearchToolInput = z.infer<typeof WebSearchToolSchema>

// =============================================================================
// Tool Definitions (placeholders)
// =============================================================================

/**
 * Available tool names
 */
export const TOOL_NAMES = [
  'semantic_search',
  'note_read',
  'note_create',
  'note_update',
  'note_delete',
  'note_list',
  'project_list',
  'web_search',
] as const

export type ToolName = typeof TOOL_NAMES[number]

/**
 * Tool metadata for UI display
 */
export const TOOL_METADATA: Record<ToolName, { label: string; description: string }> = {
  semantic_search: {
    label: 'Search Notes',
    description: 'Search through notes using semantic similarity',
  },
  note_read: {
    label: 'Read Note',
    description: 'Read the content of a specific note',
  },
  note_create: {
    label: 'Create Note',
    description: 'Create a new note with title and content',
  },
  note_update: {
    label: 'Update Note',
    description: 'Update an existing note',
  },
  note_delete: {
    label: 'Delete Note',
    description: 'Delete a note (soft delete)',
  },
  note_list: {
    label: 'List Notes',
    description: 'List notes in a project or all notes',
  },
  project_list: {
    label: 'List Projects',
    description: 'List all projects',
  },
  web_search: {
    label: 'Web Search',
    description: 'Search the web for information',
  },
}
