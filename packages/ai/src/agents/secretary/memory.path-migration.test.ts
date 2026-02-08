import { describe, expect, it } from 'vitest'
import { getCanonicalPathForLegacyFile, planLegacyPathMigrations } from './memory'

describe('legacy memory path canonicalization', () => {
  it('maps root history date files into History/', () => {
    expect(getCanonicalPathForLegacyFile('2026-02-06.md')).toBe('History/2026-02-06.md')
  })

  it('maps root roadmap files into Plans/', () => {
    expect(getCanonicalPathForLegacyFile('rei-roadmap.md')).toBe('Plans/rei-roadmap.md')
  })

  it('does not move core root files', () => {
    expect(getCanonicalPathForLegacyFile('AI.md')).toBeNull()
    expect(getCanonicalPathForLegacyFile('Plan.md')).toBeNull()
    expect(getCanonicalPathForLegacyFile('Today.md')).toBeNull()
    expect(getCanonicalPathForLegacyFile('Tomorrow.md')).toBeNull()
    expect(getCanonicalPathForLegacyFile('Recurring.md')).toBeNull()
    expect(getCanonicalPathForLegacyFile('Carryover.md')).toBeNull()
  })
})

describe('legacy path migration planner', () => {
  it('moves legacy files when canonical destination is missing', () => {
    const operations = planLegacyPathMigrations([
      { filename: '2026-02-06.md', content: '# daily archive' },
      { filename: 'rei-roadmap.md', content: '# roadmap' },
    ])

    expect(operations).toEqual([
      {
        source: '2026-02-06.md',
        destination: 'History/2026-02-06.md',
        action: 'move',
        reason: 'canonical_missing',
      },
      {
        source: 'rei-roadmap.md',
        destination: 'Plans/rei-roadmap.md',
        action: 'move',
        reason: 'canonical_missing',
      },
    ])
  })

  it('deletes legacy source when canonical file already has identical content', () => {
    const operations = planLegacyPathMigrations([
      { filename: '2026-02-06.md', content: '# same content' },
      { filename: 'History/2026-02-06.md', content: '# same content' },
    ])

    expect(operations).toEqual([
      {
        source: '2026-02-06.md',
        action: 'delete',
        reason: 'canonical_same_content',
      },
    ])
  })

  it('writes legacy conflict file when canonical destination has different content', () => {
    const operations = planLegacyPathMigrations([
      { filename: '2026-02-06.md', content: '# old archive' },
      { filename: 'History/2026-02-06.md', content: '# canonical archive' },
      { filename: 'History/2026-02-06-legacy-1.md', content: '# occupied' },
    ])

    expect(operations).toEqual([
      {
        source: '2026-02-06.md',
        destination: 'History/2026-02-06-legacy-2.md',
        action: 'move',
        reason: 'canonical_content_conflict',
      },
    ])
  })

  it('does not produce operations for core root files', () => {
    const operations = planLegacyPathMigrations([
      { filename: 'AI.md', content: '# prefs' },
      { filename: 'Plan.md', content: '# plans' },
      { filename: 'Today.md', content: '# today' },
      { filename: 'Tomorrow.md', content: '# tomorrow' },
      { filename: 'Recurring.md', content: '# recurring' },
      { filename: 'Carryover.md', content: '# carryover' },
    ])

    expect(operations).toEqual([])
  })
})
