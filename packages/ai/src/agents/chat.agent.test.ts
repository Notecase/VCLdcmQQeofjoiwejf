import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Hoisted mocks — available before module loading
// ---------------------------------------------------------------------------

const { mockStreamText, mockGenerateText, mockEmbed } = vi.hoisted(() => ({
  mockStreamText: vi.fn(),
  mockGenerateText: vi.fn(),
  mockEmbed: vi.fn(),
}))

vi.mock('ai', () => ({
  streamText: mockStreamText,
  generateText: mockGenerateText,
  embed: mockEmbed,
}))

vi.mock('../providers/model-registry', () => ({
  selectModel: () => ({ id: 'test-model', provider: 'openai' }),
}))

vi.mock('../providers/ai-sdk-factory', () => ({
  resolveModel: () => ({
    model: 'mock-model',
    entry: { id: 'test-model' },
  }),
  resolveModelsForTask: () => ({
    primary: { model: 'mock-model', entry: { id: 'test-model', provider: 'openai' } },
    fallback: null,
  }),
  isTransientError: () => false,
  getEmbeddingModel: () => 'mock-embedding-model',
}))

vi.mock('../providers/ai-sdk-usage', () => ({
  trackAISDKUsage: () => () => {},
  recordAISDKUsage: () => {},
}))

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { ChatAgent } from './chat.agent'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface QueryChain {
  select: () => QueryChain
  eq: (field: string, value: unknown) => QueryChain
  order: () => QueryChain
  limit: () => Promise<{ data: unknown[]; error: null }>
  single: () => Promise<{ data: unknown; error: unknown }>
  upsert: () => Promise<{ data: null; error: null }>
  rpc: () => Promise<{ data: unknown[]; error: null }>
}

