import { tool, type StructuredToolInterface } from '@langchain/core/tools'
import { z } from 'zod'
import { executeTool, type ToolContext } from '../../tools'
import type { EditorToolContext } from './types'
import type { EditorLongTermMemory } from './memory'

function toToolContext(ctx: EditorToolContext): ToolContext {
  return {
    userId: ctx.userId,
    supabase: ctx.supabase,
  }
}

function resolveNoteId(ctx: EditorToolContext, noteId?: string | null): string | undefined {
  return noteId || ctx.editorContext.currentNoteId
}

function getContextBlockIndex(ctx: EditorToolContext): number | undefined {
  const raw = ctx.editorContext.currentBlockId
  if (!raw) return undefined
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 0) return undefined
  return parsed
}

function resolveMemoryScope(ctx: EditorToolContext): {
  scopeType: 'note' | 'workspace' | 'user'
  scopeId: string
} {
  if (ctx.editorContext.currentNoteId) {
    return {
      scopeType: 'note',
      scopeId: ctx.editorContext.currentNoteId,
    }
  }

  if (ctx.editorContext.workspaceId) {
    return {
      scopeType: 'workspace',
      scopeId: ctx.editorContext.workspaceId,
    }
  }

  return {
    scopeType: 'user',
    scopeId: ctx.userId,
  }
}

function emitClarification(ctx: EditorToolContext, reason: string): void {
  ctx.emitEvent({
    type: 'clarification-requested',
    data: { reason, options: [] },
  })
}

function splitParagraphs(content: string): string[] {
  return content
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
}

async function proposeNoteEdit(
  ctx: EditorToolContext,
  noteId: string,
  proposedContent: string
): Promise<string> {
  const readResult = await executeTool(
    'read_note',
    { noteId, includeMetadata: false },
    toToolContext(ctx)
  )
  const original = (readResult.data as { content?: string })?.content || ''

  ctx.emitEvent({
    type: 'edit-proposal',
    data: {
      noteId,
      original,
      proposed: proposedContent,
    },
  })

  return 'Edit proposed for review.'
}

function buildMarkdownTable(
  headers: string[],
  rows: string[][],
  title?: string | null
): string {
  const lines: string[] = []
  if (title) {
    lines.push(`### ${title}`, '')
  }
  lines.push(`| ${headers.join(' | ')} |`)
  lines.push(`| ${headers.map(() => '---').join(' | ')} |`)
  for (const row of rows) {
    const padded = headers.map((_, i) => row[i] || '')
    lines.push(`| ${padded.join(' | ')} |`)
  }
  return lines.join('\n')
}

