import { describe, it, expect } from 'vitest'
import type {
  ActivationSuggestion,
  HistoryEntry,
  LearningRoadmap,
  MemoryFile,
  StudyPreferences,
} from '@inkdown/shared/types'
import { createSecretaryTools } from './tools'
import type { MemoryService, MemoryContext } from './memory'

class FakeMemoryService {
  private files = new Map<string, string>()
  private context: MemoryContext

  constructor(initialFiles: Array<{ filename: string; content: string }>, context?: Partial<MemoryContext>) {
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
  async initializeDefaults(): Promise<MemoryFile[]> { return [] }
  async performDayTransition(): Promise<{ transitioned: boolean }> { return { transitioned: false } }
  async checkAndExpandWeek(): Promise<boolean> { return false }
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

function getToolByName(tools: unknown[], name: string): any {
  const tool = (tools as any[]).find(t => t?.name === name)
  if (!tool) throw new Error(`Tool ${name} not found`)
  return tool
}

describe('secretary roadmap activation tools', () => {
  it('activates single roadmap archive into Plan.md', async () => {
    const mem = new FakeMemoryService([
      { filename: 'Plan.md', content: '# Learning Plans\n\n## Active Plans\n\n' },
      {
        filename: 'Plans/rl-roadmap.md',
        content: '# [RL] Reinforcement Learning\n**Duration:** 120 days\n**Hours/day:** 2\n**Schedule:** Daily 2h/day\n',
      },
    ])

    const tools = createSecretaryTools(mem as unknown as MemoryService, {
      openaiApiKey: 'test',
      userId: 'user',
    })
    const activate = getToolByName(tools, 'activate_roadmap')
    const result = await activate.invoke({})

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
      openaiApiKey: 'test',
      userId: 'user',
    })
    const activate = getToolByName(tools, 'activate_roadmap')
    const result = await activate.invoke({})

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
      openaiApiKey: 'test',
      userId: 'user',
    })
    const activate = getToolByName(tools, 'activate_roadmap')
    const result = await activate.invoke({})

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
      openaiApiKey: 'test',
      userId: 'user',
    })
    const generate = getToolByName(tools, 'generate_daily_plan')
    const result = await generate.invoke({ targetDate: '2026-02-07', isForTomorrow: false })

    expect(String(result)).toContain('Call activate_roadmap with a roadmapId')
  })
})

describe('save_roadmap normalization', () => {
  it('derives progress total and schedule from roadmapContent when pending cache is unavailable', async () => {
    const mem = new FakeMemoryService([
      { filename: 'Plan.md', content: '# Learning Plans\n\n## Active Plans\n\n' },
    ])

    const tools = createSecretaryTools(mem as unknown as MemoryService, {
      openaiApiKey: 'test',
      userId: 'user',
    })
    const save = getToolByName(tools, 'save_roadmap')

    await save.invoke({
      planId: 'RL',
      planName: 'Reinforcement Learning',
      startDate: '2026-02-06',
      roadmapContent: '# [RL] Reinforcement Learning\n\n**Duration:** 120 days\n**Hours/day:** 2\n**Schedule:** MWF 2h/day\n',
    })

    const plan = await mem.readFile('Plan.md')
    expect(plan?.content).toContain('### [RL] Reinforcement Learning (active)')
    expect(plan?.content).toContain('- Progress: 0/120')
    expect(plan?.content).toContain('- Schedule: MWF 2h/day')
    expect(plan?.content).not.toContain('- Progress: 0/14')
  })
})

describe('modify_today_plan behavior', () => {
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
      openaiApiKey: 'test',
      userId: 'user',
    })
    const modify = getToolByName(tools, 'modify_today_plan')

    const result = await modify.invoke({
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
      openaiApiKey: 'test',
      userId: 'user',
    })
    const modify = getToolByName(tools, 'modify_today_plan')

    const result = await modify.invoke({
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
      openaiApiKey: 'test',
      userId: 'user',
    })
    const modify = getToolByName(tools, 'modify_today_plan')

    const result = await modify.invoke({
      action: 'extend',
      taskTime: '10:45',
      duration: 15,
    })

    expect(String(result)).toContain('Extended 1 task(s)')
    const today = await mem.readFile('Today.md')
    expect(today?.content).toContain('10:45 (30min) ☕ Break')
  })
})
