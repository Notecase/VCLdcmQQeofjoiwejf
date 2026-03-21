/**
 * Deep Agent Orchestrator
 *
 * Implements task decomposition and subagent delegation using the deepagents pattern.
 * Handles compound requests by breaking them into sub-tasks and delegating to
 * specialized subagents (note, artifact, table).
 *
 * Key capabilities:
 * - Task decomposition via write_todos pattern
 * - Subagent delegation for isolated context
 * - Progress tracking via streaming events
 * - Result aggregation from multiple subagents
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { NoteAgent } from './note.agent'
import { isCreateOperation } from '../utils'
import type { ToolContext } from '../tools'
import { selectModel } from '../providers/model-registry'
import { createOpenAIClient } from '../providers/client-factory'
import { trackOpenAIStream, trackOpenAIResponse } from '../providers/token-tracker'
import type { SharedContextService } from '../services/shared-context.service'

// ============================================================================
// Types
// ============================================================================

export interface DeepAgentConfig {
  supabase: SupabaseClient
  userId: string
  openaiApiKey: string
  model?: string
  sharedContextService?: SharedContextService
}

export interface SubTask {
  id: string
  type: 'edit_note' | 'create_artifact' | 'database_action' | 'chat'
  description: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  dependsOn?: string[]
  result?: unknown
}

export interface DecompositionResult {
  tasks: SubTask[]
  reasoning: string
}

export type DeepAgentEventType =
  | 'decomposition'
  | 'subtask-start'
  | 'subtask-progress'
  | 'subtask-complete'
  | 'artifact'
  | 'edit-proposal'
  | 'note-navigate'
  | 'text-delta'
  | 'thinking'
  | 'finish'
  | 'error'

export interface DeepAgentEvent {
  type: DeepAgentEventType
  data: unknown
}

// ============================================================================
// Decomposition Prompt
// ============================================================================

const DECOMPOSITION_PROMPT = `You are a task decomposition system for a note-taking application. Break user requests into discrete sub-tasks.

CRITICAL RULES:
1. If request mentions "create/make/build [widget/timer/calculator/chart/visualization/interactive]" → create_artifact task
2. If request mentions "note/document/write about" → edit_note task
3. If request mentions "table/list/data" with specific rows/items → database_action task
4. Compound requests with "and", "also", or commas → MULTIPLE sub-tasks
5. Always create separate tasks for different output types

TASK TYPES:
- edit_note: Creating or editing markdown content in notes
- create_artifact: Creating interactive HTML/CSS/JS components (timers, calculators, charts, games, visualizations)
- database_action: Creating or populating tables with structured data
- chat: General conversation or questions that don't require creating content

EXAMPLES:

Request: "make a note about animals in Africa, and has a table of top 5 fastest animals, and create a study timer"
Tasks:
1. { type: "edit_note", description: "Create note about animals in Africa" }
2. { type: "database_action", description: "Create table with top 5 fastest animals in Africa" }
3. { type: "create_artifact", description: "Create interactive study timer widget" }

Request: "write about black holes with a table of largest ones and a visualization"
Tasks:
1. { type: "edit_note", description: "Write content about black holes" }
2. { type: "database_action", description: "Create table of largest black holes" }
3. { type: "create_artifact", description: "Create black hole size visualization" }

Request: "expand this paragraph"
Tasks:
1. { type: "edit_note", description: "Expand the selected paragraph" }

Request: "create a pomodoro timer for studying"
Tasks:
1. { type: "create_artifact", description: "Create interactive pomodoro timer for studying" }

Output valid JSON only:
{
  "tasks": [
    { "id": "1", "type": "edit_note|create_artifact|database_action|chat", "description": "task description", "dependsOn": [] }
  ],
  "reasoning": "Brief explanation of why these tasks were identified"
}`

// ============================================================================
// Subagent Definitions
// ============================================================================

const ARTIFACT_SUBAGENT_PROMPT = `You are an interactive component developer. Create HTML/CSS/JS artifacts like timers, calculators, charts, games, and visualizations.

Rules:
- HTML should be inner HTML only (no <html>, <head>, <body> tags)
- Make components visually appealing with modern CSS (dark theme, gradients, shadows)
- Include interactivity with vanilla JavaScript
- Do NOT use localStorage or sessionStorage (sandboxed iframe)
- Keep all state in memory variables
- Use Tailwind CSS classes when helpful (available via CDN)

CRITICAL OUTPUT FORMAT:
Your response MUST be ONLY a single JSON object with NO other text before or after.
Start your response with { and end with }

Example format:
{
  "title": "Study Timer",
  "html": "<div class='timer-container'>...</div>",
  "css": ".timer-container { ... }",
  "javascript": "let seconds = 0; function startTimer() { ... }"
}

Do NOT include:
- Any text before the opening {
- Any text after the closing }
- Markdown code fences
- Explanations or comments outside the JSON`

const TABLE_SUBAGENT_PROMPT = `You are a data structuring specialist. Create tables with structured data.

Rules:
- Output a JSON object with: { title, headers, rows }
- title: short descriptive title for the table
- headers: array of column header strings (e.g., ["Bird", "Speed (km/h)", "Region"])
- rows: array of arrays, each inner array is a row matching headers order (e.g., [["Peregrine Falcon", "389", "Worldwide"]])
- Provide accurate, well-researched data
- Include units in headers where relevant (e.g., "Speed (km/h)")
- Sort data appropriately (fastest first, largest first, etc.)

CRITICAL: Output ONLY valid JSON. No markdown, no explanations.`

// ============================================================================
// Artifact System Prompt (extracted from OllamaCloudProvider.generateArtifact)
// ============================================================================

const ARTIFACT_SYSTEM_PROMPT = `You are an interactive artifact generator. Create engaging, self-contained web components.

IMPORTANT: Your response MUST be valid JSON with this exact structure:
{
  "title": "Short descriptive title for the artifact",
  "html": "HTML content (without doctype, html, head, body tags - just the inner content)",
  "css": "CSS styles (will be placed in a style tag)",
  "javascript": "JavaScript code (React and ReactDOM are available, use JSX syntax)"
}

Guidelines:
- Use Tailwind CSS classes for styling (available via CDN)
- React 18 and ReactDOM are available globally
- Use Babel for JSX transformation (available)
- Keep code clean, well-organized, and self-contained
- The artifact should be interactive and visually appealing
- Handle errors gracefully in JavaScript

Create a complete, polished component with rich HTML structure, beautiful CSS styling, and interactive JavaScript.`

// ============================================================================
// Deep Agent Class
// ============================================================================

export class InkdownDeepAgent {
  private supabase: SupabaseClient
  private userId: string
  private openaiApiKey: string
  private model: string
  private client: import('openai').default // Shared OpenAI client for Gemini tasks
  private artifactClient: import('openai').default // OpenAI client for Ollama artifact tasks
  private sharedContextService?: SharedContextService
  private context: {
    currentNoteId?: string
    projectId?: string
    generatedContent?: string // Content from preceding edit_note task (may not be saved to DB yet)
  } = {}

  constructor(config: DeepAgentConfig) {
    this.supabase = config.supabase
    this.userId = config.userId
    this.openaiApiKey = config.openaiApiKey
    this.model = config.model ?? selectModel('chat').id
    this.sharedContextService = config.sharedContextService

    // Initialize clients via centralized model registry + client factory
    this.client = createOpenAIClient(selectModel('chat'))
    this.artifactClient = createOpenAIClient(selectModel('artifact'))
  }

  /**
   * Check if a message is a compound request requiring decomposition
   */
  static isCompoundRequest(message: string): boolean {
    const lower = message.toLowerCase()

    // Pattern 1: Multiple action verbs
    const actionVerbs = ['create', 'make', 'build', 'write', 'add', 'generate']
    const verbCount = actionVerbs.filter((verb) => lower.includes(verb)).length

    // Pattern 2: Conjunctions indicating multiple tasks
    const hasConjunction = /\b(and\s+(also\s+)?|,\s*(and\s+)?|also|plus)\b/.test(lower)

    // Pattern 3: Multiple output types mentioned
    const outputTypes = [
      'note',
      'table',
      'timer',
      'chart',
      'calculator',
      'widget',
      'visualization',
      'artifact',
    ]
    const outputCount = outputTypes.filter((type) => lower.includes(type)).length

    // Compound if: multiple verbs + conjunction, OR multiple output types
    return (verbCount >= 2 && hasConjunction) || outputCount >= 2
  }

  /**
   * Stream execution of a compound request
   */
  async *stream(input: {
    message: string
    context?: {
      currentNoteId?: string
      projectId?: string
    }
  }): AsyncGenerator<DeepAgentEvent> {
    // Update context
    if (input.context) {
      this.context = { ...this.context, ...input.context }
    }

    yield { type: 'thinking', data: 'Analyzing your request...' }

    // Read shared context to enrich decomposition
    let sharedCtx = ''
    if (this.sharedContextService) {
      try {
        sharedCtx = await this.sharedContextService.read({
          relevantTypes: ['active_plan', 'research_done', 'note_created', 'note_edited'],
        })
      } catch {
        // Graceful degradation
      }
    }

    // Step 1: Decompose the request into sub-tasks
    const decomposition = await this.decomposeRequest(input.message, sharedCtx)

    yield {
      type: 'decomposition',
      data: { tasks: decomposition.tasks, reasoning: decomposition.reasoning },
    }

    yield { type: 'thinking', data: `Identified ${decomposition.tasks.length} task(s) to complete` }

    // Step 2: Capture baseline content (what the editor currently shows)
    // This will be used as the `original` in the final merged edit-proposal
    let baselineContent = ''
    if (this.context.currentNoteId) {
      const { data: note } = await this.supabase
        .from('notes')
        .select('content')
        .eq('id', this.context.currentNoteId)
        .eq('user_id', this.userId)
        .single()
      baselineContent = (note as { content: string } | null)?.content || ''
    }

    // Track content state before each subtask for incremental edit-proposals
    let previousContent = baselineContent

    // Step 3: Execute each sub-task
    const results: Array<{ taskId: string; result: unknown }> = []

    for (const task of decomposition.tasks) {
      // Check dependencies
      const dependenciesComplete = (task.dependsOn || []).every((depId) =>
        results.some((r) => r.taskId === depId)
      )

      if (!dependenciesComplete) {
        yield {
          type: 'error',
          data: `Task ${task.id} has unmet dependencies`,
        }
        continue
      }

      yield {
        type: 'subtask-start',
        data: { taskId: task.id, type: task.type, description: task.description },
      }

      try {
        // Execute the subtask and stream progress
        for await (const event of this.executeSubTask(task, input.message)) {
          // Pass through events from subagent
          yield event
        }

        task.status = 'completed'

        yield {
          type: 'subtask-complete',
          data: { taskId: task.id, result: task.result },
        }

        results.push({ taskId: task.id, result: task.result })

        // Propagate context from completed tasks so subsequent tasks
        // can reference results (e.g., new noteId, generated content)
        if (task.type === 'edit_note' && task.result) {
          const noteResult = task.result as { noteId?: string; content?: string }
          if (noteResult.noteId) {
            // If this is a newly created note, tell the frontend to navigate to it
            if (noteResult.noteId !== this.context.currentNoteId) {
              yield { type: 'note-navigate', data: { noteId: noteResult.noteId } }
            }
            this.context.currentNoteId = noteResult.noteId
          }
          if (noteResult.content) {
            this.context.generatedContent = noteResult.content
          }
        }

        // Emit incremental edit-proposal after content-producing subtasks
        // Always emit — including for newly created notes — so the frontend
        // can show green diff blocks for review (the frontend resets the
        // pre-loaded editor content to allow diff injection).
        if (
          (task.type === 'edit_note' || task.type === 'database_action') &&
          this.context.currentNoteId &&
          this.context.generatedContent &&
          this.context.generatedContent !== previousContent
        ) {
          yield {
            type: 'edit-proposal',
            data: {
              noteId: this.context.currentNoteId,
              original: previousContent,
              proposed: this.context.generatedContent,
            },
          }
          previousContent = this.context.generatedContent
        }
      } catch (error) {
        task.status = 'failed'
        yield {
          type: 'error',
          data: { taskId: task.id, error: String(error) },
        }
      }
    }

    // Write shared context entry after all subtasks complete
    if (this.sharedContextService) {
      const completedTasks = decomposition.tasks.filter((t) => t.status === 'completed')
      if (completedTasks.length > 0) {
        const hasCreate = completedTasks.some((t) => t.type === 'edit_note' && !this.context.currentNoteId)
        try {
          await this.sharedContextService.write({
            agent: 'deep',
            type: hasCreate ? 'note_created' : 'note_edited',
            summary: `Deep agent completed ${completedTasks.length} task(s): ${input.message.slice(0, 80)}`,
            payload: {
              taskCount: completedTasks.length,
              taskTypes: completedTasks.map((t) => t.type),
              noteId: this.context.currentNoteId,
            },
          })
        } catch {
          // Best-effort — swallow errors
        }
      }
    }

    // Step 4: Generate summary
    const completedCount = decomposition.tasks.filter((t) => t.status === 'completed').length

    yield {
      type: 'text-delta',
      data: `Completed ${completedCount} of ${decomposition.tasks.length} tasks.`,
    }

    yield {
      type: 'finish',
      data: { tasksCompleted: completedCount, totalTasks: decomposition.tasks.length },
    }
  }

  /**
   * Decompose a request into sub-tasks using LLM
   */
  private async decomposeRequest(message: string, sharedCtx?: string): Promise<DecompositionResult> {
    const userContent = sharedCtx ? `${message}\n\n${sharedCtx}` : message

    const startTime = Date.now()
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: DECOMPOSITION_PROMPT },
        { role: 'user', content: userContent },
      ],
      temperature: 0.3,
      max_completion_tokens: 1000,
    })

    trackOpenAIResponse(response, { model: this.model, taskType: 'planner', startTime })

    const content = response.choices[0]?.message?.content || '{}'

    try {
      // Clean up potential markdown formatting
      const cleaned = content.replace(/```json\n?|\n?```/g, '').trim()
      const parsed = JSON.parse(cleaned)

      return {
        tasks: (parsed.tasks || []).map(
          (
            t: { id?: string; type?: string; description?: string; dependsOn?: string[] },
            idx: number
          ) => ({
            id: t.id || String(idx + 1),
            type: t.type || 'chat',
            description: t.description || '',
            status: 'pending' as const,
            dependsOn: t.dependsOn || [],
          })
        ),
        reasoning: parsed.reasoning || '',
      }
    } catch {
      // Fallback: single task
      return {
        tasks: [
          {
            id: '1',
            type: 'edit_note',
            description: message,
            status: 'pending',
            dependsOn: [],
          },
        ],
        reasoning: 'Could not parse decomposition, treating as single task',
      }
    }
  }

  /**
   * Execute a single sub-task
   */
  private async *executeSubTask(
    task: SubTask,
    originalMessage: string
  ): AsyncGenerator<DeepAgentEvent> {
    const toolContext: ToolContext = {
      userId: this.userId,
      supabase: this.supabase,
    }

    switch (task.type) {
      case 'edit_note':
        yield* this.executeNoteTask(task, originalMessage)
        break

      case 'create_artifact':
        yield* this.executeArtifactTask(task, originalMessage)
        break

      case 'database_action':
        yield* this.executeTableTask(task, toolContext)
        break

      case 'chat':
      default:
        yield* this.executeChatTask(task)
        break
    }
  }

  /**
   * Execute a note editing task
   */
  private async *executeNoteTask(
    task: SubTask,
    _originalMessage: string
  ): AsyncGenerator<DeepAgentEvent> {
    yield { type: 'thinking', data: 'Creating note content...' }

    const noteAgent = new NoteAgent({
      supabase: this.supabase,
      userId: this.userId,
      openaiApiKey: this.openaiApiKey,
      model: this.model,
    })

    // Determine if we're creating or updating
    // Use shared isCreateOperation() to detect "create a note" intent,
    // even when a note is currently open (e.g., "create a new note about X")
    const isCreate =
      !this.context.currentNoteId ||
      isCreateOperation(task.description, !!this.context.currentNoteId)

    const stream = noteAgent.stream({
      action: isCreate ? 'create' : 'update',
      input: task.description,
      noteId: this.context.currentNoteId,
      projectId: this.context.projectId,
      options: { skipAutoSave: !isCreate }, // For updates, skip auto-save (use edit proposal)
    })

    let fullContent = ''

    for await (const chunk of stream) {
      if (chunk.type === 'text-delta') {
        fullContent += chunk.data as string
        yield {
          type: 'subtask-progress',
          data: {
            taskId: task.id,
            progress: Math.min(90, fullContent.length / 20),
            message: 'Generating content...',
          },
        }
      } else if (chunk.type === 'thinking') {
        yield { type: 'thinking', data: chunk.data as string }
      } else if (chunk.type === 'finish') {
        const finishData = chunk.data as { success: boolean; noteId?: string }
        if (finishData.success) {
          task.result = { noteId: finishData.noteId, content: fullContent }
          // Content is accumulated in context.generatedContent via stream() context propagation.
          // The final merged edit-proposal is emitted after all tasks complete.
        }
      }
    }
  }

  /**
   * Execute an artifact creation task
   * Uses artifact model from model registry for artifact generation
   */
  private async *executeArtifactTask(
    task: SubTask,
    originalMessage: string
  ): AsyncGenerator<DeepAgentEvent> {
    yield { type: 'thinking', data: 'Creating interactive artifact...' }

    // Enrich task description with original context for better understanding
    const enrichedDescription = `${task.description}\n\nOriginal user request context: "${originalMessage}"`

    let fullContent = ''
    let lastProgressUpdate = 0
    const progressInterval = 500 // Update progress every 500ms
    const artifactModel = selectModel('artifact')

    try {
      const rawStream = await this.artifactClient.chat.completions.create({
        model: artifactModel.id,
        messages: [
          { role: 'system', content: ARTIFACT_SYSTEM_PROMPT },
          { role: 'user', content: enrichedDescription },
        ],
        temperature: 0.3,
        max_completion_tokens: 20000,
        stream: true,
        stream_options: { include_usage: true },
      })

      for await (const chunk of trackOpenAIStream(rawStream, {
        model: artifactModel.id, taskType: 'artifact',
      })) {
        const delta = chunk.choices[0]?.delta?.content
        if (delta) {
          fullContent += delta

          // Emit progress updates at intervals
          const now = Date.now()
          if (now - lastProgressUpdate > progressInterval) {
            lastProgressUpdate = now

            // Detect current generation phase based on content markers
            const phase = this.detectArtifactPhase(fullContent)

            // Emit code-preview for streaming visualization in UI
            yield {
              type: 'code-preview' as DeepAgentEventType,
              data: {
                phase,
                preview: fullContent.slice(-200), // Last 200 chars as preview
                totalChars: fullContent.length,
              },
            }

            yield {
              type: 'subtask-progress',
              data: {
                taskId: task.id,
                progress: Math.min(90, fullContent.length / 50),
                message: `Generating ${phase.toUpperCase()} code...`,
              },
            }
          }
        }
      }
    } catch (error) {
      console.error('[DeepAgent] Artifact generation failed:', error)
      yield {
        type: 'error',
        data: {
          taskId: task.id,
          error: `Artifact generation failed: ${error}`,
        },
      }
      task.status = 'failed'
      task.result = { error: String(error) }
      return
    }

    // Parse the artifact
    let artifact = this.parseArtifactContent(fullContent, task.description)

    // If parsing failed (all fields empty), retry with more explicit instructions
    if (!artifact.html && !artifact.css && !artifact.javascript) {
      console.warn('[DeepAgent] First artifact attempt returned empty content. Retrying...')

      try {
        let retryContent = ''
        const retryPrompt = `${enrichedDescription}\n\nIMPORTANT: Your response MUST be a valid JSON object with title, html, css, and javascript fields. The html field MUST contain component markup. Start with { and end with }`

        const retryRawStream = await this.artifactClient.chat.completions.create({
          model: artifactModel.id,
          messages: [
            { role: 'system', content: ARTIFACT_SYSTEM_PROMPT },
            { role: 'user', content: retryPrompt },
          ],
          temperature: 0.3,
          max_completion_tokens: 20000,
          stream: true,
          stream_options: { include_usage: true },
        })

        for await (const chunk of trackOpenAIStream(retryRawStream, {
          model: artifactModel.id, taskType: 'artifact',
        })) {
          const delta = chunk.choices[0]?.delta?.content
          if (delta) {
            retryContent += delta
          }
        }

        console.log(
          '[DeepAgent] Artifact retry response (first 500 chars):',
          retryContent.slice(0, 500)
        )
        artifact = this.parseArtifactContent(retryContent, task.description)
      } catch (retryError) {
        console.error('[DeepAgent] Artifact retry failed:', retryError)
      }
    }

    // Validate the artifact has actual content after potential retry
    if (!artifact.html && !artifact.css && !artifact.javascript) {
      console.error(
        '[DeepAgent] Artifact has no code content after parsing and retry. Task:',
        task.description
      )
      yield {
        type: 'error',
        data: {
          taskId: task.id,
          error:
            'Failed to generate artifact code. The AI response could not be parsed into HTML/CSS/JavaScript. Please try again with a more specific description.',
        },
      }
      task.status = 'failed'
      task.result = { error: 'Empty artifact content' }
      return
    }

    task.result = artifact

    yield {
      type: 'artifact',
      data: {
        title: artifact.title,
        html: artifact.html,
        css: artifact.css,
        javascript: artifact.javascript,
        noteId: this.context.currentNoteId || null,
      },
    }
  }

  /**
   * Execute a table/database task
   * Generates GFM markdown table for immediate visual rendering
   */
  private async *executeTableTask(
    task: SubTask,
    _toolContext: ToolContext
  ): AsyncGenerator<DeepAgentEvent> {
    yield { type: 'thinking', data: 'Creating table data...' }

    const startTime = Date.now()
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: TABLE_SUBAGENT_PROMPT },
        { role: 'user', content: task.description },
      ],
      temperature: 0.3,
      max_completion_tokens: 2000,
    })

    trackOpenAIResponse(response, { model: this.model, taskType: 'table', startTime })

    const content = response.choices[0]?.message?.content || '{}'

    try {
      const cleaned = content.replace(/```json\n?|\n?```/g, '').trim()
      const tableData = JSON.parse(cleaned) as {
        title?: string
        headers?: string[]
        rows?: string[][]
      }

      yield {
        type: 'subtask-progress',
        data: { taskId: task.id, progress: 50, message: 'Formatting table...' },
      }

      // Convert to GFM markdown table for visual rendering
      const tableMarkdown = this.convertToGFMTable(tableData)

      // Store the markdown table as the result
      task.result = {
        title: tableData.title,
        rowCount: tableData.rows?.length || 0,
        markdown: tableMarkdown,
      }

      yield {
        type: 'subtask-progress',
        data: { taskId: task.id, progress: 90, message: 'Table ready' },
      }

      // Accumulate table into generatedContent (final edit-proposal emitted after all tasks)
      if (this.context.currentNoteId) {
        const originalContent = this.context.generatedContent || ''
        const tableSection = `\n\n### ${tableData.title || 'Table'}\n\n${tableMarkdown}\n`
        this.context.generatedContent = originalContent + tableSection
      } else {
        // No note open - output to chat as fallback
        yield {
          type: 'text-delta',
          data: `\n\n### ${tableData.title || 'Table'}\n\n${tableMarkdown}\n`,
        }
      }
    } catch (error) {
      yield {
        type: 'error',
        data: { taskId: task.id, error: `Failed to parse table data: ${error}` },
      }
    }
  }

  /**
   * Convert table data to GFM (GitHub Flavored Markdown) table format
   * Supports new format: { title, headers, rows } where rows is string[][]
   */
  private convertToGFMTable(tableData: {
    title?: string
    headers?: string[]
    rows?: string[][]
  }): string {
    const headers = tableData.headers || []
    const rows = tableData.rows || []

    if (headers.length === 0) {
      return '*No table data available*'
    }

    // Header row
    const headerRow = `| ${headers.join(' | ')} |`

    // Separator row
    const separator = `| ${headers.map(() => '---').join(' | ')} |`

    // Data rows
    const dataRows = rows.map((row) => {
      const cells = headers.map((_, idx) => {
        const value = row[idx]
        if (value == null) return ''
        return String(value).replace(/\|/g, '\\|') // Escape pipe characters
      })
      return `| ${cells.join(' | ')} |`
    })

    return [headerRow, separator, ...dataRows].join('\n')
  }

  /**
   * Execute a chat/conversation task
   */
  private async *executeChatTask(task: SubTask): AsyncGenerator<DeepAgentEvent> {
    yield { type: 'thinking', data: 'Processing...' }

    const rawStream = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: 'You are a helpful AI assistant for note-taking and learning.' },
        { role: 'user', content: task.description },
      ],
      temperature: 0.7,
      max_completion_tokens: 2000,
      stream: true,
      stream_options: { include_usage: true },
    })

    let fullContent = ''

    for await (const chunk of trackOpenAIStream(rawStream, {
      model: this.model, taskType: 'chat',
    })) {
      const delta = chunk.choices?.[0]?.delta?.content
      if (delta) {
        fullContent += delta
        yield { type: 'text-delta', data: delta }
      }
    }

    task.result = fullContent
  }

  /**
   * Parse artifact content from LLM response
   * Handles truncated JSON by attempting to extract individual fields
   */
  private parseArtifactContent(
    content: string,
    description: string
  ): { title: string; html: string; css: string; javascript: string } {
    const defaultResult = {
      title: this.extractArtifactTitle(description),
      html: '',
      css: '',
      javascript: '',
    }

    // Debug: Log raw LLM response (truncated)
    console.log('[DeepAgent] Artifact LLM response (first 500 chars):', content.slice(0, 500))

    try {
      // Try JSON parsing first - handle markdown code blocks with optional spaces
      // kimi-k2.5 returns: " ```json\n{...}\n```"
      const cleaned = content
        .replace(/^\s*```(?:json)?\s*\n?/i, '') // Remove opening code block with optional spaces
        .replace(/\n?\s*```\s*$/i, '') // Remove closing code block
        .trim()
      const parsed = JSON.parse(cleaned)

      const result = {
        title: parsed.title || defaultResult.title,
        html: parsed.html || '',
        css: parsed.css || '',
        javascript: parsed.javascript || '',
      }

      console.log('[DeepAgent] Parsed artifact JSON:', {
        title: result.title,
        hasHtml: !!result.html,
        htmlLength: result.html.length,
        hasCss: !!result.css,
        cssLength: result.css.length,
        hasJs: !!result.javascript,
        jsLength: result.javascript.length,
      })

      return result
    } catch (error) {
      console.warn('[DeepAgent] JSON parse failed, trying partial JSON recovery. Error:', error)
      console.log('[DeepAgent] Raw content for recovery (first 300 chars):', content.slice(0, 300))

      // Partial JSON recovery - extract individual fields even from truncated JSON
      const result = { ...defaultResult }

      // Try to extract title
      const titleMatch = content.match(/"title"\s*:\s*"((?:[^"\\]|\\.)*)"/s)
      if (titleMatch) {
        result.title = titleMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n')
      }

      // Try to extract html - the value might be truncated, so get as much as we can
      const htmlMatch = content.match(/"html"\s*:\s*"((?:[^"\\]|\\.)*)(?:"|$)/s)
      if (htmlMatch) {
        result.html = htmlMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\t/g, '\t')
      }

      // Try to extract css
      const cssMatch = content.match(/"css"\s*:\s*"((?:[^"\\]|\\.)*)(?:"|$)/s)
      if (cssMatch) {
        result.css = cssMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\t/g, '\t')
      }

      // Try to extract javascript - this is often the longest field and most likely truncated
      const jsMatch = content.match(/"javascript"\s*:\s*"((?:[^"\\]|\\.)*)(?:"|$)/s)
      if (jsMatch) {
        result.javascript = jsMatch[1]
          .replace(/\\"/g, '"')
          .replace(/\\n/g, '\n')
          .replace(/\\t/g, '\t')
      }

      console.log('[DeepAgent] Partial JSON recovery result:', {
        hasTitle: result.title !== defaultResult.title,
        hasHtml: !!result.html,
        htmlLength: result.html.length,
        hasCss: !!result.css,
        cssLength: result.css.length,
        hasJs: !!result.javascript,
        jsLength: result.javascript.length,
      })

      // If partial recovery failed, try markdown code block fallback
      if (!result.html && !result.css && !result.javascript) {
        console.log('[DeepAgent] Partial recovery failed, trying markdown code block fallback')
        const htmlBlockMatch = content.match(/```html\s*([\s\S]*?)```/i)
        const cssBlockMatch = content.match(/```css\s*([\s\S]*?)```/i)
        const jsBlockMatch = content.match(/```(?:javascript|js)\s*([\s\S]*?)```/i)

        result.html = htmlBlockMatch?.[1]?.trim() || ''
        result.css = cssBlockMatch?.[1]?.trim() || ''
        result.javascript = jsBlockMatch?.[1]?.trim() || ''
      }

      if (!result.html && !result.css && !result.javascript) {
        console.error(
          '[DeepAgent] ARTIFACT PARSING FAILED - all code fields empty. Full content:',
          content
        )
      }

      return result
    }
  }

  /**
   * Detect the current artifact generation phase based on content markers
   */
  private detectArtifactPhase(content: string): 'html' | 'css' | 'javascript' {
    const lower = content.toLowerCase()

    // Check for JavaScript markers (typically comes last)
    if (
      lower.includes('"javascript"') ||
      lower.includes('javascript:') ||
      lower.includes('function ') ||
      lower.includes('const ') ||
      lower.includes('let ')
    ) {
      return 'javascript'
    }

    // Check for CSS markers
    if (
      lower.includes('"css"') ||
      lower.includes('css:') ||
      (lower.includes('{') &&
        (lower.includes('color:') || lower.includes('background:') || lower.includes('padding:')))
    ) {
      return 'css'
    }

    // Default to HTML (first phase)
    return 'html'
  }

  /**
   * Extract a human-readable title from the artifact description
   */
  private extractArtifactTitle(description: string): string {
    // Try to extract the main noun phrase
    const match = description.match(
      /(?:create|make|build)\s+(?:an?\s+)?(?:interactive\s+)?(.+?)(?:\s+for|\s+that|\s+with|$)/i
    )
    if (match) {
      return match[1].trim().slice(0, 50)
    }
    return `Artifact ${new Date().toISOString().split('T')[0]}`
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createInkdownDeepAgent(config: DeepAgentConfig): InkdownDeepAgent {
  return new InkdownDeepAgent(config)
}
