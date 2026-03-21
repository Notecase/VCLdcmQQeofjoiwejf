import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// Mock client-factory to avoid real OpenAI client creation
vi.mock('../providers/client-factory', () => ({
  createOpenAIClient: () => ({
    chat: { completions: { create: vi.fn() } },
  }),
}))

vi.mock('../providers/model-registry', () => ({
  selectModel: () => ({
    id: 'gemini-3.1-pro-preview',
    provider: 'gemini',
    displayName: 'Gemini 3.1 Pro',
    contextWindow: 2000000,
    capabilities: ['chat'],
    costPer1kInput: 0.125,
    costPer1kOutput: 1.0,
    maxOutputTokens: 65536,
    supportsToolChoice: true,
  }),
}))

import { EditorAgent, type IntentClassification } from './editor.agent'

function createSupabaseStub(): SupabaseClient {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: new Error('not used in test') }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
    insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
  }

  return {
    from: vi.fn(() => chain),
  } as unknown as SupabaseClient
}

describe('EditorAgent regression', () => {
  it('falls back to chat path when open_note intent has no noteId', async () => {
    const agent = new EditorAgent({
      supabase: createSupabaseStub(),
      userId: 'user-1',
      openaiApiKey: 'test-key',
    })

    const chatSpy = vi.fn(async function* () {
      yield { type: 'text-delta', data: 'This note is about distributed systems.' }
    })

    ;(agent as unknown as { state: { context: { currentNoteId: string } } }).state = {
      context: { currentNoteId: '11111111-1111-4111-8111-111111111111' },
    }
    ;(agent as unknown as { streamChat: typeof chatSpy }).streamChat = chatSpy

    const intent: IntentClassification = {
      intent: 'open_note',
      confidence: 0.91,
      parameters: {},
      reasoning: 'user asks what current note is about',
    }

    const events: Array<{ type: string; data: unknown }> = []
    for await (const event of (
      agent as unknown as {
        streamExecution: (
          i: IntentClassification,
          message: string
        ) => AsyncGenerator<{ type: string; data: unknown }>
      }
    ).streamExecution(intent, "what's this note about")) {
      events.push(event)
    }

    expect(chatSpy).toHaveBeenCalledTimes(1)
    expect(events.some((event) => event.type === 'text-delta')).toBe(true)
  })

  it('falls back to chat in non-stream mode when open_note has no noteId but current note exists', async () => {
    const agent = new EditorAgent({
      supabase: createSupabaseStub(),
      userId: 'user-1',
      openaiApiKey: 'test-key',
    })

    ;(agent as unknown as { state: { context: { currentNoteId: string } } }).state = {
      context: { currentNoteId: '11111111-1111-4111-8111-111111111111' },
    }

    const handleChatSpy = vi.fn().mockResolvedValue({
      intent: {
        intent: 'chat',
        confidence: 0.9,
        parameters: {},
        reasoning: 'fallback',
      },
      response: 'Summary from chat fallback',
    })
    ;(agent as unknown as { handleChat: typeof handleChatSpy }).handleChat = handleChatSpy

    const intent: IntentClassification = {
      intent: 'open_note',
      confidence: 0.85,
      parameters: {},
      reasoning: 'read active note',
    }

    const result = await (
      agent as unknown as {
        executeIntent: (i: IntentClassification, message: string) => Promise<{ response: string }>
      }
    ).executeIntent(intent, "what's this note about")

    expect(handleChatSpy).toHaveBeenCalledTimes(1)
    expect(result.response).toContain('Summary from chat fallback')
  })

  it('parses structured array deltas from streaming chunks', async () => {
    const agent = new EditorAgent({
      supabase: createSupabaseStub(),
      userId: 'user-1',
      openaiApiKey: 'test-key',
    })

    const chunk = {
      choices: [
        {
          delta: {
            content: [
              { type: 'output_text', text: 'Hello ' },
              { type: 'output_text', text: 'world' },
            ],
          },
        },
      ],
    }

    const delta = (agent as unknown as { extractStreamDelta: (c: unknown) => string }).extractStreamDelta(
      chunk
    )
    expect(delta).toBe('Hello world')
  })
})
