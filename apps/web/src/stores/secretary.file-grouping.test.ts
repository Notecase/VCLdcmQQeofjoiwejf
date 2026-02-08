import { describe, expect, it } from 'vitest'
import type { MemoryFile } from '@inkdown/shared/types'
import { partitionMemoryFiles } from './secretary.file-grouping'
import { computeDailyCompletionRates } from '../utils/secretaryAnalytics'

function file(filename: string, content = ''): MemoryFile {
  return {
    id: `${filename}-id`,
    userId: 'user-1',
    filename,
    content,
    createdAt: '2026-02-08T10:00:00.000Z',
    updatedAt: '2026-02-08T10:00:00.000Z',
  }
}

describe('secretary memory file grouping', () => {
  it('partitions root, history, and plans files for sidebar rendering', () => {
    const groups = partitionMemoryFiles([
      file('AI.md'),
      file('Plan.md'),
      file('Today.md'),
      file('History/2026-02-06.md'),
      file('History/2026-02-07.md'),
      file('Plans/rei-roadmap.md'),
    ])

    expect(groups.rootMemoryFiles.map(f => f.filename)).toEqual(['AI.md', 'Plan.md', 'Today.md'])
    expect(groups.historyEntries.map(f => f.filename)).toEqual([
      'History/2026-02-07.md',
      'History/2026-02-06.md',
    ])
    expect(groups.planArchiveEntries.map(f => f.filename)).toEqual(['Plans/rei-roadmap.md'])
  })

  it('provides history analytics source without lazy history loading', () => {
    const groups = partitionMemoryFiles([
      file('AI.md'),
      file(
        'History/2026-02-06.md',
        `# Day\n- [x] 09:00 (45min) Task A\n- [ ] 10:00 (45min) Task B`,
      ),
      file(
        'History/2026-02-07.md',
        `# Day\n- [x] 09:00 (45min) Task C\n- [x] 10:00 (45min) Task D`,
      ),
    ])

    const stats = computeDailyCompletionRates(groups.historyEntries)

    expect(stats.length).toBe(2)
    expect(stats[0].date).toBe('2026-02-06')
    expect(stats[1].date).toBe('2026-02-07')
  })
})
