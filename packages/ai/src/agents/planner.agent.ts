/**
 * Planner Agent
 *
 * Goal decomposition and task planning agent.
 * Creates actionable plans from high-level goals.
 */

import { z } from 'zod'
import { stripJsonFences } from '../utils/stripJsonFences'
import { SupabaseClient } from '@supabase/supabase-js'
import { generateText, Output } from 'ai'
import type { SharedContextService } from '../services/shared-context.service'
import { selectModel } from '../providers/model-registry'
import { resolveModel } from '../providers/ai-sdk-factory'
import { recordAISDKUsage } from '../providers/ai-sdk-usage'

// ============================================================================
// Types
// ============================================================================

export interface PlannerAgentConfig {
  supabase: SupabaseClient
  userId: string
  model?: string
  sharedContextService?: SharedContextService
}

export interface PlanStep {
  id: number
  description: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  estimatedTime?: string
  dependencies?: number[]
  result?: string
}

export interface Plan {
  id: string
  goal: string
  summary: string
  steps: PlanStep[]
  createdAt: Date
  updatedAt: Date
  status: 'draft' | 'active' | 'completed' | 'paused'
}

export interface PlannerAgentState {
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
  currentPlan?: Plan
  previousPlans: Plan[]
}

export interface PlannerAgentResponse {
  success: boolean
  plan?: Plan
  message: string
  error?: string
}

// ============================================================================
// Input Schemas
// ============================================================================

export const CreatePlanSchema = z.object({
  goal: z.string().min(1).max(2000),
  context: z.string().optional(),
  constraints: z.array(z.string()).optional(),
  maxSteps: z.number().int().min(1).max(20).optional().default(10),
})

export const UpdatePlanSchema = z.object({
  planId: z.string().uuid().optional(), // If not provided, updates current plan
  stepId: z.number().int().min(1).optional(),
  status: z.enum(['pending', 'in_progress', 'completed', 'failed']).optional(),
  result: z.string().optional(),
})

export const ExecuteStepSchema = z.object({
  planId: z.string().uuid().optional(),
  stepId: z.number().int().min(1),
})

export type CreatePlanInput = z.infer<typeof CreatePlanSchema>
export type UpdatePlanInput = z.infer<typeof UpdatePlanSchema>
export type ExecuteStepInput = z.infer<typeof ExecuteStepSchema>

// ============================================================================
// Structured Output Schema
// ============================================================================

const PlanOutputSchema = z.object({
  summary: z.string(),
  steps: z.array(
    z.object({
      id: z.number(),
      description: z.string(),
      estimatedTime: z.string().optional(),
      dependencies: z.array(z.number()).optional(),
    })
  ),
})

// ============================================================================
// Planning Prompt
// ============================================================================

const PLANNING_PROMPT = `You are a strategic planning assistant. Your job is to break down goals into clear, actionable steps.

For each goal, create a plan with:
1. A brief summary (1-2 sentences)
2. A numbered list of steps (each step should be specific and actionable)
3. Estimated time for each step
4. Dependencies between steps (which steps must be completed first)

Output format (JSON):
{
  "summary": "Brief description of the plan",
  "steps": [
    {
      "id": 1,
      "description": "Specific action to take",
      "estimatedTime": "30 minutes",
      "dependencies": []
    },
    {
      "id": 2,
      "description": "Next action",
      "estimatedTime": "1 hour",
      "dependencies": [1]
    }
  ]
}

Keep steps focused and achievable. Prioritize clarity over complexity.
Only output valid JSON.`

// ============================================================================
// Planner Agent Class
// ============================================================================

export class PlannerAgent {
  private supabase: SupabaseClient
  private userId: string
  private model: string
  private sharedContextService?: SharedContextService
  private state: PlannerAgentState

  constructor(config: PlannerAgentConfig) {
    this.supabase = config.supabase
    this.userId = config.userId
    this.model = config.model ?? selectModel('planner').id
    this.sharedContextService = config.sharedContextService
    this.state = {
      messages: [],
      previousPlans: [],
    }
  }

