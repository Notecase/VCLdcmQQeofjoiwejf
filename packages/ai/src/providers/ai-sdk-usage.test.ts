import { describe, it, expect, vi, beforeEach } from 'vitest'
import { trackAISDKUsage, recordAISDKUsage } from './ai-sdk-usage'
import { tokenTracker } from './token-tracker'
import type { LanguageModelUsage } from 'ai'

function makeUsage(input: number, output: number, total: number): LanguageModelUsage {
  return {
    inputTokens: input,
    outputTokens: output,
    totalTokens: total,
    inputTokenDetails: {},
    outputTokenDetails: {},
  } as LanguageModelUsage
}

describe('ai-sdk-usage', () => {
  beforeEach(() => {
    vi.spyOn(tokenTracker, 'record').mockImplementation(() => {})
  })

  describe('trackAISDKUsage', () => {
    it('returns a function', () => {
      const callback = trackAISDKUsage({ model: 'gemini-2.5-pro', taskType: 'chat' })
      expect(typeof callback).toBe('function')
    })

    it('callback records usage to tokenTracker', () => {
      const callback = trackAISDKUsage({
        model: 'gemini-2.5-pro',
        taskType: 'chat',
        userId: 'user-123',
        sessionId: 'session-456',
      })

      callback({ usage: makeUsage(100, 50, 150) })

      expect(tokenTracker.record).toHaveBeenCalledTimes(1)
      const event = vi.mocked(tokenTracker.record).mock.calls[0][0]
      expect(event.model).toBe('gemini-2.5-pro')
      expect(event.provider).toBe('gemini')
      expect(event.taskType).toBe('chat')
      expect(event.inputTokens).toBe(100)
      expect(event.outputTokens).toBe(50)
      expect(event.costCents).toBeGreaterThan(0)
      expect(event.durationMs).toBeGreaterThanOrEqual(0)
      expect(event.userId).toBe('user-123')
      expect(event.sessionId).toBe('session-456')
      expect(event.timestamp).toBeGreaterThan(0)
    })

    it('handles zero token counts', () => {
      const callback = trackAISDKUsage({ model: 'gemini-2.5-pro', taskType: 'chat' })
      callback({ usage: makeUsage(0, 0, 0) })

      const event = vi.mocked(tokenTracker.record).mock.calls[0][0]
      expect(event.inputTokens).toBe(0)
      expect(event.outputTokens).toBe(0)
      expect(event.costCents).toBe(0)
    })
  })

  describe('recordAISDKUsage', () => {
    it('records usage with correct timing', () => {
      const startTime = Date.now() - 500 // 500ms ago

      recordAISDKUsage(
        makeUsage(200, 100, 300),
        { model: 'kimi-k2.5', taskType: 'artifact' },
        startTime
      )

      expect(tokenTracker.record).toHaveBeenCalledTimes(1)
      const event = vi.mocked(tokenTracker.record).mock.calls[0][0]
      expect(event.model).toBe('kimi-k2.5')
      expect(event.provider).toBe('ollama-cloud')
      expect(event.taskType).toBe('artifact')
      expect(event.inputTokens).toBe(200)
      expect(event.outputTokens).toBe(100)
      expect(event.durationMs).toBeGreaterThanOrEqual(400)
    })

    it('falls back to gemini provider for unknown models', () => {
      recordAISDKUsage(
        makeUsage(10, 5, 15),
        { model: 'unknown-model', taskType: 'chat' },
        Date.now()
      )

      const event = vi.mocked(tokenTracker.record).mock.calls[0][0]
      expect(event.provider).toBe('gemini')
      expect(event.costCents).toBe(0) // unknown model has no pricing
    })
  })
})
