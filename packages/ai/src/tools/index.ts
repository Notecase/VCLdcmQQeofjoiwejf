/**
 * AI Tools exports
 *
 * Complete 30-tool system for LangGraph agents.
 *
 * Tool Categories:
 * - Core Editing (8): read_block, read_note, edit_block, search_web, create_artifact, create_database, read_memory_file, write_memory_file
 * - Database (10): db_add_row, db_update_rows, db_delete_rows, db_query_rows, db_aggregate, db_group_by, db_column_stats, db_sort_rows, db_get_schema, db_create_chart_data
 * - Artifact (10): artifact_modify_html, artifact_modify_css, artifact_modify_js, artifact_parse_structure, artifact_get_css_rules, artifact_validate, artifact_get_js_functions, artifact_extract_dependencies, artifact_optimize, artifact_get_colors
 * - Secretary (7): create_roadmap, save_roadmap, list_memory_files, delete_memory_file, get_roadmap, advance_roadmap_week, get_current_week_tasks
 */

import { z } from 'zod'

// ============================================================================
// Core Types
// ============================================================================

export type { ToolContext, ToolResult } from './core.tools'

// ============================================================================
// Core Editing Tools (8)
// ============================================================================

export {
  // Schemas
  ReadBlockSchema,
  ReadNoteSchema,
  EditBlockSchema,
  SearchWebSchema,
  CreateArtifactSchema,
  CreateDatabaseSchema,
  ReadMemorySchema,
  WriteMemorySchema,
  InsertMarkdownTableSchema,
  // Types
  type ReadBlockInput,
  type ReadNoteInput,
  type EditBlockInput,
  type SearchWebInput,
  type CreateArtifactInput,
  type CreateDatabaseInput,
  type ReadMemoryInput,
  type WriteMemoryInput,
  type InsertMarkdownTableInput,
  // Functions
  readBlock,
  readNote,
  editBlock,
  searchWeb,
  createArtifact,
  createDatabase,
  readMemory,
  writeMemory,
  insertMarkdownTable,
  // Tool definitions
  coreEditingTools,
} from './core.tools'

// ============================================================================
// Database Tools (10)
// ============================================================================

export {
  // Schemas
  DbAddRowSchema,
  DbUpdateRowsSchema,
  DbDeleteRowsSchema,
  DbQueryRowsSchema,
  DbAggregateSchema,
  DbGroupBySchema,
  DbColumnStatsSchema,
  DbSortRowsSchema,
  DbGetSchemaSchema,
  DbCreateChartDataSchema,
  DbInsertRowsSchema,
  // Types
  type DbAddRowInput,
  type DbUpdateRowsInput,
  type DbDeleteRowsInput,
  type DbQueryRowsInput,
  type DbAggregateInput,
  type DbGroupByInput,
  type DbColumnStatsInput,
  type DbSortRowsInput,
  type DbGetSchemaInput,
  type DbCreateChartDataInput,
  type DbInsertRowsInput,
  // Functions
  dbAddRow,
  dbUpdateRows,
  dbDeleteRows,
  dbQueryRows,
  dbAggregate,
  dbGroupBy,
  dbColumnStats,
  dbSortRows,
  dbGetSchema,
  dbCreateChartData,
  dbInsertRows,
  // Tool definitions
  databaseTools,
} from './database.tools'

// ============================================================================
// Artifact Tools (6)
// ============================================================================

export {
  // Schemas
  ArtifactModifyHtmlSchema,
  ArtifactModifyCssSchema,
  ArtifactModifyJsSchema,
  ArtifactParseStructureSchema,
  ArtifactGetCssRulesSchema,
  ArtifactValidateSchema,
  ArtifactGetJsFunctionsSchema,
  ArtifactExtractDependenciesSchema,
  ArtifactOptimizeSchema,
  ArtifactGetColorsSchema,
  // Types
  type ArtifactModifyHtmlInput,
  type ArtifactModifyCssInput,
  type ArtifactModifyJsInput,
  type ArtifactParseStructureInput,
  type ArtifactGetCssRulesInput,
  type ArtifactValidateInput,
  type ArtifactGetJsFunctionsInput,
  type ArtifactExtractDependenciesInput,
  type ArtifactOptimizeInput,
  type ArtifactGetColorsInput,
  // Functions
  artifactModifyHtml,
  artifactModifyCss,
  artifactModifyJs,
  artifactParseStructure,
  artifactGetCssRules,
  artifactValidate,
  artifactGetJsFunctions,
  artifactExtractDependencies,
  artifactOptimize,
  artifactGetColors,
  // Tool definitions
  artifactTools,
} from './artifact.tools'

