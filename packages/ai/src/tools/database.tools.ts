/**
 * Database Tools (10 tools)
 * 
 * Tools for manipulating embedded databases/tables in notes.
 * From Note3: db_add_row, db_update_rows, db_delete_rows, db_query_rows,
 * db_aggregate, db_group_by, db_column_stats, db_sort_rows,
 * db_get_schema, db_create_chart_data
 */

import { z } from 'zod'
import { SupabaseClient } from '@supabase/supabase-js'
import { ToolContext, ToolResult } from './core.tools'

// ============================================================================
// Types for Embedded Databases
// ============================================================================

interface DatabaseRow {
    id: string
    [key: string]: unknown
}

interface EmbeddedDatabase {
    id: string
    name: string
    columns: { name: string; type: string; options?: string[] }[]
    rows: DatabaseRow[]
    createdAt: string
}

// ============================================================================
// Schema Definitions
// ============================================================================

export const DbAddRowSchema = z.object({
    noteId: z.string().uuid().describe('Note containing the database'),
    databaseId: z.string().uuid().describe('ID of the database'),
    data: z.record(z.unknown()).describe('Row data as key-value pairs'),
})

export const DbUpdateRowsSchema = z.object({
    noteId: z.string().uuid().describe('Note containing the database'),
    databaseId: z.string().uuid().describe('ID of the database'),
    filter: z.record(z.unknown()).describe('Filter to match rows'),
    updates: z.record(z.unknown()).describe('Updates to apply'),
})

export const DbDeleteRowsSchema = z.object({
    noteId: z.string().uuid().describe('Note containing the database'),
    databaseId: z.string().uuid().describe('ID of the database'),
    filter: z.record(z.unknown()).describe('Filter to match rows to delete'),
})

export const DbQueryRowsSchema = z.object({
    noteId: z.string().uuid().describe('Note containing the database'),
    databaseId: z.string().uuid().describe('ID of the database'),
    filter: z.record(z.unknown()).optional().describe('Filter criteria'),
    columns: z.array(z.string()).optional().describe('Columns to return'),
    limit: z.number().int().min(1).optional().describe('Maximum rows to return'),
})

export const DbAggregateSchema = z.object({
    noteId: z.string().uuid().describe('Note containing the database'),
    databaseId: z.string().uuid().describe('ID of the database'),
    operation: z.enum(['count', 'sum', 'avg', 'min', 'max']).describe('Aggregation operation'),
    column: z.string().optional().describe('Column to aggregate (required for sum/avg/min/max)'),
    filter: z.record(z.unknown()).optional().describe('Filter before aggregating'),
})

export const DbGroupBySchema = z.object({
    noteId: z.string().uuid().describe('Note containing the database'),
    databaseId: z.string().uuid().describe('ID of the database'),
    groupColumn: z.string().describe('Column to group by'),
    aggregations: z.array(z.object({
        column: z.string(),
        operation: z.enum(['count', 'sum', 'avg', 'min', 'max']),
    })).describe('Aggregations to compute per group'),
})

export const DbColumnStatsSchema = z.object({
    noteId: z.string().uuid().describe('Note containing the database'),
    databaseId: z.string().uuid().describe('ID of the database'),
    column: z.string().describe('Column to analyze'),
})

export const DbSortRowsSchema = z.object({
    noteId: z.string().uuid().describe('Note containing the database'),
    databaseId: z.string().uuid().describe('ID of the database'),
    sortColumn: z.string().describe('Column to sort by'),
    direction: z.enum(['asc', 'desc']).optional().default('asc').describe('Sort direction'),
    limit: z.number().int().min(1).optional().describe('Maximum rows to return'),
})

export const DbGetSchemaSchema = z.object({
    noteId: z.string().uuid().describe('Note containing the database'),
    databaseId: z.string().uuid().describe('ID of the database'),
})

export const DbCreateChartDataSchema = z.object({
    noteId: z.string().uuid().describe('Note containing the database'),
    databaseId: z.string().uuid().describe('ID of the database'),
    chartType: z.enum(['bar', 'line', 'pie', 'scatter']).describe('Type of chart'),
    xColumn: z.string().describe('Column for X axis'),
    yColumn: z.string().describe('Column for Y axis'),
    groupColumn: z.string().optional().describe('Column to group/color by'),
})

// ============================================================================
// Type Exports
// ============================================================================

export type DbAddRowInput = z.infer<typeof DbAddRowSchema>
export type DbUpdateRowsInput = z.infer<typeof DbUpdateRowsSchema>
export type DbDeleteRowsInput = z.infer<typeof DbDeleteRowsSchema>
export type DbQueryRowsInput = z.infer<typeof DbQueryRowsSchema>
export type DbAggregateInput = z.infer<typeof DbAggregateSchema>
export type DbGroupByInput = z.infer<typeof DbGroupBySchema>
export type DbColumnStatsInput = z.infer<typeof DbColumnStatsSchema>
export type DbSortRowsInput = z.infer<typeof DbSortRowsSchema>
export type DbGetSchemaInput = z.infer<typeof DbGetSchemaSchema>
export type DbCreateChartDataInput = z.infer<typeof DbCreateChartDataSchema>

