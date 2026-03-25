import { describe, it, expect } from 'vitest'
import type {
  ActivationSuggestion,
  HistoryEntry,
  LearningRoadmap,
  MemoryFile,
  StudyPreferences,
} from '@inkdown/shared/types'
import { createSecretaryTools } from './tools'
import { MemoryService } from './memory'
import type { MemoryContext } from './memory'

class FakeMemoryService {
  private files = new Map<string, string>()
  private context: MemoryContext

  constructor(
    initialFiles: Array<{ filename: string; content: string }>,
    context?: Partial<MemoryContext>
  ) {
    for (const file of initialFiles) {
      this.files.set(file.filename, file.content)
    }

    const defaultSuggestion: ActivationSuggestion = {
      action: 'none',
      reason: 'none',
      candidates: [],
    }
    this.context = {
      preferences: null,
      activePlans: [],
      thisWeekSection: '',
      todayContent: '',
      tomorrowContent: '',
      parserWarnings: [],
      activationSuggestion: defaultSuggestion,
      recurringBlocks: '',
      carryoverTasks: '',
      inboxContent: '',
      calendarContent: '',
      ...context,
    }
  }

  async readFile(filename: string): Promise<MemoryFile | null> {
    if (!this.files.has(filename)) return null
    const now = new Date().toISOString()
    return {
      id: `${filename}-id`,
      userId: 'user',
      filename,
      content: this.files.get(filename) || '',
      createdAt: now,
      updatedAt: now,
    }
  }

  async writeFile(filename: string, content: string): Promise<MemoryFile> {
    this.files.set(filename, content)
    const now = new Date().toISOString()
    return {
      id: `${filename}-id`,
      userId: 'user',
      filename,
      content,
      createdAt: now,
      updatedAt: now,
    }
  }

  async listFiles(prefix?: string): Promise<MemoryFile[]> {
    const now = new Date().toISOString()
    return [...this.files.entries()]
      .filter(([filename]) => (prefix ? filename.startsWith(prefix) : true))
      .map(([filename, content]) => ({
        id: `${filename}-id`,
        userId: 'user',
        filename,
        content,
        createdAt: now,
        updatedAt: now,
      }))
  }

  async deleteFile(filename: string): Promise<boolean> {
    this.files.delete(filename)
    return true
  }

  async getFullContext(): Promise<MemoryContext> {
    return this.context
  }

  async getHistoryAnalytics(): Promise<{
    recentDays: number
    avgCompletionRate: number
    struggledTopics: string[]
    strongTopics: string[]
    currentStreak: number
    moodTrend: string[]
  }> {
    return {
      recentDays: 0,
      avgCompletionRate: 0,
      struggledTopics: [],
      strongTopics: [],
      currentStreak: 0,
      moodTrend: [],
    }
  }

  // Unused members to satisfy structural compatibility in tests.
  async initializeDefaults(): Promise<MemoryFile[]> {
    return []
  }
  async performDayTransition(): Promise<{ transitioned: boolean }> {
    return { transitioned: false }
  }
  async checkAndExpandWeek(): Promise<boolean> {
    return false
  }
  async getContextDiagnostics(): Promise<{
    activePlansParsed: number
    roadmapFilesFound: number
    autoActivated: boolean
    warnings: []
    activationSuggestion: ActivationSuggestion
    todayPlanParsed: boolean
  }> {
    return {
      activePlansParsed: 0,
      roadmapFilesFound: 0,
      autoActivated: false,
      warnings: [],
      activationSuggestion: this.context.activationSuggestion,
      todayPlanParsed: false,
    }
  }
}

function getToolByName(tools: Record<string, any>, name: string): any {
  const t = tools[name]
  if (!t) throw new Error(`Tool ${name} not found`)
  return t
}

