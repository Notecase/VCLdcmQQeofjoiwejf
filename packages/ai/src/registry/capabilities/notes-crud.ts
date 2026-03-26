/**
 * notes.read and notes.create Capabilities
 *
 * Wrappers around core note CRUD operations. Zero LLM cost.
 */

import { z } from 'zod'
import { readNote } from '../../tools/core.tools'
import type { Capability, CapabilityContext } from '../types'

// ============================================================================
// notes.read
// ============================================================================

const readInputSchema = z.object({
  noteId: z.string().uuid().describe('ID of the note to read'),
})

async function executeRead(input: unknown, context: CapabilityContext): Promise<string> {
  const { noteId } = readInputSchema.parse(input)

  const result = await readNote(
    { noteId, includeMetadata: true },
    { userId: context.userId, supabase: context.supabase }
  )

  if (!result.success || !result.data) {
    return `Note not found: ${result.error || 'unknown error'}`
  }

  const { title, content, projectId, createdAt } = result.data
  let output = `# ${title}\n\n${content}`
  if (projectId) output += `\n\nProject: ${projectId}`
  if (createdAt) output += `\nCreated: ${createdAt}`
  return output
}

export const notesRead: Capability = {
  name: 'notes.read',
  description: 'Read the full content and metadata of a specific note by ID.',
  inputSchema: readInputSchema,
  execute: executeRead,
}

// ============================================================================
// notes.create
// ============================================================================

const createInputSchema = z.object({
  title: z.string().describe('Title for the new note'),
  content: z.string().optional().default('').describe('Initial markdown content'),
  projectId: z.string().uuid().optional().describe('Project to create the note in'),
})

async function executeCreate(input: unknown, context: CapabilityContext): Promise<string> {
  const { title, content, projectId } = createInputSchema.parse(input)

  const noteId = crypto.randomUUID()
  const now = new Date().toISOString()

  const insertData: Record<string, unknown> = {
    id: noteId,
    user_id: context.userId,
    title,
    content,
    created_at: now,
    updated_at: now,
    is_deleted: false,
  }

  if (projectId) {
    insertData.project_id = projectId
  }

  const { error } = await context.supabase.from('notes').insert(insertData)

  if (error) {
    return `Failed to create note: ${error.message}`
  }

  return `Created note "${title}" (ID: ${noteId})`
}

export const notesCreate: Capability = {
  name: 'notes.create',
  description: 'Create a new note with a title and optional content. Returns the created note ID.',
  inputSchema: createInputSchema,
  execute: executeCreate,
}
