import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ResearchAgent } from './agent'

const { createMock, getOllamaCloudMock, ollamaGenerateArtifactMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  getOllamaCloudMock: vi.fn(),
  ollamaGenerateArtifactMock: vi.fn(),
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

vi.mock('../../providers/factory', () => ({
  getOllamaCloud: getOllamaCloudMock,
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
    getOllamaCloudMock.mockReset()
    ollamaGenerateArtifactMock.mockReset()
    getOllamaCloudMock.mockReturnValue({
      generateArtifact: ollamaGenerateArtifactMock,
    })

    createMock.mockImplementation(async (params: { stream?: boolean }) => {
      if (params.stream) {
        return createTextStream(['# Black Holes\n\n', 'Draft content body.'])
      }

      return {
        choices: [{ message: { content: createArtifactPayload() } }],
      }
    })

    ollamaGenerateArtifactMock.mockImplementation(async function* () {
      yield createArtifactPayload()
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

  it('falls back to GPT-5.2 artifact generation when Ollama fails', async () => {
    ollamaGenerateArtifactMock.mockImplementation(async () => {
      throw new Error('ollama unavailable')
    })

    createMock.mockImplementation(async (params: { stream?: boolean }) => {
      if (params.stream) {
        return createTextStream(['# Study Note\n\nKey points.'])
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

    const fallbackCalls = createMock.mock.calls.filter(([arg]) => arg && arg.stream === false)

    expect(getOllamaCloudMock).toHaveBeenCalledTimes(1)
    expect(fallbackCalls.length).toBeGreaterThan(0)
    expect(payload.proposedContent).toContain('```artifact')
    expect(events.some((e) => e.event === 'error')).toBe(false)
  })

  it('emits an artifact error and skips artifact block when primary and fallback generation both fail', async () => {
    ollamaGenerateArtifactMock.mockImplementation(async () => {
      throw new Error('ollama unavailable')
    })

    createMock.mockImplementation(async (params: { stream?: boolean }) => {
      if (params.stream) {
        return createTextStream(['# Study Note\n\nKey points.'])
      }
      throw new Error('openai fallback unavailable')
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