describe('secretary roadmap activation tools', () => {
  it('activates single roadmap archive into Plan.md', async () => {
    const mem = new FakeMemoryService([
      { filename: 'Plan.md', content: '# Learning Plans\n\n## Active Plans\n\n' },
      {
        filename: 'Plans/rl-roadmap.md',
        content:
          '# [RL] Reinforcement Learning\n**Duration:** 120 days\n**Hours/day:** 2\n**Schedule:** Daily 2h/day\n',
      },
    ])

    const tools = createSecretaryTools(mem as unknown as MemoryService, {
      userId: 'user',
    })
    const activate = getToolByName(tools, 'activate_roadmap')
    const result = await activate.execute({})

    expect(String(result)).toContain('Activated roadmap [RL]')
    const plan = await mem.readFile('Plan.md')
    expect(plan?.content).toContain('### [RL] Reinforcement Learning (active)')
  })

  it('requires roadmapId when multiple roadmap archives exist', async () => {
    const mem = new FakeMemoryService([
      { filename: 'Plan.md', content: '# Learning Plans\n\n## Active Plans\n\n' },
      { filename: 'Plans/rl-roadmap.md', content: '# [RL] Reinforcement Learning' },
      { filename: 'Plans/ml-roadmap.md', content: '# [ML] Machine Learning' },
    ])

    const tools = createSecretaryTools(mem as unknown as MemoryService, {
      userId: 'user',
    })
    const activate = getToolByName(tools, 'activate_roadmap')
    const result = await activate.execute({})

    expect(String(result)).toContain('Multiple roadmap candidates found')
  })

  it('derives candidate id/name from non-bracket roadmap heading', async () => {
    const mem = new FakeMemoryService([
      { filename: 'Plan.md', content: '# Learning Plans\n\n## Active Plans\n\n' },
      {
        filename: 'Plans/reinforcement-learning-roadmap.md',
        content: '# Reinforcement Learning Roadmap\n\n**Duration:** 120 days\n**Hours/day:** 2\n',
      },
    ])

    const tools = createSecretaryTools(mem as unknown as MemoryService, {
      userId: 'user',
    })
    const activate = getToolByName(tools, 'activate_roadmap')
    const result = await activate.execute({})

    expect(String(result)).toContain('Activated roadmap [RL]')
    const plan = await mem.readFile('Plan.md')
    expect(plan?.content).toContain('Reinforcement Learning')
  })
})

describe('generate_daily_plan activation guard', () => {
  it('asks for activate_roadmap when multiple candidates exist with no active plan', async () => {
    const mem = new FakeMemoryService([], {
      activePlans: [],
      activationSuggestion: {
        action: 'needs_selection',
        reason: 'choose one',
        candidates: [
          { id: 'RL', name: 'Reinforcement Learning', filename: 'Plans/rl-roadmap.md' },
          { id: 'ML', name: 'Machine Learning', filename: 'Plans/ml-roadmap.md' },
        ],
      },
    })

    const tools = createSecretaryTools(mem as unknown as MemoryService, {
      userId: 'user',
    })
    const generate = getToolByName(tools, 'generate_daily_plan')
    const result = await generate.execute({ targetDate: '2026-02-07', isForTomorrow: false })

    expect(String(result)).toContain('Call activate_roadmap with a roadmapId')
  })
})

describe('save_roadmap normalization', () => {
  it('derives progress total and schedule from roadmapContent when pending cache is unavailable', async () => {
    const mem = new FakeMemoryService([
      { filename: 'Plan.md', content: '# Learning Plans\n\n## Active Plans\n\n' },
    ])

    const tools = createSecretaryTools(mem as unknown as MemoryService, {
      userId: 'user',
    })
    const save = getToolByName(tools, 'save_roadmap')

    await save.execute({
      planId: 'RL',
      planName: 'Reinforcement Learning',
      startDate: '2026-02-06',
      roadmapContent:
        '# [RL] Reinforcement Learning\n\n**Duration:** 120 days\n**Hours/day:** 2\n**Schedule:** MWF 2h/day\n',
    })

    const plan = await mem.readFile('Plan.md')
    expect(plan?.content).toContain('### [RL] Reinforcement Learning (active)')
    expect(plan?.content).toContain('- Progress: 0/120')
    expect(plan?.content).toContain('- Schedule: MWF 2h/day')
    expect(plan?.content).not.toContain('- Progress: 0/14')
  })
})

