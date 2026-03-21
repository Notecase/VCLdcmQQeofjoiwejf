import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockGenerateText } = vi.hoisted(() => ({
  mockGenerateText: vi.fn(),
}))

vi.mock('ai', () => ({
  generateText: mockGenerateText,
  Output: { object: (opts: unknown) => opts },
}))

vi.mock('../providers/model-registry', () => ({
  selectModel: () => ({ id: 'test-model', provider: 'openai' }),
}))

vi.mock('../providers/ai-sdk-factory', () => ({
  resolveModel: () => ({
    model: 'mock-model',
    entry: { id: 'test-model' },
  }),
}))

vi.mock('../providers/ai-sdk-usage', () => ({
  trackAISDKUsage: () => () => {},
  recordAISDKUsage: () => {},
}))

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { PlannerAgent } from './planner.agent'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createSupabaseStub(): SupabaseClient {
  return {
    from: vi.fn(() => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        single: async () => ({ data: null, error: null }),
        upsert: async () => ({ data: null, error: null }),
        insert: () => chain,
        update: () => chain,
      }
      return chain
    }),
    rpc: vi.fn(async () => ({ data: null, error: null })),
  } as unknown as SupabaseClient
}

async function collectEvents(
  gen: AsyncGenerator<{ type: string; data: unknown }>
): Promise<Array<{ type: string; data: unknown }>> {
  const events: Array<{ type: string; data: unknown }> = []
  for await (const event of gen) {
    events.push(event)
  }
  return events
}

