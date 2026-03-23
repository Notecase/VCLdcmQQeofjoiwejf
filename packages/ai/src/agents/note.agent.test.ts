import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockStreamText, mockGenerateText } = vi.hoisted(() => ({
  mockStreamText: vi.fn(),
  mockGenerateText: vi.fn(),
}))

vi.mock('ai', () => ({
  streamText: mockStreamText,
  generateText: mockGenerateText,
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
}))

vi.mock('../providers/ai-sdk-usage', () => ({
  trackAISDKUsage: () => () => {},
  recordAISDKUsage: () => {},
}))

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { NoteAgent } from './note.agent'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface QueryChain {
  select: () => QueryChain
  eq: (field: string, value: unknown) => QueryChain
  single: () => Promise<{ data: unknown; error: unknown }>
  insert: (data: unknown) => QueryChain
  update: (data: unknown) => QueryChain
}

function createSupabaseStub(overrides?: {
  noteContent?: string
  noteTitle?: string
  insertedId?: string
  updateError?: boolean
  fetchError?: boolean
}): SupabaseClient {
  return {
    from: vi.fn((_table: string) => {
      const chain: QueryChain = {
        select: () => chain,
        eq: () => chain,
        single: async () => {
          if (overrides?.fetchError) {
            return { data: null, error: { message: 'not found' } }
          }
          return {
            data: {
              id: overrides?.insertedId ?? 'new-note-id',
              title: overrides?.noteTitle ?? 'Test Note',
              content: overrides?.noteContent ?? '# Test Note\n\nSome content here.',
            },
            error: null,
          }
        },
        insert: () => chain,
        update: () => {
          if (overrides?.updateError) {
            // Override single to return error on the update path
            return {
              ...chain,
              eq: () => ({
                ...chain,
                eq: async () => ({
                  data: null,
                  error: { message: 'update failed' },
                }),
              }),
            } as unknown as QueryChain
          }
          return chain
        },
      }
      return chain
    }),
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

const NOTE_ID = '11111111-1111-4111-8111-111111111111'
const PROJECT_ID = '22222222-2222-4222-8222-222222222222'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NoteAgent', () => {
  beforeEach(() => {
    mockStreamText.mockReset()
    mockGenerateText.mockReset()
  })

  // -------------------------------------------------------------------------
  // stream() — create action
  // -------------------------------------------------------------------------

  describe('stream() create', () => {
    it('streams text-delta events and emits finish with success', async () => {
      const supabase = createSupabaseStub({ insertedId: 'created-id' })

      mockStreamText.mockReturnValue({
        textStream: (async function* () {
          yield '# New Note\n'
          yield '\nCreated content.'
        })(),
      })

      const agent = new NoteAgent({ supabase, userId: 'u1' })
      const events = await collectEvents(
        agent.stream({
          action: 'create',
          input: 'Create a note about testing',
          projectId: PROJECT_ID,
        })
      )

      // Should have thinking events
      expect(events.some((e) => e.type === 'thinking')).toBe(true)

      // Should have text-delta events
      const deltas = events.filter((e) => e.type === 'text-delta')
      expect(deltas.length).toBe(2)

      // Should emit title event when heading is detected
      expect(events.some((e) => e.type === 'title')).toBe(true)

      // Should end with finish success
      const finish = events.find((e) => e.type === 'finish')
      expect(finish).toBeDefined()
      expect((finish!.data as { success: boolean }).success).toBe(true)
    })
  })

  // -------------------------------------------------------------------------
  // stream() — update action
  // -------------------------------------------------------------------------

  describe('stream() update', () => {
    it('loads existing note content and streams updates', async () => {
      const supabase = createSupabaseStub({
        noteContent: '# Existing\n\nOld content.',
        noteTitle: 'Existing',
      })

      mockStreamText.mockReturnValue({
        textStream: (async function* () {
          yield '# Existing\n'
          yield '\nUpdated content.'
        })(),
      })

      const agent = new NoteAgent({ supabase, userId: 'u1' })
      const events = await collectEvents(
        agent.stream({
          action: 'update',
          input: 'Make it better',
          noteId: NOTE_ID,
        })
      )

      const deltas = events.filter((e) => e.type === 'text-delta')
      expect(deltas.length).toBe(2)

      const finish = events.find((e) => e.type === 'finish')
      expect((finish!.data as { success: boolean }).success).toBe(true)
    })

    it('emits finish with success=false when note fetch fails', async () => {
      const supabase = createSupabaseStub({ fetchError: true })

      const agent = new NoteAgent({ supabase, userId: 'u1' })
      const events = await collectEvents(
        agent.stream({
          action: 'update',
          input: 'Update this',
          noteId: NOTE_ID,
        })
      )

      const finish = events.find((e) => e.type === 'finish')
      expect(finish).toBeDefined()
      expect((finish!.data as { success: boolean }).success).toBe(false)
      // Should NOT have any text-delta events (stopped early)
      expect(events.filter((e) => e.type === 'text-delta').length).toBe(0)
    })
  })

  // -------------------------------------------------------------------------
  // stream() — summarize action
  // -------------------------------------------------------------------------

  describe('stream() summarize', () => {
    it('streams summary content', async () => {
      const supabase = createSupabaseStub({ noteContent: '# Big Note\n\nLots of content here.' })

      mockStreamText.mockReturnValue({
        textStream: (async function* () {
          yield '## Summary\n'
          yield '- Key point 1\n'
          yield '- Key point 2'
        })(),
      })

      const agent = new NoteAgent({ supabase, userId: 'u1' })
      const events = await collectEvents(
        agent.stream({
          action: 'summarize',
          input: 'Summarize this note',
          noteId: NOTE_ID,
        })
      )

      const deltas = events.filter((e) => e.type === 'text-delta')
      expect(deltas.length).toBe(3)

      const finish = events.find((e) => e.type === 'finish')
      expect((finish!.data as { success: boolean }).success).toBe(true)
    })
  })

  // -------------------------------------------------------------------------
  // stream() — expand action
  // -------------------------------------------------------------------------

  describe('stream() expand', () => {
    it('streams expanded content', async () => {
      const supabase = createSupabaseStub({ noteContent: '# Short Note\n\nBrief.' })

      mockStreamText.mockReturnValue({
        textStream: (async function* () {
          yield '# Short Note\n\n'
          yield 'Expanded with more detail and examples.'
        })(),
      })

      const agent = new NoteAgent({ supabase, userId: 'u1' })
      const events = await collectEvents(
        agent.stream({
          action: 'expand',
          input: 'Add more detail',
          noteId: NOTE_ID,
        })
      )

      const deltas = events.filter((e) => e.type === 'text-delta')
      expect(deltas.length).toBe(2)

      const finish = events.find((e) => e.type === 'finish')
      expect((finish!.data as { success: boolean }).success).toBe(true)
    })
  })

  // -------------------------------------------------------------------------
  // stream() — organize action
  // -------------------------------------------------------------------------

  describe('stream() organize', () => {
    it('streams reorganized content', async () => {
      const supabase = createSupabaseStub({ noteContent: 'Messy content\nno structure' })

      mockStreamText.mockReturnValue({
        textStream: (async function* () {
          yield '# Organized\n\n'
          yield '## Section 1\n\nClean content.'
        })(),
      })

      const agent = new NoteAgent({ supabase, userId: 'u1' })
      const events = await collectEvents(
        agent.stream({
          action: 'organize',
          input: 'Organize this',
          noteId: NOTE_ID,
        })
      )

      const deltas = events.filter((e) => e.type === 'text-delta')
      expect(deltas.length).toBe(2)

      const finish = events.find((e) => e.type === 'finish')
      expect((finish!.data as { success: boolean }).success).toBe(true)
    })
  })

  // -------------------------------------------------------------------------
  // stream() — invalid input
  // -------------------------------------------------------------------------

  describe('stream() validation', () => {
    it('emits error and finish on invalid input', async () => {
      const supabase = createSupabaseStub()

      const agent = new NoteAgent({ supabase, userId: 'u1' })
      // Empty input string fails zod validation (min 1)
      const events = await collectEvents(
        agent.stream({
          action: 'create',
          input: '',
        })
      )

      const finish = events.find((e) => e.type === 'finish')
      expect(finish).toBeDefined()
      expect((finish!.data as { success: boolean }).success).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // run() — non-streaming
  // -------------------------------------------------------------------------

  describe('run()', () => {
    it('create action returns noteId and content', async () => {
      const supabase = createSupabaseStub({ insertedId: 'new-note-123' })

      mockGenerateText.mockResolvedValue({
        text: '# Created Note\n\nContent here.',
        usage: { inputTokens: 50, outputTokens: 100 },
      })

      const agent = new NoteAgent({ supabase, userId: 'u1' })
      const result = await agent.run({
        action: 'create',
        input: 'Create a note about testing',
        projectId: PROJECT_ID,
      })

      expect(result.success).toBe(true)
      expect(result.action).toBe('create')
      expect(result.content).toBe('# Created Note\n\nContent here.')
      expect(result.title).toBe('Created Note')
    })

    it('update action errors when noteId is missing', async () => {
      const supabase = createSupabaseStub()

      const agent = new NoteAgent({ supabase, userId: 'u1' })
      const result = await agent.run({
        action: 'update',
        input: 'Update something',
        // no noteId
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Note ID required')
    })

    it('summarize action works with provided text (no noteId)', async () => {
      const supabase = createSupabaseStub()

      mockGenerateText.mockResolvedValue({
        text: '## Summary\n\n- Point 1\n- Point 2',
        usage: { inputTokens: 30, outputTokens: 20 },
      })

      const agent = new NoteAgent({ supabase, userId: 'u1' })
      const result = await agent.run({
        action: 'summarize',
        input: 'Long text to summarize goes here...',
      })

      expect(result.success).toBe(true)
      expect(result.action).toBe('summarize')
      expect(result.content).toContain('Summary')
    })

    it('organize action errors when noteId is missing', async () => {
      const supabase = createSupabaseStub()

      const agent = new NoteAgent({ supabase, userId: 'u1' })
      const result = await agent.run({
        action: 'organize',
        input: 'Organize this',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Note ID required')
    })

    it('expand action errors when noteId is missing', async () => {
      const supabase = createSupabaseStub()

      const agent = new NoteAgent({ supabase, userId: 'u1' })
      const result = await agent.run({
        action: 'expand',
        input: 'Expand this',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Note ID required')
    })
  })
})