  /**
   * Create a new plan
   */
  async createPlan(input: CreatePlanInput): Promise<PlannerAgentResponse> {
    try {
      const userContent = await this.buildPlanUserContent(input)
      const parsed = await this.generatePlanOutput(userContent)

      const plan: Plan = {
        id: crypto.randomUUID(),
        goal: input.goal,
        summary: parsed.summary || 'Plan created',
        steps: (parsed.steps || []).map(
          (step: {
            id: number
            description: string
            estimatedTime?: string
            dependencies?: number[]
          }) => ({
            ...step,
            status: 'pending' as const,
          })
        ),
        createdAt: new Date(),
        updatedAt: new Date(),
        status: 'draft',
      }

      // Save plan to memory/state
      this.state.currentPlan = plan
      await this.savePlanToMemory(plan)

      // Write shared context entry for the new plan
      if (this.sharedContextService) {
        try {
          await this.sharedContextService.write({
            agent: 'planner',
            type: 'active_plan',
            summary: `Plan: ${plan.summary}`,
            payload: {
              planId: plan.id,
              goal: plan.goal,
              stepCount: plan.steps.length,
            },
          })
        } catch {
          // Best-effort — swallow errors
        }
      }

      return {
        success: true,
        plan,
        message: `Created plan with ${plan.steps.length} steps`,
      }
    } catch (err) {
      return {
        success: false,
        message: 'Failed to create plan',
        error: String(err),
      }
    }
  }

  /**
   * Stream plan creation
   */
  async *streamCreatePlan(input: CreatePlanInput): AsyncGenerator<{
    type: 'thinking' | 'step' | 'summary' | 'finish'
    data: string | PlanStep | Plan
  }> {
    yield { type: 'thinking', data: 'Analyzing your goal...' }

    try {
      const userContent = await this.buildPlanUserContent(input)

      yield { type: 'thinking', data: 'Creating action plan...' }

      const parsed = await this.generatePlanOutput(userContent)

      yield { type: 'summary', data: parsed.summary || 'Plan created' }

      const plan: Plan = {
        id: crypto.randomUUID(),
        goal: input.goal,
        summary: parsed.summary || 'Plan created',
        steps: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        status: 'draft',
      }

      // Emit steps one by one
      for (const step of parsed.steps || []) {
        const planStep: PlanStep = {
          id: step.id,
          description: step.description,
          estimatedTime: step.estimatedTime,
          dependencies: step.dependencies,
          status: 'pending',
        }
        plan.steps.push(planStep)
        yield { type: 'step', data: planStep }
        await new Promise((resolve) => setTimeout(resolve, 200)) // Small delay for effect
      }

      this.state.currentPlan = plan
      await this.savePlanToMemory(plan)

      // Write shared context entry for the new plan
      if (this.sharedContextService) {
        try {
          await this.sharedContextService.write({
            agent: 'planner',
            type: 'active_plan',
            summary: `Plan: ${plan.summary}`,
            payload: {
              planId: plan.id,
              goal: plan.goal,
              stepCount: plan.steps.length,
            },
          })
        } catch {
          // Best-effort — swallow errors
        }
      }

      yield { type: 'finish', data: plan }
    } catch (err) {
      yield { type: 'thinking', data: `Error: ${err}` }
    }
  }

  /**
   * Update a plan or step status
   */
  async updatePlan(input: UpdatePlanInput): Promise<PlannerAgentResponse> {
    const plan = this.state.currentPlan

    if (!plan) {
      return {
        success: false,
        message: 'No active plan to update',
      }
    }

    if (input.stepId) {
      const step = plan.steps.find((s) => s.id === input.stepId)
      if (!step) {
        return {
          success: false,
          message: `Step ${input.stepId} not found`,
        }
      }

      if (input.status) step.status = input.status
      if (input.result) step.result = input.result
      plan.updatedAt = new Date()

      // Check if all steps completed
      if (plan.steps.every((s) => s.status === 'completed')) {
        plan.status = 'completed'
      }
    }

    await this.savePlanToMemory(plan)

    return {
      success: true,
      plan,
      message: 'Plan updated',
    }
  }

