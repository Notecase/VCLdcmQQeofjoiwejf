import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { EditorConversationHistoryService } from './history'

function createSupabaseStub(rows: unknown[]): SupabaseClient {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: rows, error: null }),
  }

  return {
    from: vi.fn(() => chain),
  } as unknown as SupabaseClient
}

describe('EditorConversationHistoryService', () => {
  it('loads last turns in ascending order for replay', async () => {
    const rows = [
      { role: 'assistant', content: 'A3', created_at: '2026-02-09T10:03:00.000Z' },
      { role: 'user', content: 'Q3', created_at: '2026-02-09T10:02:00.000Z' },
      { role: 'assistant', content: 'A2', created_at: '2026-02-09T10:01:00.000Z' },
      { role: 'user', content: 'Q2', created_at: '2026-02-09T10:00:00.000Z' },
      { role: 'assistant', content: 'A1', created_at: '2026-02-09T09:59:00.000Z' },
      { role: 'user', content: 'Q1', created_at: '2026-02-09T09:58:00.000Z' },
    ]

    const service = new EditorConversationHistoryService(createSupabaseStub(rows), 'u1')
    const history = await service.loadThreadMessages({
      threadId: '11111111-1111-4111-8111-111111111111',
      windowTurns: 2,
      maxChars: 1000,
    })

    expect(history).toEqual([
      { role: 'user', content: 'Q2' },
      { role: 'assistant', content: 'A2' },
      { role: 'user', content: 'Q3' },
      { role: 'assistant', content: 'A3' },
    ])
  })

  it('trims history deterministically newest-first by character budget', async () => {
    const rows = [
      { role: 'assistant', content: 'abcdef', created_at: '2026-02-09T10:03:00.000Z' },
      { role: 'user', content: 'uvwxyz', created_at: '2026-02-09T10:02:00.000Z' },
      { role: 'assistant', content: 'older-a', created_at: '2026-02-09T10:01:00.000Z' },
      { role: 'user', content: 'older-q', created_at: '2026-02-09T10:00:00.000Z' },
    ]

    const service = new EditorConversationHistoryService(createSupabaseStub(rows), 'u1')
    const history = await service.loadThreadMessages({
      threadId: '11111111-1111-4111-8111-111111111111',
      windowTurns: 4,
      maxChars: 12,
    })

    expect(history).toEqual([
      { role: 'user', content: 'uvwxyz' },
      { role: 'assistant', content: 'abcdef' },
    ])
  })
})
