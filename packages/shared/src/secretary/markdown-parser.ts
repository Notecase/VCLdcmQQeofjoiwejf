import type {
  DailyPlan,
  DailyPlanParseResult,
  LearningRoadmap,
  ParserWarning,
  PlanParseResult,
  ScheduledTask,
  TaskArtifactLink,
} from '../types/secretary'

export function parseStudyDays(scheduleStr: string): string[] {
  if (!scheduleStr) return ['Daily']
  const lower = scheduleStr.toLowerCase()
  if (lower.includes('daily')) return ['Daily']

  const dayMap: Array<[RegExp, string]> = [
    [/\bmon(day)?\b/i, 'Mon'],
    [/\btue(s|sday)?\b/i, 'Tue'],
    [/\bwed(nesday)?\b/i, 'Wed'],
    [/\bthu(r|rs|rsday)?\b/i, 'Thu'],
    [/\bfri(day)?\b/i, 'Fri'],
    [/\bsat(urday)?\b/i, 'Sat'],
    [/\bsun(day)?\b/i, 'Sun'],
  ]

  const days = dayMap.filter(([pattern]) => pattern.test(scheduleStr)).map(([, day]) => day)
  if (days.length > 0) return days

  // Fallback for compact forms like "MWF" or "TuThSa".
  const compactMap: Record<string, string> = {
    m: 'Mon',
    tu: 'Tue',
    w: 'Wed',
    th: 'Thu',
    f: 'Fri',
    sa: 'Sat',
    su: 'Sun',
  }

  const compactDays: string[] = []
  const tokenPattern = /^(su|sa|th|tu|m|w|f)/i
  let remaining = scheduleStr.replace(/[\s\d.h/day/,-]+/gi, '').trim()

  while (remaining.length > 0) {
    const match = remaining.match(tokenPattern)
    if (!match) {
      remaining = remaining.slice(1)
      continue
    }
    const token = match[1].toLowerCase()
    const day = compactMap[token]
    if (day) compactDays.push(day)
    remaining = remaining.slice(match[1].length)
  }

  return compactDays.length > 0 ? compactDays : ['Daily']
}

function parseHoursPerDay(scheduleText: string): number {
  const m = scheduleText.match(/(\d+(?:\.\d+)?)\s*h(?:ours?)?\s*\/\s*day/i)
  if (!m) return 2
  const n = parseFloat(m[1])
  return Number.isFinite(n) && n > 0 ? n : 2
}

function extractSection(content: string, titleRegex: RegExp): string {
  const pattern = new RegExp(
    `${titleRegex.source}[^\\n]*\\n([\\s\\S]*?)(?=\\n##\\s|\\n#\\s|$)`,
    'i'
  )
  const match = content.match(pattern)
  return match?.[1]?.trim() || ''
}

function buildWarning(
  code: string,
  message: string,
  file: string,
  severity: 'info' | 'warning' | 'error' = 'warning'
): ParserWarning {
  return { code, message, file, severity }
}

function decodeArtifactValue(value: string | undefined): string | undefined {
  if (!value) return undefined
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function parseTaskArtifacts(line: string): TaskArtifactLink[] {
  const matches = [...line.matchAll(/\{artifact:([^}]+)\}/gi)]
  const artifacts: TaskArtifactLink[] = []

  for (const [idx, match] of matches.entries()) {
    const parts = String(match[1] || '').split('|')
    const [kind, status, label, targetId, href, missionId, createdByAgent, createdAt] = parts.map(
      (part) => decodeArtifactValue(part)
    )

    if (!kind || !status || !label || !createdByAgent || !createdAt) {
      continue
    }

    artifacts.push({
      id: `artifact-${idx}-${kind}-${status}`,
      kind: kind as TaskArtifactLink['kind'],
      status: status as TaskArtifactLink['status'],
      label,
      targetId,
      href,
      missionId,
      createdByAgent,
      createdAt,
    })
  }

  return artifacts
}

function normalizeStatus(status: string | undefined): LearningRoadmap['status'] {
  const lower = (status || '').toLowerCase()
  if (
    lower === 'active' ||
    lower === 'paused' ||
    lower === 'completed' ||
    lower === 'archived' ||
    lower === 'expired'
  ) {
    return lower
  }
  return 'active'
}