export function createEditorDeepTools(
  ctx: EditorToolContext,
  memoryService: EditorLongTermMemory
): StructuredToolInterface[] {
  const baseCtx = toToolContext(ctx)

  const answerQuestionAboutNote = tool(
    async ({ question, noteId, blockIndex }) => {
      const effectiveNoteId = resolveNoteId(ctx, noteId)
      if (!effectiveNoteId) {
        emitClarification(ctx, 'Please open a note first so I can answer this question.')
        return 'No note selected. Ask the user to open or specify a note.'
      }

      const readResult =
        blockIndex !== undefined
          ? await executeTool(
              'read_block',
              {
                noteId: effectiveNoteId,
                blockIndex,
              },
              baseCtx
            )
          : await executeTool(
              'read_note',
              {
                noteId: effectiveNoteId,
                includeMetadata: true,
              },
              baseCtx
            )

      if (!readResult.success || !readResult.data) {
        return `Unable to read note: ${readResult.error || 'unknown error'}`
      }

      const payload = readResult.data as Record<string, unknown>
      const title = typeof payload.title === 'string' ? payload.title : 'Untitled'
      const content = typeof payload.content === 'string' ? payload.content : ''
      const truncated = content.length > 8000 ? `${content.slice(0, 8000)}\n...[truncated]` : content

      return [
        `Question: ${question}`,
        `Note title: ${title}`,
        'Note content:',
        truncated,
      ].join('\n\n')
    },
    {
      name: 'answer_question_about_note',
      description:
        'Read the active note and provide context to answer a question. USE THIS for Q&A, summarization, and understanding note content. Do NOT use this for editing — use add_paragraph, edit_paragraph, or remove_paragraph instead.',
      schema: z.object({
        question: z.string().min(1).describe('The specific question the user is asking about the note content'),
        noteId: z.string().uuid().nullish().describe('UUID of a specific note to read. Omit to use the currently open note'),
        blockIndex: z.number().int().min(0).nullish().describe('Specific paragraph index to read. Omit to read the full note'),
      }),
    }
  )

  const createNote = tool(
    async ({ title, content, projectId }) => {
      const effectiveProjectId = projectId || ctx.editorContext.projectId

      const { data: newNote, error } = await ctx.supabase
        .from('notes')
        .insert({
          user_id: ctx.userId,
          title: title || 'Untitled',
          content: '',
          project_id: effectiveProjectId || null,
        })
        .select('id')
        .single()

      if (error || !newNote) {
        return `Failed to create note: ${error?.message || 'unknown error'}`
      }

      const noteId = (newNote as { id: string }).id

      ctx.emitEvent({
        type: 'note-navigate',
        data: { noteId },
      })

      ctx.emitEvent({
        type: 'edit-proposal',
        data: {
          noteId,
          original: '',
          proposed: content,
        },
      })

      return `Note "${title}" created (ID: ${noteId}). Content proposed for review.`
    },
    {
      name: 'create_note',
      description: 'Create a brand-new note with generated content. ONLY for creating new notes in the workspace. To edit the current note, use add_paragraph, edit_paragraph, or remove_paragraph instead.',
      schema: z.object({
        title: z.string().min(1).describe('Title for the new note'),
        content: z.string().min(1).describe('Full markdown content for the note'),
        projectId: z.string().uuid().nullish().describe('Project to create the note in'),
      }),
    }
  )

  const addParagraph = tool(
    async ({ noteId, paragraph, afterBlockIndex }) => {
      const effectiveNoteId = resolveNoteId(ctx, noteId)
      if (!effectiveNoteId) {
        emitClarification(ctx, 'Please open a note before adding a paragraph.')
        return 'No note selected.'
      }

      const readResult = await executeTool(
        'read_note',
        { noteId: effectiveNoteId, includeMetadata: false },
        baseCtx
      )
      if (!readResult.success || !readResult.data) {
        return `Failed to read note: ${readResult.error || 'unknown error'}`
      }

      const current = (readResult.data as { content?: string }).content || ''
      const blocks = splitParagraphs(current)
      const targetIndex = afterBlockIndex ?? getContextBlockIndex(ctx)

      if (targetIndex === undefined) {
        blocks.push(paragraph.trim())
      } else {
        const safeIndex = Math.min(Math.max(targetIndex + 1, 0), blocks.length)
        blocks.splice(safeIndex, 0, paragraph.trim())
      }

      return proposeNoteEdit(ctx, effectiveNoteId, blocks.join('\n\n'))
    },
    {
      name: 'add_paragraph',
      description: 'Add NEW content as a paragraph to the current note. Use this for inserting new paragraphs, sections, or content that doesn\'t exist yet. To modify existing text, use edit_paragraph. To delete, use remove_paragraph.',
      schema: z.object({
        noteId: z.string().uuid().nullish().describe('UUID of the target note. Omit to use the currently open note'),
        paragraph: z.string().min(1).describe('Full markdown content of the new paragraph to insert'),
        afterBlockIndex: z.number().int().min(0).nullish().describe('Insert after this paragraph index (0-based). Omit to append at end'),
      }),
    }
  )

  const removeParagraph = tool(
    async ({ noteId, blockIndex }) => {
      const effectiveNoteId = resolveNoteId(ctx, noteId)
      if (!effectiveNoteId) {
        emitClarification(ctx, 'Please open a note before removing a paragraph.')
        return 'No note selected.'
      }

      const effectiveBlockIndex = blockIndex ?? getContextBlockIndex(ctx)
      if (effectiveBlockIndex === undefined) {
        emitClarification(ctx, 'Tell me which paragraph number should be removed.')
        return 'Missing paragraph index.'
      }

      const readResult = await executeTool(
        'read_note',
        {
          noteId: effectiveNoteId,
          includeMetadata: false,
        },
        baseCtx
      )

      if (!readResult.success || !readResult.data) {
        return `Failed to read note before deletion: ${readResult.error || 'unknown error'}`
      }

      const current = (readResult.data as { content?: string }).content || ''
      const blocks = splitParagraphs(current)
      if (effectiveBlockIndex < 0 || effectiveBlockIndex >= blocks.length) {
        return `Paragraph index ${effectiveBlockIndex} is out of range (0-${Math.max(blocks.length - 1, 0)}).`
      }

      blocks.splice(effectiveBlockIndex, 1)
      return proposeNoteEdit(ctx, effectiveNoteId, blocks.join('\n\n'))
    },
    {
      name: 'remove_paragraph',
      description: 'Remove an existing paragraph from the note by its index. ONLY use when the user explicitly asks to delete or remove content. Do not use for rewriting — use edit_paragraph for that.',
      schema: z.object({
        noteId: z.string().uuid().nullish().describe('UUID of the target note. Omit to use the currently open note'),
        blockIndex: z.number().int().min(0).nullish().describe('Index of the paragraph to remove (0-based)'),
      }),
    }
  )

  const editParagraph = tool(
    async ({ noteId, blockIndex, newContent }) => {
      const effectiveNoteId = resolveNoteId(ctx, noteId)
      if (!effectiveNoteId) {
        emitClarification(ctx, 'Please open a note before editing a paragraph.')
        return 'No note selected.'
      }

      const readResult = await executeTool(
        'read_note',
        { noteId: effectiveNoteId, includeMetadata: false },
        baseCtx
      )
      if (!readResult.success || !readResult.data) {
        return `Failed to read note: ${readResult.error || 'unknown error'}`
      }

      const current = (readResult.data as { content?: string }).content || ''
      const blocks = splitParagraphs(current)
      const effectiveBlockIndex = blockIndex ?? getContextBlockIndex(ctx)

      if (effectiveBlockIndex === undefined) {
        blocks.push(newContent.trim())
      } else if (effectiveBlockIndex < 0 || effectiveBlockIndex >= blocks.length) {
        return `Paragraph index ${effectiveBlockIndex} is out of range (0-${Math.max(blocks.length - 1, 0)}).`
      } else {
        blocks[effectiveBlockIndex] = newContent.trim()
      }

      return proposeNoteEdit(ctx, effectiveNoteId, blocks.join('\n\n'))
    },
    {
      name: 'edit_paragraph',
      description: 'Replace or rewrite an existing paragraph in the note by its index. Use this when the user wants to modify, rewrite, improve, or change existing content. For adding new content, use add_paragraph instead.',
      schema: z.object({
        noteId: z.string().uuid().nullish().describe('UUID of the target note. Omit to use the currently open note'),
        blockIndex: z.number().int().min(0).nullish().describe('Index of the paragraph to replace (0-based). Omit to append'),
        newContent: z.string().min(1).describe('New markdown content to replace the existing paragraph'),
      }),
    }
  )

  const createArtifactFromNote = tool(
    async ({ noteId, title, html, css, javascript }) => {
      const effectiveNoteId = resolveNoteId(ctx, noteId)
      const result = await executeTool(
        'create_artifact',
        {
          type: 'full',
          name: title,
          content: JSON.stringify({ title, html, css, javascript }),
          noteId: effectiveNoteId,
        },
        baseCtx
      )

      if (result.success) {
        ctx.emitEvent({
          type: 'artifact',
          data: {
            title,
            html,
            css,
            javascript,
            noteId: effectiveNoteId || null,
          },
        })
      }

      return result.success
        ? `Artifact "${title}" created successfully.`
        : `Failed to create artifact: ${result.error || 'unknown error'}`
    },
    {
      name: 'create_artifact_from_note',
      description: 'Create an interactive HTML/CSS/JavaScript widget embedded in the note. ONLY for content that requires interactivity: timers, calculators, games, quizzes, interactive visualizations, animations. For static data tables, use insert_table instead.',
      schema: z.object({
        noteId: z.string().uuid().nullish().describe('UUID of the note to attach the artifact to. Omit to use the currently open note'),
        title: z.string().min(1).describe('Human-readable title for the artifact widget'),
        html: z.string().describe('Inner HTML markup only (no html/head/body tags). Rendered in a sandboxed iframe'),
        css: z.string().describe('CSS styles as a string. Applied within the sandboxed iframe'),
        javascript: z.string().describe('JavaScript code (no script tags). Runs in sandboxed iframe — no localStorage, sessionStorage, or cross-frame access'),
      }),
    }
  )

  const insertTable = tool(
    async ({ noteId, title, headers, rows, position }) => {
      const effectiveNoteId = resolveNoteId(ctx, noteId)
      if (!effectiveNoteId) {
        emitClarification(ctx, 'Please open a note before inserting a table.')
        return 'No note selected.'
      }

      const readResult = await executeTool(
        'read_note',
        { noteId: effectiveNoteId, includeMetadata: false },
        baseCtx
      )
      if (!readResult.success || !readResult.data) {
        return `Failed to read note: ${readResult.error || 'unknown error'}`
      }

      const current = (readResult.data as { content?: string }).content || ''
      const tableMarkdown = buildMarkdownTable(headers, rows, title)
      const proposedContent = position === 'start'
        ? (current ? `${tableMarkdown}\n\n${current}` : tableMarkdown)
        : (current ? `${current}\n\n${tableMarkdown}` : tableMarkdown)

      return proposeNoteEdit(ctx, effectiveNoteId, proposedContent)
    },
    {
      name: 'insert_table',
      description: 'Insert a static markdown data table into the note. Use for structured data: lists, rankings, comparisons, statistics. For INTERACTIVE content (calculators, timers, quizzes, games) use create_artifact_from_note instead.',
      schema: z.object({
        noteId: z.string().uuid().nullish().describe('UUID of the target note. Omit to use the currently open note'),
        title: z.string().nullish().describe('Optional title heading for the table (rendered as ### heading)'),
        headers: z.array(z.string()).min(1).describe("Column header names, e.g. ['Name', 'Speed', 'Habitat']"),
        rows: z.array(z.array(z.string())).default([]).describe('Table data rows. Each row is an array of cell values matching the headers'),
        position: z.enum(['start', 'end']).default('end').describe("Where to insert: 'start' for beginning of note, 'end' for after existing content"),
      }),
    }
  )

  const databaseToolMap: Record<string, string> = {
    add_row: 'db_add_row',
    insert_rows: 'db_insert_rows',
    update_rows: 'db_update_rows',
    delete_rows: 'db_delete_rows',
    query_rows: 'db_query_rows',
    aggregate: 'db_aggregate',
    group_by: 'db_group_by',
    column_stats: 'db_column_stats',
    sort_rows: 'db_sort_rows',
    get_schema: 'db_get_schema',
    create_chart_data: 'db_create_chart_data',
  }

  const databaseAction = tool(
    async ({ action, noteId, databaseId, args }) => {
      const toolName = databaseToolMap[action]
      const effectiveNoteId = resolveNoteId(ctx, noteId)
      if (!toolName) return `Unknown database action: ${action}`
      if (!effectiveNoteId) {
        emitClarification(ctx, 'Please open a note before running a database action.')
        return 'No note selected.'
      }

      const toolArgs: Record<string, unknown> = {
        ...args,
        noteId: effectiveNoteId,
      }

      if (databaseId) {
        toolArgs.databaseId = databaseId
      }

      const result = await executeTool(toolName, toolArgs, baseCtx)
      return result.success
        ? `Database action "${action}" succeeded.\n${JSON.stringify(result.data || {}, null, 2)}`
        : `Database action "${action}" failed: ${result.error || 'unknown error'}`
    },
    {
      name: 'database_action',
      description: 'Run operations against EXISTING embedded databases in notes. For creating new data tables from scratch, use insert_table instead. This tool is for querying, inserting, updating, or deleting rows in databases that already exist.',
      schema: z.object({
        action: z.enum([
          'add_row',
          'insert_rows',
          'update_rows',
          'delete_rows',
          'query_rows',
          'aggregate',
          'group_by',
          'column_stats',
          'sort_rows',
          'get_schema',
          'create_chart_data',
        ]).describe('The database operation to perform'),
        noteId: z.string().uuid().nullish().describe('UUID of the note containing the database. Omit to use the currently open note'),
        databaseId: z.string().uuid().nullish().describe('UUID of the specific database within the note'),
        args: z.record(z.unknown()).default({}).describe('Operation-specific arguments (e.g. row data, query filters)'),
      }),
    }
  )

  const readMemory = tool(
    async ({ memoryType, key }) => {
      const result = await executeTool(
        'read_memory_file',
        {
          memoryType,
        },
        baseCtx
      )

      if (!result.success) {
        return `Failed to read memory: ${result.error || 'unknown error'}`
      }

      if (!key) {
        return typeof (result.data as { content?: unknown })?.content === 'string'
          ? ((result.data as { content: string }).content ?? '')
          : JSON.stringify(result.data || {})
      }

      const row = await memoryService.read(key, {
        currentNoteId: ctx.editorContext.currentNoteId,
        workspaceId: ctx.editorContext.workspaceId,
      })
      return row?.value || `No long-term memory found for key "${key}".`
    },
    {
      name: 'read_memory',
      description: 'Read stored user preferences, plans, or context from long-term memory. Use for retrieving saved preferences, daily plans, or contextual notes.',
      schema: z.object({
        memoryType: z
          .enum(['preferences', 'plan_index', 'daily', 'today', 'tomorrow', 'context'])
          .default('preferences')
          .describe('Category of memory to read: preferences, plan_index, daily, today, tomorrow, or context'),
        key: z.string().nullish().describe('Specific memory key to look up. Omit to read the full memory file'),
      }),
    }
  )

  const writeMemory = tool(
    async ({ memoryType, key, content }) => {
      const result = await executeTool(
        'write_memory_file',
        {
          memoryType,
          content,
        },
        baseCtx
      )

      if (!result.success) {
        return `Failed to write memory: ${result.error || 'unknown error'}`
      }

      const memoryKey = key || `${memoryType}:latest`
      const scope = resolveMemoryScope(ctx)
      await memoryService.write({
        key: memoryKey,
        value: content.slice(0, 2000),
        memoryType,
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
      })

      return `Memory updated successfully for "${memoryKey}".`
    },
    {
      name: 'write_memory',
      description: 'Save user preferences, plans, or context to long-term memory. Store concise facts and preferences, not full note bodies.',
      schema: z.object({
        memoryType: z
          .enum(['preferences', 'plan_index', 'daily', 'today', 'tomorrow', 'context'])
          .default('preferences')
          .describe('Category of memory to write to'),
        key: z.string().nullish().describe('Memory key identifier. Omit for default key based on memoryType'),
        content: z.string().min(1).describe('The content to store. Keep concise — max 2000 chars'),
      }),
    }
  )

  return [
    answerQuestionAboutNote,
    createNote,
    addParagraph,
    removeParagraph,
    editParagraph,
    createArtifactFromNote,
    insertTable,
    databaseAction,
    readMemory,
    writeMemory,
  ]
}
