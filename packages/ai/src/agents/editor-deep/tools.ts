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

function resolveNoteId(ctx: EditorToolContext, noteId?: string): string | undefined {
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
        'Read the active note (or a specific note) and provide the relevant context needed to answer a question.',
      schema: z.object({
        question: z.string().min(1),
        noteId: z.string().uuid().optional(),
        blockIndex: z.number().int().min(0).optional(),
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

      const targetIndex = afterBlockIndex ?? getContextBlockIndex(ctx)
      if (targetIndex === undefined) {
        const result = await executeTool(
          'edit_block',
          {
            noteId: effectiveNoteId,
            newContent: `\n\n${paragraph.trim()}`,
            operation: 'append',
          },
          baseCtx
        )

        return result.success
          ? 'Paragraph appended to the current note.'
          : `Failed to append paragraph: ${result.error || 'unknown error'}`
      }

      const readResult = await executeTool(
        'read_note',
        {
          noteId: effectiveNoteId,
          includeMetadata: true,
        },
        baseCtx
      )

      if (!readResult.success || !readResult.data) {
        return `Failed to read note before insertion: ${readResult.error || 'unknown error'}`
      }

      const current = (readResult.data as { content?: string }).content || ''
      const blocks = splitParagraphs(current)
      const safeIndex = Math.min(Math.max(targetIndex + 1, 0), blocks.length)
      blocks.splice(safeIndex, 0, paragraph.trim())

      const writeResult = await executeTool(
        'edit_block',
        {
          noteId: effectiveNoteId,
          newContent: blocks.join('\n\n'),
          operation: 'replace',
        },
        baseCtx
      )

      return writeResult.success
        ? `Paragraph inserted at position ${safeIndex + 1}.`
        : `Failed to insert paragraph: ${writeResult.error || 'unknown error'}`
    },
    {
      name: 'add_paragraph',
      description: 'Add a paragraph to the current note, optionally after a specific paragraph index.',
      schema: z.object({
        noteId: z.string().uuid().optional(),
        paragraph: z.string().min(1),
        afterBlockIndex: z.number().int().min(0).optional(),
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
          includeMetadata: true,
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
      const writeResult = await executeTool(
        'edit_block',
        {
          noteId: effectiveNoteId,
          newContent: blocks.join('\n\n'),
          operation: 'replace',
        },
        baseCtx
      )

      return writeResult.success
        ? `Removed paragraph ${effectiveBlockIndex + 1}.`
        : `Failed to remove paragraph: ${writeResult.error || 'unknown error'}`
    },
    {
      name: 'remove_paragraph',
      description: 'Remove a paragraph from the current note by index.',
      schema: z.object({
        noteId: z.string().uuid().optional(),
        blockIndex: z.number().int().min(0).optional(),
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

      const effectiveBlockIndex = blockIndex ?? getContextBlockIndex(ctx)
      if (effectiveBlockIndex === undefined) {
        // Default fallback: append content when no explicit target is provided.
        const appendResult = await executeTool(
          'edit_block',
          {
            noteId: effectiveNoteId,
            newContent: `\n\n${newContent.trim()}`,
            operation: 'append',
          },
          baseCtx
        )
        return appendResult.success
          ? 'No target paragraph specified, so I appended the content to the end of the note.'
          : `Failed to append content: ${appendResult.error || 'unknown error'}`
      }

      const replaceResult = await executeTool(
        'edit_block',
        {
          noteId: effectiveNoteId,
          blockIndex: effectiveBlockIndex,
          newContent,
          operation: 'replace',
        },
        baseCtx
      )

      return replaceResult.success
        ? `Updated paragraph ${effectiveBlockIndex + 1}.`
        : `Failed to update paragraph: ${replaceResult.error || 'unknown error'}`
    },
    {
      name: 'edit_paragraph',
      description: 'Edit a specific paragraph in the note, or append content if no index is provided.',
      schema: z.object({
        noteId: z.string().uuid().optional(),
        blockIndex: z.number().int().min(0).optional(),
        newContent: z.string().min(1),
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
      description: 'Persist an HTML/CSS/JS artifact optionally linked to the active note.',
      schema: z.object({
        noteId: z.string().uuid().optional(),
        title: z.string().min(1),
        html: z.string(),
        css: z.string(),
        javascript: z.string(),
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

      const result = await executeTool(
        'insert_markdown_table',
        {
          noteId: effectiveNoteId,
          title,
          headers,
          rows,
          position,
        },
        baseCtx
      )

      return result.success
        ? `Inserted table "${title || 'Untitled Table'}" with ${rows.length} rows.`
        : `Failed to insert table: ${result.error || 'unknown error'}`
    },
    {
      name: 'insert_table',
      description: 'Insert a markdown table into the active note.',
      schema: z.object({
        noteId: z.string().uuid().optional(),
        title: z.string().optional(),
        headers: z.array(z.string()).min(1),
        rows: z.array(z.array(z.string())).default([]),
        position: z.enum(['start', 'end']).default('end'),
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
      description: 'Run one of the supported db_* operations against embedded note databases.',
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
        ]),
        noteId: z.string().uuid().optional(),
        databaseId: z.string().uuid().optional(),
        args: z.record(z.unknown()).default({}),
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
      description: 'Read memory context from existing memory files and long-term key/value memory.',
      schema: z.object({
        memoryType: z
          .enum(['preferences', 'plan_index', 'daily', 'today', 'tomorrow', 'context'])
          .default('preferences'),
        key: z.string().optional(),
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
      description: 'Write memory content to existing memory files and long-term key/value memory.',
      schema: z.object({
        memoryType: z
          .enum(['preferences', 'plan_index', 'daily', 'today', 'tomorrow', 'context'])
          .default('preferences'),
        key: z.string().optional(),
        content: z.string().min(1),
      }),
    }
  )

  return [
    answerQuestionAboutNote,
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
