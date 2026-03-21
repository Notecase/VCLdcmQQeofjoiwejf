import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { EditorLongTermMemory } from './memory'

function createSupabaseStub(): SupabaseClient {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
    in: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
  }

  return {
    from: vi.fn(() => chain),
  } as unknown as SupabaseClient
}

describe('EditorLongTermMemory', () => {
  it('prioritizes note-scoped memories over workspace/user memories', async () => {
    const memory = new EditorLongTermMemory(createSupabaseStub(), 'u1')

    vi.spyOn(memory, 'list').mockResolvedValue([
      {
        id: '1',
        key: 'global_pref',
        value: 'Keep answers concise.',
        memory_type: 'preference',
        scope_type: 'user',
        scope_id: 'u1',
        created_at: '2026-02-09T10:00:00.000Z',
        updated_at: '2026-02-09T10:00:00.000Z',
      },
      {
        id: '2',
        key: 'workspace_style',
        value: 'Use bullet points for summaries.',
        memory_type: 'preference',
        scope_type: 'workspace',
        scope_id: 'ws-1',
        created_at: '2026-02-09T10:01:00.000Z',
        updated_at: '2026-02-09T10:01:00.000Z',
      },
      {
        id: '3',
        key: 'latest_summary',
        value: 'This note explains maximum likelihood estimation.',
        memory_type: 'note_context',
        scope_type: 'note',
        scope_id: 'note-1',
        created_at: '2026-02-09T10:02:00.000Z',
        updated_at: '2026-02-09T10:02:00.000Z',
      },
    ] as any)

    const summary = await memory.buildContextSummary('what is this note about', {
      currentNoteId: 'note-1',
      workspaceId: 'ws-1',
    })

    const lines = summary.split('\n').filter(Boolean)
    expect(lines[0]).toContain('[note]')
    expect(lines[0]).toContain('latest_summary')
  })

  it('distills scoped memory without storing full raw note content', async () => {
    const memory = new EditorLongTermMemory(createSupabaseStub(), 'u1')
    const writeSpy = vi.spyOn(memory, 'write').mockResolvedValue()

    await memory.distillAndStoreTurn({
      threadId: '11111111-1111-4111-8111-111111111111',
      userMessage: "what's this note about",
      assistantMessage:
        'This note explains MLE and MAP estimation, comparing frequentist and Bayesian perspectives.',
      context: {
        currentNoteId: 'note-1',
        workspaceId: 'ws-1',
      },
    })

    expect(writeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'latest_summary',
        scopeType: 'note',
        scopeId: 'note-1',
      })
    )

    const serializedWrites = JSON.stringify(writeSpy.mock.calls)
    expect(serializedWrites).not.toContain('Maximum Likelihood Estimation (MLE)')
  })
})
