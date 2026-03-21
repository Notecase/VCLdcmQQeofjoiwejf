import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ResearchAgent } from './agent'

const { createMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
}))

vi.mock('openai', () => ({
  default: class OpenAI {
    chat = {
      completions: {
        create: createMock,
      },
    }
  },
}))

// Mock the client factory to return our mocked OpenAI client
vi.mock('../../providers/client-factory', () => ({
  createOpenAIClient: () => ({
    chat: {
      completions: {
        create: createMock,
      },
    },
  }),
  createLangChainModel: vi.fn(),
}))

vi.mock('../../providers/model-registry', () => ({
  selectModel: (taskType: string) => ({
    id: taskType === 'artifact' ? 'kimi-k2.5' : 'gemini-3.1-pro-preview',
    provider: taskType === 'artifact' ? 'ollama-cloud' : 'gemini',
    displayName: taskType === 'artifact' ? 'Kimi K2.5' : 'Gemini 3.1 Pro',
    contextWindow: 131072,
    capabilities: ['chat'],
    costPer1kInput: 0,
    costPer1kOutput: 0,
    maxOutputTokens: 32768,
    supportsToolChoice: false,
  }),
}))

function createTextStream(chunks: string[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield {
          choices: [{ delta: { content: chunk } }],
        }
      }
    },
  }
}

function createArtifactPayload(
  overrides: Partial<{
    title: string
    html: string
    css: string
    javascript: string
  }> = {}
) {
  return JSON.stringify({
    title: overrides.title ?? 'Study Timer',
    html: overrides.html ?? '<div id="timer">25:00</div>',
    css: overrides.css ?? '#timer { color: white; }',
    javascript: overrides.javascript ?? 'console.log("timer")',
  })
}

describe('ResearchAgent note draft mode', () => {
  const originalFlag = process.env.RESEARCH_NOTE_DRAFT_ENABLED

  beforeEach(() => {
    process.env.RESEARCH_NOTE_DRAFT_ENABLED = 'true'
    createMock.mockReset()

    createMock.mockImplementation(async (params: { stream?: boolean }) => {
      if (params.stream) {
        return createTextStream(['# Black Holes\n\n', 'Draft content body.'])
      }

      return {
        choices: [{ message: { content: createArtifactPayload() } }],
      }
    })
  })

  afterEach(() => {
    if (originalFlag === undefined) {
      delete process.env.RESEARCH_NOTE_DRAFT_ENABLED
    } else {
      process.env.RESEARCH_NOTE_DRAFT_ENABLED = originalFlag
    }
  })

  it('streams note draft events and does not auto-navigate before save', async () => {
    const agent = new ResearchAgent({
      supabase: {} as any,
      userId: 'user-1',
      openaiApiKey: 'test-key',
    })

    const events = []
    for await (const event of agent.stream({
      message: 'create a note about black holes and include a study timer',
      threadId: 'thread-1',
    })) {
      events.push(event)
    }

    expect(events.some((e) => e.event === 'note-draft-delta')).toBe(true)
    expect(events.some((e) => e.event === 'note-draft')).toBe(true)
    expect(events.some((e) => e.event === 'note-navigate')).toBe(false)

    const draftEvent = events.find((e) => e.event === 'note-draft')
    expect(draftEvent).toBeTruthy()
    const payload =
      typeof draftEvent?.data === 'string' ? JSON.parse(draftEvent.data) : draftEvent?.data

    expect(payload.proposedContent).toContain('# Black Holes')
    expect(payload.draftId).toBeTruthy()
  })

  it('emits note-draft delta payloads without full currentContent on every chunk', async () => {
    createMock.mockImplementation(async (params: { stream?: boolean }) => {
      if (params.stream) {
        return createTextStream(['# Streaming Draft', '\n\nFirst chunk.', '\n\nSecond chunk.'])
      }
      return {
        choices: [{ message: { content: createArtifactPayload() } }],
      }
    })

    const agent = new ResearchAgent({
      supabase: {} as any,
      userId: 'user-1',
      openaiApiKey: 'test-key',
    })

    const payloads: Array<Record<string, unknown>> = []
    for await (const event of agent.stream({
      message: 'create a note about smooth streaming',
      threadId: 'thread-delta',
    })) {
      if (event.event !== 'note-draft-delta') continue
      const payload = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
      payloads.push(payload as Record<string, unknown>)
    }

    expect(payloads.length).toBeGreaterThan(1)
    expect(payloads[0].currentContent).toBeDefined()
    expect(payloads.slice(1).some((p) => p.currentContent === undefined)).toBe(true)
  })

  it('falls back to Gemini artifact generation when Ollama client fails', async () => {
    let callCount = 0
    createMock.mockImplementation(async (params: { stream?: boolean; model?: string }) => {
      if (params.stream) {
        return createTextStream(['# Study Note\n\nKey points.'])
      }
      callCount++
      // First non-streaming call (artifact via Ollama) fails
      if (callCount === 1 && params.model === 'kimi-k2.5') {
        throw new Error('ollama unavailable')
      }
      return {
        choices: [{ message: { content: createArtifactPayload({ title: 'Fallback Timer' }) } }],
      }
    })

    const agent = new ResearchAgent({
      supabase: {} as any,
      userId: 'user-1',
      openaiApiKey: 'test-key',
    })

    const events = []
    for await (const event of agent.stream({
      message: 'create a note about effective studying and include a study timer artifact',
      threadId: 'thread-fallback',
    })) {
      events.push(event)
    }

    const draftEvent = events.find((e) => e.event === 'note-draft')
    const payload =
      typeof draftEvent?.data === 'string' ? JSON.parse(draftEvent.data) : draftEvent?.data

    expect(payload.proposedContent).toContain('```artifact')
    expect(events.some((e) => e.event === 'error')).toBe(false)
  })

  it('emits an artifact error and skips artifact block when primary and fallback generation both fail', async () => {
    createMock.mockImplementation(async (params: { stream?: boolean }) => {
      if (params.stream) {
        return createTextStream(['# Study Note\n\nKey points.'])
      }
      throw new Error('all artifact generation failed')
    })

    const agent = new ResearchAgent({
      supabase: {} as any,
      userId: 'user-1',
      openaiApiKey: 'test-key',
    })

    const events = []
    for await (const event of agent.stream({
      message: 'create a note about effective studying and include a study timer artifact',
      threadId: 'thread-double-fail',
    })) {
      events.push(event)
    }

    const draftEvent = events.find((e) => e.event === 'note-draft')
    const payload =
      typeof draftEvent?.data === 'string' ? JSON.parse(draftEvent.data) : draftEvent?.data

    const errorEvent = events.find((e) => e.event === 'error')
    expect(errorEvent).toBeTruthy()
    expect(String(errorEvent?.data).toLowerCase()).toContain('artifact')
    expect(payload.proposedContent).not.toContain('```artifact')
  })

  it('defaults to draft mode when RESEARCH_NOTE_DRAFT_ENABLED is unset', async () => {
    delete process.env.RESEARCH_NOTE_DRAFT_ENABLED

    const agent = new ResearchAgent({
      supabase: {} as any,
      userId: 'user-1',
      openaiApiKey: 'test-key',
    })

    const events = []
    for await (const event of agent.stream({
      message: 'create a note about why the sky is blue',
      threadId: 'thread-2',
    })) {
      events.push(event)
    }

    expect(events.some((e) => e.event === 'note-draft')).toBe(true)
    expect(events.some((e) => e.event === 'note-navigate')).toBe(false)
  })
})
