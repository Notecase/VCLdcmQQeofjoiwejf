/**
 * Memory File Formatting
 */

import type { MemoryRow } from '../db/memory.js'
import { relativeTime, truncate } from './index.js'
import { markdownTable } from './tables.js'

/**
 * Format a single memory file for display.
 */
export function formatMemoryFile(file: MemoryRow): string {
  return `## ${file.filename}\n**Updated:** ${relativeTime(file.updated_at)}\n\n${file.content}`
}

/**
 * Format a list of memory files as a table.
 */
export function formatMemoryList(files: MemoryRow[]): string {
  if (files.length === 0) return 'No memory files found.'

  const header = `## Memory Files (${files.length})\n\n`
  const rows = files.map((f) => [
    f.filename,
    truncate(f.content.replace(/\n/g, ' '), 60),
    relativeTime(f.updated_at),
  ])

  return header + markdownTable(['Filename', 'Preview', 'Updated'], rows)
}

/**
 * Format history analytics.
 */
export function formatAnalytics(analytics: {
  recentDays: number
  avgCompletionRate: number
  struggledTopics: string[]
  strongTopics: string[]
  currentStreak: number
  moodTrend: string[]
}): string {
  const parts: string[] = []
  parts.push('## Study Analytics (Last 7 Days)')
  parts.push('')
  parts.push(`- **Days tracked:** ${analytics.recentDays}`)
  parts.push(`- **Avg completion:** ${analytics.avgCompletionRate}%`)
  parts.push(`- **Current streak:** ${analytics.currentStreak} days`)
  parts.push('')

  if (analytics.moodTrend.length > 0) {
    parts.push(`**Mood trend:** ${analytics.moodTrend.join(' → ')}`)
  }
  if (analytics.strongTopics.length > 0) {
    parts.push(`**Strong areas:** ${analytics.strongTopics.join(', ')}`)
  }
  if (analytics.struggledTopics.length > 0) {
    parts.push(`**Needs work:** ${analytics.struggledTopics.join(', ')}`)
  }

  return parts.join('\n')
}
