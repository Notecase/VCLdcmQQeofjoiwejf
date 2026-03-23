import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ResearchAgent } from './agent'

const { streamTextMock, generateTextMock } = vi.hoisted(() => ({
  streamTextMock: vi.fn(),
  generateTextMock: vi.fn(),
}))

vi.mock('ai', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    streamText: streamTextMock,
    generateText: generateTextMock,
  }
})

vi.mock('../../providers/ai-sdk-factory', () => ({
  resolveModel: (taskType: string) => ({
    model: `mock-${taskType}`,
    entry: {
      id: taskType === 'artifact' ? 'kimi-k2.5' : 'gemini-2.5-pro',
      provider: taskType === 'artifact' ? 'ollama-cloud' : 'gemini',
      displayName: taskType === 'artifact' ? 'Kimi K2.5' : 'Gemini 2.5 Pro',
    },
  }),
  resolveModelsForTask: (taskType: string) => ({
    primary: {
      model: `mock-${taskType}`,
      entry: {
        id: taskType === 'artifact' ? 'kimi-k2.5' : 'gemini-2.5-pro',
        provider: taskType === 'artifact' ? 'ollama-cloud' : 'gemini',
      },
    },
    fallback: null,
  }),
  getModelsForTask: (taskType: string) => ({
    primary: {
      model: `mock-${taskType}`,
      entry: {
        id: taskType === 'artifact' ? 'kimi-k2.5' : 'gemini-2.5-pro',
        provider: taskType === 'artifact' ? 'ollama-cloud' : 'gemini',
      },
    },
    fallback: null,
  }),
  isTransientError: () => false,
  getModelForTask: (taskType: string) => `mock-${taskType}`,
}))

vi.mock('../../providers/ai-sdk-usage', () => ({
  trackAISDKUsage: () => () => {},
}))

vi.mock('../../providers/model-registry', () => {
  const makeEntry = (taskType: string) => ({
    id: taskType === 'artifact' ? 'kimi-k2.5' : 'gemini-2.5-pro',
    provider: taskType === 'artifact' ? 'ollama-cloud' : 'gemini',
    displayName: taskType === 'artifact' ? 'Kimi K2.5' : 'Gemini 2.5 Pro',
    contextWindow: 131072,
    capabilities: ['chat'],
    costPer1kInput: 0,
    costPer1kOutput: 0,
    maxOutputTokens: 32768,
    supportsToolChoice: false,
  })
  return {
    selectModel: (taskType: string) => makeEntry(taskType),
    MODEL_REGISTRY: {
      'gemini-2.5-pro': makeEntry('research'),
      'kimi-k2.5': makeEntry('artifact'),
    },
  }
})

function createMockTextStream(chunks: string[]) {
  async function* gen() {
    for (const chunk of chunks) {
      yield chunk
    }
  }
  return { textStream: gen() }
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
    streamTextMock.mockReset()
    generateTextMock.mockReset()

    // Default: streamText returns streaming chunks, generateText returns artifact
    streamTextMock.mockReturnValue(
      createMockTextStream(['# Black Holes\n\n', 'Draft content body.'])
    )
    generateTextMock.mockResolvedValue({
      text: createArtifactPayload(),
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
    streamTextMock.mockReturnValue(
      createMockTextStream(['# Streaming Draft', '\n\nFirst chunk.', '\n\nSecond chunk.'])
    )

    const agent = new ResearchAgent({
      supabase: {} as any,
      userId: 'user-1',
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
    streamTextMock.mockReturnValue(createMockTextStream(['# Study Note\n\nKey points.']))

    let callCount = 0
    generateTextMock.mockImplementation(async () => {
      callCount++
      // First call (artifact via Ollama) fails
      if (callCount === 1) {
        throw new Error('ollama unavailable')
      }
      return { text: createArtifactPayload({ title: 'Fallback Timer' }) }
    })

    const agent = new ResearchAgent({
      supabase: {} as any,
      userId: 'user-1',
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
    streamTextMock.mockReturnValue(createMockTextStream(['# Study Note\n\nKey points.']))
    generateTextMock.mockRejectedValue(new Error('all artifact generation failed'))

    const agent = new ResearchAgent({
      supabase: {} as any,
      userId: 'user-1',
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