describe('modify_plan behavior', () => {
  it('returns a clear no-op message when taskTime is missing from Today.md', async () => {
    const mem = new FakeMemoryService([
      {
        filename: 'Today.md',
        content: `# Today's Plan

## Schedule

- [ ] 09:00 (45min) 📖 Learn RL basics [RL]
- [ ] 09:45 (15min) ☕ Break
`,
      },
    ])

    const tools = createSecretaryTools(mem as unknown as MemoryService, {
      userId: 'user',
    })
    const modify = getToolByName(tools, 'modify_plan')

    const result = await modify.execute({
      action: 'reschedule',
      taskTime: '10:00',
      newTime: '11:00',
    })

    expect(String(result)).toContain('No tasks matched')
    const today = await mem.readFile('Today.md')
    expect(today?.content).toContain('09:00')
    expect(today?.content).not.toContain('11:00')
  })

  it('reschedules every task line that matches the requested time', async () => {
    const mem = new FakeMemoryService([
      {
        filename: 'Today.md',
        content: `# Today's Plan

## Schedule

- [ ] 10:00 (45min) 📖 Session A [RL]
- [ ] 10:00 (45min) 💻 Session B [RL]
`,
      },
    ])

    const tools = createSecretaryTools(mem as unknown as MemoryService, {
      userId: 'user',
    })
    const modify = getToolByName(tools, 'modify_plan')

    const result = await modify.execute({
      action: 'reschedule',
      taskTime: '10:00',
      newTime: '11:00',
    })

    expect(String(result)).toContain('Rescheduled 2 task(s)')
    const today = await mem.readFile('Today.md')
    expect(today?.content.match(/10:00/g)?.length || 0).toBe(0)
    expect(today?.content.match(/11:00/g)?.length || 0).toBe(2)
  })

  it('extends duration by the requested minutes for matching task(s)', async () => {
    const mem = new FakeMemoryService([
      {
        filename: 'Today.md',
        content: `# Today's Plan

## Schedule

- [ ] 10:45 (15min) ☕ Break
`,
      },
    ])

    const tools = createSecretaryTools(mem as unknown as MemoryService, {
      userId: 'user',
    })
    const modify = getToolByName(tools, 'modify_plan')

    const result = await modify.execute({
      action: 'extend',
      taskTime: '10:45',
      duration: 15,
    })

    expect(String(result)).toContain('Extended 1 task(s)')
    const today = await mem.readFile('Today.md')
    expect(today?.content).toContain('10:45 (30min) ☕ Break')
  })
})

// ============================================================================
// Day Transition Tests
// ============================================================================

/**
 * TestableMemoryService overrides Supabase I/O with in-memory storage
 * so we can test the real performDayTransition() logic.
 */
class TestableMemoryService extends MemoryService {
  private files = new Map<string, string>()

  constructor(initialFiles: Array<{ filename: string; content: string }>, timezone: string) {
    // Pass null as supabase — we override all I/O methods
    super(null as any, 'test-user', timezone)
    for (const f of initialFiles) {
      this.files.set(f.filename, f.content)
    }
  }

  override async readFile(filename: string): Promise<MemoryFile | null> {
    if (!this.files.has(filename)) return null
    const now = new Date().toISOString()
    return {
      id: `${filename}-id`,
      userId: 'test-user',
      filename,
      content: this.files.get(filename) || '',
      createdAt: now,
      updatedAt: now,
    }
  }

  override async writeFile(filename: string, content: string): Promise<MemoryFile> {
    this.files.set(filename, content)
    const now = new Date().toISOString()
    return {
      id: `${filename}-id`,
      userId: 'test-user',
      filename,
      content,
      createdAt: now,
      updatedAt: now,
    }
  }

  override async deleteFile(filename: string): Promise<boolean> {
    this.files.delete(filename)
    return true
  }

  getFileContent(filename: string): string | undefined {
    return this.files.get(filename)
  }
}

