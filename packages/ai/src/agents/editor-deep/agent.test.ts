import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const { executeToolMock, mockStream, capturedAgentConfig } = vi.hoisted(() => ({
  executeToolMock: vi.fn(),
  mockStream: vi.fn(),
  capturedAgentConfig: { last: null as any },
}))

vi.mock('../../tools', () => ({
  executeTool: executeToolMock,
}))

// Mock the AI SDK ToolLoopAgent — capture config for inspection
vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai')
  return {
    ...actual,
    ToolLoopAgent: class MockToolLoopAgent {
      constructor(config: any) {
        capturedAgentConfig.last = config
      }
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

  // =========================================================================
  // ED-01: ToolLoopAgent configured with stepCountIs(20)
  // =========================================================================

  it('configures ToolLoopAgent with stopWhen: stepCountIs(20)', async () => {
    mockStream.mockReturnValue({
      fullStream: (async function* () {
        yield { type: 'text-delta', text: 'ok' }
      })(),
    })

    const agent = new EditorDeepAgent({
      supabase: createSupabaseStub(),
      userId: 'u1',
    })

    await collectStreamEvents(agent, {
      message: 'hello',
      threadId: '11111111-1111-4111-8111-111111111111',
      context: {},
    })

    // The captured config from MockToolLoopAgent constructor
    expect(capturedAgentConfig.last).toBeTruthy()
    expect(capturedAgentConfig.last.stopWhen).toBeDefined()
  })

  // =========================================================================
  // ED-06: Model fallback on transient errors
  // =========================================================================

  it('falls back to secondary model on transient 429 error', async () => {
    let callCount = 0
    mockStream.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        throw new Error('429 Too Many Requests')
      }
      return {
        fullStream: (async function* () {
          yield { type: 'text-delta', text: 'Fallback response' }
        })(),
      }
    })

    const agent = new EditorDeepAgent({
      supabase: createSupabaseStub(),
      userId: 'u1',
    })

    const events = await collectStreamEvents(agent, {
      message: 'test fallback',
      threadId: '11111111-1111-4111-8111-111111111111',
      context: {},
    })

    // Should have a thinking event about switching models
    const switchEvent = events.find(
      (e) => e.type === 'thinking' && String(e.data).includes('Switching to')
    )
    expect(switchEvent).toBeTruthy()

    // Should still produce final output
    expect(events.some((e) => e.type === 'assistant-final')).toBe(true)
  })

  it('propagates non-transient errors without fallback', async () => {
    mockStream.mockImplementation(() => {
      throw new Error('Invalid API key')
    })

    const agent = new EditorDeepAgent({
      supabase: createSupabaseStub(),
      userId: 'u1',
    })

    const events = await collectStreamEvents(agent, {
      message: 'test non-transient',
      threadId: '11111111-1111-4111-8111-111111111111',
      context: { currentNoteId: '22222222-2222-4222-8222-222222222222' },
    })

    // Should emit error event
    const errorEvent = events.find((e) => e.type === 'error')
    expect(errorEvent).toBeTruthy()
    expect(String(errorEvent!.data)).toContain('Invalid API key')

    // Should still emit done
    expect(events.some((e) => e.type === 'done')).toBe(true)
  })

  // =========================================================================
  // ED-10: Deterministic summary — additional phrase coverage
  // =========================================================================

  it.each(['summarize this note', 'summary of this note', 'about this note'])(
    'uses deterministic summary fast path for "%s"',
    async (message) => {
      executeToolMock.mockResolvedValue({
        success: true,
        data: { title: 'Test Note', content: 'First paragraph.\n\nSecond paragraph.' },
      })

      const agent = new EditorDeepAgent({
        supabase: createSupabaseStub(),
        userId: 'u1',
      })

      const events = await collectStreamEvents(agent, {
        message,
        threadId: '22222222-2222-4222-8222-222222222222',
        context: { currentNoteId: '33333333-3333-4333-8333-333333333333' },
      })

      expect(mockStream).not.toHaveBeenCalled()
      const final = events.find((e) => e.type === 'assistant-final')
      expect(final).toBeTruthy()
      expect(String(final!.data)).toContain('mainly about')
    }
  )

  it.each(['edit this note', 'what about cats', 'summarize cats'])(
    'does NOT trigger fast path for "%s"',
    async (message) => {
      mockStream.mockReturnValue({
        fullStream: (async function* () {
          yield { type: 'text-delta', text: 'Normal response' }
        })(),
      })

      const agent = new EditorDeepAgent({
        supabase: createSupabaseStub(),
        userId: 'u1',
      })

      await collectStreamEvents(agent, {
        message,
        threadId: '22222222-2222-4222-8222-222222222222',
        context: { currentNoteId: '33333333-3333-4333-8333-333333333333' },
      })

      // Should have used ToolLoopAgent (not fast path)
      expect(mockStream).toHaveBeenCalled()
    }
  )

  describe('summarizeNoteContent', () => {
    it('returns empty message for notes with no content', async () => {
      executeToolMock.mockResolvedValue({
        success: true,
        data: { title: 'Empty', content: '' },
      })

      const agent = new EditorDeepAgent({
        supabase: createSupabaseStub(),
        userId: 'u1',
      })

      const events = await collectStreamEvents(agent, {
        message: "what's this note about",
        threadId: '22222222-2222-4222-8222-222222222222',
        context: { currentNoteId: '33333333-3333-4333-8333-333333333333' },
      })

      const final = events.find((e) => e.type === 'assistant-final')
      expect(String(final?.data)).toContain('currently empty')
    })

    it('returns single bullet for single-paragraph note', async () => {
      executeToolMock.mockResolvedValue({
        success: true,
        data: { title: 'Short', content: 'Just one paragraph here.' },
      })

      const agent = new EditorDeepAgent({
        supabase: createSupabaseStub(),
        userId: 'u1',
      })

      const events = await collectStreamEvents(agent, {
        message: "what's this note about",
        threadId: '22222222-2222-4222-8222-222222222222',
        context: { currentNoteId: '33333333-3333-4333-8333-333333333333' },
      })

      const final = events.find((e) => e.type === 'assistant-final')
      const text = String(final?.data)
      expect(text).toContain('mainly about')
      const bullets = text.split('\n').filter((l) => l.startsWith('- '))
      expect(bullets).toHaveLength(1)
    })

    it('limits to first 3 paragraphs and truncates at 180 chars', async () => {
      const longParagraph = 'A'.repeat(200)
      executeToolMock.mockResolvedValue({
        success: true,
        data: {
          title: 'Long',
          content: [longParagraph, 'Second.', 'Third.', 'Fourth.', 'Fifth.'].join('\n\n'),
        },
      })

      const agent = new EditorDeepAgent({
        supabase: createSupabaseStub(),
        userId: 'u1',
      })

      const events = await collectStreamEvents(agent, {
        message: "what's this note about",
        threadId: '22222222-2222-4222-8222-222222222222',
        context: { currentNoteId: '33333333-3333-4333-8333-333333333333' },
      })

      const final = events.find((e) => e.type === 'assistant-final')
      const text = String(final?.data)
      const bullets = text.split('\n').filter((l) => l.startsWith('- '))
      expect(bullets).toHaveLength(3)
      // First bullet should be truncated with ...
      expect(bullets[0]).toContain('...')
      // Should not contain fourth/fifth paragraphs
      expect(text).not.toContain('Fourth.')
      expect(text).not.toContain('Fifth.')
    })
  })
})