// ============================================================================
// Helper Functions
// ============================================================================

async function getDatabase(
    supabase: SupabaseClient,
    userId: string,
    noteId: string,
    databaseId: string
): Promise<{ database: EmbeddedDatabase; databases: EmbeddedDatabase[]; note: Record<string, unknown> } | null> {
    const { data: note, error } = await supabase
        .from('notes')
        .select('editor_state')
        .eq('id', noteId)
        .eq('user_id', userId)
        .single()

    if (error || !note) return null

    const editorState = (note.editor_state || {}) as { databases?: EmbeddedDatabase[] }
    const databases = editorState.databases || []
    const database = databases.find(db => db.id === databaseId)

    if (!database) return null

    return { database, databases, note }
}

async function saveDatabase(
    supabase: SupabaseClient,
    userId: string,
    noteId: string,
    databases: EmbeddedDatabase[]
): Promise<boolean> {
    const { error } = await supabase
        .from('notes')
        .update({ editor_state: { databases } })
        .eq('id', noteId)
        .eq('user_id', userId)

    return !error
}

function matchesFilter(row: DatabaseRow, filter: Record<string, unknown>): boolean {
    return Object.entries(filter).every(([key, value]) => row[key] === value)
}

// ============================================================================
// Tool Implementations
// ============================================================================

export async function dbAddRow(
    input: DbAddRowInput,
    ctx: ToolContext
): Promise<ToolResult<{ rowId: string }>> {
    try {
        const result = await getDatabase(ctx.supabase, ctx.userId, input.noteId, input.databaseId)
        if (!result) return { success: false, error: 'Database not found' }

        const { database, databases } = result
        const rowId = crypto.randomUUID()
        const newRow: DatabaseRow = { id: rowId, ...input.data }

        database.rows.push(newRow)

        const saved = await saveDatabase(ctx.supabase, ctx.userId, input.noteId, databases)
        if (!saved) return { success: false, error: 'Failed to save' }

        return { success: true, data: { rowId } }
    } catch (err) {
        return { success: false, error: String(err) }
    }
}

export async function dbUpdateRows(
    input: DbUpdateRowsInput,
    ctx: ToolContext
): Promise<ToolResult<{ updatedCount: number }>> {
    try {
        const result = await getDatabase(ctx.supabase, ctx.userId, input.noteId, input.databaseId)
        if (!result) return { success: false, error: 'Database not found' }

        const { database, databases } = result
        let updatedCount = 0

        database.rows = database.rows.map(row => {
            if (matchesFilter(row, input.filter)) {
                updatedCount++
                return { ...row, ...input.updates }
            }
            return row
        })

        const saved = await saveDatabase(ctx.supabase, ctx.userId, input.noteId, databases)
        if (!saved) return { success: false, error: 'Failed to save' }

        return { success: true, data: { updatedCount } }
    } catch (err) {
        return { success: false, error: String(err) }
    }
}

export async function dbDeleteRows(
    input: DbDeleteRowsInput,
    ctx: ToolContext
): Promise<ToolResult<{ deletedCount: number }>> {
    try {
        const result = await getDatabase(ctx.supabase, ctx.userId, input.noteId, input.databaseId)
        if (!result) return { success: false, error: 'Database not found' }

        const { database, databases } = result
        const originalCount = database.rows.length
        database.rows = database.rows.filter(row => !matchesFilter(row, input.filter))
        const deletedCount = originalCount - database.rows.length

        const saved = await saveDatabase(ctx.supabase, ctx.userId, input.noteId, databases)
        if (!saved) return { success: false, error: 'Failed to save' }

        return { success: true, data: { deletedCount } }
    } catch (err) {
        return { success: false, error: String(err) }
    }
}

export async function dbQueryRows(
    input: DbQueryRowsInput,
    ctx: ToolContext
): Promise<ToolResult<{ rows: DatabaseRow[]; total: number }>> {
    try {
        const result = await getDatabase(ctx.supabase, ctx.userId, input.noteId, input.databaseId)
        if (!result) return { success: false, error: 'Database not found' }

        let rows = result.database.rows

        // Apply filter
        if (input.filter) {
            rows = rows.filter(row => matchesFilter(row, input.filter!))
        }

        const total = rows.length

        // Apply limit
        if (input.limit) {
            rows = rows.slice(0, input.limit)
        }

        // Select columns
        if (input.columns) {
            rows = rows.map(row => {
                const selected: DatabaseRow = { id: row.id }
                for (const col of input.columns!) {
                    selected[col] = row[col]
                }
                return selected
            })
        }

        return { success: true, data: { rows, total } }
    } catch (err) {
        return { success: false, error: String(err) }
    }
}

