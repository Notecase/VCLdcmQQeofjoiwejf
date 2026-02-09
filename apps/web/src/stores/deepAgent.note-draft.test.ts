import { describe, expect, it } from 'vitest'
import {
  applyNoteDraftDelta,
  applyNoteDraftSnapshot,
  getNoteDraftDiffScopeId,
  setNoteDraftHidden,
} from './deepAgent.note-draft'

describe('deepAgent note draft helpers', () => {
  it('updates draft from note-draft-delta payload', () => {
    const next = applyNoteDraftDelta(null, {
      draftId: 'draft-1',
      title: 'Black Holes',
      originalContent: '',
      currentContent: '# Black Holes\n\nPart 1',
      delta: '# Black Holes\n\nPart 1',
    })

    expect(next.draftId).toBe('draft-1')
    expect(next.proposedContent).toContain('Part 1')
    expect(next.hidden).toBe(false)
    expect(next.isSaved).toBe(false)
  })

  it('appends delta content when currentContent is omitted', () => {
    const initial = applyNoteDraftDelta(null, {
      draftId: 'draft-append',
      title: 'Streaming Draft',
      originalContent: '',
      currentContent: '# Streaming Draft',
      delta: '# Streaming Draft',
    })

    const next = applyNoteDraftDelta(initial, {
      draftId: 'draft-append',
      title: 'Streaming Draft',
      originalContent: '',
      delta: '\n\nSecond chunk',
    } as any)

    expect(next.currentContent).toBe('# Streaming Draft\n\nSecond chunk')
    expect(next.proposedContent).toBe('# Streaming Draft\n\nSecond chunk')
  })

  it('prefers snapshot currentContent when both snapshot and delta are provided', () => {
    const previous = applyNoteDraftDelta(null, {
      draftId: 'draft-snapshot',
      title: 'Streaming Draft',
      originalContent: '',
      currentContent: '# Old',
      delta: '# Old',
    })

    const next = applyNoteDraftDelta(previous, {
      draftId: 'draft-snapshot',
      title: 'Streaming Draft',
      originalContent: '',
      currentContent: '# New full snapshot',
      delta: 'ignored delta',
    })

    expect(next.currentContent).toBe('# New full snapshot')
  })

  it('hydrates saved-state flags from final draft snapshot', () => {
    const next = applyNoteDraftSnapshot(null, {
      draftId: 'draft-2',
      title: 'Draft',
      originalContent: '',
      proposedContent: '# Draft',
      currentContent: '# Draft',
      savedAt: '2026-02-08T00:00:00.000Z',
      updatedAt: '2026-02-08T00:00:00.000Z',
    })

    expect(next.isSaved).toBe(true)
    expect(next.hidden).toBe(false)
  })

  it('toggles hidden visibility state', () => {
    const hidden = setNoteDraftHidden(
      {
        draftId: 'draft-3',
        title: 'Draft',
        originalContent: '',
        proposedContent: '# Draft',
        currentContent: '# Draft',
        updatedAt: '2026-02-08T00:00:00.000Z',
      },
      true
    )

    expect(hidden?.hidden).toBe(true)
    expect(setNoteDraftHidden(hidden, false)?.hidden).toBe(false)
  })

  it('keeps draft diff scope stable when thread id changes', () => {
    const beforeThreadAssignment = getNoteDraftDiffScopeId('draft-9')
    const afterThreadAssignment = getNoteDraftDiffScopeId('draft-9', 'thread-abc')

    expect(beforeThreadAssignment).toBe('draft:draft-9')
    expect(afterThreadAssignment).toBe(beforeThreadAssignment)
  })
})