export function parsePlanMarkdown(content: string): PlanParseResult {
  const warnings: ParserWarning[] = []
  const file = 'Plan.md'

  if (!content.trim()) {
    return {
      plans: [],
      activePlans: [],
      thisWeekSection: '',
      warnings: [buildWarning('plan_empty', 'Plan.md is empty.', file, 'info')],
    }
  }

  const activeSection = extractSection(content, /##\s*Active Plans/)
  const source = activeSection || content
  if (!activeSection) {
    warnings.push(
      buildWarning(
        'active_section_missing',
        'Missing "## Active Plans" section; attempting full-file parse.',
        file
      )
    )
  }

  const headingPattern =
    /^###\s*\[([^\]]+)\]\s*(.+?)(?:\s*\((active|paused|completed|archived|expired)\))?\s*$/gim
  const headings = [...source.matchAll(headingPattern)]
  const plans: LearningRoadmap[] = []

  for (let i = 0; i < headings.length; i++) {
    const match = headings[i]
    const next = headings[i + 1]
    const rawId = match[1]?.trim() || ''
    const name = match[2]?.trim() || 'Untitled roadmap'
    const status = normalizeStatus(match[3])
    const sectionStart = (match.index || 0) + match[0].length
    const sectionEnd = next?.index ?? source.length
    const detail = source.slice(sectionStart, sectionEnd)

    if (!rawId) {
      warnings.push(
        buildWarning('plan_id_missing', `Skipping roadmap "${name}" because ID is missing.`, file)
      )
      continue
    }

    if (!match[3]) {
      warnings.push(
        buildWarning(
          'plan_status_missing',
          `Roadmap [${rawId}] is missing an explicit status; defaulting to "active".`,
          file,
          'info'
        )
      )
    }

    const progressMatch = detail.match(/-\s*progress:\s*(\d+)\s*\/\s*(\d+)/i)
    const dateMatch = detail.match(
      /-\s*date:\s*(\d{4}-\d{2}-\d{2})\s*[-\u2013]\s*(\d{4}-\d{2}-\d{2})/i
    )
    const scheduleMatch = detail.match(/-\s*schedule:\s*(.+)/i)
    const topicMatch = detail.match(/-\s*current:\s*(.+)/i)
    const projectIdMatch = detail.match(/-\s*projectid:\s*([0-9a-f-]{36})/i)

    const completedLessons = progressMatch ? parseInt(progressMatch[1], 10) : 0
    const totalLessons = progressMatch ? parseInt(progressMatch[2], 10) : 0
    const percentComplete =
      totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0
    const scheduleText = scheduleMatch?.[1]?.trim() || ''

    plans.push({
      id: rawId.toUpperCase(),
      name,
      status,
      dateRange: {
        start: dateMatch?.[1] || '',
        end: dateMatch?.[2] || '',
      },
      schedule: {
        hoursPerDay: parseHoursPerDay(scheduleText),
        studyDays: parseStudyDays(scheduleText),
      },
      progress: {
        currentWeek: 1,
        totalWeeks: 1,
        completedLessons,
        totalLessons,
        percentComplete,
      },
      currentTopic: topicMatch?.[1]?.trim() || '',
      archiveFilename: `Plans/${rawId.toLowerCase()}-roadmap.md`,
      projectId: projectIdMatch?.[1] || undefined,
    })
  }

  if (plans.length === 0) {
    warnings.push(
      buildWarning('no_plans_parsed', 'No roadmap entries were parsed from Plan.md.', file, 'info')
    )
  }

  return {
    plans,
    activePlans: plans.filter((p) => p.status === 'active'),
    thisWeekSection: extractSection(content, /##\s*(?:This Week|THIS WEEK)/),
    warnings,
  }
}

export function parseDailyPlanMarkdown(
  content: string,
  date: string,
  filename = 'Today.md'
): DailyPlanParseResult {
  if (!content.trim()) {
    return {
      plan: null,
      warnings: [buildWarning('daily_plan_empty', `${filename} is empty.`, filename, 'info')],
    }
  }

  const warnings: ParserWarning[] = []
  const tasks: ScheduledTask[] = []
  const taskPattern =
    /^-\s*\[([xX \->])\]\s*(\d{1,2}:\d{2})\s*\((\d+)\s*(?:m|min|mins|minute|minutes)\)\s*(.+?)\s*(?:\[(\w+)\])?\s*$/gim
  let match: RegExpExecArray | null
  let idx = 0

  while ((match = taskPattern.exec(content)) !== null) {
    const marker = match[1].toLowerCase()
    const status: ScheduledTask['status'] =
      marker === 'x'
        ? 'completed'
        : marker === '-'
          ? 'skipped'
          : marker === '>'
            ? 'in_progress'
            : 'pending'

    const line = match[0]
    const noteMatch = line.match(/\{note:([a-f0-9-]+)\}/i)
    const artifacts = parseTaskArtifacts(line)

    tasks.push({
      id: `task-${idx++}`,
      title: match[4]
        .trim()
        .replace(/\{note:[a-f0-9-]+\}/i, '')
        .replace(/\{artifact:[^}]+\}/gi, '')
        .trim(),
      type: 'learn',
      status,
      scheduledTime: match[2],
      durationMinutes: parseInt(match[3], 10),
      planId: match[5] || undefined,
      noteId: noteMatch?.[1] || undefined,
      artifacts,
      aiGenerated: true,
    })
  }

  if (tasks.length === 0) {
    warnings.push(
      buildWarning(
        'no_tasks_parsed',
        `No schedule tasks could be parsed from ${filename}. Ensure task lines use "- [ ] HH:MM (XXmin) ..." format.`,
        filename
      )
    )
  }

  const totalMinutes = tasks.reduce((sum, t) => sum + t.durationMinutes, 0)
  const completedMinutes = tasks
    .filter((t) => t.status === 'completed')
    .reduce((sum, t) => sum + t.durationMinutes, 0)

  const plan: DailyPlan = {
    id: `plan-${date}`,
    date,
    tasks,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isApproved: true,
    userModified: false,
    totalMinutes,
    completedMinutes,
  }

  return { plan, warnings }
}
