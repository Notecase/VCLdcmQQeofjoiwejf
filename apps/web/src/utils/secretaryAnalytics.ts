import type { MemoryFile } from '@inkdown/shared/types'
import { parseDateString } from '@inkdown/shared/secretary'

export interface DailyStats {
  date: string
  totalTasks: number
  completedTasks: number
  completionRate: number
}

export function computeDailyCompletionRates(entries: MemoryFile[]): DailyStats[] {
  return entries
    .map((entry) => {
      const { total, completed } = parseTaskCounts(entry.content)
      const dateMatch = entry.filename.match(/(\d{4}-\d{2}-\d{2})/)
      return {
        date: dateMatch?.[1] || entry.filename,
        totalTasks: total,
        completedTasks: completed,
        completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
      }
    })
    .sort((a, b) => a.date.localeCompare(b.date))
}

export function computeStreak(entries: MemoryFile[]): { current: number; longest: number } {
  const dates = entries
    .map((e) => {
      const m = e.filename.match(/(\d{4}-\d{2}-\d{2})/)
      if (!m) return null
      const { completed } = parseTaskCounts(e.content)
      return completed > 0 ? m[1] : null
    })
    .filter((d): d is string => d !== null)
    .sort()

  if (dates.length === 0) return { current: 0, longest: 0 }

  let longest = 1
  let current = 1

  for (let i = 1; i < dates.length; i++) {
    const prev = parseDateString(dates[i - 1])
    const curr = parseDateString(dates[i])
    const diffDays = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24))

    if (diffDays === 1) {
      current++
      if (current > longest) longest = current
    } else if (diffDays > 1) {
      current = 1
    }
  }

  // Check if the most recent date is today or yesterday for "current" streak
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const lastDate = parseDateString(dates[dates.length - 1])
  lastDate.setHours(0, 0, 0, 0)
  const daysSinceLast = Math.round((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24))

  if (daysSinceLast > 1) {
    current = 0
  }

  return { current, longest }
}

export function computeWeeklySummary(entries: MemoryFile[]): {
  totalTasks: number
  completedTasks: number
  studyDays: number
  averageCompletion: number
} {
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  sevenDaysAgo.setHours(0, 0, 0, 0)

  const recentEntries = entries.filter((e) => {
    const m = e.filename.match(/(\d{4}-\d{2}-\d{2})/)
    if (!m) return false
    return parseDateString(m[1]) >= sevenDaysAgo
  })

  let totalTasks = 0
  let completedTasks = 0
  let studyDays = 0
  let totalRate = 0

  for (const entry of recentEntries) {
    const { total, completed } = parseTaskCounts(entry.content)
    totalTasks += total
    completedTasks += completed
    if (total > 0) {
      studyDays++
      totalRate += total > 0 ? Math.round((completed / total) * 100) : 0
    }
  }

  return {
    totalTasks,
    completedTasks,
    studyDays,
    averageCompletion: studyDays > 0 ? Math.round(totalRate / studyDays) : 0,
  }
}

function parseTaskCounts(content: string): { total: number; completed: number } {
  const taskPattern = /^-\s*\[([x \->])\]/gm
  let total = 0
  let completed = 0

  for (const m of content.matchAll(taskPattern)) {
    total++
    if (m[1] === 'x') completed++
  }

  return { total, completed }
}
