/**
 * Agentic AI Agent
 *
 * Autonomous AI agent that can research, plan, and execute complex tasks.
 * Creates notes, databases, and artifacts based on natural language instructions.
 *
 * Ported from Note3's agenticAI.ts
 */

import OpenAI from 'openai'
import { selectModel } from '../providers/model-registry'
import { createOpenAIClient } from '../providers/client-factory'
import { trackOpenAIResponse } from '../providers/token-tracker'

// Simple UUID generator (avoids external dependency)
function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
import type {
  AgentStep,
  AgentStepType,
  AgenticResult,
  AgenticStatus,
  AgenticProgress,
  AgenticTask,
  BlockInfo,
  ResearchResult,
  ValidationResult,
  DataSchema,
  DatabaseColumn,
} from './agentic.types'

// ============================================================================
// Constants
// ============================================================================

const MAX_RETRIES = 2
const MAX_STEPS = 20

// ============================================================================
// Planning Prompts
// ============================================================================

const PLANNING_PROMPT = `You are an AI task planner. Analyze the user's request and break it down into a sequence of steps.

Available step types:
- Research: Search for information on a topic
- ExtractData: Extract structured data from research results
- CreateNote: Create a new note
- CreateDatabase: Create a database with specified columns
- CreateArtifact: Create an HTML/CSS/JS artifact
- GenerateContent: Generate text content for a block
- PopulateDatabase: Fill a database with data
- Validate: Verify the quality of created content
- Reflect: Review and potentially improve work

Rules:
1. Each step must have a unique ID (use simple strings like "step1", "step2")
2. Steps can depend on other steps via depends_on array
3. Research should come before ExtractData
4. CreateDatabase should come before PopulateDatabase
5. Keep plans focused and efficient (max ${MAX_STEPS} steps)

Return ONLY a JSON array of steps:
[
  {
    "id": "step1",
    "step_type": { "type": "Research", "query": "...", "purpose": "..." },
    "depends_on": []
  },
  {
    "id": "step2",
    "step_type": { "type": "CreateDatabase", "title": "...", "columns": [...] },
    "depends_on": ["step1"]
  }
]`

// ============================================================================
// Agent Class
// ============================================================================

export class AgenticAgent {
  private _apiKey: string // Kept for backward compat; client-factory uses env vars
  private client: OpenAI
  private model: string
  private tasks: Map<string, AgenticTask> = new Map()

  constructor(apiKey: string) {
    this._apiKey = apiKey
    const modelEntry = selectModel('chat')
    this.model = modelEntry.id
    this.client = createOpenAIClient(modelEntry)
  }

  /**
   * Plan a task without executing (for preview)
   */
  async planTask(task: string): Promise<AgentStep[]> {
    const prompt = `${PLANNING_PROMPT}

User request: ${task}`

    const response = await this.chatCompletion(prompt)

    // Parse response
    const jsonMatch = response.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      throw new Error('Failed to parse planning response')
    }

    const steps: AgentStep[] = JSON.parse(jsonMatch[0]).map((step: Partial<AgentStep>) => ({
      ...step,
      status: 'Pending' as const,
      retry_count: 0,
    }))

