/**
 * Orchestration Service
 *
 * Multi-block workflow orchestration system.
 * Supports pre-built templates and AI-planned custom workflows.
 *
 * Ported from Note3's orchestration.ts
 */

import { createOpenAIProvider } from '../providers/openai'

// Simple UUID generator (avoids external dependency)
function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}
import type {
  WorkflowTemplate,
  WorkflowResult,
  WorkflowState,
  WorkflowExecution,
  ExecutionStep,
  BlockInfo,
  WorkflowProgress,
  OrchestrationRequest,
  TemplateStep,
} from './orchestration.types'

// ============================================================================
// Built-in Workflow Templates
// ============================================================================

const EXPENSE_TRACKER_TEMPLATE: WorkflowTemplate = {
  id: 'expense_tracker',
  name: 'Expense Tracker',
  description: 'Track expenses with a database and summary chart',
  tags: ['expense', 'budget', 'finance', 'money', 'track'],
  icon: '💰',
  steps: [
    {
      id: 'db',
      step_type: { type: 'CreateDatabase' },
      config: {
        title: 'Expenses',
        columns: [
          { name: 'Date', type: 'date' },
          { name: 'Category', type: 'select', options: ['Food', 'Transport', 'Entertainment', 'Utilities', 'Other'] },
          { name: 'Description', type: 'text' },
          { name: 'Amount', type: 'number' },
        ],
      },
      depends_on: [],
    },
    {
      id: 'chart',
      step_type: { type: 'CreateArtifact' },
      config: {
        title: 'Expense Summary',
        type: 'chart',
        chartType: 'pie',
        dataSource: 'db',
        groupBy: 'Category',
        aggregate: 'sum',
        aggregateColumn: 'Amount',
      },
      depends_on: ['db'],
    },
  ],
  data_mappings: [
    {
      from_step: 'db',
      from_field: 'id',
      to_step: 'chart',
      to_field: 'databaseId',
    },
  ],
  parameters: [
    { name: 'title', param_type: 'String', description: 'Title for the expense tracker', default: 'Expense Tracker', required: false },
  ],
}

const TODO_LIST_TEMPLATE: WorkflowTemplate = {
  id: 'todo_list',
  name: 'Todo List',
  description: 'Task management with priority and due dates',
  tags: ['todo', 'task', 'checklist', 'productivity'],
  icon: '✅',
  steps: [
    {
      id: 'db',
      step_type: { type: 'CreateDatabase' },
      config: {
        title: 'Tasks',
        columns: [
          { name: 'Task', type: 'text' },
          { name: 'Priority', type: 'select', options: ['High', 'Medium', 'Low'] },
          { name: 'Due Date', type: 'date' },
          { name: 'Status', type: 'select', options: ['Todo', 'In Progress', 'Done'] },
          { name: 'Notes', type: 'text' },
        ],
      },
      depends_on: [],
    },
  ],
  data_mappings: [],
  parameters: [
    { name: 'title', param_type: 'String', description: 'Title for the todo list', default: 'Todo List', required: false },
  ],
}

const PROJECT_DASHBOARD_TEMPLATE: WorkflowTemplate = {
  id: 'project_dashboard',
  name: 'Project Dashboard',
  description: 'Track project progress with tasks and timeline',
  tags: ['project', 'dashboard', 'management', 'timeline'],
  icon: '📊',
  steps: [
    {
      id: 'tasks_db',
      step_type: { type: 'CreateDatabase' },
      config: {
        title: 'Project Tasks',
        columns: [
          { name: 'Task', type: 'text' },
          { name: 'Assignee', type: 'text' },
          { name: 'Start Date', type: 'date' },
          { name: 'End Date', type: 'date' },
          { name: 'Progress', type: 'number' },
          { name: 'Status', type: 'select', options: ['Not Started', 'In Progress', 'Blocked', 'Complete'] },
        ],
      },
      depends_on: [],
    },
    {
      id: 'gantt',
      step_type: { type: 'CreateArtifact' },
      config: {
        title: 'Project Timeline',
        type: 'gantt',
        dataSource: 'tasks_db',
      },
      depends_on: ['tasks_db'],
    },
    {
      id: 'progress',
      step_type: { type: 'CreateArtifact' },
      config: {
        title: 'Progress Overview',
        type: 'progress-bar',
        dataSource: 'tasks_db',
        metric: 'average',
        metricColumn: 'Progress',
      },
      depends_on: ['tasks_db'],
    },
  ],
  data_mappings: [
    { from_step: 'tasks_db', from_field: 'id', to_step: 'gantt', to_field: 'databaseId' },
    { from_step: 'tasks_db', from_field: 'id', to_step: 'progress', to_field: 'databaseId' },
  ],
  parameters: [
    { name: 'title', param_type: 'String', description: 'Project name', default: 'Project Dashboard', required: false },
  ],
}