// ============================================================================
// Secretary/Planner Tools (7)
// ============================================================================

export {
  // Schemas
  CreateRoadmapSchema,
  SaveRoadmapSchema,
  ListMemoryFilesSchema,
  DeleteMemorySchema,
  GetRoadmapSchema,
  AdvanceRoadmapWeekSchema,
  GetCurrentWeekTasksSchema,
  // Types
  type CreateRoadmapInput,
  type SaveRoadmapInput,
  type ListMemoryFilesInput,
  type DeleteMemoryInput,
  type GetRoadmapInput,
  type AdvanceRoadmapWeekInput,
  type GetCurrentWeekTasksInput,
  // Functions
  createRoadmap,
  saveRoadmap,
  listMemoryFiles,
  deleteMemory,
  getRoadmap,
  advanceRoadmapWeek,
  getCurrentWeekTasks,
  // Tool definitions
  secretaryTools,
} from './secretary.tools'

// ============================================================================
// Combined Tool Registry
// ============================================================================

import { coreEditingTools } from './core.tools'
import { databaseTools } from './database.tools'
import { artifactTools } from './artifact.tools'
import { secretaryTools } from './secretary.tools'

/**
 * All 26 tools combined
 */
export const allTools = [
  ...coreEditingTools,
  ...databaseTools,
  ...artifactTools,
  ...secretaryTools,
] as const

/**
 * Tool names by category
 */
export const toolNames = {
  core: coreEditingTools.map((t) => t.name),
  database: databaseTools.map((t) => t.name),
  artifact: artifactTools.map((t) => t.name),
  secretary: secretaryTools.map((t) => t.name),
  all: allTools.map((t) => t.name),
} as const

/**
 * Get tool by name
 */
export function getToolByName(name: string) {
  return allTools.find((t) => t.name === name)
}

/**
 * Get tools by category
 */
export function getToolsByCategory(category: 'core' | 'database' | 'artifact' | 'secretary') {
  switch (category) {
    case 'core':
      return coreEditingTools
    case 'database':
      return databaseTools
    case 'artifact':
      return artifactTools
    case 'secretary':
      return secretaryTools
  }
}

// ============================================================================
// Tool Executor
// ============================================================================

import { ToolContext, ToolResult } from './core.tools'

/**
 * Execute a tool by name with input and context
 */
export async function executeTool(
  toolName: string,
  input: unknown,
  context: ToolContext
): Promise<ToolResult> {
  const tool = getToolByName(toolName)

  if (!tool) {
    return { success: false, error: `Unknown tool: ${toolName}` }
  }

  try {
    // Validate input against schema
    const validatedInput = tool.schema.parse(input)

    // Execute tool - use type assertion to handle heterogeneous tool signatures
    const executeFunc = tool.execute as (input: unknown, ctx: ToolContext) => Promise<ToolResult>
    return await executeFunc(validatedInput, context)
  } catch (err) {
    if (err instanceof z.ZodError) {
      return {
        success: false,
        error: `Invalid input: ${err.errors.map((e) => e.message).join(', ')}`,
      }
    }
    return { success: false, error: String(err) }
  }
}

/**
 * Tool metadata for UI display
 */
export const TOOL_METADATA: Record<
  string,
  { label: string; description: string; category: string }
