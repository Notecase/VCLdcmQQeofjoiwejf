import { describe, expect, it } from 'vitest'
import { buildEmptyAssistantFallback } from './ai.fallback'

describe('buildEmptyAssistantFallback', () => {
  it('returns note-aware fallback when a note is open', () => {
    const message = buildEmptyAssistantFallback({ hasCurrentNote: true })
    expect(message).toContain('current note')
  })

  it('returns open-note instruction when no note is active', () => {
    const message = buildEmptyAssistantFallback({ hasCurrentNote: false })
    expect(message).toContain('open note')
  })
})