function createSupabaseStub(overrides?: {
  sessionState?: unknown
  embeddingResults?: Array<{
    note_id: string
    note_title: string
    chunk_text: string
    similarity: number
  }>
}): SupabaseClient {
  return {
    from: vi.fn((_table: string) => {
      const chain: QueryChain = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: async () => ({ data: [], error: null }),
        single: async () => ({
          data: overrides?.sessionState ?? null,
          error: overrides?.sessionState ? null : { message: 'not found' },
        }),
        upsert: async () => ({ data: null, error: null }),
        rpc: async () => ({ data: overrides?.embeddingResults ?? [], error: null }),
      }
      return chain
    }),
    rpc: vi.fn(async () => ({
      data: overrides?.embeddingResults ?? [],
      error: null,
    })),
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChatAgent', () => {
  beforeEach(() => {
    mockStreamText.mockReset()
    mockGenerateText.mockReset()
    mockEmbed.mockReset()

    // Default embed mock
    mockEmbed.mockResolvedValue({ embedding: [0.1, 0.2, 0.3] })
  })

  // -------------------------------------------------------------------------
  // stream()
  // -------------------------------------------------------------------------

  describe('stream()', () => {
    it('emits thinking, text-delta, and finish events', async () => {
      // Mock RAG returning no results (supabase.rpc returns empty)
      const supabase = createSupabaseStub({ embeddingResults: [] })

      // Mock streamText returning an async iterable textStream
      mockStreamText.mockReturnValue({
        textStream: (async function* () {
          yield 'Hello '
          yield 'world!'
        })(),
      })

      const agent = new ChatAgent({ supabase, userId: 'u1' })

      const events = await collectEvents(
        agent.stream({ message: 'hi', includeRag: true, maxChunks: 5 })
      )

      // Should have thinking events
      expect(events.some((e) => e.type === 'thinking')).toBe(true)

      // Should have text-delta events
      const deltas = events.filter((e) => e.type === 'text-delta')
      expect(deltas.length).toBe(2)
      expect(deltas[0].data).toBe('Hello ')
      expect(deltas[1].data).toBe('world!')

      // Should end with finish
      const last = events[events.length - 1]
      expect(last.type).toBe('finish')
    })

    it('emits citation events when RAG finds matching chunks', async () => {
      const chunks = [
        {
          note_id: 'n1',
          note_title: 'My Note',
          chunk_text: 'Some relevant text about topic X',
          similarity: 0.85,
        },
      ]

      const supabase = createSupabaseStub({ embeddingResults: chunks })

      mockStreamText.mockReturnValue({
        textStream: (async function* () {
          yield 'Response based on context'
        })(),
      })

      const agent = new ChatAgent({ supabase, userId: 'u1' })
      const events = await collectEvents(
        agent.stream({ message: 'tell me about X', includeRag: true, maxChunks: 5 })
      )

      const citations = events.filter((e) => e.type === 'citation')
      expect(citations.length).toBe(1)
      expect(citations[0].data).toMatchObject({
        number: 1,
        noteId: 'n1',
        title: 'My Note',
      })
    })

    it('skips RAG when includeRag is false', async () => {
      const supabase = createSupabaseStub()

      mockStreamText.mockReturnValue({
        textStream: (async function* () {
          yield 'Direct response'
        })(),
      })

      const agent = new ChatAgent({ supabase, userId: 'u1' })
      const events = await collectEvents(
        agent.stream({ message: 'hello', includeRag: false, maxChunks: 5 })
      )

      // No citation events
      expect(events.filter((e) => e.type === 'citation').length).toBe(0)
      // embed should NOT have been called
      expect(mockEmbed).not.toHaveBeenCalled()
      // Still has text-delta
      expect(events.some((e) => e.type === 'text-delta')).toBe(true)
    })

    it('accumulates full content in internal messages state', async () => {
      const supabase = createSupabaseStub()

      mockStreamText.mockReturnValue({
        textStream: (async function* () {
          yield 'Part1'
          yield 'Part2'
        })(),
      })

      const agent = new ChatAgent({ supabase, userId: 'u1' })
      await collectEvents(agent.stream({ message: 'test', includeRag: false, maxChunks: 5 }))

      const state = agent.getState()
      // Should have user + assistant messages
      expect(state.messages.length).toBe(2)
      expect(state.messages[0].role).toBe('user')
      expect(state.messages[0].content).toBe('test')
      expect(state.messages[1].role).toBe('assistant')
      expect(state.messages[1].content).toBe('Part1Part2')
    })
  })

  // -------------------------------------------------------------------------
  // run()
  // -------------------------------------------------------------------------

  describe('run()', () => {
    it('returns content and citations from non-streaming path', async () => {
      const chunks = [
        {
          note_id: 'n1',
          note_title: 'Note A',
          chunk_text: 'Context text',
          similarity: 0.9,
        },
      ]
      const supabase = createSupabaseStub({ embeddingResults: chunks })

      mockGenerateText.mockResolvedValue({
        text: 'Generated response',
        usage: { inputTokens: 100, outputTokens: 50 },
      })

      const agent = new ChatAgent({ supabase, userId: 'u1' })
      const response = await agent.run({ message: 'question', includeRag: true, maxChunks: 5 })

      expect(response.content).toBe('Generated response')
      expect(response.citations.length).toBe(1)
      expect(response.citations[0].noteId).toBe('n1')
      expect(response.usage).toEqual({ inputTokens: 100, outputTokens: 50 })
    })

    it('returns empty citations when RAG is disabled', async () => {
      const supabase = createSupabaseStub()

      mockGenerateText.mockResolvedValue({
        text: 'Simple answer',
        usage: { inputTokens: 10, outputTokens: 5 },
      })

      const agent = new ChatAgent({ supabase, userId: 'u1' })
      const response = await agent.run({ message: 'hello', includeRag: false, maxChunks: 5 })

      expect(response.content).toBe('Simple answer')
      expect(response.citations).toEqual([])
    })
  })

  // -------------------------------------------------------------------------
  // loadSession()
  // -------------------------------------------------------------------------

  describe('loadSession()', () => {
    it('returns true and restores state when session exists', async () => {
      const savedState = {
        messages: [{ role: 'user', content: 'old msg', createdAt: new Date() }],
        retrievedChunks: [],
        citations: [],
      }

      const supabase = createSupabaseStub({ sessionState: { state: savedState } })

      const agent = new ChatAgent({ supabase, userId: 'u1' })
      const result = await agent.loadSession('11111111-1111-4111-8111-111111111111')

      expect(result).toBe(true)
      const state = agent.getState()
      expect(state.messages.length).toBe(1)
      expect(state.messages[0].content).toBe('old msg')
    })

    it('returns false when session does not exist', async () => {
      const supabase = createSupabaseStub() // no sessionState → single() returns error

      const agent = new ChatAgent({ supabase, userId: 'u1' })
      const result = await agent.loadSession('22222222-2222-4222-8222-222222222222')

      expect(result).toBe(false)
    })
  })
})