const MEETING_NOTES_TEMPLATE: WorkflowTemplate = {
  id: 'meeting_notes',
  name: 'Meeting Notes',
  description: 'Structured meeting notes with action items',
  tags: ['meeting', 'notes', 'agenda', 'minutes'],
  icon: '📝',
  steps: [
    {
      id: 'note',
      step_type: { type: 'CreateNote' },
      config: {
        title: 'Meeting Notes',
        template: `# Meeting: {{meeting_title}}

**Date:** {{date}}
**Attendees:**

## Agenda
1.

## Discussion Points


## Action Items

## Next Steps
`,
      },
      depends_on: [],
    },
    {
      id: 'actions_db',
      step_type: { type: 'CreateDatabase' },
      config: {
        title: 'Action Items',
        columns: [
          { name: 'Action', type: 'text' },
          { name: 'Owner', type: 'text' },
          { name: 'Due Date', type: 'date' },
          { name: 'Status', type: 'select', options: ['Pending', 'In Progress', 'Done'] },
        ],
      },
      depends_on: ['note'],
    },
  ],
  data_mappings: [],
  parameters: [
    { name: 'meeting_title', param_type: 'String', description: 'Meeting title', default: 'Team Meeting', required: true },
    { name: 'date', param_type: 'String', description: 'Meeting date', default: '', required: false },
  ],
}

const HABIT_TRACKER_TEMPLATE: WorkflowTemplate = {
  id: 'habit_tracker',
  name: 'Habit Tracker',
  description: 'Track daily habits and build streaks',
  tags: ['habit', 'tracker', 'daily', 'routine', 'streak'],
  icon: '🎯',
  steps: [
    {
      id: 'habits_db',
      step_type: { type: 'CreateDatabase' },
      config: {
        title: 'Habits',
        columns: [
          { name: 'Habit', type: 'text' },
          { name: 'Category', type: 'select', options: ['Health', 'Productivity', 'Learning', 'Mindfulness', 'Other'] },
          { name: 'Frequency', type: 'select', options: ['Daily', 'Weekly', 'Custom'] },
          { name: 'Current Streak', type: 'number' },
          { name: 'Best Streak', type: 'number' },
        ],
      },
      depends_on: [],
    },
    {
      id: 'log_db',
      step_type: { type: 'CreateDatabase' },
      config: {
        title: 'Habit Log',
        columns: [
          { name: 'Date', type: 'date' },
          { name: 'Habit', type: 'relation', relationTo: 'habits_db' },
          { name: 'Completed', type: 'checkbox' },
          { name: 'Notes', type: 'text' },
        ],
      },
      depends_on: ['habits_db'],
    },
    {
      id: 'streak_chart',
      step_type: { type: 'CreateArtifact' },
      config: {
        title: 'Streak Overview',
        type: 'heatmap',
        dataSource: 'log_db',
      },
      depends_on: ['log_db'],
    },
  ],
  data_mappings: [
    { from_step: 'habits_db', from_field: 'id', to_step: 'log_db', to_field: 'habitDbId' },
    { from_step: 'log_db', from_field: 'id', to_step: 'streak_chart', to_field: 'databaseId' },
  ],
  parameters: [
    { name: 'title', param_type: 'String', description: 'Title for the habit tracker', default: 'Habit Tracker', required: false },
  ],
}

// ============================================================================
// Template Registry
// ============================================================================

const TEMPLATES: WorkflowTemplate[] = [
  EXPENSE_TRACKER_TEMPLATE,
  TODO_LIST_TEMPLATE,
  PROJECT_DASHBOARD_TEMPLATE,
  MEETING_NOTES_TEMPLATE,
  HABIT_TRACKER_TEMPLATE,
]

// ============================================================================
// Orchestration Service Class
// ============================================================================

export class OrchestrationService {
  private apiKey: string
  private executions: Map<string, WorkflowExecution> = new Map()

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  /**
   * Get all available workflow templates
   */
  getTemplates(): WorkflowTemplate[] {
    return TEMPLATES
  }