const SAMPLE_PLAN_OUTPUT = {
  summary: 'A plan to learn TypeScript',
  steps: [
    { id: 1, description: 'Read the docs', estimatedTime: '1 hour', dependencies: [] },
    { id: 2, description: 'Write a small project', estimatedTime: '2 hours', dependencies: [1] },
    { id: 3, description: 'Practice advanced types', estimatedTime: '1 hour', dependencies: [2] },
  ],
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PlannerAgent', () => {
  beforeEach(() => {
    mockGenerateText.mockReset()
  })

  // -------------------------------------------------------------------------
  // createPlan()
  // -------------------------------------------------------------------------

  describe('createPlan()', () => {
    it('generates a valid plan with steps', async () => {
      mockGenerateText.mockResolvedValue({
        text: JSON.stringify(SAMPLE_PLAN_OUTPUT),
        output: SAMPLE_PLAN_OUTPUT,
        usage: { inputTokens: 100, outputTokens: 200 },
      })

      const agent = new PlannerAgent({ supabase: createSupabaseStub(), userId: 'u1' })
      const result = await agent.createPlan({ goal: 'Learn TypeScript', maxSteps: 10 })

      expect(result.success).toBe(true)
      expect(result.plan).toBeDefined()
      expect(result.plan!.goal).toBe('Learn TypeScript')
      expect(result.plan!.summary).toBe('A plan to learn TypeScript')
      expect(result.plan!.steps.length).toBe(3)
      expect(result.plan!.steps[0].status).toBe('pending')
      expect(result.plan!.status).toBe('draft')
      expect(result.message).toContain('3 steps')
    })

    it('includes context and constraints in the prompt', async () => {
      mockGenerateText.mockResolvedValue({
        text: '{}',
        output: { summary: 'Plan with constraints', steps: [{ id: 1, description: 'Step 1' }] },
        usage: { inputTokens: 50, outputTokens: 50 },
      })

      const agent = new PlannerAgent({ supabase: createSupabaseStub(), userId: 'u1' })
      const result = await agent.createPlan({
        goal: 'Build an app',
        context: 'Using React and TypeScript',
        constraints: ['Must be done in 2 weeks', 'Use existing design system'],
        maxSteps: 5,
      })

      expect(result.success).toBe(true)
      // Verify generateText was called with user content containing context/constraints
      const callArgs = mockGenerateText.mock.calls[0][0]
      const userMessage = callArgs.messages[0].content
      expect(userMessage).toContain('Build an app')
      expect(userMessage).toContain('Using React and TypeScript')
      expect(userMessage).toContain('Must be done in 2 weeks')
      expect(userMessage).toContain('Maximum steps: 5')
    })

    it('returns error response when AI call fails', async () => {
      mockGenerateText.mockRejectedValue(new Error('API timeout'))

      const agent = new PlannerAgent({ supabase: createSupabaseStub(), userId: 'u1' })
      const result = await agent.createPlan({ goal: 'Something', maxSteps: 10 })

      expect(result.success).toBe(false)
      expect(result.error).toContain('API timeout')
      expect(result.message).toBe('Failed to create plan')
    })

    it('sets the plan as currentPlan in state', async () => {
      mockGenerateText.mockResolvedValue({
        text: '{}',
        output: SAMPLE_PLAN_OUTPUT,
        usage: { inputTokens: 50, outputTokens: 50 },
      })

      const agent = new PlannerAgent({ supabase: createSupabaseStub(), userId: 'u1' })
      await agent.createPlan({ goal: 'Test goal', maxSteps: 10 })

      const plan = agent.getCurrentPlan()
      expect(plan).toBeDefined()
      expect(plan!.goal).toBe('Test goal')
    })

    it('falls back to parsed text when output is null', async () => {
      mockGenerateText.mockResolvedValue({
        text: JSON.stringify(SAMPLE_PLAN_OUTPUT),
        output: null,
        usage: { inputTokens: 50, outputTokens: 50 },
      })

      const agent = new PlannerAgent({ supabase: createSupabaseStub(), userId: 'u1' })
      const result = await agent.createPlan({ goal: 'Fallback test', maxSteps: 10 })

      expect(result.success).toBe(true)
      expect(result.plan!.steps.length).toBe(3)
    })

    it('handles unparseable text fallback gracefully', async () => {
      mockGenerateText.mockResolvedValue({
        text: 'not valid json at all',
        output: null,
        usage: { inputTokens: 50, outputTokens: 50 },
      })

      const agent = new PlannerAgent({ supabase: createSupabaseStub(), userId: 'u1' })
      const result = await agent.createPlan({ goal: 'Bad output', maxSteps: 10 })

      // Should still succeed, just with an empty plan
      expect(result.success).toBe(true)
      expect(result.plan!.summary).toBe('Plan created')
      expect(result.plan!.steps.length).toBe(0)
    })
  })

  // -------------------------------------------------------------------------
  // streamCreatePlan()
  // -------------------------------------------------------------------------

  describe('streamCreatePlan()', () => {
    it('emits thinking, summary, step, and finish events', async () => {
      mockGenerateText.mockResolvedValue({
        text: '{}',
        output: SAMPLE_PLAN_OUTPUT,
        usage: { inputTokens: 100, outputTokens: 200 },
      })

      const agent = new PlannerAgent({ supabase: createSupabaseStub(), userId: 'u1' })
      const events = await collectEvents(
        agent.streamCreatePlan({ goal: 'Learn TypeScript', maxSteps: 10 })
      )

      // Should have thinking events
      const thinkingEvents = events.filter((e) => e.type === 'thinking')
      expect(thinkingEvents.length).toBeGreaterThanOrEqual(1)

      // Should have summary event
      const summaryEvent = events.find((e) => e.type === 'summary')
      expect(summaryEvent).toBeDefined()
      expect(summaryEvent!.data).toBe('A plan to learn TypeScript')

      // Should emit each step individually
      const stepEvents = events.filter((e) => e.type === 'step')
      expect(stepEvents.length).toBe(3)
      expect((stepEvents[0].data as { description: string }).description).toBe('Read the docs')
      expect((stepEvents[1].data as { description: string }).description).toBe(
        'Write a small project'
      )

      // Should end with finish containing the full plan
      const finishEvent = events.find((e) => e.type === 'finish')
      expect(finishEvent).toBeDefined()
      expect((finishEvent!.data as { goal: string }).goal).toBe('Learn TypeScript')
    })

    it('emits thinking error when AI call fails', async () => {
      mockGenerateText.mockRejectedValue(new Error('stream failure'))

      const agent = new PlannerAgent({ supabase: createSupabaseStub(), userId: 'u1' })
      const events = await collectEvents(
        agent.streamCreatePlan({ goal: 'Fail test', maxSteps: 10 })
      )

      const errorEvent = events.find(
        (e) => e.type === 'thinking' && String(e.data).includes('Error')
      )
      expect(errorEvent).toBeDefined()
    })
  })

  // -------------------------------------------------------------------------
  // updatePlan()
  // -------------------------------------------------------------------------

  describe('updatePlan()', () => {
    it('transitions step status correctly', async () => {
      // First create a plan
      mockGenerateText.mockResolvedValue({
        text: '{}',
        output: SAMPLE_PLAN_OUTPUT,
        usage: { inputTokens: 50, outputTokens: 50 },
      })

      const agent = new PlannerAgent({ supabase: createSupabaseStub(), userId: 'u1' })
      await agent.createPlan({ goal: 'Test plan', maxSteps: 10 })

      // Update step 1 to in_progress
      const result1 = await agent.updatePlan({ stepId: 1, status: 'in_progress' })
      expect(result1.success).toBe(true)
      expect(result1.plan!.steps[0].status).toBe('in_progress')

      // Complete step 1
      const result2 = await agent.updatePlan({
        stepId: 1,
        status: 'completed',
        result: 'Done reading docs',
      })
      expect(result2.success).toBe(true)
      expect(result2.plan!.steps[0].status).toBe('completed')
      expect(result2.plan!.steps[0].result).toBe('Done reading docs')
    })

    it('marks plan as completed when all steps are completed', async () => {
      mockGenerateText.mockResolvedValue({
        text: '{}',
        output: {
          summary: 'Simple plan',
          steps: [
            { id: 1, description: 'Only step', estimatedTime: '5 min' },
          ],
        },
        usage: { inputTokens: 50, outputTokens: 50 },
      })

      const agent = new PlannerAgent({ supabase: createSupabaseStub(), userId: 'u1' })
      await agent.createPlan({ goal: 'Quick task', maxSteps: 10 })

      const result = await agent.updatePlan({ stepId: 1, status: 'completed' })
      expect(result.success).toBe(true)
      expect(result.plan!.status).toBe('completed')
    })

    it('returns error when no active plan exists', async () => {
      const agent = new PlannerAgent({ supabase: createSupabaseStub(), userId: 'u1' })

      const result = await agent.updatePlan({ stepId: 1, status: 'completed' })
      expect(result.success).toBe(false)
      expect(result.message).toBe('No active plan to update')
    })

    it('returns error when step is not found', async () => {
      mockGenerateText.mockResolvedValue({
        text: '{}',
        output: SAMPLE_PLAN_OUTPUT,
        usage: { inputTokens: 50, outputTokens: 50 },
      })

      const agent = new PlannerAgent({ supabase: createSupabaseStub(), userId: 'u1' })
      await agent.createPlan({ goal: 'Test', maxSteps: 10 })

      const result = await agent.updatePlan({ stepId: 999, status: 'completed' })
      expect(result.success).toBe(false)
      expect(result.message).toContain('Step 999 not found')
    })
  })

  // -------------------------------------------------------------------------
  // activatePlan()
  // -------------------------------------------------------------------------

  describe('activatePlan()', () => {
    it('transitions plan status from draft to active', async () => {
      mockGenerateText.mockResolvedValue({
        text: '{}',
        output: SAMPLE_PLAN_OUTPUT,
        usage: { inputTokens: 50, outputTokens: 50 },
      })

      const agent = new PlannerAgent({ supabase: createSupabaseStub(), userId: 'u1' })
      await agent.createPlan({ goal: 'Activate me', maxSteps: 10 })

      expect(agent.getCurrentPlan()!.status).toBe('draft')
      const activated = agent.activatePlan()
      expect(activated).toBe(true)
      expect(agent.getCurrentPlan()!.status).toBe('active')
    })

    it('returns false when no plan exists', () => {
      const agent = new PlannerAgent({ supabase: createSupabaseStub(), userId: 'u1' })
      expect(agent.activatePlan()).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // getState()
  // -------------------------------------------------------------------------

  describe('getState()', () => {
    it('returns initial empty state', () => {
      const agent = new PlannerAgent({ supabase: createSupabaseStub(), userId: 'u1' })
      const state = agent.getState()

      expect(state.messages).toEqual([])
      expect(state.previousPlans).toEqual([])
      expect(state.currentPlan).toBeUndefined()
    })
  })
})