export async function dbAggregate(
    input: DbAggregateInput,
    ctx: ToolContext
): Promise<ToolResult<{ result: number }>> {
    try {
        const dbResult = await getDatabase(ctx.supabase, ctx.userId, input.noteId, input.databaseId)
        if (!dbResult) return { success: false, error: 'Database not found' }

        let rows = dbResult.database.rows
        if (input.filter) {
            rows = rows.filter(row => matchesFilter(row, input.filter!))
        }

        let result: number

        switch (input.operation) {
            case 'count':
                result = rows.length
                break
            case 'sum':
                if (!input.column) return { success: false, error: 'Column required for sum' }
                result = rows.reduce((sum, row) => sum + (Number(row[input.column!]) || 0), 0)
                break
            case 'avg':
                if (!input.column) return { success: false, error: 'Column required for avg' }
                result = rows.length > 0
                    ? rows.reduce((sum, row) => sum + (Number(row[input.column!]) || 0), 0) / rows.length
                    : 0
                break
            case 'min':
                if (!input.column) return { success: false, error: 'Column required for min' }
                result = Math.min(...rows.map(row => Number(row[input.column!]) || Infinity))
                break
            case 'max':
                if (!input.column) return { success: false, error: 'Column required for max' }
                result = Math.max(...rows.map(row => Number(row[input.column!]) || -Infinity))
                break
            default:
                return { success: false, error: 'Unknown operation' }
        }

        return { success: true, data: { result } }
    } catch (err) {
        return { success: false, error: String(err) }
    }
}

export async function dbGroupBy(
    input: DbGroupByInput,
    ctx: ToolContext
): Promise<ToolResult<{ groups: Record<string, Record<string, number>> }>> {
    try {
        const result = await getDatabase(ctx.supabase, ctx.userId, input.noteId, input.databaseId)
        if (!result) return { success: false, error: 'Database not found' }

        const groups: Record<string, Record<string, number>> = {}

        for (const row of result.database.rows) {
            const groupKey = String(row[input.groupColumn] ?? 'null')
            if (!groups[groupKey]) {
                groups[groupKey] = {}
            }

            for (const agg of input.aggregations) {
                const aggKey = `${agg.operation}_${agg.column}`
                if (groups[groupKey][aggKey] === undefined) {
                    groups[groupKey][aggKey] = agg.operation === 'count' ? 0 : (agg.operation === 'min' ? Infinity : (agg.operation === 'max' ? -Infinity : 0))
                }

                const value = Number(row[agg.column]) || 0
                switch (agg.operation) {
                    case 'count':
                        groups[groupKey][aggKey]++
                        break
                    case 'sum':
                        groups[groupKey][aggKey] += value
                        break
                    case 'min':
                        groups[groupKey][aggKey] = Math.min(groups[groupKey][aggKey], value)
                        break
                    case 'max':
                        groups[groupKey][aggKey] = Math.max(groups[groupKey][aggKey], value)
                        break
                }
            }
        }

        return { success: true, data: { groups } }
    } catch (err) {
        return { success: false, error: String(err) }
    }
}

export async function dbColumnStats(
    input: DbColumnStatsInput,
    ctx: ToolContext
): Promise<ToolResult<{
    count: number
    unique: number
    nullCount: number
    type: string
    min?: number
    max?: number
    avg?: number
}>> {
    try {
        const result = await getDatabase(ctx.supabase, ctx.userId, input.noteId, input.databaseId)
        if (!result) return { success: false, error: 'Database not found' }

        const values = result.database.rows.map(row => row[input.column])
        const nonNull = values.filter(v => v != null)
        const unique = new Set(nonNull).size
        const nullCount = values.length - nonNull.length

        const column = result.database.columns.find(c => c.name === input.column)
        const type = column?.type || 'unknown'

        const stats: { count: number; unique: number; nullCount: number; type: string; min?: number; max?: number; avg?: number } = {
            count: values.length,
            unique,
            nullCount,
            type,
        }

        if (type === 'number') {
            const nums = nonNull.map(Number).filter(n => !isNaN(n))
            if (nums.length > 0) {
                stats.min = Math.min(...nums)
                stats.max = Math.max(...nums)
                stats.avg = nums.reduce((a, b) => a + b, 0) / nums.length
            }
        }

        return { success: true, data: stats }
    } catch (err) {
        return { success: false, error: String(err) }
    }
}

