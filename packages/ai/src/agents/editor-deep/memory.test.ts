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

  // =========================================================================
  // ED-09: Preference detection via regex
  // =========================================================================

  describe('preference detection (distillAndStoreTurn)', () => {
    it('detects "please always use bullet points" as a preference', async () => {
      const memory = new EditorLongTermMemory(createSupabaseStub(), 'u1')
      const writeSpy = vi.spyOn(memory, 'write').mockResolvedValue()

      await memory.distillAndStoreTurn({
        threadId: 'thread-1',
        userMessage: 'please always use bullet points',
        assistantMessage: 'Got it, I will use bullet points.',
        context: { currentNoteId: 'note-1', workspaceId: 'ws-1' },
      })

      const prefCall = writeSpy.mock.calls.find(
        (call) => typeof call[0].key === 'string' && call[0].key.startsWith('preference_')
      )
      expect(prefCall).toBeTruthy()
      expect(prefCall![0].memoryType).toBe('preference')
    })

    it('detects "never use technical jargon" as a preference', async () => {
      const memory = new EditorLongTermMemory(createSupabaseStub(), 'u1')
      const writeSpy = vi.spyOn(memory, 'write').mockResolvedValue()

      await memory.distillAndStoreTurn({
        threadId: 'thread-1',
        userMessage: 'never use technical jargon',
        assistantMessage: 'Understood.',
        context: { currentNoteId: 'note-1' },
      })

      const prefCall = writeSpy.mock.calls.find(
        (call) => typeof call[0].key === 'string' && call[0].key.startsWith('preference_')
      )
      expect(prefCall).toBeTruthy()
    })

    it('detects "avoid long paragraphs" as a preference', async () => {
      const memory = new EditorLongTermMemory(createSupabaseStub(), 'u1')
      const writeSpy = vi.spyOn(memory, 'write').mockResolvedValue()

      await memory.distillAndStoreTurn({
        threadId: 'thread-1',
        userMessage: 'avoid long paragraphs please',
        assistantMessage: 'Will do.',
        context: {},
      })

      const prefCall = writeSpy.mock.calls.find(
        (call) => typeof call[0].key === 'string' && call[0].key.startsWith('preference_')
      )
      expect(prefCall).toBeTruthy()
    })

    it('does NOT write preference for "what is this note about"', async () => {
      const memory = new EditorLongTermMemory(createSupabaseStub(), 'u1')
      const writeSpy = vi.spyOn(memory, 'write').mockResolvedValue()

      await memory.distillAndStoreTurn({
        threadId: 'thread-1',
        userMessage: 'what is this note about',
        assistantMessage: 'This note is about...',
        context: { currentNoteId: 'note-1' },
      })

      const prefCall = writeSpy.mock.calls.find(
        (call) => typeof call[0].key === 'string' && call[0].key.startsWith('preference_')
      )
      // Should only write note_summary, not preference
      expect(prefCall).toBeUndefined()
      // But should write note_summary
      const summaryCall = writeSpy.mock.calls.find((call) => call[0].memoryType === 'note_summary')
      expect(summaryCall).toBeTruthy()
    })

    it('stores preference with workspace scope when workspaceId present', async () => {
      const memory = new EditorLongTermMemory(createSupabaseStub(), 'u1')
      const writeSpy = vi.spyOn(memory, 'write').mockResolvedValue()

      await memory.distillAndStoreTurn({
        threadId: 'thread-1',
        userMessage: 'please use formal tone',
        assistantMessage: 'Understood.',
        context: { workspaceId: 'ws-42' },
      })

      const prefCall = writeSpy.mock.calls.find(
        (call) => typeof call[0].key === 'string' && call[0].key.startsWith('preference_')
      )
      expect(prefCall).toBeTruthy()
      expect(prefCall![0].scopeType).toBe('workspace')
      expect(prefCall![0].scopeId).toBe('ws-42')
    })

    it('stores preference with user scope when no workspaceId', async () => {
      const memory = new EditorLongTermMemory(createSupabaseStub(), 'u1')
      const writeSpy = vi.spyOn(memory, 'write').mockResolvedValue()

      await memory.distillAndStoreTurn({
        threadId: 'thread-1',
        userMessage: 'always prefer concise answers',
        assistantMessage: 'Got it.',
        context: {},
      })

      const prefCall = writeSpy.mock.calls.find(
        (call) => typeof call[0].key === 'string' && call[0].key.startsWith('preference_')
      )
      expect(prefCall).toBeTruthy()
      expect(prefCall![0].scopeType).toBe('user')
      expect(prefCall![0].scopeId).toBe('u1')
    })
  })

  // =========================================================================
  // note_summary excluded from buildContextSummary
  // =========================================================================

  it('excludes note_summary memories from buildContextSummary', async () => {
    const memory = new EditorLongTermMemory(createSupabaseStub(), 'u1')

    vi.spyOn(memory, 'list').mockResolvedValue([
      {
        id: '1',
        key: 'user_pref',
        value: 'Keep answers concise.',
        memory_type: 'preference',
        scope_type: 'user',
        scope_id: 'u1',
        source_thread_id: null,
        importance: 0.5,
        last_used_at: null,
        created_at: '2026-02-09T10:00:00.000Z',
        updated_at: '2026-02-09T10:00:00.000Z',
      },
      {
        id: '2',
        key: 'latest_summary',
        value: 'This note explains MLE.',
        memory_type: 'note_summary',
        scope_type: 'note',
        scope_id: 'note-1',
        source_thread_id: null,
        importance: 0.7,
        last_used_at: null,
        created_at: '2026-02-09T10:01:00.000Z',
        updated_at: '2026-02-09T10:01:00.000Z',
      },
    ])

    const summary = await memory.buildContextSummary('tell me about this', {
      currentNoteId: 'note-1',
    })

    // Should include the preference but NOT the note_summary
    expect(summary).toContain('user_pref')
    expect(summary).not.toContain('note_summary')
    expect(summary).not.toContain('latest_summary')
  })
})