describe('performDayTransition', () => {
  it('promotes Tomorrow.md to Today.md when dates match exactly', async () => {
    const mem = new TestableMemoryService(
      [
        {
          filename: 'Today.md',
          content: `# Today's Plan — 2026-03-23\n\n- [x] 09:00 (45min) Study RL\n`,
        },
        {
          filename: 'Tomorrow.md',
          content: `# Tomorrow's Plan — 2026-03-24\n\n- [ ] 09:00 (60min) Study ML\n`,
        },
      ],
      'UTC'
    )

    // Freeze "today" to 2026-03-24 by using UTC timezone
    // getTodayDate('UTC') should return 2026-03-24 when run on that date
    // Instead, we test the logic directly: Today.md has 2026-03-23 (stale),
    // Tomorrow.md has 2026-03-24. We need todayDate to be 2026-03-24.
    // Since we can't freeze time easily, let's use a date that's definitely in the past.

    // Use a simpler approach: set Today.md to a very old date so it's always stale,
    // and Tomorrow.md to today's actual date
    const todayStr = new Date().toISOString().split('T')[0]
    const mem2 = new TestableMemoryService(
      [
        {
          filename: 'Today.md',
          content: `# Today's Plan — 2020-01-01\n\n- [x] 09:00 (45min) Old task\n`,
        },
        {
          filename: 'Tomorrow.md',
          content: `# Tomorrow's Plan — ${todayStr}\n\n- [ ] 09:00 (60min) Study ML\n`,
        },
      ],
      'UTC'
    )

    const result = await mem2.performDayTransition()

    expect(result.transitioned).toBe(true)
    expect(result.promotedTomorrow).toBe(true)

    const today = mem2.getFileContent('Today.md')
    expect(today).toContain('Study ML')
    expect(today).toContain(todayStr)

    const tomorrow = mem2.getFileContent('Tomorrow.md')
    expect(tomorrow).toBe('')

    // Verify old Today.md was archived
    const archived = mem2.getFileContent('History/2020-01-01.md')
    expect(archived).toContain('Old task')
  })

  it('promotes Tomorrow.md even when its date is older than today (multi-day gap)', async () => {
    // Simulate: user didn't open app for 2 days after approving tomorrow plan
    const todayStr = new Date().toISOString().split('T')[0]
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0]

    const mem = new TestableMemoryService(
      [
        {
          filename: 'Today.md',
          content: `# Today's Plan — 2020-01-01\n\n- [ ] 09:00 (30min) Ancient task\n`,
        },
        {
          filename: 'Tomorrow.md',
          content: `# Tomorrow's Plan — ${twoDaysAgo}\n\nStatus: Approved\n\n- [ ] 09:00 (60min) Catch-up session\n`,
        },
      ],
      'UTC'
    )

    const result = await mem.performDayTransition()

    expect(result.transitioned).toBe(true)
    expect(result.promotedTomorrow).toBe(true)

    const today = mem.getFileContent('Today.md')
    expect(today).toContain('Catch-up session')

    const tomorrow = mem.getFileContent('Tomorrow.md')
    expect(tomorrow).toBe('')
  })

  it('keeps Tomorrow.md if its date is in the future', async () => {
    const futureDate = new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0]

    const mem = new TestableMemoryService(
      [
        {
          filename: 'Today.md',
          content: `# Today's Plan — 2020-01-01\n\n- [ ] 09:00 (30min) Old task\n`,
        },
        {
          filename: 'Tomorrow.md',
          content: `# Tomorrow's Plan — ${futureDate}\n\n- [ ] 10:00 (60min) Future session\n`,
        },
      ],
      'UTC'
    )

    const result = await mem.performDayTransition()

    expect(result.transitioned).toBe(true)
    expect(result.promotedTomorrow).toBe(false)

    // Today.md should be reset (blank)
    const today = mem.getFileContent('Today.md')
    expect(today).toContain('No tasks scheduled yet')

    // Tomorrow.md should be preserved (future date)
    const tomorrow = mem.getFileContent('Tomorrow.md')
    expect(tomorrow).toContain('Future session')
    expect(tomorrow).toContain(futureDate)
  })

  it('no-ops when Today.md is already current', async () => {
    const todayStr = new Date().toISOString().split('T')[0]

    const mem = new TestableMemoryService(
      [
        {
          filename: 'Today.md',
          content: `# Today's Plan — ${todayStr}\n\n- [ ] 09:00 (45min) Current task\n`,
        },
        {
          filename: 'Tomorrow.md',
          content: `# Tomorrow's Plan — 2099-12-31\n\n- [ ] 10:00 (60min) Far future\n`,
        },
      ],
      'UTC'
    )

    const result = await mem.performDayTransition()

    expect(result.transitioned).toBe(false)

    // Nothing should change
    const today = mem.getFileContent('Today.md')
    expect(today).toContain('Current task')
    const tomorrow = mem.getFileContent('Tomorrow.md')
    expect(tomorrow).toContain('Far future')
  })

  it('resets Today.md when no Tomorrow.md exists', async () => {
    const mem = new TestableMemoryService(
      [
        {
          filename: 'Today.md',
          content: `# Today's Plan — 2020-01-01\n\n- [x] Done task\n`,
        },
      ],
      'UTC'
    )

    const result = await mem.performDayTransition()

    expect(result.transitioned).toBe(true)
    expect(result.promotedTomorrow).toBe(false)

    const today = mem.getFileContent('Today.md')
    expect(today).toContain('No tasks scheduled yet')
  })

  // Death-spiral regression tests

  it('promotes Tomorrow.md when Today.md is empty', async () => {
    const todayStr = new Date().toISOString().split('T')[0]
    const mem = new TestableMemoryService(
      [
        {
          filename: 'Today.md',
          content: '',
        },
        {
          filename: 'Tomorrow.md',
          content: `# Tomorrow's Plan — ${todayStr}\n\nStatus: Approved\n\n- [ ] 09:00 (60min) Morning review\n`,
        },
      ],
      'UTC'
    )

    const result = await mem.performDayTransition()

    expect(result.transitioned).toBe(true)
    expect(result.promotedTomorrow).toBe(true)

    const today = mem.getFileContent('Today.md')
    expect(today).toContain('Morning review')
    expect(today).toContain(todayStr)

    const tomorrow = mem.getFileContent('Tomorrow.md')
    expect(tomorrow).toBe('')
  })

  it('promotes Tomorrow.md when Today.md is a dateless template (death spiral state)', async () => {
    const todayStr = new Date().toISOString().split('T')[0]
    const mem = new TestableMemoryService(
      [
        {
          filename: 'Today.md',
          content: `# Today's Plan\n\n*No tasks scheduled yet.*\n`,
        },
        {
          filename: 'Tomorrow.md',
          content: `# Tomorrow's Plan — ${todayStr}\n\nStatus: Approved\n\n- [ ] 09:00 (45min) Study RL\n- [ ] 10:00 (30min) Code review\n`,
        },
      ],
      'UTC'
    )

    const result = await mem.performDayTransition()

    expect(result.transitioned).toBe(true)
    expect(result.promotedTomorrow).toBe(true)

    const today = mem.getFileContent('Today.md')
    expect(today).toContain('Study RL')
    expect(today).toContain(todayStr)

    const tomorrow = mem.getFileContent('Tomorrow.md')
    expect(tomorrow).toBe('')
  })

  it('writes dated empty template when Today.md is dateless and no Tomorrow.md exists', async () => {
    const todayStr = new Date().toISOString().split('T')[0]
    const mem = new TestableMemoryService(
      [
        {
          filename: 'Today.md',
          content: `# Today's Plan\n\n*No tasks scheduled yet.*\n`,
        },
      ],
      'UTC'
    )

    const result = await mem.performDayTransition()

    expect(result.transitioned).toBe(true)
    expect(result.promotedTomorrow).toBe(false)

    const today = mem.getFileContent('Today.md')
    expect(today).toContain('No tasks scheduled yet')
    // The key assertion: the template now includes a date, breaking the death spiral
    expect(today).toContain(todayStr)
  })
})
