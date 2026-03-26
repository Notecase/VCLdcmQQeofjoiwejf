/**
 * Secretary Memory Service
 *
 * Supabase CRUD wrapper for the `secretary_memory` table.
 * Provides file-based memory storage (Plan.md, AI.md, Today.md, Tomorrow.md, Plans/*.md).
 */

import { SupabaseClient } from '@supabase/supabase-js'
import {
  parsePlanMarkdown,
  renderPlanEntryMarkdown,
  getTodayDate,
  addDays,
  getCurrentWeekMonday,
} from '@inkdown/shared/secretary'
import type {
  ActivationSuggestion,
  LearningRoadmap,
  MemoryFile,
  ParserWarning,
  RoadmapCandidate,
  StudyPreferences,
  DayTransitionResult,
} from '@inkdown/shared/types'
import { AppError, ErrorCode } from '@inkdown/shared'
import { lintSecretaryMemoryFiles } from './memory-lint'
import { parseRoadmapCandidatesFromFiles, type ParsedRoadmapCandidate } from './roadmap-candidates'

// ============================================================================
// Types
// ============================================================================

interface MemoryRow {
  id: string
  user_id: string
  filename: string
  content: string
  created_at: string
  updated_at: string
}

export interface HistoryAnalytics {
  recentDays: number
  avgCompletionRate: number
  struggledTopics: string[]
  strongTopics: string[]
  currentStreak: number
  moodTrend: string[]
}

export interface MemoryContext {
  preferences: StudyPreferences | null
  activePlans: LearningRoadmap[]
  thisWeekSection: string
  todayContent: string
  tomorrowContent: string
  parserWarnings: ParserWarning[]
  activationSuggestion: ActivationSuggestion
  recurringBlocks: string
  carryoverTasks: string
  inboxContent: string
  calendarContent: string
}

const CORE_ROOT_MEMORY_FILES = new Set([
  'AI.md',
  'Plan.md',
  'Today.md',
  'Tomorrow.md',
  'Recurring.md',
  'Carryover.md',
])

const LEGACY_HISTORY_FILENAME_RE = /^\d{4}-\d{2}-\d{2}\.md$/i

export interface LegacyPathMigrationOperation {
  source: string
  destination?: string
  action: 'move' | 'delete'
  reason: 'canonical_missing' | 'canonical_same_content' | 'canonical_content_conflict'
}

/**
 * Returns a canonical folder path for known legacy root-level markdown files.
 * - YYYY-MM-DD.md      -> History/YYYY-MM-DD.md
 * - *roadmap*.md       -> Plans/<filename>.md
 * Core root files stay at root.
 */
export function getCanonicalPathForLegacyFile(filename: string): string | null {
  if (!filename || filename.includes('/')) return null
  if (CORE_ROOT_MEMORY_FILES.has(filename)) return null
  if (!filename.toLowerCase().endsWith('.md')) return null

  if (LEGACY_HISTORY_FILENAME_RE.test(filename)) {
    return `History/${filename}`
  }

  if (filename.toLowerCase().includes('roadmap')) {
    return `Plans/${filename}`
  }

  return null
}

function withLegacySuffix(filename: string, suffix: number): string {
  const slashIdx = filename.lastIndexOf('/')
  const dir = slashIdx >= 0 ? `${filename.slice(0, slashIdx)}/` : ''
  const base = slashIdx >= 0 ? filename.slice(slashIdx + 1) : filename
  const stem = base.toLowerCase().endsWith('.md') ? base.slice(0, -3) : base
  return `${dir}${stem}-legacy-${suffix}.md`
}

