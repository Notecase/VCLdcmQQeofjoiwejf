/**
 * Table Subagent
 *
 * Specialized subagent for creating and populating database tables.
 * Used by the DeepAgent orchestrator for database_action tasks.
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { executeTool, type ToolContext } from '../../tools'

// ============================================================================
// Types
// ============================================================================

export interface TableSubagentConfig {
  supabase: SupabaseClient
  userId: string
  openaiApiKey: string
  model?: string
}

export interface TableSubagentContext {
  currentNoteId?: string
}

export interface TableColumn {
  name: string
  type: 'text' | 'number' | 'date' | 'boolean'
}

export interface TableData {
  tableName: string
  columns: TableColumn[]
  rows: Record<string, unknown>[]
}

export interface TableSubagentResult {
  success: boolean
  tableName?: string
  rowCount?: number
  databaseId?: string
  error?: string
}

// ============================================================================
// System Prompt
// ============================================================================

export const TABLE_SUBAGENT_PROMPT = `You are a data structuring specialist. Create tables with structured data.

Rules:
- Output a JSON object with: { tableName, columns, rows }
- columns: array of { name, type } where type is 'text' | 'number' | 'date' | 'boolean'
- rows: array of objects matching column names
- Provide accurate, well-researched data
- Use descriptive column names

CRITICAL: Output ONLY valid JSON. No markdown, no explanations.`

// ============================================================================
// Table Subagent
// ============================================================================

export class TableSubagent {
  private supabase: SupabaseClient
  private userId: string
  private openaiApiKey: string
  private model: string
  private context: TableSubagentContext = {}

  constructor(config: TableSubagentConfig) {
    this.supabase = config.supabase
    this.userId = config.userId
    this.openaiApiKey = config.openaiApiKey
    this.model = config.model ?? 'gpt-5.2'
  }

  /**
   * Set the context for table operations
   */
  setContext(context: TableSubagentContext): void {
    this.context = { ...this.context, ...context }
  }

  /**
   * Execute a table creation task with streaming
   */
  async *execute(taskDescription: string): AsyncGenerator<{
    type: 'thinking' | 'progress' | 'data' | 'complete'
    data: unknown
  }> {
    yield { type: 'thinking', data: 'Generating table data...' }

    const OpenAI = (await import('openai')).default
    const client = new OpenAI({ apiKey: this.openaiApiKey })

    const response = await client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: TABLE_SUBAGENT_PROMPT },
        { role: 'user', content: taskDescription },
      ],
      temperature: 0.3,
      max_completion_tokens: 2000,
    })

    const content = response.choices[0]?.message?.content || '{}'

    let tableData: TableData | null = null
    let result: TableSubagentResult = { success: false }

    try {
      const cleaned = content.replace(/```json\n?|\n?```/g, '').trim()
      tableData = JSON.parse(cleaned) as TableData

      yield {
        type: 'data',
        data: tableData,
      }

      // Create table in note if we have a noteId
      if (this.context.currentNoteId && tableData) {
        yield { type: 'progress', data: { progress: 50, message: 'Creating table in note...' } }

        const toolContext: ToolContext = {
          userId: this.userId,
          supabase: this.supabase,
        }

        const createResult = await executeTool(
          'create_database',
          {
            noteId: this.context.currentNoteId,
            name: tableData.tableName || 'Table',
            columns: tableData.columns || [],
          },
          toolContext
        )

        if (createResult.success && tableData.rows && tableData.rows.length > 0) {
          yield { type: 'progress', data: { progress: 75, message: 'Populating table...' } }

          const databaseId = (createResult.data as { databaseId: string })?.databaseId

          if (databaseId) {
            await executeTool(
              'db_insert_rows',
              {
                noteId: this.context.currentNoteId,
                databaseId,
                rows: tableData.rows,
              },
              toolContext
            )

            result = {
              success: true,
              tableName: tableData.tableName,
              rowCount: tableData.rows.length,
              databaseId,
            }
          }
        } else if (createResult.success) {
          const databaseId = (createResult.data as { databaseId: string })?.databaseId
          result = {
            success: true,
            tableName: tableData.tableName,
            rowCount: 0,
            databaseId,
          }
        } else {
          result = {
            success: false,
            error: createResult.error || 'Failed to create table',
          }
        }
      } else if (tableData) {
        // No noteId, just return the data
        result = {
          success: true,
          tableName: tableData.tableName,
          rowCount: tableData.rows?.length || 0,
        }
      }
    } catch (error) {
      result = {
        success: false,
        error: `Failed to parse table data: ${error}`,
      }
    }

    yield { type: 'complete', data: result }
  }

  /**
   * Generate table data without creating in database
   */
  async generateTableData(taskDescription: string): Promise<TableData | null> {
    const OpenAI = (await import('openai')).default
    const client = new OpenAI({ apiKey: this.openaiApiKey })

    const response = await client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: TABLE_SUBAGENT_PROMPT },
        { role: 'user', content: taskDescription },
      ],
      temperature: 0.3,
      max_completion_tokens: 2000,
    })

    const content = response.choices[0]?.message?.content || '{}'

    try {
      const cleaned = content.replace(/```json\n?|\n?```/g, '').trim()
      return JSON.parse(cleaned) as TableData
    } catch {
      return null
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createTableSubagent(config: TableSubagentConfig): TableSubagent {
  return new TableSubagent(config)
}