  /**
   * Get a specific template by ID
   */
  getTemplate(templateId: string): WorkflowTemplate | undefined {
    return TEMPLATES.find(t => t.id === templateId)
  }

  /**
   * Orchestrate a workflow from template or prompt
   */
  async orchestrateWorkflow(
    options: OrchestrationRequest,
    onProgress?: (progress: WorkflowProgress) => void
  ): Promise<WorkflowResult> {
    const workflowId = generateId()
    const startTime = Date.now()

    let template: WorkflowTemplate | undefined

    // Get template or create from prompt
    if (options.templateId) {
      template = this.getTemplate(options.templateId)
      if (!template) {
        return {
          workflow_id: workflowId,
          state: { Failed: `Template not found: ${options.templateId}` },
          created_blocks: [],
          execution_time_ms: Date.now() - startTime,
          steps_completed: 0,
          steps_failed: 0,
        }
      }
    } else if (options.prompt) {
      // Try to match a template or create custom workflow
      template = await this.matchOrCreateWorkflow(options.prompt)
    }

    if (!template) {
      return {
        workflow_id: workflowId,
        state: { Failed: 'No template or prompt provided' },
        created_blocks: [],
        execution_time_ms: Date.now() - startTime,
        steps_completed: 0,
        steps_failed: 0,
      }
    }

    // Create execution record
    const execution: WorkflowExecution = {
      id: workflowId,
      templateId: template.id,
      noteId: options.noteId,
      parameters: options.parameters || {},
      state: 'Planning',
      steps: template.steps.map(s => ({
        id: generateId(),
        templateStepId: s.id,
        status: 'pending',
      })),
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    this.executions.set(workflowId, execution)

    // Execute steps
    const createdBlocks: BlockInfo[] = []
    let stepsCompleted = 0
    let stepsFailed = 0
    const stepResults = new Map<string, unknown>()

    onProgress?.({
      workflowId,
      state: 'Executing',
      currentStepIndex: 0,
      totalSteps: template.steps.length,
      message: 'Starting workflow...',
    })

    for (let i = 0; i < template.steps.length; i++) {
      const templateStep = template.steps[i]
      const execStep = execution.steps[i]

      // Check dependencies
      const canExecute = templateStep.depends_on.every(depId => {
        const depStep = template!.steps.find(s => s.id === depId)
        const depExecStep = execution.steps.find(s => s.templateStepId === depStep?.id)
        return depExecStep?.status === 'completed'
      })

      if (!canExecute) {
        execStep.status = 'skipped'
        continue
      }

      execution.state = 'Executing'
      execStep.status = 'running'
      execStep.startedAt = new Date()

      onProgress?.({
        workflowId,
        state: 'Executing',
        currentStep: templateStep.id,
        currentStepIndex: i + 1,
        totalSteps: template.steps.length,
        message: `Executing step: ${templateStep.id}`,
      })

      try {
        const result = await this.executeStep(
          templateStep,
          template,
          options.parameters || {},
          stepResults
        )

        execStep.result = result
        execStep.status = 'completed'
        execStep.completedAt = new Date()
        stepResults.set(templateStep.id, result)
        stepsCompleted++

        if (result && typeof result === 'object' && 'blockId' in result) {
          const blockResult = result as { blockId: string; title?: string }
          createdBlocks.push({
            id: blockResult.blockId,
            block_type: templateStep.step_type.type,
            title: blockResult.title || templateStep.id,
            step_id: templateStep.id,
          })
        }
      } catch (error) {
        execStep.status = 'failed'
        execStep.error = String(error)
        execStep.completedAt = new Date()
        stepsFailed++
      }

      execution.updatedAt = new Date()
    }

    // Determine final state
    const finalState: WorkflowState = stepsFailed > 0
      ? (stepsCompleted > 0 ? 'Completed' : { Failed: 'All steps failed' })
      : 'Completed'

    execution.state = finalState

    onProgress?.({
      workflowId,
      state: finalState,
      currentStepIndex: template.steps.length,
      totalSteps: template.steps.length,
      message: typeof finalState === 'string'
        ? `Workflow ${finalState.toLowerCase()}`
        : `Workflow failed: ${finalState.Failed}`,
    })

    return {
      workflow_id: workflowId,
      state: finalState,
      created_blocks: createdBlocks,
      execution_time_ms: Date.now() - startTime,
      steps_completed: stepsCompleted,
      steps_failed: stepsFailed,
    }
  }

  /**
   * Create a custom workflow using AI planning
   */
  async createCustomWorkflow(
    prompt: string,
    noteId?: string,
    onProgress?: (progress: WorkflowProgress) => void
  ): Promise<WorkflowResult> {
    return this.orchestrateWorkflow({ prompt, noteId }, onProgress)
  }

  /**
   * Cancel a running workflow
   */
  cancelWorkflow(workflowId: string): boolean {
    const execution = this.executions.get(workflowId)
    if (!execution) return false

    if (execution.state === 'Completed' || typeof execution.state === 'object') {
      return false
    }

    execution.state = 'Cancelled'
    execution.updatedAt = new Date()

    for (const step of execution.steps) {
      if (step.status === 'pending' || step.status === 'running') {
        step.status = 'skipped'
      }
    }

    return true
  }

  /**
   * Get workflow execution status
   */
  getWorkflowStatus(workflowId: string): WorkflowState | undefined {
    return this.executions.get(workflowId)?.state
  }

  // =========================================================================
  // Helper Methods
  // =========================================================================

  /**
   * Match template from prompt or create custom
   */
  private async matchOrCreateWorkflow(prompt: string): Promise<WorkflowTemplate | undefined> {
    const promptLower = prompt.toLowerCase()

    // Try to match existing template
    for (const template of TEMPLATES) {
      if (template.tags.some(tag => promptLower.includes(tag.toLowerCase()))) {
        return template
      }
      if (promptLower.includes(template.name.toLowerCase())) {
        return template
      }
    }

    // Create custom workflow using AI
    return this.generateCustomTemplate(prompt)
  }

  /**
   * Generate a custom template using AI
   */
  private async generateCustomTemplate(prompt: string): Promise<WorkflowTemplate> {
    const provider = createOpenAIProvider({ apiKey: this.apiKey })

    const systemPrompt = `You are a workflow planner. Create a workflow template based on the user's request.

Available step types:
- CreateNote: Create a new note
- CreateDatabase: Create a database with columns
- CreateArtifact: Create an HTML/CSS/JS artifact
- AIGenerate: Generate content using AI

Return a JSON object:
{
  "id": "custom_workflow",
  "name": "Workflow Name",
  "description": "What this workflow does",
  "tags": ["relevant", "tags"],
  "icon": "emoji",
  "steps": [
    {
      "id": "step1",
      "step_type": { "type": "CreateDatabase" },
      "config": { "title": "...", "columns": [...] },
      "depends_on": []
    }
  ],
  "data_mappings": [],
  "parameters": []
}`

    let response = ''
    for await (const chunk of provider.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ])) {
      response += chunk
    }

    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('Failed to generate workflow template')
    }

    return JSON.parse(jsonMatch[0])
  }

  /**
   * Execute a single template step
   */
  private async executeStep(
    step: TemplateStep,
    template: WorkflowTemplate,
    parameters: Record<string, unknown>,
    stepResults: Map<string, unknown>
  ): Promise<unknown> {
    // Apply parameter substitution to config
    const config = this.applyParameters(step.config, parameters)

    // Apply data mappings
    for (const mapping of template.data_mappings) {
      if (mapping.to_step === step.id) {
        const sourceResult = stepResults.get(mapping.from_step)
        if (sourceResult && typeof sourceResult === 'object') {
          const sourceValue = (sourceResult as Record<string, unknown>)[mapping.from_field]
          if (sourceValue !== undefined) {
            (config as Record<string, unknown>)[mapping.to_field] = sourceValue
          }
        }
      }
    }

    switch (step.step_type.type) {
      case 'CreateNote':
        return this.createNote(config as { title: string; template?: string })

      case 'CreateDatabase':
        return this.createDatabase(config as { title: string; columns: unknown[] })

      case 'CreateArtifact':
        return this.createArtifact(config as { title: string; type: string; [key: string]: unknown })

      case 'AIGenerate':
        return this.aiGenerate(config as { prompt: string })

      default:
        throw new Error(`Unknown step type: ${step.step_type.type}`)
    }
  }

  /**
   * Apply parameter substitution
   */
  private applyParameters(
    config: Record<string, unknown>,
    parameters: Record<string, unknown>
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(config)) {
      if (typeof value === 'string') {
        // Replace {{param}} placeholders
        result[key] = value.replace(/\{\{(\w+)\}\}/g, (_, paramName) =>
          String(parameters[paramName] ?? '')
        )
      } else if (Array.isArray(value)) {
        result[key] = value
      } else if (typeof value === 'object' && value !== null) {
        result[key] = this.applyParameters(value as Record<string, unknown>, parameters)
      } else {
        result[key] = value
      }
    }

    return result
  }

  /**
   * Create a note
   */
  private async createNote(config: { title: string; template?: string }): Promise<{ blockId: string; title: string }> {
    const blockId = generateId()
    return { blockId, title: config.title }
  }

  /**
   * Create a database
   */
  private async createDatabase(config: { title: string; columns: unknown[] }): Promise<{ blockId: string; title: string; columns: unknown[] }> {
    const blockId = generateId()
    return { blockId, title: config.title, columns: config.columns }
  }

  /**
   * Create an artifact
   */
  private async createArtifact(config: { title: string; type: string; [key: string]: unknown }): Promise<{ blockId: string; title: string; type: string }> {
    const blockId = generateId()
    return { blockId, title: config.title, type: config.type }
  }

  /**
   * Generate content using AI
   */
  private async aiGenerate(config: { prompt: string }): Promise<{ content: string }> {
    const provider = createOpenAIProvider({ apiKey: this.apiKey })

    let content = ''
    for await (const chunk of provider.chat([{ role: 'user', content: config.prompt }])) {
      content += chunk
    }

    return { content }
  }

  // =========================================================================
  // Convenience Methods
  // =========================================================================

  async createExpenseTracker(title?: string, noteId?: string): Promise<WorkflowResult> {
    return this.orchestrateWorkflow({
      templateId: 'expense_tracker',
      parameters: { title: title || 'Expense Tracker' },
      noteId,
    })
  }

  async createTodoList(title?: string, noteId?: string): Promise<WorkflowResult> {
    return this.orchestrateWorkflow({
      templateId: 'todo_list',
      parameters: { title: title || 'Todo List' },
      noteId,
    })
  }

  async createProjectDashboard(title?: string, noteId?: string): Promise<WorkflowResult> {
    return this.orchestrateWorkflow({
      templateId: 'project_dashboard',
      parameters: { title: title || 'Project Dashboard' },
      noteId,
    })
  }

  async createMeetingNotes(meetingTitle?: string, noteId?: string): Promise<WorkflowResult> {
    return this.orchestrateWorkflow({
      templateId: 'meeting_notes',
      parameters: {
        meeting_title: meetingTitle || 'Team Meeting',
        date: new Date().toLocaleDateString(),
      },
      noteId,
    })
  }

  async createHabitTracker(title?: string, noteId?: string): Promise<WorkflowResult> {
    return this.orchestrateWorkflow({
      templateId: 'habit_tracker',
      parameters: { title: title || 'Habit Tracker' },
      noteId,
    })
  }

  /**
   * Get template suggestions based on prompt
   */
  suggestTemplates(prompt: string): WorkflowTemplate[] {
    const promptLower = prompt.toLowerCase()
    const suggestions: Array<{ template: WorkflowTemplate; score: number }> = []

    for (const template of TEMPLATES) {
      let score = 0

      for (const tag of template.tags) {
        if (promptLower.includes(tag.toLowerCase())) {
          score += 10
        }
      }

      if (promptLower.includes(template.name.toLowerCase())) {
        score += 20
      }

      if (score > 0) {
        suggestions.push({ template, score })
      }
    }

    return suggestions
      .sort((a, b) => b.score - a.score)
      .map(s => s.template)
  }

  /**
   * Format workflow result for display
   */
  formatResult(result: WorkflowResult): string {
    if (typeof result.state === 'object' && 'Failed' in result.state) {
      return `Workflow failed: ${result.state.Failed}`
    }

    if (result.state === 'Completed') {
      return `Workflow completed successfully!\n` +
        `Created ${result.created_blocks.length} blocks in ${result.execution_time_ms}ms\n` +
        `Steps: ${result.steps_completed} completed, ${result.steps_failed} failed`
    }

    return `Workflow state: ${result.state}`
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createOrchestrationService(apiKey: string): OrchestrationService {
  return new OrchestrationService(apiKey)
}

// ============================================================================
// Exports
// ============================================================================

export { TEMPLATES as WORKFLOW_TEMPLATES }
