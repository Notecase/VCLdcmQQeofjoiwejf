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
  projectId?: string
}

function encodeArtifactValue(value: string | undefined): string {
  return encodeURIComponent(value || '')
}

function renderArtifactTags(plan: DailyPlan, taskIndex: number): string {
  const artifacts = plan.tasks[taskIndex].artifacts || []
  if (artifacts.length === 0) return ''

  return artifacts
    .map((artifact) => {
      const payload = [
        artifact.kind,
        artifact.status,
        artifact.label,
        artifact.targetId,
        artifact.href,
        artifact.missionId,
        artifact.createdByAgent,
        artifact.createdAt,
      ]
        .map((value) => encodeArtifactValue(value))
        .join('|')

      return ` {artifact:${payload}}`
    })
    .join('')
}

/**
 * Render a daily plan markdown document while preserving user-authored sections
 * from existing content (focus/AI notes/end-of-day).
 */
export function renderDailyPlanMarkdown(
  plan: DailyPlan,
  options: RenderDailyPlanOptions = {}
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

  for (const [taskIndex, task] of plan.tasks.entries()) {
    const marker =
      task.status === 'completed'
        ? 'x'
        : task.status === 'skipped'
          ? '-'
          : task.status === 'in_progress'
            ? '>'
            : ' '
    const noteTag = task.noteId ? ` {note:${task.noteId}}` : ''
    const artifactTags = renderArtifactTags(plan, taskIndex)
    const planTag = task.planId ? ` [${task.planId}]` : ''
    lines.push(
      `- [${marker}] ${task.scheduledTime} (${task.durationMinutes}min) ${task.title}${noteTag}${artifactTags}${planTag}`
    )
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

  const lines = [
    `### [${input.planId}] ${input.planName} (${status})`,
    `- Progress: ${current}/${total}`,
    `- Date: ${input.startDate} - ${input.endDate}`,
    `- Schedule: ${input.schedule}`,
    `- Current: ${topic}`,
  ]
  if (input.projectId) {
    lines.push(`- ProjectId: ${input.projectId}`)
  }
  return lines.join('\n')
}
