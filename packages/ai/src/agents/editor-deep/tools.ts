import { tool, type ToolSet } from 'ai'
import { z } from 'zod'
import { executeTool, type ToolContext } from '../../tools'
import { parseMarkdownStructure, findBlocksByHeading } from '../../utils/structureParser'
import { createWebSearchTool } from '../../tools/web-search'
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

/**
 * Splice content at a specific block index using character offsets from the parser.
 * This preserves original whitespace (unlike the old splitToStructuralBlocks + join approach
 * which normalized all inter-block spacing to \n\n, causing diff mismatches).
 */
/** @internal Exported for testing */
export function spliceAtBlockIndex(
  original: string,
  blockIndex: number | undefined,
  operation: 'insert-after' | 'replace' | 'remove',
  newContent?: string
): string {
  if (!original.trim()) {
    return newContent?.trim() || ''
  }
  const parsed = parseMarkdownStructure(original)
  const blocks = parsed.blocks

  if (operation === 'insert-after') {
    if (blockIndex === undefined || blockIndex < 0 || blockIndex >= blocks.length) {
      // Append at end
      const suffix = original.endsWith('\n') ? '\n' : '\n\n'
      return original + suffix + (newContent?.trim() || '')
    }
    const target = blocks[blockIndex]
    const insertPos = target.endChar
    return (
      original.slice(0, insertPos) +
      '\n\n' +
      (newContent?.trim() || '') +
      (insertPos < original.length ? original.slice(insertPos) : '')
    )
  }

  if (operation === 'replace') {
    if (blockIndex === undefined || blockIndex < 0 || blockIndex >= blocks.length) return original
    const target = blocks[blockIndex]
    return (
      original.slice(0, target.startChar) +
      (newContent?.trim() || '') +
      original.slice(target.endChar)
    )
  }

  if (operation === 'remove') {
    if (blockIndex === undefined || blockIndex < 0 || blockIndex >= blocks.length) return original
    const target = blocks[blockIndex]
    let removeEnd = target.endChar
    // Consume trailing newlines so we don't leave double blank lines
    while (removeEnd < original.length && original[removeEnd] === '\n') removeEnd++
    return original.slice(0, target.startChar) + original.slice(removeEnd)
  }

  return original
}

/**
 * Resolve afterHeading to a block index for insertion.
 */
/** @internal Exported for testing */
export function resolveAfterHeadingIndex(
  content: string,
  afterHeading: string
): number | undefined {
  const parsed = parseMarkdownStructure(content)
  const matches = findBlocksByHeading(parsed, afterHeading)
  if (matches.length > 0) return parsed.blocks.indexOf(matches[0])
  return undefined
}

async function proposeNoteEdit(
  ctx: EditorToolContext,
  noteId: string,
  proposedContent: string,
  originalContent?: string
): Promise<string> {
  let original = originalContent ?? ''
  if (!original) {
    const readResult = await executeTool(
      'read_note',
      { noteId, includeMetadata: false },
      toToolContext(ctx)
    )
    original = (readResult.data as { content?: string })?.content || ''
  }

  ctx.emitEvent({
    type: 'edit-proposal',
    data: {
      noteId,
      original,
      proposed: proposedContent,
      structure: parseMarkdownStructure(original).blocks.map((b) => ({
        type: b.type,
        startLine: b.startLine,
        endLine: b.endLine,
        heading: b.metadata?.heading,
      })),
    },
  })

  return 'Edit proposed for review.'
}