export function planLegacyPathMigrations(
  files: Array<Pick<MemoryFile, 'filename' | 'content'>>
): LegacyPathMigrationOperation[] {
  const byFilename = new Map(files.map((file) => [file.filename, file]))
  const reservedDestinations = new Set(files.map((file) => file.filename))
  const operations: LegacyPathMigrationOperation[] = []

  const sortedFiles = [...files].sort((a, b) => a.filename.localeCompare(b.filename))
  for (const file of sortedFiles) {
    const canonicalPath = getCanonicalPathForLegacyFile(file.filename)
    if (!canonicalPath) continue

    const canonicalFile = byFilename.get(canonicalPath)
    if (!canonicalFile && !reservedDestinations.has(canonicalPath)) {
      reservedDestinations.add(canonicalPath)
      operations.push({
        source: file.filename,
        destination: canonicalPath,
        action: 'move',
        reason: 'canonical_missing',
      })
      continue
    }

    if (canonicalFile && canonicalFile.content === file.content) {
      operations.push({
        source: file.filename,
        action: 'delete',
        reason: 'canonical_same_content',
      })
      continue
    }

    let suffix = 1
    let fallback = withLegacySuffix(canonicalPath, suffix)
    while (reservedDestinations.has(fallback) || byFilename.has(fallback)) {
      suffix += 1
      fallback = withLegacySuffix(canonicalPath, suffix)
    }
    reservedDestinations.add(fallback)
    operations.push({
      source: file.filename,
      destination: fallback,
      action: 'move',
      reason: 'canonical_content_conflict',
    })
  }

  return operations
}

// ============================================================================
// Memory Service
// ============================================================================

export class MemoryService {
  private legacyPathMigrationChecked = false

  constructor(
    private supabase: SupabaseClient,
    private userId: string,
    private timezone?: string
  ) {}

