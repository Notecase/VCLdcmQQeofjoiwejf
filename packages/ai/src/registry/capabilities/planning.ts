/**
 * planning.decompose Capability
 *
 * Decomposes a goal into actionable steps via PlannerAgent.
 */

import { z } from 'zod'
import type { Capability, CapabilityContext } from '../types'

const inputSchema = z.object({
  goal: z.string().describe('The goal to decompose into steps'),
  constraints: z.array(z.string()).optional().describe('Optional constraints for the plan'),
})

async function execute(input: unknown, context: CapabilityContext): Promise<string> {
  const { goal, constraints } = inputSchema.parse(input)

  // Dynamic import to avoid circular dependencies
  const { PlannerAgent } = await import('../../agents/planner.agent')

  const agent = new PlannerAgent({
    supabase: context.supabase,
    userId: context.userId,
  })

  const result = await agent.createPlan({ goal, constraints, maxSteps: 10 })

  if (!result.success || !result.plan) {
    return `Failed to create plan: ${result.message || result.error || 'unknown error'}`
  }

  const { plan } = result
  const steps = plan.steps
    .map((s) => `${s.id}. ${s.description}${s.estimatedTime ? ` (~${s.estimatedTime})` : ''}`)
    .join('\n')

  return `## Plan: ${plan.summary}\n\n${steps}\n\n(${plan.steps.length} steps total)`
}

export const planningDecompose: Capability = {
  name: 'planning.decompose',
  description:
    'Decompose a goal into actionable steps with estimated time. Returns a structured plan.',
  inputSchema,
  execute,
}