/** @internal Exported for testing */
export function buildMarkdownTable(
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
): ToolSet {
  const baseCtx = toToolContext(ctx)

  const answer_question_about_note = tool({
    description:
      'Read the active note and provide context to answer a question. USE THIS for Q&A, summarization, and understanding note content. Do NOT use this for editing — use add_paragraph, edit_paragraph, or remove_paragraph instead.',
    inputSchema: z.object({
      question: z
        .string()
        .min(1)
        .describe('The specific question the user is asking about the note content'),
      noteId: z
        .string()
        .uuid()
        .optional()
        .describe('UUID of a specific note to read. Omit to use the currently open note'),
      blockIndex: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe('Specific paragraph index to read. Omit to read the full note'),
    }),
    execute: async ({ question, noteId, blockIndex }) => {
      const effectiveNoteId = resolveNoteId(ctx, noteId)
      if (!effectiveNoteId) {
        emitClarification(ctx, 'Please open a note first so I can answer this question.')
        return 'No note selected. Ask the user to open or specify a note.'
      }

      ctx.emitEvent({
        type: 'custom-progress',
        data: { step: 'Reading your note to find the answer...' },
      })

      const readResult =
        blockIndex !== undefined
          ? await executeTool('read_block', { noteId: effectiveNoteId, blockIndex }, baseCtx)
          : await executeTool(
              'read_note',
              { noteId: effectiveNoteId, includeMetadata: true },
              baseCtx
            )

      if (!readResult.success || !readResult.data) {
        return `Unable to read note: ${readResult.error || 'unknown error'}`
      }

      const payload = readResult.data as Record<string, unknown>
      const title = typeof payload.title === 'string' ? payload.title : 'Untitled'
      const content = typeof payload.content === 'string' ? payload.content : ''
      const truncated =
        content.length > 8000 ? `${content.slice(0, 8000)}\n...[truncated]` : content

      ctx.emitEvent({ type: 'custom-progress', data: { step: 'Analyzing note structure...' } })

      return [`Question: ${question}`, `Note title: ${title}`, 'Note content:', truncated].join(
        '\n\n'
      )
    },
  })

  const read_note_structure = tool({
    description:
      'Get the numbered block structure of the note with block indices. Call BEFORE editing to find correct afterBlockIndex values.',
    inputSchema: z.object({
      noteId: z.string().uuid().optional().describe('Note to analyze. Omit for current note'),
    }),
    execute: async ({ noteId }) => {
      const effectiveNoteId = resolveNoteId(ctx, noteId)
      if (!effectiveNoteId) {
        return 'No note selected.'
      }

      const readResult = await executeTool(
        'read_note',
        { noteId: effectiveNoteId, includeMetadata: false },
        baseCtx
      )
      if (!readResult.success || !readResult.data) {
        return 'Failed to read note.'
      }

      const content = (readResult.data as { content?: string }).content || ''
      if (!content.trim()) return 'Note is empty.'

      const parsed = parseMarkdownStructure(content)
      return parsed.blocks
        .map(
          (b, i) =>
            `[${i}] ${b.type}${b.metadata?.heading ? `: ${b.metadata.heading}` : ''} (lines ${b.startLine}-${b.endLine})`
        )
        .join('\n')
    },
  })

  const create_note = tool({
    description:
      'Create a brand-new note with generated content. ONLY for creating new notes in the workspace. To edit the current note, use add_paragraph, edit_paragraph, or remove_paragraph instead.',
    inputSchema: z.object({
      title: z.string().min(1).describe('Title for the new note'),
      content: z.string().min(1).describe('Full markdown content for the note'),
      projectId: z.string().uuid().optional().describe('Project to create the note in'),
    }),
    execute: async ({ title, content, projectId }) => {
      const effectiveProjectId = projectId || ctx.editorContext.projectId

      ctx.emitEvent({ type: 'custom-progress', data: { step: `Creating new note "${title}"...` } })

      // Create note with EMPTY content — the full content is proposed as a diff
      // so the user can review all-green addition blocks before accepting
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

      // Navigate to the new (empty) note first
      ctx.emitEvent({
        type: 'note-navigate',
        data: { noteId },
      })

      // Propose the full content as an edit so the user sees all-green diff blocks
      ctx.emitEvent({
        type: 'edit-proposal',
        data: {
          noteId,
          original: '',
          proposed: content,
          structure: [],
        },
      })

      ctx.emitEvent({
        type: 'action-summary',
        data: { action: 'create_note', title, noteId, description: `Created note "${title}"` },
      })

      return `Note "${title}" created (ID: ${noteId}). The note has been opened for review.`
    },
  })

  const add_paragraph = tool({
    description:
      "Add NEW content as a paragraph to the current note. Use this for inserting new paragraphs, sections, or content that doesn't exist yet. To modify existing text, use edit_paragraph. To delete, use remove_paragraph.",
    inputSchema: z.object({
      noteId: z
        .string()
        .uuid()
        .optional()
        .describe('UUID of the target note. Omit to use the currently open note'),
      paragraph: z.string().min(1).describe('Full markdown content of the new paragraph to insert'),
      afterBlockIndex: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe('Insert after this paragraph index (0-based). Omit to append at end'),
      afterHeading: z
        .string()
        .optional()
        .describe(
          'Insert after the section with this heading text. More reliable than afterBlockIndex for section-level insertion'
        ),
    }),
    execute: async ({ noteId, paragraph, afterBlockIndex, afterHeading }) => {
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
      let targetIndex: number | undefined = afterBlockIndex ?? getContextBlockIndex(ctx)

      if (afterHeading && targetIndex === undefined) {
        targetIndex = resolveAfterHeadingIndex(current, afterHeading)
      }

      ctx.emitEvent({ type: 'custom-progress', data: { step: 'Computing changes to propose...' } })
      const proposed = spliceAtBlockIndex(current, targetIndex, 'insert-after', paragraph.trim())
      return proposeNoteEdit(ctx, effectiveNoteId, proposed, current)
    },
  })

  const remove_paragraph = tool({
    description:
      'Remove an existing paragraph from the note by its index. ONLY use when the user explicitly asks to delete or remove content. Do not use for rewriting — use edit_paragraph for that.',
    inputSchema: z.object({
      noteId: z
        .string()
        .uuid()
        .optional()
        .describe('UUID of the target note. Omit to use the currently open note'),
      blockIndex: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe('Index of the paragraph to remove (0-based)'),
    }),
    execute: async ({ noteId, blockIndex }) => {
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
        { noteId: effectiveNoteId, includeMetadata: false },
        baseCtx
      )

      if (!readResult.success || !readResult.data) {
        return `Failed to read note before deletion: ${readResult.error || 'unknown error'}`
      }

      const current = (readResult.data as { content?: string }).content || ''
      const parsed = parseMarkdownStructure(current)
      if (effectiveBlockIndex < 0 || effectiveBlockIndex >= parsed.blocks.length) {
        return `Paragraph index ${effectiveBlockIndex} is out of range (0-${Math.max(parsed.blocks.length - 1, 0)}).`
      }

      const proposed = spliceAtBlockIndex(current, effectiveBlockIndex, 'remove')
      return proposeNoteEdit(ctx, effectiveNoteId, proposed, current)
    },
  })

  const edit_paragraph = tool({
    description:
      'Replace or rewrite an existing paragraph in the note by its index. Use this when the user wants to modify, rewrite, improve, or change existing content. For adding new content, use add_paragraph instead.',
    inputSchema: z.object({
      noteId: z
        .string()
        .uuid()
        .optional()
        .describe('UUID of the target note. Omit to use the currently open note'),
      blockIndex: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe('Index of the paragraph to replace (0-based). Omit to append'),
      newContent: z
        .string()
        .min(1)
        .describe('New markdown content to replace the existing paragraph'),
    }),
    execute: async ({ noteId, blockIndex, newContent }) => {
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
      const effectiveBlockIndex = blockIndex ?? getContextBlockIndex(ctx)

      if (effectiveBlockIndex === undefined) {
        ctx.emitEvent({
          type: 'custom-progress',
          data: { step: 'Computing changes to propose...' },
        })
        const proposed = spliceAtBlockIndex(current, undefined, 'insert-after', newContent.trim())
        return proposeNoteEdit(ctx, effectiveNoteId, proposed, current)
      }

      const parsed = parseMarkdownStructure(current)
      if (effectiveBlockIndex < 0 || effectiveBlockIndex >= parsed.blocks.length) {
        return `Paragraph index ${effectiveBlockIndex} is out of range (0-${Math.max(parsed.blocks.length - 1, 0)}).`
      }

      ctx.emitEvent({ type: 'custom-progress', data: { step: 'Computing changes to propose...' } })
      const proposed = spliceAtBlockIndex(
        current,
        effectiveBlockIndex,
        'replace',
        newContent.trim()
      )
      return proposeNoteEdit(ctx, effectiveNoteId, proposed, current)
    },
  })

  const create_artifact_from_note = tool({
    description:
      'Create an interactive HTML/CSS/JavaScript widget embedded in the note. ONLY for content that requires interactivity: timers, calculators, games, quizzes, interactive visualizations, animations. For static data tables, use insert_table instead.',
    inputSchema: z.object({
      noteId: z
        .string()
        .uuid()
        .optional()
        .describe(
          'UUID of the note to attach the artifact to. Omit to use the currently open note'
        ),
      title: z.string().min(1).describe('Human-readable title for the artifact widget'),
      html: z
        .string()
        .describe(
          'Inner HTML markup only (no html/head/body tags). Rendered in a sandboxed iframe'
        ),
      css: z.string().describe('CSS styles as a string. Applied within the sandboxed iframe'),
      javascript: z
        .string()
        .describe(
          'JavaScript code (no script tags). Runs in sandboxed iframe — no localStorage, sessionStorage, or cross-frame access'
        ),
    }),
    execute: async ({ noteId, title, html, css, javascript }) => {
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
  })

  const insert_table = tool({
    description:
      'Insert a static markdown data table into the note. Use for structured data: lists, rankings, comparisons, statistics. For INTERACTIVE content (calculators, timers, quizzes, games) use create_artifact_from_note instead.',
    inputSchema: z.object({
      noteId: z
        .string()
        .uuid()
        .optional()
        .describe('UUID of the target note. Omit to use the currently open note'),
      title: z
        .string()
        .optional()
        .describe('Optional title heading for the table (rendered as ### heading)'),
      headers: z
        .array(z.string())
        .min(1)
        .describe("Column header names, e.g. ['Name', 'Speed', 'Habitat']"),
      rows: z
        .string()
        .default('')
        .describe(
          'Table data rows as JSON array of arrays, e.g. [["Alice","25"],["Bob","30"]]. Each inner array is one row matching the headers'
        ),
      position: z
        .enum(['start', 'end'])
        .default('end')
        .describe(
          "Where to insert: 'start' for beginning of note, 'end' for after existing content"
        ),
      afterBlockIndex: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe(
          'Insert after this block index (0-based). More precise than position. Call read_note_structure first to find the correct index'
        ),
      afterHeading: z
        .string()
        .optional()
        .describe(
          'Insert after the section with this heading text. More reliable than afterBlockIndex for section-level insertion'
        ),
    }),
    execute: async ({ noteId, title, headers, rows, position, afterBlockIndex, afterHeading }) => {
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

      // Parse rows from JSON string (flattened for Gemini schema compat)
      let parsedRows: string[][] = []
      try {
        if (rows) parsedRows = JSON.parse(rows)
      } catch {
        return 'Failed to parse table rows: invalid JSON. Provide rows as a JSON array of arrays, e.g. [["Alice","25"],["Bob","30"]].'
      }

      const current = (readResult.data as { content?: string }).content || ''
      const tableMarkdown = buildMarkdownTable(headers, parsedRows, title)

      // Resolve target index: explicit afterBlockIndex > afterHeading > position
      let targetIndex: number | undefined = afterBlockIndex

      if (afterHeading && targetIndex === undefined) {
        const parsed = parseMarkdownStructure(current)
        const matches = findBlocksByHeading(parsed, afterHeading)
        if (matches.length > 0) {
          targetIndex = parsed.blocks.indexOf(matches[0])
        }
      }

      let proposedContent: string
      if (targetIndex !== undefined) {
        proposedContent = spliceAtBlockIndex(current, targetIndex, 'insert-after', tableMarkdown)
      } else {
        proposedContent =
          position === 'start'
            ? current
              ? `${tableMarkdown}\n\n${current}`
              : tableMarkdown
            : current
              ? `${current}\n\n${tableMarkdown}`
              : tableMarkdown
      }

      return proposeNoteEdit(ctx, effectiveNoteId, proposedContent, current)
    },
  })

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

  const database_action = tool({
    description:
      'Run operations against EXISTING embedded databases in notes. For creating new data tables from scratch, use insert_table instead. This tool is for querying, inserting, updating, or deleting rows in databases that already exist.',
    inputSchema: z.object({
      action: z
        .enum([
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
        ])
        .describe('The database operation to perform'),
      noteId: z
        .string()
        .uuid()
        .optional()
        .describe('UUID of the note containing the database. Omit to use the currently open note'),
      databaseId: z
        .string()
        .uuid()
        .optional()
        .describe('UUID of the specific database within the note'),
      args: z
        .string()
        .default('{}')
        .describe('JSON-serialized operation arguments (e.g. row data, query filters)'),
    }),
    execute: async ({ action, noteId, databaseId, args }) => {
      const toolName = databaseToolMap[action]
      const effectiveNoteId = resolveNoteId(ctx, noteId)
      if (!toolName) return `Unknown database action: ${action}`
      if (!effectiveNoteId) {
        emitClarification(ctx, 'Please open a note before running a database action.')
        return 'No note selected.'
      }

      // Parse args from JSON string (flattened for Gemini schema compat)
      let parsedArgs: Record<string, unknown> = {}
      try {
        parsedArgs = JSON.parse(args)
      } catch {
        parsedArgs = {}
      }

      const toolArgs: Record<string, unknown> = {
        ...parsedArgs,
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
  })

  const read_memory = tool({
    description:
      'Read stored user preferences, plans, or context from long-term memory. Use for retrieving saved preferences, daily plans, or contextual notes.',
    inputSchema: z.object({
      memoryType: z
        .enum(['preferences', 'plan_index', 'daily', 'today', 'tomorrow', 'context'])
        .default('preferences')
        .describe(
          'Category of memory to read: preferences, plan_index, daily, today, tomorrow, or context'
        ),
      key: z
        .string()
        .optional()
        .describe('Specific memory key to look up. Omit to read the full memory file'),
    }),
    execute: async ({ memoryType, key }) => {
      const result = await executeTool('read_memory_file', { memoryType }, baseCtx)

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
  })

  const write_memory = tool({
    description:
      'Save user preferences, plans, or context to long-term memory. Store concise facts and preferences, not full note bodies.',
    inputSchema: z.object({
      memoryType: z
        .enum(['preferences', 'plan_index', 'daily', 'today', 'tomorrow', 'context'])
        .default('preferences')
        .describe('Category of memory to write to'),
      key: z
        .string()
        .optional()
        .describe('Memory key identifier. Omit for default key based on memoryType'),
      content: z.string().min(1).describe('The content to store. Keep concise — max 2000 chars'),
    }),
    execute: async ({ memoryType, key, content }) => {
      const result = await executeTool('write_memory_file', { memoryType, content }, baseCtx)

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
  })

  const ask_user_preference = tool({
    description:
      "Ask the user a clarifying question BEFORE creating a note or making a major edit. Use when the topic is broad and the user's preference would significantly affect the output. DO NOT overuse — simple or specific requests should proceed directly without asking.",
    inputSchema: z.object({
      question: z
        .string()
        .min(1)
        .describe('The question to ask the user (e.g. "How detailed should this note be?")'),
      options: z
        .array(
          z.object({
            label: z.string().describe('Short label for this option (e.g. "Concise overview")'),
            description: z
              .string()
              .optional()
              .describe('Optional longer description of what this option means'),
          })
        )
        .min(2)
        .max(6)
        .describe('2-6 options for the user to choose from'),
      context: z
        .string()
        .optional()
        .describe('Brief context about why this question matters for the output'),
    }),
    execute: async ({ question, options, context }) => {
      ctx.emitEvent({
        type: 'pre-action-question',
        data: {
          id: crypto.randomUUID(),
          question,
          options: options.map((opt, i) => ({
            id: `opt-${i}`,
            label: opt.label,
            description: opt.description || '',
          })),
          allowFreeText: true,
          context: context || '',
        },
      })
      return 'Question sent to user. Wait for their response before proceeding.'
    },
  })

  const web_search = createWebSearchTool({
    maxResults: 10,
    onSearchStart: (query) =>
      ctx.emitEvent({
        type: 'web-search-start',
        data: { query },
      }),
    onSearchComplete: (results) =>
      ctx.emitEvent({
        type: 'web-search-result',
        data: {
          sources: results.map((r) => ({
            title: r.title,
            url: r.url,
            content: r.content?.slice(0, 150) || '',
            publishedDate: r.publishedDate,
          })),
        },
      }),
  })

  return {
    answer_question_about_note,
    read_note_structure,
    create_note,
    add_paragraph,
    remove_paragraph,
    edit_paragraph,
    create_artifact_from_note,
    insert_table,
    database_action,
    read_memory,
    write_memory,
    ask_user_preference,
    web_search,
  }
}
