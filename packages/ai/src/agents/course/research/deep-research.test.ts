import { afterEach, describe, expect, it, vi } from 'vitest'
import { runDeepResearch } from './deep-research'

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function createAbortError(message = 'The operation was aborted'): Error {
  const error = new Error(message)
  Object.defineProperty(error, 'name', { value: 'AbortError' })
  return error
}

describe('runDeepResearch', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('completes when provider returns "complete" terminal status', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ id: 'interaction-1', status: 'in_progress' }))
      .mockResolvedValueOnce(jsonResponse({
        status: 'complete',
        outputs: [
          {
            content: [{ text: 'Deep research final report content.' }],
            groundings: [{ url: 'https://example.com/source-1', title: 'Source 1' }],
          },
        ],
      }))

    vi.stubGlobal('fetch', fetchMock)

    const progressEvents: Array<{ status: string; thinking: string }> = []
    const result = await runDeepResearch('TypeScript', ['Generics'], {
      geminiApiKey: 'test-key',
      pollIntervalMs: 1,
      maxPolls: 3,
      requestTimeoutMs: 50,
      onProgress: (progress) => {
        progressEvents.push({ status: progress.status, thinking: progress.thinking })
      },
    })

    expect(result.success).toBe(true)
    expect(result.report).toContain('final report')
    expect(result.sources).toHaveLength(1)
    expect(progressEvents.some(e => e.status === 'complete')).toBe(true)
  })

  it('recovers from one timed-out poll and continues to completion', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ id: 'interaction-2', status: 'in_progress' }))
      .mockRejectedValueOnce(createAbortError())
      .mockResolvedValueOnce(jsonResponse({ status: 'in_progress', outputs: [] }))
      .mockResolvedValueOnce(jsonResponse({
        status: 'completed',
        outputs: [{ text: 'Recovered final report.' }],
      }))

    vi.stubGlobal('fetch', fetchMock)

    const progressEvents: Array<{ status: string; thinking: string }> = []
    const result = await runDeepResearch('Distributed Systems', [], {
      geminiApiKey: 'test-key',
      pollIntervalMs: 1,
      maxPolls: 6,
      requestTimeoutMs: 50,
      maxConsecutivePollErrors: 2,
      onProgress: (progress) => {
        progressEvents.push({ status: progress.status, thinking: progress.thinking })
      },
    })

    expect(result.success).toBe(true)
    expect(result.report).toContain('Recovered final report')
    expect(progressEvents.some(e => e.thinking.includes('Retrying'))).toBe(true)
  })

  it('fails after repeated timed-out polls above the threshold', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ id: 'interaction-3', status: 'in_progress' }))
      .mockRejectedValueOnce(createAbortError())
      .mockRejectedValueOnce(createAbortError())

    vi.stubGlobal('fetch', fetchMock)

    const progressEvents: Array<{ status: string; thinking: string }> = []
    const result = await runDeepResearch('Computer Vision', [], {
      geminiApiKey: 'test-key',
      pollIntervalMs: 1,
      maxPolls: 6,
      requestTimeoutMs: 50,
      maxConsecutivePollErrors: 2,
      onProgress: (progress) => {
        progressEvents.push({ status: progress.status, thinking: progress.thinking })
      },
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('failed repeatedly')
    expect(progressEvents.at(-1)?.status).toBe('failed')
  })
})