  /**
   * Get suggestions for executing a step
   */
  async getStepGuidance(input: ExecuteStepInput): Promise<{
    success: boolean
    step?: PlanStep
    guidance?: string
    error?: string
  }> {
    const plan = this.state.currentPlan

    if (!plan) {
      return { success: false, error: 'No active plan' }
    }

    const step = plan.steps.find((s) => s.id === input.stepId)
    if (!step) {
      return { success: false, error: `Step ${input.stepId} not found` }
    }

    // Check dependencies
    const incompleteDeps =
      step.dependencies?.filter((depId) => {
        const dep = plan.steps.find((s) => s.id === depId)
        return dep && dep.status !== 'completed'
      }) || []

    if (incompleteDeps.length > 0) {
      return {
        success: true,
        step,
        guidance: `This step depends on steps ${incompleteDeps.join(', ')} which are not yet completed.`,
      }
    }

    // Get AI guidance
    const startTime = Date.now()
    const { model: planModel, entry: planEntry } = resolveModel('planner', this.model)
    const result = await generateText({
      model: planModel,
      system:
        'You are a helpful assistant. Provide brief, actionable guidance for completing a task step.',
      messages: [
        {
          role: 'user' as const,
          content: `Goal: ${plan.goal}\n\nStep to execute: ${step.description}\n\nEstimated time: ${step.estimatedTime || 'Not specified'}\n\nProvide 2-3 practical tips for completing this step effectively.`,
        },
      ],
      temperature: 0.7,
      maxOutputTokens: 500,
    })
    recordAISDKUsage(result.usage, { model: planEntry.id, taskType: 'planner' }, startTime)

    return {
      success: true,
      step,
      guidance: result.text || 'Focus on completing this step before moving to the next.',
    }
  }

  /**
   * Get current state
   */
  getState(): PlannerAgentState {
    return { ...this.state }
  }

  /**
   * Get current plan
   */
  getCurrentPlan(): Plan | undefined {
    return this.state.currentPlan
  }

  /**
   * Build user content string from input and shared context
   */
  private async buildPlanUserContent(input: CreatePlanInput): Promise<string> {
    let userContent = `Goal: ${input.goal}`
    if (input.context) {
      userContent += `\n\nContext: ${input.context}`
    }
    if (input.constraints?.length) {
      userContent += `\n\nConstraints:\n${input.constraints.map((c) => `- ${c}`).join('\n')}`
    }
    userContent += `\n\nMaximum steps: ${input.maxSteps}`

    if (this.sharedContextService) {
      try {
        const sharedCtx = await this.sharedContextService.read({
          relevantTypes: ['research_done', 'note_created', 'note_edited', 'course_saved'],
        })
        if (sharedCtx) {
          userContent += '\n\n' + sharedCtx
        }
      } catch {
        // Graceful degradation
      }
    }
    return userContent
  }

  /**
   * Generate plan output via AI SDK
   */
  private async generatePlanOutput(userContent: string): Promise<{
    summary: string
    steps: Array<{ id: number; description: string; estimatedTime?: string; dependencies?: number[] }>
  }> {
    const startTime = Date.now()
    const { model: planModel, entry: planEntry } = resolveModel('planner', this.model)
    const result = await generateText({
      model: planModel,
      system: PLANNING_PROMPT,
      messages: [{ role: 'user' as const, content: userContent }],
      temperature: 0.7,
      maxOutputTokens: 2000,
      output: Output.object({ schema: PlanOutputSchema }),
    })
    recordAISDKUsage(result.usage, { model: planEntry.id, taskType: 'planner' }, startTime)

    if (result.output) return result.output
    try {
      return JSON.parse(stripJsonFences(result.text))
    } catch {
      return { summary: 'Plan created', steps: [] }
    }
  }

  /**
   * Activate a plan
   */
  activatePlan(): boolean {
    if (this.state.currentPlan) {
      this.state.currentPlan.status = 'active'
      return true
    }
    return false
  }

  // =========================================================================
  // Private Methods
  // =========================================================================

  private async savePlanToMemory(plan: Plan): Promise<void> {
    try {
      // Save to AI memory as plan_index
      await this.supabase.rpc('set_ai_memory', {
        p_user_id: this.userId,
        p_memory_type: 'plan_index',
        p_content: JSON.stringify({
          currentPlanId: plan.id,
          goal: plan.goal,
          summary: plan.summary,
          stepCount: plan.steps.length,
          completedSteps: plan.steps.filter((s) => s.status === 'completed').length,
          status: plan.status,
          updatedAt: plan.updatedAt.toISOString(),
        }),
        p_metadata: { plan },
      })
    } catch {
      // Ignore save errors
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createPlannerAgent(config: PlannerAgentConfig): PlannerAgent {
  return new PlannerAgent(config)
}