export async function dbSortRows(
    input: DbSortRowsInput,
    ctx: ToolContext
): Promise<ToolResult<{ rows: DatabaseRow[] }>> {
    try {
        const result = await getDatabase(ctx.supabase, ctx.userId, input.noteId, input.databaseId)
        if (!result) return { success: false, error: 'Database not found' }

        let rows = [...result.database.rows]

        rows.sort((a, b) => {
            const aVal = a[input.sortColumn]
            const bVal = b[input.sortColumn]

            if (aVal == null) return input.direction === 'asc' ? 1 : -1
            if (bVal == null) return input.direction === 'asc' ? -1 : 1

            if (typeof aVal === 'number' && typeof bVal === 'number') {
                return input.direction === 'asc' ? aVal - bVal : bVal - aVal
            }

            const comparison = String(aVal).localeCompare(String(bVal))
            return input.direction === 'asc' ? comparison : -comparison
        })

        if (input.limit) {
            rows = rows.slice(0, input.limit)
        }

        return { success: true, data: { rows } }
    } catch (err) {
        return { success: false, error: String(err) }
    }
}

export async function dbGetSchema(
    input: DbGetSchemaInput,
    ctx: ToolContext
): Promise<ToolResult<{ name: string; columns: { name: string; type: string }[]; rowCount: number }>> {
    try {
        const result = await getDatabase(ctx.supabase, ctx.userId, input.noteId, input.databaseId)
        if (!result) return { success: false, error: 'Database not found' }

        return {
            success: true,
            data: {
                name: result.database.name,
                columns: result.database.columns,
                rowCount: result.database.rows.length,
            },
        }
    } catch (err) {
        return { success: false, error: String(err) }
    }
}

export async function dbCreateChartData(
    input: DbCreateChartDataInput,
    ctx: ToolContext
): Promise<ToolResult<{ chartData: { labels: string[]; datasets: { label: string; data: number[] }[] } }>> {
    try {
        const result = await getDatabase(ctx.supabase, ctx.userId, input.noteId, input.databaseId)
        if (!result) return { success: false, error: 'Database not found' }

        const rows = result.database.rows

        if (input.groupColumn) {
            // Grouped chart
            const groups = new Map<string, Map<string, number[]>>()

            for (const row of rows) {
                const xVal = String(row[input.xColumn])
                const yVal = Number(row[input.yColumn]) || 0
                const groupVal = String(row[input.groupColumn])

                if (!groups.has(groupVal)) {
                    groups.set(groupVal, new Map())
                }
                const groupData = groups.get(groupVal)!
                if (!groupData.has(xVal)) {
                    groupData.set(xVal, [])
                }
                groupData.get(xVal)!.push(yVal)
            }

            const labels = [...new Set(rows.map(r => String(r[input.xColumn])))]
            const datasets = [...groups.entries()].map(([label, data]) => ({
                label,
                data: labels.map(l => {
                    const vals = data.get(l) || []
                    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
                }),
            }))

            return { success: true, data: { chartData: { labels, datasets } } }
        } else {
            // Simple chart
            const labels = rows.map(r => String(r[input.xColumn]))
            const data = rows.map(r => Number(r[input.yColumn]) || 0)

            return {
                success: true,
                data: {
                    chartData: {
                        labels,
                        datasets: [{ label: input.yColumn, data }],
                    },
                },
            }
        }
    } catch (err) {
        return { success: false, error: String(err) }
    }
}

// ============================================================================
// Tool Definitions for LangGraph
// ============================================================================

export const databaseTools = [
    { name: 'db_add_row', description: 'Add a new row to an embedded database', schema: DbAddRowSchema, execute: dbAddRow },
    { name: 'db_update_rows', description: 'Update rows in an embedded database matching a filter', schema: DbUpdateRowsSchema, execute: dbUpdateRows },
    { name: 'db_delete_rows', description: 'Delete rows from an embedded database matching a filter', schema: DbDeleteRowsSchema, execute: dbDeleteRows },
    { name: 'db_query_rows', description: 'Query rows from an embedded database with optional filtering', schema: DbQueryRowsSchema, execute: dbQueryRows },
    { name: 'db_aggregate', description: 'Perform aggregation (count/sum/avg/min/max) on database rows', schema: DbAggregateSchema, execute: dbAggregate },
    { name: 'db_group_by', description: 'Group database rows and compute aggregations per group', schema: DbGroupBySchema, execute: dbGroupBy },
    { name: 'db_column_stats', description: 'Get statistics for a specific column', schema: DbColumnStatsSchema, execute: dbColumnStats },
    { name: 'db_sort_rows', description: 'Sort database rows by a column', schema: DbSortRowsSchema, execute: dbSortRows },
    { name: 'db_get_schema', description: 'Get the schema (columns and types) of an embedded database', schema: DbGetSchemaSchema, execute: dbGetSchema },
    { name: 'db_create_chart_data', description: 'Generate chart data from database rows', schema: DbCreateChartDataSchema, execute: dbCreateChartData },
] as const