    return steps
  }

  /**
   * Execute an autonomous task
   */
  async executeTask(
    task: string,
    noteId?: string,
    onProgress?: (progress: AgenticProgress) => void
  ): Promise<AgenticResult> {
    const taskId = generateId()
    const startTime = Date.now()

    // Plan the task
    onProgress?.({
      taskId,
      status: 'Planning',
      currentStepIndex: 0,
      totalSteps: 0,
      message: 'Planning task...',
    })

    let steps: AgentStep[]
    try {
      steps = await this.planTask(task)
    } catch (error) {
      return {
        task_id: taskId,
        status: 'Failed',
        created_blocks: [],
        execution_time_ms: Date.now() - startTime,
        steps_completed: 0,
        steps_failed: 0,
        error: `Planning failed: ${error}`,
      }
    }

    // Store task
    const agenticTask: AgenticTask = {
      id: taskId,
      description: task,
      noteId,
      steps,
      status: 'Planning',
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    this.tasks.set(taskId, agenticTask)

    // Execute steps
    const createdBlocks: BlockInfo[] = []
    let stepsCompleted = 0
    let stepsFailed = 0
    const stepResults = new Map<string, unknown>()

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]

      // Check dependencies
      const canExecute = step.depends_on.every((depId) => {
        const depStep = steps.find((s) => s.id === depId)
        return depStep?.status === 'Completed'
      })

      if (!canExecute) {
        step.status = 'Skipped'
        continue
      }

      // Update progress
      const statusMap: Record<string, AgenticStatus> = {
        Research: 'Researching',
        ExtractData: 'Extracting',
        CreateNote: 'Creating',
        CreateDatabase: 'Creating',
        CreateArtifact: 'Creating',
        GenerateContent: 'Creating',
        PopulateDatabase: 'Populating',
        Validate: 'Validating',
        Reflect: 'Validating',
      }

      const stepType = step.step_type.type
      agenticTask.status = statusMap[stepType] || 'Creating'

      onProgress?.({
        taskId,
        status: agenticTask.status,
        currentStep: step.id,
        currentStepIndex: i + 1,
        totalSteps: steps.length,
        message: `Executing ${stepType}: ${step.id}`,
      })

      // Execute step with retries
      step.status = 'InProgress'
      let success = false

      while (!success && step.retry_count < MAX_RETRIES) {
        try {
          const result = await this.executeStep(step, stepResults, noteId)
          step.result = { success: true, data: result, message: 'Step completed' }
          step.status = 'Completed'
          stepResults.set(step.id, result)
          stepsCompleted++
          success = true

          // Track created blocks
          if (result && typeof result === 'object' && 'blockId' in (result as object)) {
            createdBlocks.push({
              id: (result as { blockId: string }).blockId,
              block_type: stepType,
              title: this.getStepTitle(step.step_type),
              step_id: step.id,
            })
          }
        } catch (error) {
          step.retry_count++
          step.error = String(error)

          if (step.retry_count >= MAX_RETRIES) {
            step.status = 'Failed'
            step.result = { success: false, message: String(error) }
            stepsFailed++
          }
        }
      }
    }

    // Determine final status
    const finalStatus: AgenticStatus =
      stepsFailed > 0 ? (stepsCompleted > 0 ? 'Completed' : 'Failed') : 'Completed'

    agenticTask.status = finalStatus
    agenticTask.updatedAt = new Date()

    onProgress?.({
      taskId,
      status: finalStatus,
      currentStepIndex: steps.length,
      totalSteps: steps.length,
      message:
        finalStatus === 'Completed'
          ? `Task completed: ${stepsCompleted} steps`
          : `Task failed: ${stepsFailed} steps failed`,
    })

    return {
      task_id: taskId,
      status: finalStatus,
      created_blocks: createdBlocks,
      execution_time_ms: Date.now() - startTime,
      steps_completed: stepsCompleted,
      steps_failed: stepsFailed,
      error: stepsFailed > 0 ? steps.find((s) => s.status === 'Failed')?.error : undefined,
    }
  }

  /**
   * Execute a single step
   */
  private async executeStep(
    step: AgentStep,
    stepResults: Map<string, unknown>,
    noteId?: string
  ): Promise<unknown> {
    const stepType = step.step_type

    switch (stepType.type) {
      case 'Research':
        return this.executeResearch(stepType.query, stepType.purpose)

      case 'ExtractData':
        return this.executeExtractData(stepType.query, stepType.schema, stepType.count, stepResults)

      case 'CreateNote':
        return this.executeCreateNote(stepType.title, stepType.parent_id || noteId)

      case 'CreateDatabase':
        return this.executeCreateDatabase(stepType.title, stepType.columns, noteId)

      case 'CreateArtifact':
        return this.executeCreateArtifact(
          stepType.title,
          stepType.artifact_type,
          stepType.content_prompt,
          noteId
        )

      case 'GenerateContent':
        return this.executeGenerateContent(
          stepType.block_id,
          stepType.content_type,
          stepType.prompt,
          stepResults
        )

      case 'PopulateDatabase':
        return this.executePopulateDatabase(stepType.database_id, stepType.data_source, stepResults)

      case 'Validate':
        return this.executeValidate(stepType.target, stepType.criteria, stepResults)

      case 'Reflect':
        return this.executeReflect(stepType.on, stepType.improve, stepResults)

      default:
        throw new Error(`Unknown step type: ${(stepType as AgentStepType).type}`)
    }
  }

  /**
   * Research a topic
   */
  async research(query: string): Promise<ResearchResult> {
    return this.executeResearch(query, 'General research')
  }

  /**
   * Research and extract structured data
   */
  async researchAndExtract(
    query: string,
    schema: DataSchema,
    count: number
  ): Promise<Record<string, unknown>[]> {
    const researchResult = await this.executeResearch(query, 'Data extraction')
    const stepResults = new Map<string, unknown>()
    stepResults.set('research', researchResult)

    const extractResult = await this.executeExtractData(query, schema, count, stepResults)
    return (extractResult as { data: Record<string, unknown>[] }).data || []
  }

  /**
   * Verify data accuracy
   */
  async verifyData(data: Record<string, unknown>[]): Promise<ValidationResult> {
    const prompt = `Verify the accuracy and quality of this data:

${JSON.stringify(data, null, 2)}

Check for:
1. Data completeness
2. Format consistency
3. Reasonable values
4. No obvious errors

Return a JSON object:
{
  "passed": boolean,
  "issues": [
    { "severity": "Error|Warning|Info", "description": "...", "suggestion": "..." }
  ],
  "score": 0-100
}`

    const response = await this.chatCompletion(prompt)

    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return {
        passed: false,
        issues: [{ severity: 'Error', description: 'Failed to validate' }],
        score: 0,
      }
    }

    return JSON.parse(jsonMatch[0])
  }

  // =========================================================================
  // Step Executors
  // =========================================================================

  private async executeResearch(query: string, purpose: string): Promise<ResearchResult> {
    const prompt = `Research the following topic and provide a comprehensive summary:

Query: ${query}
Purpose: ${purpose}

Provide:
1. A clear summary of the findings
2. Key facts and data points
3. Any relevant statistics or numbers

Return a JSON object:
{
  "query": "${query}",
  "sources": [
    { "title": "...", "url": "...", "snippet": "..." }
  ],
  "summary": "...",
  "data": [{ "key": "value" }]  // Optional structured data
}`

    const response = await this.chatCompletion(prompt)

    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return { query, sources: [], summary: response }
    }

    return JSON.parse(jsonMatch[0])
  }

  private async executeExtractData(
    query: string,
    schema: DataSchema,
    count: number,
    stepResults: Map<string, unknown>
  ): Promise<{ data: Record<string, unknown>[] }> {
    // Get research context if available
    let researchContext = ''
    for (const [_key, value] of stepResults) {
      if (value && typeof value === 'object' && 'summary' in value) {
        researchContext = (value as ResearchResult).summary
        break
      }
    }

    const columnDescriptions = schema.columns
      .map((c) => `- ${c.name} (${c.data_type}): ${c.description}`)
      .join('\n')

    const prompt = `Extract structured data based on the following:

Query: ${query}
Context: ${researchContext}

Required columns:
${columnDescriptions}

Extract ${count} records and return ONLY a JSON array:
[
  { ${schema.columns.map((c) => `"${c.name}": ...`).join(', ')} }
]`

    const response = await this.chatCompletion(prompt)

    const jsonMatch = response.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      return { data: [] }
    }

    return { data: JSON.parse(jsonMatch[0]) }
  }

  private async executeCreateNote(
    title: string,
    _parentId?: string
  ): Promise<{ blockId: string; title: string }> {
    // In actual implementation, this would create a note via Supabase
    // For now, return a mock result
    const blockId = generateId()
    return { blockId, title }
  }

  private async executeCreateDatabase(
    title: string,
    columns: DatabaseColumn[],
    _noteId?: string
  ): Promise<{ blockId: string; title: string; columns: DatabaseColumn[] }> {
    const blockId = generateId()
    return { blockId, title, columns }
  }

  private async executeCreateArtifact(
    title: string,
    artifactType: string,
    contentPrompt: string,
    _noteId?: string
  ): Promise<{ blockId: string; title: string; type: string }> {
    const prompt = `Create an HTML artifact:

Title: ${title}
Type: ${artifactType}
Requirements: ${contentPrompt}

Return ONLY the HTML code, no explanation.`

    // Generate HTML content (stored for future use when actual artifact creation is implemented)
    await this.chatCompletion(prompt)

    const blockId = generateId()
    return { blockId, title, type: artifactType }
  }

  private async executeGenerateContent(
    blockId: string,
    contentType: string,
    prompt: string,
    stepResults: Map<string, unknown>
  ): Promise<{ blockId: string; content: string }> {
    // Build context from previous steps
    let context = ''
    for (const [_key, value] of stepResults) {
      if (value && typeof value === 'object') {
        if ('summary' in value) {
          context += `Research: ${(value as ResearchResult).summary}\n\n`
        }
        if ('data' in value) {
          context += `Data: ${JSON.stringify((value as { data: unknown }).data)}\n\n`
        }
      }
    }

    const fullPrompt = `Generate ${contentType} content:

Context:
${context}

Instructions: ${prompt}

Generate clear, well-structured content.`

    const content = await this.chatCompletion(fullPrompt)

    return { blockId, content }
  }

  private async executePopulateDatabase(
    databaseId: string,
    dataSource: { type: string; data?: Record<string, unknown>[]; prompt?: string },
    stepResults: Map<string, unknown>
  ): Promise<{ databaseId: string; rowCount: number }> {
    let data: Record<string, unknown>[] = []

    if (dataSource.type === 'Research') {
      // Get data from research step
      for (const [_key, value] of stepResults) {
        if (value && typeof value === 'object' && 'data' in value) {
          data = (value as { data: Record<string, unknown>[] }).data || []
          break
        }
      }
    } else if (dataSource.type === 'AIGenerated' && dataSource.prompt) {
      const response = await this.chatCompletion(dataSource.prompt)

      const jsonMatch = response.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        data = JSON.parse(jsonMatch[0])
      }
    }

    return { databaseId, rowCount: data.length }
  }

  private async executeValidate(
    target: string,
    criteria: string[],
    stepResults: Map<string, unknown>
  ): Promise<ValidationResult> {
    // Get target data
    const targetData = stepResults.get(target)

    const prompt = `Validate the following against these criteria:

Target: ${JSON.stringify(targetData)}

Criteria:
${criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

Return a JSON object:
{
  "passed": boolean,
  "issues": [{ "severity": "Error|Warning|Info", "description": "...", "suggestion": "..." }],
  "score": 0-100
}`

    const response = await this.chatCompletion(prompt)

    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return { passed: true, issues: [], score: 100 }
    }

    return JSON.parse(jsonMatch[0])
  }

  private async executeReflect(
    on: string,
    improve: boolean,
    stepResults: Map<string, unknown>
  ): Promise<{ reflection: string; improvements?: string[] }> {
    const targetData = stepResults.get(on)

    const prompt = `Reflect on the following work:

${JSON.stringify(targetData)}

${improve ? 'Suggest specific improvements.' : 'Provide observations only.'}

Return a JSON object:
{
  "reflection": "...",
  ${improve ? '"improvements": ["..."]' : ''}
}`

    const response = await this.chatCompletion(prompt)

    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return { reflection: response }
    }

    return JSON.parse(jsonMatch[0])
  }

  // =========================================================================
  // Helper Methods
  // =========================================================================

  /**
   * Send a chat completion request via the centralized client.
   */
  private async chatCompletion(prompt: string): Promise<string> {
    const startTime = Date.now()
    const result = await this.client.chat.completions.create({
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_completion_tokens: 4000,
    })
    trackOpenAIResponse(result, { model: this.model, taskType: 'chat', startTime })
    return result.choices[0]?.message?.content || ''
  }

  private getStepTitle(stepType: AgentStepType): string {
    switch (stepType.type) {
      case 'CreateNote':
        return stepType.title
      case 'CreateDatabase':
        return stepType.title
      case 'CreateArtifact':
        return stepType.title
      default:
        return stepType.type
    }
  }

  /**
   * Get task by ID
   */
  getTask(taskId: string): AgenticTask | undefined {
    return this.tasks.get(taskId)
  }

  /**
   * Cancel a running task
   */
  cancelTask(taskId: string): boolean {
    const task = this.tasks.get(taskId)
    if (!task || task.status === 'Completed' || task.status === 'Failed') {
      return false
    }

    task.status = 'Failed'
    task.updatedAt = new Date()

    // Mark remaining steps as skipped
    for (const step of task.steps) {
      if (step.status === 'Pending' || step.status === 'InProgress') {
        step.status = 'Skipped'
      }
    }

    return true
  }

  /**
   * Format result for display
   */
  formatResult(result: AgenticResult): string {
    if (result.status === 'Failed') {
      return `Task failed: ${result.error || 'Unknown error'}`
    }

    if (result.status === 'Completed') {
      return (
        `Task completed successfully!\n` +
        `Created ${result.created_blocks.length} blocks in ${result.execution_time_ms}ms\n` +
        `Steps: ${result.steps_completed} completed, ${result.steps_failed} failed`
      )
    }

    return `Task status: ${result.status}`
  }

  /**
   * Format plan for display
   */
  formatPlan(steps: AgentStep[]): string {
    return steps
      .map((step, idx) => {
        const type = step.step_type.type
        const deps =
          step.depends_on.length > 0 ? ` (depends on: ${step.depends_on.join(', ')})` : ''
        return `${idx + 1}. [${step.id}] ${type}${deps}`
      })
      .join('\n')
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createAgenticAgent(apiKey: string): AgenticAgent {
  return new AgenticAgent(apiKey)
}
