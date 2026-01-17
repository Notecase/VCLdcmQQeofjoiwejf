/**
 * Core Editing Tools (8 tools)
 * 
 * Tools for reading, editing, and manipulating notes and blocks.
 * From Note3: read_block, read_note, edit_block, search_web,
 * create_artifact, create_database, read_memory_file, write_memory_file
 */

import { z } from 'zod'
import { SupabaseClient } from '@supabase/supabase-js'

// ============================================================================
// Tool Context & Result Types
// ============================================================================

export interface ToolContext {
    userId: string
    supabase: SupabaseClient
    config?: Record<string, unknown>
}

export interface ToolResult<T = unknown> {
    success: boolean
    data?: T
    error?: string
}

// ============================================================================
// Schema Definitions
// ============================================================================

export const ReadBlockSchema = z.object({
    noteId: z.string().uuid().describe('ID of the note containing the block'),
    blockIndex: z.number().int().min(0).optional().describe('Index of the block to read (0-based). If not provided, reads all blocks.'),
})

export const ReadNoteSchema = z.object({
    noteId: z.string().uuid().describe('ID of the note to read'),
    includeMetadata: z.boolean().optional().default(true).describe('Include note metadata (title, created_at, etc.)'),
})

export const EditBlockSchema = z.object({
    noteId: z.string().uuid().describe('ID of the note to edit'),
    blockIndex: z.number().int().min(0).optional().describe('Index of the block to edit. If not provided, edits entire content.'),
    newContent: z.string().describe('New content for the block'),
    operation: z.enum(['replace', 'append', 'prepend']).optional().default('replace').describe('How to apply the edit'),
})

export const SearchWebSchema = z.object({
    query: z.string().min(1).describe('Search query for web search'),
    maxResults: z.number().int().min(1).max(10).optional().default(5).describe('Maximum number of results'),
})

export const CreateArtifactSchema = z.object({
    type: z.enum(['html', 'css', 'js', 'full']).describe('Type of artifact to create'),
    name: z.string().min(1).describe('Name for the artifact'),
    content: z.string().describe('Content of the artifact'),
    noteId: z.string().uuid().optional().describe('Note to attach artifact to'),
})

export const CreateDatabaseSchema = z.object({
    name: z.string().min(1).describe('Name of the database/table'),
    columns: z.array(z.object({
        name: z.string(),
        type: z.enum(['text', 'number', 'boolean', 'date', 'url', 'select', 'multi-select']),
        options: z.array(z.string()).optional(),
    })).describe('Column definitions'),
    noteId: z.string().uuid().optional().describe('Note to embed database in'),
})

export const ReadMemorySchema = z.object({
    memoryType: z.enum(['preferences', 'plan_index', 'daily', 'today', 'tomorrow', 'context'])
        .describe('Type of memory to read'),
})

export const WriteMemorySchema = z.object({
    memoryType: z.enum(['preferences', 'plan_index', 'daily', 'today', 'tomorrow', 'context'])
        .describe('Type of memory to write'),
    content: z.string().describe('Content to write'),
    metadata: z.record(z.unknown()).optional().describe('Optional metadata'),
})

// ============================================================================
// Type Exports
// ============================================================================

export type ReadBlockInput = z.infer<typeof ReadBlockSchema>
export type ReadNoteInput = z.infer<typeof ReadNoteSchema>
export type EditBlockInput = z.infer<typeof EditBlockSchema>
export type SearchWebInput = z.infer<typeof SearchWebSchema>
export type CreateArtifactInput = z.infer<typeof CreateArtifactSchema>
export type CreateDatabaseInput = z.infer<typeof CreateDatabaseSchema>
export type ReadMemoryInput = z.infer<typeof ReadMemorySchema>
export type WriteMemoryInput = z.infer<typeof WriteMemorySchema>

// ============================================================================
// Tool Implementations
// ============================================================================

/**
 * Read a specific block from a note
 */
export async function readBlock(
    input: ReadBlockInput,
    ctx: ToolContext
): Promise<ToolResult<{ content: string; blockIndex?: number }>> {
    try {
        const { data: note, error } = await ctx.supabase
            .from('notes')
            .select('content')
            .eq('id', input.noteId)
            .eq('user_id', ctx.userId)
            .eq('is_deleted', false)
            .single()

        if (error || !note) {
            return { success: false, error: 'Note not found' }
        }

        const content = note.content || ''

        if (input.blockIndex !== undefined) {
            // Split by paragraphs/blocks (double newline)
            const blocks = content.split(/\n\n+/)
            if (input.blockIndex >= blocks.length) {
                return { success: false, error: `Block index ${input.blockIndex} out of range (${blocks.length} blocks)` }
            }
            return {
                success: true,
                data: { content: blocks[input.blockIndex], blockIndex: input.blockIndex }
            }
        }

        return { success: true, data: { content } }
    } catch (err) {
        return { success: false, error: String(err) }
    }
}