> = {
  // Core
  read_block: {
    label: 'Read Block',
    description: 'Read a specific block from a note',
    category: 'core',
  },
  read_note: {
    label: 'Read Note',
    description: 'Read entire note with metadata',
    category: 'core',
  },
  edit_block: {
    label: 'Edit Block',
    description: 'Edit a block or note content',
    category: 'core',
  },
  search_web: {
    label: 'Web Search',
    description: 'Search the web for information',
    category: 'core',
  },
  create_artifact: {
    label: 'Create Artifact',
    description: 'Create HTML/CSS/JS visualization',
    category: 'core',
  },
  create_database: {
    label: 'Create Database',
    description: 'Create embedded database',
    category: 'core',
  },
  read_memory_file: { label: 'Read Memory', description: 'Read AI memory', category: 'core' },
  write_memory_file: { label: 'Write Memory', description: 'Write AI memory', category: 'core' },
  insert_markdown_table: {
    label: 'Insert Table',
    description: 'Insert a markdown table into a note',
    category: 'core',
  },
  // Database
  db_add_row: { label: 'Add Row', description: 'Add row to database', category: 'database' },
  db_insert_rows: {
    label: 'Insert Rows',
    description: 'Bulk insert multiple rows',
    category: 'database',
  },
  db_update_rows: {
    label: 'Update Rows',
    description: 'Update matching rows',
    category: 'database',
  },
  db_delete_rows: {
    label: 'Delete Rows',
    description: 'Delete matching rows',
    category: 'database',
  },
  db_query_rows: { label: 'Query Rows', description: 'Query database rows', category: 'database' },
  db_aggregate: { label: 'Aggregate', description: 'Compute aggregations', category: 'database' },
  db_group_by: { label: 'Group By', description: 'Group and aggregate', category: 'database' },
  db_column_stats: {
    label: 'Column Stats',
    description: 'Get column statistics',
    category: 'database',
  },
  db_sort_rows: { label: 'Sort Rows', description: 'Sort database rows', category: 'database' },
  db_get_schema: { label: 'Get Schema', description: 'Get database schema', category: 'database' },
  db_create_chart_data: {
    label: 'Chart Data',
    description: 'Generate chart data',
    category: 'database',
  },
  // Artifact
  artifact_modify_html: {
    label: 'Modify HTML',
    description: 'Modify artifact HTML',
    category: 'artifact',
  },
  artifact_modify_css: {
    label: 'Modify CSS',
    description: 'Modify artifact CSS',
    category: 'artifact',
  },
  artifact_modify_js: {
    label: 'Modify JS',
    description: 'Modify artifact JavaScript',
    category: 'artifact',
  },
  artifact_parse_structure: {
    label: 'Parse Structure',
    description: 'Parse HTML structure',
    category: 'artifact',
  },
  artifact_get_css_rules: {
    label: 'Get CSS Rules',
    description: 'Extract CSS rules',
    category: 'artifact',
  },
  artifact_validate: {
    label: 'Validate',
    description: 'Validate artifact syntax',
    category: 'artifact',
  },
  artifact_get_js_functions: {
    label: 'Get JS Functions',
    description: 'Extract JavaScript functions',
    category: 'artifact',
  },
  artifact_extract_dependencies: {
    label: 'Extract Dependencies',
    description: 'Find imports and CDN links',
    category: 'artifact',
  },
  artifact_optimize: {
    label: 'Optimize',
    description: 'Optimize code for size/performance/a11y',
    category: 'artifact',
  },
  artifact_get_colors: {
    label: 'Get Colors',
    description: 'Extract color palette from CSS',
    category: 'artifact',
  },
  // Secretary
  create_roadmap: {
    label: 'Create Roadmap',
    description: 'Create learning roadmap',
    category: 'secretary',
  },
  save_roadmap: {
    label: 'Save Roadmap',
    description: 'Save roadmap changes',
    category: 'secretary',
  },
  list_memory_files: {
    label: 'List Memory',
    description: 'List all memory types',
    category: 'secretary',
  },
  delete_memory_file: {
    label: 'Delete Memory',
    description: 'Delete memory type',
    category: 'secretary',
  },
  get_roadmap: { label: 'Get Roadmap', description: 'Get roadmap details', category: 'secretary' },
  advance_roadmap_week: {
    label: 'Advance Week',
    description: 'Advance to next week',
    category: 'secretary',
  },
  get_current_week_tasks: {
    label: 'Week Tasks',
    description: 'Get current week tasks',
    category: 'secretary',
  },
}
