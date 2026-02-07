import type { DailyPlan } from '../types/secretary'

export interface RenderDailyPlanOptions {
  existingContent?: string
  defaultHeader?: string
}

export interface RenderPlanEntryInput {
  planId: string
  planName: string
  status?: 'active' | 'paused' | 'completed' | 'archived'
  progressCurrent?: number
  progressTotal?: number
  startDate: string
  endDate: string
  schedule: string
  currentTopic?: string
}

/**
 * Render a daily plan markdown document while preserving user-authored sections
 * from existing content (focus/AI notes/end-of-day).
 */
export function renderDailyPlanMarkdown(
  plan: DailyPlan,
  options: RenderDailyPlanOptions = {},
): string {
  const existing = options.existingContent || ''
  const header = existing.match(/^#\s+.+$/m)?.[0] || options.defaultHeader || "# Today's Plan"

  const lines: string[] = [
    header,
    '',
    `**Date:** ${plan.date}`,
    '**Focus:** Study session',
    '',
    '## Schedule',
    '',
  ]

  for (const task of plan.tasks) {
    const marker =
      task.status === 'completed' ? 'x'
        : task.status === 'skipped' ? '-'
          : task.status === 'in_progress' ? '>'
            : ' '
    const noteTag = task.noteId ? ` {note:${task.noteId}}` : ''
    const planTag = task.planId ? ` [${task.planId}]` : ''
    lines.push(`- [${marker}] ${task.scheduledTime} (${task.durationMinutes}min) ${task.title}${noteTag}${planTag}`)
  }

  const focusMatch = existing.match(/\*\*Focus:\*\*\s*(.+)/)
  if (focusMatch) {
    const focusIndex = lines.indexOf('**Focus:** Study session')
    if (focusIndex >= 0) lines[focusIndex] = `**Focus:** ${focusMatch[1].trim()}`
  }

  const aiNotes = existing.match(/## AI Notes[\s\S]*?(?=\n## |$)/)
  if (aiNotes) lines.push('', aiNotes[0].trim())

  const endOfDay = existing.match(/## End of Day[\s\S]*$/)
  if (endOfDay) lines.push('', endOfDay[0].trim())

  return lines.join('\n')
}

export function renderPlanEntryMarkdown(input: RenderPlanEntryInput): string {
  const status = input.status || 'active'
  const current = input.progressCurrent ?? 0
  const total = input.progressTotal ?? 14
  const topic = input.currentTopic || 'Week 1 - Getting started'

  return [
    `### [${input.planId}] ${input.planName} (${status})`,
    `- Progress: ${current}/${total}`,
    `- Date: ${input.startDate} - ${input.endDate}`,
    `- Schedule: ${input.schedule}`,
    `- Current: ${topic}`,
  ].join('\n')
}