/**
 * Read entire note with metadata
 */
export async function readNote(
    input: ReadNoteInput,
    ctx: ToolContext
): Promise<ToolResult<{
    id: string
    title: string
    content: string
    projectId?: string
    createdAt?: string
    updatedAt?: string
}>> {
    try {
        // Always fetch all needed columns and filter in JS
        const { data: note, error } = await ctx.supabase
            .from('notes')
            .select('id, title, content, project_id, created_at, updated_at')
            .eq('id', input.noteId)
            .eq('user_id', ctx.userId)
            .eq('is_deleted', false)
            .single()

        if (error || !note) {
            return { success: false, error: 'Note not found' }
        }

        // Type assertion for the note data
        const noteData = note as {
            id: string;
            title: string;
            content: string;
            project_id?: string;
            created_at?: string;
            updated_at?: string
        }

        const result: {
            id: string
            title: string
            content: string
            projectId?: string
            createdAt?: string
            updatedAt?: string
        } = {
            id: noteData.id,
            title: noteData.title,
            content: noteData.content,
        }

        if (input.includeMetadata) {
            result.projectId = noteData.project_id
            result.createdAt = noteData.created_at
            result.updatedAt = noteData.updated_at
        }

        return { success: true, data: result }
    } catch (err) {
        return { success: false, error: String(err) }
    }
}

/**
 * Edit a block or entire note content
 */
export async function editBlock(
    input: EditBlockInput,
    ctx: ToolContext
): Promise<ToolResult<{ updatedContent: string }>> {
    try {
        // Get current content
        const { data: note, error: readError } = await ctx.supabase
            .from('notes')
            .select('content')
            .eq('id', input.noteId)
            .eq('user_id', ctx.userId)
            .eq('is_deleted', false)
            .single()

        if (readError || !note) {
            return { success: false, error: 'Note not found' }
        }

        let updatedContent: string

        if (input.blockIndex !== undefined) {
            // Edit specific block
            const blocks = (note.content || '').split(/\n\n+/)
            if (input.blockIndex >= blocks.length) {
                return { success: false, error: `Block index ${input.blockIndex} out of range` }
            }

            switch (input.operation) {
                case 'append':
                    blocks[input.blockIndex] += input.newContent
                    break
                case 'prepend':
                    blocks[input.blockIndex] = input.newContent + blocks[input.blockIndex]
                    break
                default:
                    blocks[input.blockIndex] = input.newContent
            }
            updatedContent = blocks.join('\n\n')
        } else {
            // Edit entire content
            switch (input.operation) {
                case 'append':
                    updatedContent = (note.content || '') + input.newContent
                    break
                case 'prepend':
                    updatedContent = input.newContent + (note.content || '')
                    break
                default:
                    updatedContent = input.newContent
            }
        }

        // Update note
        const { error: updateError } = await ctx.supabase
            .from('notes')
            .update({ content: updatedContent })
            .eq('id', input.noteId)
            .eq('user_id', ctx.userId)

        if (updateError) {
            return { success: false, error: updateError.message }
        }

        return { success: true, data: { updatedContent } }
    } catch (err) {
        return { success: false, error: String(err) }
    }
}

/**
 * Search the web (placeholder - needs external API)
 */
export async function searchWeb(
    input: SearchWebInput,
    _ctx: ToolContext
): Promise<ToolResult<{ results: { title: string; url: string; snippet: string }[] }>> {
    // TODO: Integrate with actual web search API (e.g., Tavily, SerpAPI, Brave Search)
    // For now, return placeholder
    return {
        success: true,
        data: {
            results: [
                {
                    title: `Search result for "${input.query}"`,
                    url: `https://example.com/search?q=${encodeURIComponent(input.query)}`,
                    snippet: `This is a placeholder result. Integrate with a web search API to enable actual web search functionality.`,
                },
            ],
        },
    }
}

/**
 * Create an artifact (HTML/CSS/JS component)
 */
