import { describe, it, expect } from 'vitest'
import { windowMessages, buildInvocationMessages, type ThreadMessage } from './conversation-history'

// ============================================================================
// Helpers
// ============================================================================

function msg(role: 'user' | 'assistant', content: string, minutesAgo: number): ThreadMessage {
  const d = new Date(Date.now() - minutesAgo * 60_000)
  return { role, content, createdAt: d.toISOString() }
}

// ============================================================================
// windowMessages
// ============================================================================

describe('windowMessages', () => {
  it('returns empty array for empty input', () => {
    expect(windowMessages([])).toEqual([])
  })

  it('passes through messages within budget', () => {
    const messages = [
      msg('user', 'Hello', 3),
      msg('assistant', 'Hi there', 2),
      msg('user', 'How are you?', 1),
    ]
    const result = windowMessages(messages, { maxTurns: 20, maxChars: 16000 })
    expect(result).toHaveLength(3)
    expect(result[0].content).toBe('Hello')
    expect(result[2].content).toBe('How are you?')
  })

  it('limits by maxTurns', () => {
    const messages = Array.from({ length: 10 }, (_, i) =>
      msg(i % 2 === 0 ? 'user' : 'assistant', `Message ${i}`, 10 - i)
    )
    // maxTurns=2 → limit=4 messages
    const result = windowMessages(messages, { maxTurns: 2, maxChars: 100000 })
    expect(result).toHaveLength(4)
    expect(result[0].content).toBe('Message 6')
    expect(result[3].content).toBe('Message 9')
  })

  it('limits by maxChars', () => {
    const messages = [
      msg('user', 'A'.repeat(100), 3),
      msg('assistant', 'B'.repeat(100), 2),
      msg('user', 'C'.repeat(100), 1),
    ]
    // Budget of 250 chars: only last 2 messages fit (200 chars)
    const result = windowMessages(messages, { maxTurns: 20, maxChars: 250 })
    expect(result).toHaveLength(2)
    expect(result[0].content).toBe('B'.repeat(100))
    expect(result[1].content).toBe('C'.repeat(100))
  })

  it('truncates single message exceeding maxChars', () => {
    const messages = [msg('user', 'X'.repeat(500), 1)]
    const result = windowMessages(messages, { maxTurns: 20, maxChars: 100 })
    expect(result).toHaveLength(1)
    expect(result[0].content).toHaveLength(100)
    // Should keep the END of the content (newest chars)
    expect(result[0].content).toBe('X'.repeat(100))
  })

  it('filters empty messages', () => {
    const messages = [msg('user', 'Hello', 3), msg('assistant', '', 2), msg('user', '   ', 1)]
    const result = windowMessages(messages)
    expect(result).toHaveLength(1)
    expect(result[0].content).toBe('Hello')
  })

  it('filters non-user/assistant roles', () => {
    const messages = [
      msg('user', 'Hello', 3),
      { role: 'system' as any, content: 'system msg', createdAt: new Date().toISOString() },
      msg('assistant', 'Reply', 1),
    ]
    const result = windowMessages(messages)
    expect(result).toHaveLength(2)
  })

  it('sorts chronologically regardless of input order', () => {
    const messages = [
      msg('user', 'Third', 1),
      msg('assistant', 'First', 3),
      msg('user', 'Second', 2),
    ]
    const result = windowMessages(messages)
    expect(result[0].content).toBe('First')
    expect(result[1].content).toBe('Second')
    expect(result[2].content).toBe('Third')
  })

  it('uses defaults when no options provided', () => {
    const messages = [msg('user', 'Hello', 1)]
    const result = windowMessages(messages)
    expect(result).toHaveLength(1)
  })

  it('clamps maxTurns to valid range', () => {
    const messages = [msg('user', 'Hello', 1)]
    // maxTurns: 0 should be clamped to 1
    const result = windowMessages(messages, { maxTurns: 0 })
    expect(result).toHaveLength(1)
  })
})

// ============================================================================
// buildInvocationMessages
// ============================================================================

describe('buildInvocationMessages', () => {
  it('appends current message to empty history', () => {
    const result = buildInvocationMessages([], 'Hello')
    expect(result).toEqual([{ role: 'user', content: 'Hello' }])
  })

  it('appends current message to history', () => {
    const history = [
      { role: 'user' as const, content: 'Hi' },
      { role: 'assistant' as const, content: 'Hello' },
    ]
    const result = buildInvocationMessages(history, 'How are you?')
    expect(result).toHaveLength(3)
    expect(result[2]).toEqual({ role: 'user', content: 'How are you?' })
  })

  it('deduplicates when current message is already last entry', () => {
    const history = [
      { role: 'user' as const, content: 'Hello' },
      { role: 'assistant' as const, content: 'Hi' },
      { role: 'user' as const, content: 'Save it' },
    ]
    const result = buildInvocationMessages(history, 'Save it')
    expect(result).toHaveLength(3)
    // Should not duplicate "Save it"
    expect(result[2].content).toBe('Save it')
  })

  it('deduplicates with whitespace differences', () => {
    const history = [{ role: 'user' as const, content: 'Save it' }]
    const result = buildInvocationMessages(history, '  Save it  ')
    expect(result).toHaveLength(1)
  })

  it('does not deduplicate when last entry is assistant', () => {
    const history = [
      { role: 'user' as const, content: 'Hello' },
      { role: 'assistant' as const, content: 'Save it' },
    ]
    const result = buildInvocationMessages(history, 'Save it')
    expect(result).toHaveLength(3)
  })

  it('filters empty history entries', () => {
    const history = [
      { role: 'user' as const, content: '' },
      { role: 'assistant' as const, content: 'Hello' },
    ]
    const result = buildInvocationMessages(history, 'Hi')
    expect(result).toHaveLength(2)
    expect(result[0].content).toBe('Hello')
    expect(result[1].content).toBe('Hi')
  })

  it('returns history as-is when current message is empty', () => {
    const history = [{ role: 'user' as const, content: 'Hello' }]
    const result = buildInvocationMessages(history, '   ')
    expect(result).toHaveLength(1)
  })
})