  /**
   * Read a memory file by filename
   */
  async readFile(filename: string): Promise<MemoryFile | null> {
    const { data, error } = await this.supabase
      .from('secretary_memory')
      .select('*')
      .eq('user_id', this.userId)
      .eq('filename', filename)
      .single()

    if (error || !data) return null

    const row = data as MemoryRow
    return {
      id: row.id,
      userId: row.user_id,
      filename: row.filename,
      content: row.content,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  /**
   * Write (upsert) a memory file
   */
  async writeFile(filename: string, content: string): Promise<MemoryFile> {
    const { data, error } = await this.supabase
      .from('secretary_memory')
      .upsert(
        {
          user_id: this.userId,
          filename,
          content,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,filename' }
      )
      .select()
      .single()

    if (error)
      throw new AppError(
        `Failed to write memory file: ${error.message}`,
        ErrorCode.DB_QUERY_FAILED,
        undefined,
        { filename }
      )

    const row = data as MemoryRow
    return {
      id: row.id,
      userId: row.user_id,
      filename: row.filename,
      content: row.content,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  /**
   * List memory files, optionally filtered by directory prefix
   */
  async listFiles(prefix?: string): Promise<MemoryFile[]> {
    await this.ensureLegacyPathMigration()
    return this.listFilesRaw(prefix)
  }

  private async listFilesRaw(prefix?: string): Promise<MemoryFile[]> {
    let query = this.supabase
      .from('secretary_memory')
      .select('*')
      .eq('user_id', this.userId)
      .order('filename')

    if (prefix) {
      query = query.like('filename', `${prefix}%`)
    }

    const { data, error } = await query

    if (error)
      throw new AppError(
        `Failed to list memory files: ${error.message}`,
        ErrorCode.DB_QUERY_FAILED,
        undefined,
        { prefix }
      )

    return ((data as MemoryRow[]) || []).map((row) => ({
      id: row.id,
      userId: row.user_id,
      filename: row.filename,
      content: row.content,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
  }

  private async ensureLegacyPathMigration(): Promise<void> {
    if (this.legacyPathMigrationChecked) return
    this.legacyPathMigrationChecked = true

    const files = await this.listFilesRaw()
    const operations = planLegacyPathMigrations(files)
    if (operations.length === 0) return

    const fileMap = new Map(files.map((file) => [file.filename, file]))

    for (const operation of operations) {
      const source = fileMap.get(operation.source)
      if (!source) continue

      if (operation.action === 'move' && operation.destination) {
        await this.writeFile(operation.destination, source.content)
      }
      await this.deleteFile(operation.source)
    }
  }

  /**
   * Delete a memory file
   */
  async deleteFile(filename: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('secretary_memory')
      .delete()
      .eq('user_id', this.userId)
      .eq('filename', filename)

    if (error)
      throw new AppError(
        `Failed to delete memory file: ${error.message}`,
        ErrorCode.DB_QUERY_FAILED,
        undefined,
        { filename }
      )
    return true
  }

  /**
   * Get full context for the secretary agent (reads all core files).
   * Performs day transition and weekly expansion checks on every invocation.
   */
  async getFullContext(): Promise<MemoryContext> {
    // Lifecycle checks — run before reading state
    await this.performDayTransition()
    await this.checkAndExpandWeek()
    await this.autoArchiveExpiredPlans()

    const files = await this.listFiles()
    const fileMap = new Map(files.map((f) => [f.filename, f.content]))

    let planContent = fileMap.get('Plan.md') || ''
    const aiContent = fileMap.get('AI.md') || ''
    const todayContent = fileMap.get('Today.md') || ''
    const tomorrowContent = fileMap.get('Tomorrow.md') || ''
    let planParse = parsePlanMarkdown(planContent)

    const parsedRoadmapCandidates = parseRoadmapCandidatesFromFiles(files)
    const roadmapCandidates: RoadmapCandidate[] = parsedRoadmapCandidates.map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      filename: candidate.filename,
    }))
    let activationSuggestion: ActivationSuggestion = {
      action: 'none',
      reason: 'Active plans are present in Plan.md.',
      candidates: roadmapCandidates,
    }

    // Auto-activation fallback: if exactly one roadmap exists and Plan.md has no active entries.
    if (planParse.activePlans.length === 0 && parsedRoadmapCandidates.length === 1) {
      const candidate = parsedRoadmapCandidates[0]
      const autoEntry = this.buildAutoActivationEntry(candidate)

      planContent = this.insertPlanEntry(planContent, autoEntry)
      await this.writeFile('Plan.md', planContent)
      planParse = parsePlanMarkdown(planContent)

      activationSuggestion = {
        action: 'auto_activated',
        reason: `Auto-activated single roadmap candidate [${candidate.id}] ${candidate.name}.`,
        candidates: roadmapCandidates,
        selectedId: candidate.id,
      }
    } else if (planParse.activePlans.length === 0 && roadmapCandidates.length > 1) {
      activationSuggestion = {
        action: 'needs_selection',
        reason: 'Multiple roadmap archives found but Plan.md has no active plan entries.',
        candidates: roadmapCandidates,
      }
    }

    return {
      preferences: this.parsePreferences(aiContent),
      activePlans: planParse.activePlans,
      thisWeekSection: planParse.thisWeekSection,
      todayContent,
      tomorrowContent,
      parserWarnings: planParse.warnings,
      activationSuggestion,
      recurringBlocks: fileMap.get('Recurring.md') || '',
      carryoverTasks: fileMap.get('Carryover.md') || '',
      inboxContent: fileMap.get('Inbox.md') || '',
      calendarContent: fileMap.get('Calendar.md') || '',
    }
  }

  /**
   * Analyze recent History/*.md files for patterns and trends.
   * Reads the last 7 history files and extracts completion rates,
   * struggled/strong topics, mood trend, and current streak.
   */
  async getHistoryAnalytics(): Promise<HistoryAnalytics> {
    const historyFiles = await this.listFiles('History/')
    // Sort by filename descending (filenames are YYYY-MM-DD.md) and take last 7
    const recent = historyFiles.sort((a, b) => b.filename.localeCompare(a.filename)).slice(0, 7)

    if (recent.length === 0) {
      return {
        recentDays: 0,
        avgCompletionRate: 0,
        struggledTopics: [],
        strongTopics: [],
        currentStreak: 0,
        moodTrend: [],
      }
    }

    const taskPattern = /^-\s*\[([x \->])\]/gm
    let totalCompletionRate = 0
    const struggledTopics: string[] = []
    const strongTopics: string[] = []
    const moodTrend: string[] = []
    let currentStreak = 0
    let streakBroken = false

    for (const file of recent) {
      const content = file.content

      // Count tasks using same regex as frontend secretaryAnalytics.ts
      let total = 0
      let completed = 0
      for (const m of content.matchAll(taskPattern)) {
        total++
        if (m[1] === 'x') completed++
      }

      const rate = total > 0 ? Math.round((completed / total) * 100) : 0
      totalCompletionRate += rate

      // Track streak (consecutive days with >50% completion)
      if (!streakBroken && rate > 50) {
        currentStreak++
      } else {
        streakBroken = true
      }

      // Extract "Struggled with:" from End of Day sections
      const struggledMatch = content.match(/Struggled with:\s*(.+)/i)
      if (struggledMatch && struggledMatch[1].trim()) {
        struggledTopics.push(struggledMatch[1].trim())
      }

      // Extract "What went well:" as strong topics
      const strongMatch = content.match(/What went well:\s*(.+)/i)
      if (strongMatch && strongMatch[1].trim()) {
        strongTopics.push(strongMatch[1].trim())
      }

      // Extract mood
      const moodMatch = content.match(/Mood:\s*(.+)/i)
      if (moodMatch && moodMatch[1].trim()) {
        moodTrend.push(moodMatch[1].trim())
      }
    }

    return {
      recentDays: recent.length,
      avgCompletionRate: Math.round(totalCompletionRate / recent.length),
      struggledTopics,
      strongTopics,
      currentStreak,
      moodTrend,
    }
  }

  /**
   * Initialize default memory files for a new user
   */
  async initializeDefaults(): Promise<MemoryFile[]> {
    const defaults: Array<{ filename: string; content: string }> = [
      {
        filename: 'AI.md',
        content: `# AI Preferences

## Study Schedule
- **Best focus time:** 09:00 - 12:00
- **Break frequency:** Every 45 minutes
- **Break duration:** 15 minutes
- **Weekday study hours:** 4
- **Weekend study hours:** 6
- **Timezone:** America/New_York

## Learning Style
- Prefer hands-on practice over theory
- Like visual diagrams and examples

## Availability
- **Weekdays:** 09:00 - 22:00
- **Weekends:** 10:00 - 20:00
`,
      },
      {
        filename: 'Plan.md',
        content: `# Learning Plans

## Active Plans

<!-- New plans will be added here -->

---

## This Week

*Schedule will be generated when plans are active.*

---

## Archived

*No archived plans yet.*
`,
      },
      {
        filename: 'Today.md',
        content: `# Today's Plan

*No tasks scheduled yet. Use "Prepare Tomorrow" to generate a plan.*
`,
      },
      {
        filename: 'Tomorrow.md',
        content: '',
      },
    ]

    const results: MemoryFile[] = []
    for (const { filename, content } of defaults) {
      const existing = await this.readFile(filename)
      if (!existing) {
        results.push(await this.writeFile(filename, content))
      } else {
        results.push(existing)
      }
    }

    return results
  }

  /**
   * Produce lightweight diagnostics for secretary debug workflows.
   */
  async getContextDiagnostics(): Promise<{
    activePlansParsed: number
    roadmapFilesFound: number
    autoActivated: boolean
    warnings: ParserWarning[]
    activationSuggestion: ActivationSuggestion
    todayPlanParsed: boolean
  }> {
    const context = await this.getFullContext()
    const files = await this.listFiles()
    const candidates = parseRoadmapCandidatesFromFiles(files)
    const lint = lintSecretaryMemoryFiles(files)

    return {
      activePlansParsed: lint.activePlansParsed,
      roadmapFilesFound: candidates.length,
      autoActivated: context.activationSuggestion.action === 'auto_activated',
      warnings: lint.warnings,
      activationSuggestion: context.activationSuggestion,
      todayPlanParsed: lint.todayPlanParsed,
    }
  }

  private buildAutoActivationEntry(candidate: ParsedRoadmapCandidate): string {
    const start = getTodayDate(this.timezone)
    const roadmapContent = candidate.content || ''
    const durationMatch = roadmapContent.match(/\*\*Duration:\*\*\s*(\d+)\s*days?/i)
    const durationDays = durationMatch ? parseInt(durationMatch[1], 10) : 14
    const end = addDays(start, Math.max(durationDays - 1, 0))

    const scheduleMatch = roadmapContent.match(/\*\*Schedule:\*\*\s*(.+)/i)
    const hoursMatch = roadmapContent.match(/\*\*Hours\/day:\*\*\s*(\d+(?:\.\d+)?)/i)
    const hours = hoursMatch ? parseFloat(hoursMatch[1]) : 2
    const schedule =
      scheduleMatch?.[1]?.trim() || `Daily ${Number.isFinite(hours) ? hours : 2}h/day`

    return renderPlanEntryMarkdown({
      planId: candidate.id,
      planName: candidate.name,
      status: 'active',
      progressCurrent: 0,
      progressTotal: durationDays,
      startDate: start,
      endDate: end,
      schedule,
      currentTopic: 'Week 1 - Getting started',
    })
  }

  private insertPlanEntry(planContent: string, planEntry: string): string {
    if (!planContent.trim()) {
      return [
        '# Learning Plans',
        '',
        '## Active Plans',
        '',
        planEntry,
        '',
        '---',
        '',
        '## This Week',
        '',
        '*Schedule will be generated when plans are active.*',
      ].join('\n')
    }

    const activeSectionPattern = /##\s*Active Plans[^\n]*\n/i
    const activeMatch = planContent.match(activeSectionPattern)
    if (!activeMatch || activeMatch.index === undefined) {
      return `${planContent.trimEnd()}\n\n## Active Plans\n\n${planEntry}\n`
    }

    const sectionStart = activeMatch.index + activeMatch[0].length
    const afterActive = planContent.slice(sectionStart)
    const nextSectionOffset = afterActive.search(/\n##\s/)
    const sectionEnd =
      nextSectionOffset >= 0 ? sectionStart + nextSectionOffset : planContent.length

    const currentActiveBody = planContent.slice(sectionStart, sectionEnd).trim()
    const updatedActiveBody = currentActiveBody ? `${currentActiveBody}\n\n${planEntry}` : planEntry

    return `${planContent.slice(0, sectionStart)}\n${updatedActiveBody}\n${planContent.slice(sectionEnd)}`
  }

  // ==========================================================================
  // Day Transition
  // ==========================================================================

  /**
   * Check if Today.md is stale and perform day transition:
   * 1. Archive stale Today.md to History/YYYY-MM-DD.md
   * 2. Promote Tomorrow.md to Today.md if its date is today or earlier (handles multi-day gaps)
   * 3. If Tomorrow.md is for a future date, keep it and reset Today.md
   */
  async performDayTransition(): Promise<DayTransitionResult> {
    const todayDate = getTodayDate(this.timezone)
    const todayFile = await this.readFile('Today.md')

    // Extract date from Today.md (may be null if empty or dateless)
    const todayContent = todayFile?.content?.trim() ?? ''
    const dateMatch = todayContent ? todayContent.match(/(\d{4}-\d{2}-\d{2})/) : null
    const todayFileDate = dateMatch?.[1] ?? null

    // Only valid early return: Today.md already has today's date
    if (todayFileDate === todayDate) {
      return { transitioned: false }
    }

    // Archive Today.md if it has content WITH a stale date
    if (todayContent && todayFileDate) {
      const archiveFilename = `History/${todayFileDate}.md`
      await this.writeFile(archiveFilename, todayFile!.content)
      await this.updatePlanProgress(todayFile!.content)
      await this.saveCarryoverTasks(todayFile!.content, todayFileDate)
    }

    // ALWAYS check Tomorrow.md for promotion (the core fix — no longer gated behind Today.md)
    const tomorrowFile = await this.readFile('Tomorrow.md')
    let promotedTomorrow = false

    if (tomorrowFile && tomorrowFile.content.trim()) {
      const tomorrowDateMatch = tomorrowFile.content.match(/(\d{4}-\d{2}-\d{2})/)
      if (tomorrowDateMatch && tomorrowDateMatch[1] <= todayDate) {
        // Tomorrow.md date is today or past (e.g. user didn't open app for days) — promote it
        await this.writeFile('Today.md', tomorrowFile.content)
        await this.writeFile('Tomorrow.md', '')
        promotedTomorrow = true
      } else if (tomorrowDateMatch && tomorrowDateMatch[1] > todayDate) {
        // Tomorrow.md is for a future date — keep it, just reset Today.md with date
        await this.writeFile(
          'Today.md',
          `# Today's Plan — ${todayDate}\n\n*No tasks scheduled yet.*\n`
        )
      } else {
        // No date found in Tomorrow.md — clear both, write dated template
        await this.writeFile(
          'Today.md',
          `# Today's Plan — ${todayDate}\n\n*No tasks scheduled yet.*\n`
        )
        await this.writeFile('Tomorrow.md', '')
      }
    } else {
      // No tomorrow plan — write dated empty template
      await this.writeFile(
        'Today.md',
        `# Today's Plan — ${todayDate}\n\n*No tasks scheduled yet.*\n`
      )
    }

    return {
      transitioned: true,
      archivedDate: todayFileDate ?? undefined,
      promotedTomorrow,
    }
  }

  /**
   * Update Plan.md progress counters based on completed tasks in archived content
   */
  private async updatePlanProgress(archivedContent: string): Promise<void> {
    const completedPerPlan = new Map<string, number>()
    const taskPattern = /^-\s*\[x\].*\[(\w+)\]\s*$/gm
    let match
    while ((match = taskPattern.exec(archivedContent)) !== null) {
      const planId = match[1]
      completedPerPlan.set(planId, (completedPerPlan.get(planId) || 0) + 1)
    }

    if (completedPerPlan.size === 0) return

    const planFile = await this.readFile('Plan.md')
    if (!planFile) return

    let content = planFile.content
    for (const [planId, count] of completedPerPlan) {
      const progressPattern = new RegExp(
        `(###\\s*\\[${planId}\\][\\s\\S]*?-\\s*Progress:\\s*)(\\d+)(\\/\\d+)`,
        'i'
      )
      content = content.replace(
        progressPattern,
        (_: string, prefix: string, current: string, total: string) => {
          return `${prefix}${parseInt(current, 10) + count}${total}`
        }
      )
    }

    await this.writeFile('Plan.md', content)
  }

  /**
   * Extract incomplete tasks from archived content and write to Carryover.md.
   * These are picked up by generate_daily_plan to include in the next schedule.
   */
  private async saveCarryoverTasks(archivedContent: string, fromDate: string): Promise<void> {
    const taskPattern =
      /^- \[[ >]\] \d{1,2}:\d{2}\s*\((\d+)\s*(?:m|min|mins|minute|minutes)\)\s*(.+)$/gm
    const incomplete: Array<{ duration: string; desc: string }> = []
    let match
    while ((match = taskPattern.exec(archivedContent)) !== null) {
      incomplete.push({ duration: match[1], desc: match[2] })
    }

    if (incomplete.length === 0) {
      const existing = await this.readFile('Carryover.md')
      if (existing) await this.deleteFile('Carryover.md')
      return
    }

    const lines = incomplete.map((t) => `- (${t.duration}min) ${t.desc}`)
    const content = `# Carried Over Tasks (from ${fromDate})\n\n${lines.join('\n')}\n`
    await this.writeFile('Carryover.md', content)
  }

  // ==========================================================================
  // Weekly Auto-Expansion
  // ==========================================================================

  /**
   * Check if a new week has started and update Plan.md:
   * - Increment currentWeek for active plans
   * - Mark completed plans
   * - Regenerate "This Week" section
   */
  async checkAndExpandWeek(): Promise<boolean> {
    const planFile = await this.readFile('Plan.md')
    if (!planFile || !planFile.content.trim()) return false

    // Calculate current week's Monday
    const currentWeekStart = getCurrentWeekMonday(this.timezone)

    // Check if "This Week" header already contains this week's date
    const weekHeaderMatch = planFile.content.match(/##\s*(?:This Week|THIS WEEK)\s*\(([^)]+)\)/i)
    if (weekHeaderMatch) {
      const headerDates = weekHeaderMatch[1]
      // If header contains current Monday's date, we're already up to date
      if (headerDates.includes(currentWeekStart)) {
        return false
      }
    }

    // Parse active plans and check if any need week advancement
    const activePlans = parsePlanMarkdown(planFile.content).activePlans
    if (activePlans.length === 0) return false

    // Calculate Sunday of current week
    const currentWeekEnd = addDays(currentWeekStart, 6)

    // Build new "This Week" section based on active plans and their schedules
    const weekDayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    const thisWeekLines: string[] = [`## This Week (${currentWeekStart} - ${currentWeekEnd})\n`]

    for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
      const dayStr = addDays(currentWeekStart, dayIdx)
      const dayName = weekDayNames[dayIdx]
      const entries: string[] = []

      for (const plan of activePlans) {
        if (plan.status !== 'active') continue

        // Check if this day is within the plan's date range
        const planStart = plan.dateRange.start
        const planEnd = plan.dateRange.end

        if (planStart && dayStr < planStart) continue
        if (planEnd && dayStr > planEnd) continue

        // Check if this day matches the plan's schedule
        const schedDays = plan.schedule.studyDays
        const isStudyDay =
          schedDays.includes('Daily') ||
          schedDays.some((d: string) =>
            d.toLowerCase().startsWith(dayName.toLowerCase().slice(0, 2))
          )

        if (isStudyDay) {
          entries.push(`${plan.id} - ${plan.currentTopic || plan.name}`)
        }
      }

      if (entries.length > 0) {
        thisWeekLines.push(`**${dayName}:** ${entries.join(' | ')}`)
      }
    }

    // Replace the This Week section in Plan.md
    let updatedContent = planFile.content
    const weekSectionPattern = /##\s*(?:This Week|THIS WEEK)[^\n]*\n[\s\S]*?(?=\n##\s|\n#\s|$)/i
    const weekMatch = updatedContent.match(weekSectionPattern)

    if (weekMatch) {
      updatedContent = updatedContent.replace(weekSectionPattern, thisWeekLines.join('\n'))
    } else {
      // Append This Week section
      updatedContent = updatedContent.trimEnd() + '\n\n' + thisWeekLines.join('\n') + '\n'
    }

    await this.writeFile('Plan.md', updatedContent)
    return true
  }

  // ==========================================================================
  // Auto-Archive Expired Plans
  // ==========================================================================

  /**
   * Move active plans past their end date to the Archived section.
   * - endDate < today → archive (user gets full last day)
   * - progress >= total → status "completed"
   * - progress < total → status "expired" (time ran out)
   * - No end date → never auto-archive
   *
   * Returns IDs of newly archived plans (empty if none).
   */
  async autoArchiveExpiredPlans(): Promise<string[]> {
    const planFile = await this.readFile('Plan.md')
    if (!planFile || !planFile.content.trim()) return []

    const todayDate = getTodayDate(this.timezone)
    const parsed = parsePlanMarkdown(planFile.content)
    const toArchive = parsed.activePlans.filter(
      (p) => p.dateRange.end && p.dateRange.end < todayDate
    )

    if (toArchive.length === 0) return []

    let content = planFile.content

    const escId = (id: string) => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

    for (const plan of toArchive) {
      const newStatus =
        plan.progress.currentDay >= plan.progress.totalDays ? 'completed' : 'expired'

      // Match the full heading line for this plan in the Active Plans section
      // e.g.: ### [QUA] Quantum Computing Roadmap (active)
      const headingPattern = new RegExp(
        `^(###\\s*\\[${escId(plan.id)}\\]\\s*.+?)\\(active\\)`,
        'im'
      )
      content = content.replace(headingPattern, `$1(${newStatus})`)
    }

    // Move archived entries from Active Plans to Archived section
    // Strategy: re-parse to find the updated entries, extract their full blocks,
    // remove from Active, append to Archived
    const activeSectionPattern = /##\s*Active Plans[^\n]*\n([\s\S]*?)(?=\n---|\n##\s|$)/i
    const activeMatch = content.match(activeSectionPattern)

    if (activeMatch) {
      const activeBody = activeMatch[1]
      let cleanedActive = activeBody
      const archivedBlocks: string[] = []

      for (const plan of toArchive) {
        // Extract the full plan block (heading + bullet lines until next ### or end)
        const blockPattern = new RegExp(
          `(###\\s*\\[${escId(plan.id)}\\][\\s\\S]*?)(?=###\\s*\\[|$)`,
          'i'
        )
        const blockMatch = cleanedActive.match(blockPattern)
        if (blockMatch) {
          archivedBlocks.push(blockMatch[1].trim())
          cleanedActive = cleanedActive.replace(blockPattern, '')
        }
      }

      // Replace active section body with cleaned version
      content = content.replace(
        activeSectionPattern,
        `## Active Plans\n${cleanedActive.trim() ? '\n' + cleanedActive.trim() + '\n' : '\n'}`
      )

      // Append to Archived section (create if missing)
      const archivedText = archivedBlocks.join('\n\n')
      const archivedSectionPattern = /##\s*Archived[^\n]*\n/i
      const archivedMatch = content.match(archivedSectionPattern)

      if (archivedMatch && archivedMatch.index !== undefined) {
        const insertPos = archivedMatch.index + archivedMatch[0].length
        content =
          content.slice(0, insertPos) + '\n' + archivedText + '\n' + content.slice(insertPos)
      } else {
        content = content.trimEnd() + '\n\n## Archived\n\n' + archivedText + '\n'
      }
    }

    await this.writeFile('Plan.md', content)
    return toArchive.map((p) => p.id)
  }

  // ==========================================================================
  // Parsers
  // ==========================================================================

  /**
   * Parse study preferences from AI.md content
   */
  private parsePreferences(aiContent: string): StudyPreferences | null {
    if (!aiContent.trim()) return null

    const getMatch = (pattern: RegExp): string | null => {
      const m = aiContent.match(pattern)
      return m ? m[1].trim() : null
    }

    const parseTime = (s: string | null, fallback: string): string => {
      if (!s) return fallback
      const m = s.match(/(\d{1,2}:\d{2})/)
      return m ? m[1] : fallback
    }

    const parseNum = (s: string | null, fallback: number): number => {
      if (!s) return fallback
      const n = parseInt(s, 10)
      return isNaN(n) ? fallback : n
    }

    const focusMatch = getMatch(/best focus time[:\s]*(.+)/i)
    const focusParts = focusMatch?.split(/[-\u2013]/) || []

    const timezoneMatch = getMatch(/timezone[:\s]*(.+)/i)

    return {
      focusTime: {
        bestStart: parseTime(focusParts[0] || null, '09:00'),
        bestEnd: parseTime(focusParts[1] || null, '12:00'),
      },
      breakFrequency: parseNum(getMatch(/break frequency[:\s]*(?:every\s+)?(\d+)/i), 45),
      breakDuration: parseNum(getMatch(/break duration[:\s]*(\d+)/i), 15),
      weekdayHours: parseNum(getMatch(/weekday.*?hours[:\s]*(\d+)/i), 4),
      weekendHours: parseNum(getMatch(/weekend.*?hours[:\s]*(\d+)/i), 6),
      availability: {
        weekday: {
          start: parseTime(getMatch(/weekdays[:\s]*(.+)/i), '09:00'),
          end: parseTime(getMatch(/weekdays[:\s]*\d{1,2}:\d{2}\s*[-\u2013]\s*(.+)/i), '22:00'),
        },
        weekend: {
          start: parseTime(getMatch(/weekends[:\s]*(.+)/i), '10:00'),
          end: parseTime(getMatch(/weekends[:\s]*\d{1,2}:\d{2}\s*[-\u2013]\s*(.+)/i), '20:00'),
        },
      },
      timezone: timezoneMatch || undefined,
    }
  }
}
