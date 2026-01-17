/**
 * Planner Agent
 * 
 * Goal decomposition and task planning agent.
 * Creates actionable plans from high-level goals.
 * 
 * Compatible with:
 * - Vercel AI SDK for streaming
 * - Hono for API routing
 * - LangGraph for state management
 */

import { z } from 'zod'
import { SupabaseClient } from '@supabase/supabase-js'

// ============================================================================
// Types
// ============================================================================

export interface PlannerAgentConfig {
    supabase: SupabaseClient
    userId: string
    openaiApiKey: string
    model?: string
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
    private openaiApiKey: string
    private model: string
    private state: PlannerAgentState

    constructor(config: PlannerAgentConfig) {
        this.supabase = config.supabase
        this.userId = config.userId
        this.openaiApiKey = config.openaiApiKey
        this.model = config.model ?? 'gpt-5.2'
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
            const OpenAI = (await import('openai')).default
            const client = new OpenAI({ apiKey: this.openaiApiKey })

            let userContent = `Goal: ${input.goal}`
            if (input.context) {
                userContent += `\n\nContext: ${input.context}`
            }
            if (input.constraints?.length) {
                userContent += `\n\nConstraints:\n${input.constraints.map(c => `- ${c}`).join('\n')}`
            }
            userContent += `\n\nMaximum steps: ${input.maxSteps}`

            const response = await client.chat.completions.create({
                model: this.model,
                messages: [
                    { role: 'system', content: PLANNING_PROMPT },
                    { role: 'user', content: userContent },
                ],
                temperature: 0.7,
                max_tokens: 2000,
            })

            const content = response.choices[0]?.message?.content || '{}'
            const parsed = JSON.parse(content.replace(/```json\n?|\n?```/g, '').trim())

            const plan: Plan = {
                id: crypto.randomUUID(),
                goal: input.goal,
                summary: parsed.summary || 'Plan created',
                steps: (parsed.steps || []).map((step: { id: number; description: string; estimatedTime?: string; dependencies?: number[] }) => ({
                    ...step,
                    status: 'pending' as const,
                })),
                createdAt: new Date(),
                updatedAt: new Date(),
                status: 'draft',
            }

            // Save plan to memory/state
            this.state.currentPlan = plan
            await this.savePlanToMemory(plan)

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
            const OpenAI = (await import('openai')).default
            const client = new OpenAI({ apiKey: this.openaiApiKey })

            let userContent = `Goal: ${input.goal}`
            if (input.context) {
                userContent += `\n\nContext: ${input.context}`
            }
            if (input.constraints?.length) {
                userContent += `\n\nConstraints:\n${input.constraints.map(c => `- ${c}`).join('\n')}`
            }
            userContent += `\n\nMaximum steps: ${input.maxSteps}`

            yield { type: 'thinking', data: 'Creating action plan...' }

            const response = await client.chat.completions.create({
                model: this.model,
                messages: [
                    { role: 'system', content: PLANNING_PROMPT },
                    { role: 'user', content: userContent },
                ],
                temperature: 0.7,
                max_tokens: 2000,
            })

            const content = response.choices[0]?.message?.content || '{}'
            const parsed = JSON.parse(content.replace(/```json\n?|\n?```/g, '').trim())

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
                await new Promise(resolve => setTimeout(resolve, 200)) // Small delay for effect
            }

            this.state.currentPlan = plan
            await this.savePlanToMemory(plan)

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
            const step = plan.steps.find(s => s.id === input.stepId)
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
            if (plan.steps.every(s => s.status === 'completed')) {
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

        const step = plan.steps.find(s => s.id === input.stepId)
        if (!step) {
            return { success: false, error: `Step ${input.stepId} not found` }
        }

        // Check dependencies
        const incompleteDeps = step.dependencies?.filter(depId => {
            const dep = plan.steps.find(s => s.id === depId)
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
        const OpenAI = (await import('openai')).default
        const client = new OpenAI({ apiKey: this.openaiApiKey })

        const response = await client.chat.completions.create({
            model: this.model,
            messages: [
                {
                    role: 'system',
                    content: 'You are a helpful assistant. Provide brief, actionable guidance for completing a task step.'
                },
                {
                    role: 'user',
                    content: `Goal: ${plan.goal}\n\nStep to execute: ${step.description}\n\nEstimated time: ${step.estimatedTime || 'Not specified'}\n\nProvide 2-3 practical tips for completing this step effectively.`
                },
            ],
            temperature: 0.7,
            max_tokens: 500,
        })

        return {
            success: true,
            step,
            guidance: response.choices[0]?.message?.content || 'Focus on completing this step before moving to the next.',
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
                    completedSteps: plan.steps.filter(s => s.status === 'completed').length,
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
