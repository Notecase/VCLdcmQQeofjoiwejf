import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const { executeToolMock, mockStream } = vi.hoisted(() => ({
  executeToolMock: vi.fn(),
  mockStream: vi.fn(),
}))

vi.mock('../../tools', () => ({
  executeTool: executeToolMock,
}))

// Mock the AI SDK ToolLoopAgent
vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai')
  return {
    ...actual,
    ToolLoopAgent: class MockToolLoopAgent {
      constructor() {}
      async stream() {
        return mockStream()
      }
    },
  }
})

import { EditorDeepAgent } from './agent'

function createSupabaseStub(rows?: {
  editorMessages?: Array<{ role: string; content: string; created_at: string }>
}): SupabaseClient {
  interface QueryChain {
    select: () => QueryChain
    eq: (field: string, value: unknown) => QueryChain
    order: () => QueryChain
    limit: () => Promise<{ data: unknown[]; error: null }>
    update: () => QueryChain
    in: () => Promise<{ data: null; error: null }>
    upsert: () => Promise<{ data: null; error: null }>
    maybeSingle: () => Promise<{ data: null; error: null }>
  }

  return {
    from: vi.fn((_table: string) => {
      const chain: QueryChain = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: async () => ({ data: rows?.editorMessages || [], error: null }),
        update: () => chain,
        in: async () => ({ data: null, error: null }),
        upsert: async () => ({ data: null, error: null }),
        maybeSingle: async () => ({ data: null, error: null }),
      }
      return chain
    }),
  } as unknown as SupabaseClient
}

async function collectStreamEvents(
  agent: EditorDeepAgent,
  input: Parameters<EditorDeepAgent['stream']>[0]
) {
  const events: Array<{ type: string; data: unknown }> = []
  for await (const event of agent.stream(input)) {
    events.push(event as { type: string; data: unknown })
  }
  return events
}

describe('EditorDeepAgent', () => {
  beforeEach(() => {
    executeToolMock.mockReset()
    mockStream.mockReset()
  })

  it('streams text through ToolLoopAgent and emits assistant-final + done', async () => {
    // Mock ToolLoopAgent.stream() returning a fullStream with text events
    mockStream.mockReturnValue({
      fullStream: (async function* () {
        yield { type: 'text-delta', id: '1', text: 'Hello ' }
        yield { type: 'text-delta', id: '1', text: 'world!' }
      })(),
    })

    const agent = new EditorDeepAgent({
      supabase: createSupabaseStub(),
      userId: 'u1',
    })

    const events = await collectStreamEvents(agent, {
      message: 'hello there',
      threadId: '11111111-1111-4111-8111-111111111111',
      context: {},
    })

    expect(events.some((event) => event.type === 'assistant-start')).toBe(true)
    expect(events.some((event) => event.type === 'assistant-delta')).toBe(true)
    expect(events.some((event) => event.type === 'assistant-final')).toBe(true)
    expect(events.some((event) => event.type === 'done')).toBe(true)

    const finalEvent = events.find((e) => e.type === 'assistant-final')
    expect(finalEvent?.data).toBe('Hello world!')
  })

  it.each(["what's this note about", 'whats this note about', 'what is this note about'])(
    'uses deterministic summary fast path for "%s"',
    async (message) => {
      executeToolMock.mockResolvedValue({
        success: true,
        data: {
          title: 'MLE and MAP',
          content: 'MLE chooses parameters maximizing likelihood.\n\nMAP adds priors.',
        },
      })

      const agent = new EditorDeepAgent({
        supabase: createSupabaseStub(),
        userId: 'u1',
      })

      const events = await collectStreamEvents(agent, {
        message,
        threadId: '22222222-2222-4222-8222-222222222222',
        context: {
          currentNoteId: '33333333-3333-4333-8333-333333333333',
        },
      })

      // Should NOT have called ToolLoopAgent (fast path bypasses it)
      expect(mockStream).not.toHaveBeenCalled()
      expect(events.some((event) => event.type === 'assistant-final')).toBe(true)
      const final = events.find((event) => event.type === 'assistant-final')
      expect(String(final?.data || '')).toContain('mainly about')
    }
  )

  it('emits assistant-final before done when ToolLoopAgent throws', async () => {
    mockStream.mockImplementation(() => {
      throw new Error('synthetic agent failure')
    })

    const agent = new EditorDeepAgent({
      supabase: createSupabaseStub(),
      userId: 'u1',
    })

    const events = await collectStreamEvents(agent, {
      message: 'explain this note',
      threadId: '44444444-4444-4444-8444-444444444444',
      context: {
        currentNoteId: '55555555-5555-4555-8555-555555555555',
      },
    })

    const finalIndex = events.findIndex((event) => event.type === 'assistant-final')
    const doneIndex = events.findIndex((event) => event.type === 'done')
    expect(finalIndex).toBeGreaterThanOrEqual(0)
    expect(doneIndex).toBeGreaterThan(finalIndex)
  })
})
