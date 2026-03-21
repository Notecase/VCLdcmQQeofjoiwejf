import { describe, it, expect } from 'vitest'
import { parseDailyPlanMarkdown, parsePlanMarkdown } from './markdown-parser'
import { renderDailyPlanMarkdown } from './markdown-renderer'

describe('parsePlanMarkdown', () => {
  it('parses canonical active plans and this-week section', () => {
    const content = [
      '# Learning Plans',
      '',
      '## Active Plans',
      '',
      '### [RL] Reinforcement Learning (active)',
      '- Progress: 2/120',
      '- Date: 2026-02-01 - 2026-06-01',
      '- Schedule: Daily 2h/day',
      '- Current: Week 1 - Fundamentals',
      '',
      '## This Week (2026-02-02 - 2026-02-08)',
      '',
      '**Mon:** RL - Intro to RL',
    ].join('\n')

    const result = parsePlanMarkdown(content)

    expect(result.activePlans).toHaveLength(1)
    expect(result.activePlans[0].id).toBe('RL')
    expect(result.activePlans[0].progress.totalDays).toBe(120)
    expect(result.thisWeekSection).toContain('**Mon:** RL - Intro to RL')
    expect(result.warnings.some((w) => w.severity === 'error')).toBe(false)
  })

  it('tolerates missing status and still parses plan with warning', () => {
    const content = [
      '# Learning Plans',
      '',
      '## Active Plans',
      '',
      '### [RL] Reinforcement Learning',
      '- Progress: 0/120',
      '- Date: 2026-02-01 - 2026-06-01',
      '- Schedule: MWF 2h/day',
      '- Current: Week 1 - Fundamentals',
    ].join('\n')

    const result = parsePlanMarkdown(content)

    expect(result.plans).toHaveLength(1)
    expect(result.activePlans).toHaveLength(1)
    expect(result.warnings.some((w) => w.code === 'plan_status_missing')).toBe(true)
  })
})

describe('parseDailyPlanMarkdown', () => {
  it('parses task status markers and note tags', () => {
    const content = [
      '# Today',
      '',
      '## Schedule',
      '',
      '- [x] 09:00 (45min) Study Bellman equations {note:123e4567-e89b-12d3-a456-426614174000} [RL]',
      '- [ ] 10:00 (15min) Break',
      '- [>] 10:15 (45min) Q-learning practice [RL]',
    ].join('\n')

    const result = parseDailyPlanMarkdown(content, '2026-02-06', 'Today.md')

    expect(result.plan).not.toBeNull()
    expect(result.plan?.tasks).toHaveLength(3)
    expect(result.plan?.tasks[0].status).toBe('completed')
    expect(result.plan?.tasks[0].noteId).toBe('123e4567-e89b-12d3-a456-426614174000')
    expect(result.plan?.tasks[1].status).toBe('pending')
    expect(result.plan?.tasks[2].status).toBe('in_progress')
  })

  it('accepts alternate duration units (minutes/mins)', () => {
    const content = [
      '# Today',
      '',
      '## Schedule',
      '',
      '- [ ] 09:00 (45 minutes) Study Bellman equations [RL]',
      '- [ ] 10:00 (15 mins) Break',
    ].join('\n')

    const result = parseDailyPlanMarkdown(content, '2026-02-06', 'Today.md')

    expect(result.plan).not.toBeNull()
    expect(result.plan?.tasks).toHaveLength(2)
    expect(result.plan?.tasks[0].durationMinutes).toBe(45)
    expect(result.plan?.tasks[1].durationMinutes).toBe(15)
  })

  it('round-trips task artifacts through markdown rendering', () => {
    const markdown = renderDailyPlanMarkdown({
      id: 'plan-2026-02-06',
      date: '2026-02-06',
      tasks: [
        {
          id: 'task-1',
          title: 'Study Bellman equations',
          type: 'learn',
          status: 'pending',
          scheduledTime: '09:00',
          durationMinutes: 45,
          planId: 'RL',
          noteId: '123e4567-e89b-12d3-a456-426614174000',
          artifacts: [
            {
              id: 'artifact-1',
              kind: 'note',
              status: 'ready',
              label: 'Note ready',
              targetId: '123e4567-e89b-12d3-a456-426614174000',
              href: '/editor?noteId=123e4567-e89b-12d3-a456-426614174000',
              missionId: 'mission-1',
              createdByAgent: 'editor',
              createdAt: '2026-02-06T09:15:00.000Z',
            },
          ],
          aiGenerated: true,
        },
      ],
      createdAt: '2026-02-06T08:00:00.000Z',
      updatedAt: '2026-02-06T08:00:00.000Z',
      isApproved: true,
      userModified: false,
      totalMinutes: 45,
      completedMinutes: 0,
    })

    const result = parseDailyPlanMarkdown(markdown, '2026-02-06', 'Today.md')
    const artifact = result.plan?.tasks[0].artifacts?.[0]

    expect(artifact).toBeDefined()
    expect(artifact?.kind).toBe('note')
    expect(artifact?.status).toBe('ready')
    expect(artifact?.label).toBe('Note ready')
    expect(artifact?.href).toBe('/editor?noteId=123e4567-e89b-12d3-a456-426614174000')
    expect(artifact?.missionId).toBe('mission-1')
  })
})
