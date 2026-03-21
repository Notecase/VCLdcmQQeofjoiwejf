import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const { createDeepAgentMock, executeToolMock } = vi.hoisted(() => ({
  createDeepAgentMock: vi.fn(),
  executeToolMock: vi.fn(),
}))

vi.mock('deepagents', () => ({
  createDeepAgent: createDeepAgentMock,
}))

vi.mock('@langchain/google-genai', () => ({
  ChatGoogleGenerativeAI: class ChatGoogleGenerativeAI {},
}))

vi.mock('../../tools', () => ({
  executeTool: executeToolMock,
}))

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
  }

  return {
    from: vi.fn((table: string) => {
      const state: Record<string, unknown> = {}
      const chain: QueryChain = {
        select: () => chain,
        eq: (field: string, value: unknown) => {
          state[field] = value
          return chain
        },
        order: () => chain,
        limit: async () => {
          if (table === 'editor_messages') {
            return { data: rows?.editorMessages || [], error: null }
          }
          if (table === 'editor_memories') {
            return { data: [], error: null }
          }
          return { data: [], error: null }
        },
        update: () => chain,
        in: async () => ({ data: null, error: null }),
        upsert: async () => ({ data: null, error: null }),
      }
      return chain
    }),
  } as unknown as SupabaseClient
}

async function collectStreamText(
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
    createDeepAgentMock.mockReset()
    executeToolMock.mockReset()
  })

  it('does not pass boolean checkpointer for root graph deep agent', async () => {
    createDeepAgentMock.mockReturnValue({
      stream: async function* () {
        yield {
          agent: {
            messages: [{ role: 'assistant', content: 'Deep response' }],
          },
        }
      },
    })

    const agent = new EditorDeepAgent({
      supabase: createSupabaseStub(),
      userId: 'u1',
      openaiApiKey: 'test-key',
    })

    const events = await collectStreamText(agent, {
      message: 'hello there',
      threadId: '11111111-1111-4111-8111-111111111111',
      context: {},
    })

    expect(createDeepAgentMock).toHaveBeenCalledTimes(1)
    const params = createDeepAgentMock.mock.calls[0]?.[0] as Record<string, unknown>
    expect(params.checkpointer).not.toBe(true)
    expect(events.some((event) => event.type === 'assistant-final')).toBe(true)
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
        openaiApiKey: 'test-key',
      })

      const events = await collectStreamText(agent, {
        message,
        threadId: '22222222-2222-4222-8222-222222222222',
        context: {
          currentNoteId: '33333333-3333-4333-8333-333333333333',
        },
      })

      expect(createDeepAgentMock).not.toHaveBeenCalled()
      expect(events.some((event) => event.type === 'assistant-final')).toBe(true)
      const final = events.find((event) => event.type === 'assistant-final')
      expect(String(final?.data || '')).toContain('mainly about')
    }
  )

  it('emits assistant-final before done when deep runtime throws', async () => {
    createDeepAgentMock.mockReturnValue({
      stream: async function* () {
        throw new Error('synthetic deep failure')
      },
    })

    const agent = new EditorDeepAgent({
      supabase: createSupabaseStub(),
      userId: 'u1',
      openaiApiKey: 'test-key',
    })

    const events = await collectStreamText(agent, {
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