export async function createArtifact(
    input: CreateArtifactInput,
    ctx: ToolContext
): Promise<ToolResult<{ artifactId: string }>> {
    try {
        // Store artifact as an attachment or in a dedicated artifacts table
        // For now, store as JSON in the note's editor_state
        if (input.noteId) {
            const { data: note, error: readError } = await ctx.supabase
                .from('notes')
                .select('editor_state')
                .eq('id', input.noteId)
                .eq('user_id', ctx.userId)
                .single()

            if (readError) {
                return { success: false, error: 'Note not found' }
            }

            const editorState = (note?.editor_state || {}) as Record<string, unknown>
            const artifacts = (editorState.artifacts || []) as Array<Record<string, unknown>>
            const artifactId = crypto.randomUUID()

            artifacts.push({
                id: artifactId,
                name: input.name,
                type: input.type,
                content: input.content,
                createdAt: new Date().toISOString(),
            })

            const { error: updateError } = await ctx.supabase
                .from('notes')
                .update({ editor_state: { ...editorState, artifacts } })
                .eq('id', input.noteId)
                .eq('user_id', ctx.userId)

            if (updateError) {
                return { success: false, error: updateError.message }
            }

            return { success: true, data: { artifactId } }
        }

        // Create standalone artifact ID
        return { success: true, data: { artifactId: crypto.randomUUID() } }
    } catch (err) {
        return { success: false, error: String(err) }
    }
}

/**
 * Create a database/table structure
 */
export async function createDatabase(
    input: CreateDatabaseInput,
    ctx: ToolContext
): Promise<ToolResult<{ databaseId: string; schema: unknown }>> {
    try {
        const databaseId = crypto.randomUUID()
        const schema = {
            id: databaseId,
            name: input.name,
            columns: input.columns,
            rows: [],
            createdAt: new Date().toISOString(),
        }

        if (input.noteId) {
            const { data: note, error: readError } = await ctx.supabase
                .from('notes')
                .select('editor_state')
                .eq('id', input.noteId)
                .eq('user_id', ctx.userId)
                .single()

            if (readError) {
                return { success: false, error: 'Note not found' }
            }

            const editorState = (note?.editor_state || {}) as Record<string, unknown>
            const databases = (editorState.databases || []) as Array<Record<string, unknown>>
            databases.push(schema)

            const { error: updateError } = await ctx.supabase
                .from('notes')
                .update({ editor_state: { ...editorState, databases } })
                .eq('id', input.noteId)
                .eq('user_id', ctx.userId)

            if (updateError) {
                return { success: false, error: updateError.message }
            }
        }

        return { success: true, data: { databaseId, schema } }
    } catch (err) {
        return { success: false, error: String(err) }
    }
}

/**
 * Read AI memory
 */
export async function readMemory(
    input: ReadMemoryInput,
    ctx: ToolContext
): Promise<ToolResult<{ content: string; metadata?: Record<string, unknown> }>> {
    try {
        const { data, error } = await ctx.supabase
            .rpc('get_ai_memory', {
                p_user_id: ctx.userId,
                p_memory_type: input.memoryType,
            })
            .single<{ content: string; metadata: Record<string, unknown>; updated_at: string }>()

        if (error || !data) {
            return { success: true, data: { content: '' } } // Empty memory is valid
        }

        return {
            success: true,
            data: {
                content: data.content,
                metadata: data.metadata,
            },
        }
    } catch (err) {
        return { success: false, error: String(err) }
    }
}

/**
 * Write AI memory
 */
export async function writeMemory(
    input: WriteMemoryInput,
    ctx: ToolContext
): Promise<ToolResult<{ written: boolean }>> {
    try {
        const { error } = await ctx.supabase.rpc('set_ai_memory', {
            p_user_id: ctx.userId,
            p_memory_type: input.memoryType,
            p_content: input.content,
            p_metadata: input.metadata || {},
        })

        if (error) {
            return { success: false, error: error.message }
        }

        return { success: true, data: { written: true } }
    } catch (err) {
        return { success: false, error: String(err) }
    }
}

// ============================================================================
// Tool Definitions for LangGraph
// ============================================================================

export const coreEditingTools = [
    {
        name: 'read_block',
        description: 'Read a specific block from a note by index, or read all blocks',
        schema: ReadBlockSchema,
        execute: readBlock,
    },
    {
        name: 'read_note',
        description: 'Read the entire content and metadata of a note',
        schema: ReadNoteSchema,
        execute: readNote,
    },
    {
        name: 'edit_block',
        description: 'Edit a specific block in a note, or edit the entire note content',
        schema: EditBlockSchema,
        execute: editBlock,
    },
    {
        name: 'search_web',
        description: 'Search the web for current information on a topic',
        schema: SearchWebSchema,
        execute: searchWeb,
    },
    {
        name: 'create_artifact',
        description: 'Create an HTML/CSS/JS visualization or interactive component',
        schema: CreateArtifactSchema,
        execute: createArtifact,
    },
    {
        name: 'create_database',
        description: 'Create a structured database/table with custom columns',
        schema: CreateDatabaseSchema,
        execute: createDatabase,
    },
    {
        name: 'read_memory_file',
        description: 'Read AI memory (preferences, plans, daily notes)',
        schema: ReadMemorySchema,
        execute: readMemory,
    },
    {
        name: 'write_memory_file',
        description: 'Write/update AI memory content',
        schema: WriteMemorySchema,
        execute: writeMemory,
    },
] as const
