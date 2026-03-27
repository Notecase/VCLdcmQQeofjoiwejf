/**
 * Secretary Agent Tools
 *
 * AI SDK v6 tools for the secretary agent.
 * All backed by the secretary_memory Supabase table.
 */

import { tool, generateText } from 'ai'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { LearningRoadmap, RoadmapCandidate } from '@inkdown/shared/types'
import {
  parsePlanMarkdown,
  renderPlanEntryMarkdown,
  getTodayDate,
  addDays,
  getDayNameForDate,
  formatDateHeading,
} from '@inkdown/shared/secretary'
import { MemoryService } from './memory'
import { PLANNER_SUBAGENT_PROMPT } from './prompts'
import { parseRoadmapCandidatesFromFiles, type ParsedRoadmapCandidate } from './roadmap-candidates'
import { resolveModel } from '../../providers/ai-sdk-factory'
import { trackAISDKUsage } from '../../providers/ai-sdk-usage'
import { getGoogleProviderOptions } from '../../providers/safety'
import { buildSystemPrompt } from '../../safety/content-policy'
import { generateDelegationTools } from '../../registry'
import '../../registry/capabilities' // Ensure capabilities are registered
import type { CapabilityContext } from '../../registry/types'

// ============================================================================
// Pending Roadmap Cache (module-level, keyed by userId)
// ============================================================================

export interface RoadmapPreview {
  id: string
  name: string
  content: string
  durationDays: number
  hoursPerDay: number
}

const pendingRoadmaps = new Map<string, RoadmapPreview>()

export function getPendingRoadmap(userId: string): RoadmapPreview | undefined {
  return pendingRoadmaps.get(userId)
}

export function clearPendingRoadmap(userId: string): void {
  pendingRoadmaps.delete(userId)
}

function insertPlanEntry(planContent: string, planEntry: string): string {
  const source = planContent.trim()
    ? planContent
    : '# Learning Plans\n\n## Active Plans\n\n---\n\n## This Week\n\n*Schedule will be generated when plans are active.*\n'

  const activeSectionPattern = /##\s*Active Plans[^\n]*\n/i
  const activeMatch = source.match(activeSectionPattern)
  if (!activeMatch || activeMatch.index === undefined) {
    return `${source.trimEnd()}\n\n## Active Plans\n\n${planEntry}\n`
  }

  const sectionStart = activeMatch.index + activeMatch[0].length
  const afterActive = source.slice(sectionStart)
  const nextSectionOffset = afterActive.search(/\n##\s/)
  const sectionEnd = nextSectionOffset >= 0 ? sectionStart + nextSectionOffset : source.length

  const currentBody = source.slice(sectionStart, sectionEnd).trim()
  const updatedBody = currentBody ? `${currentBody}\n\n${planEntry}` : planEntry
  return `${source.slice(0, sectionStart)}\n${updatedBody}\n${source.slice(sectionEnd)}`
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Convert "HH:MM" to minutes since midnight */
function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/** Convert minutes since midnight to "HH:MM" */
function minutesToTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(1439, minutes))
  const h = Math.floor(clamped / 60)
  const m = clamped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Regex that matches a task line and captures: prefix, time, parenOpen, duration, parenClose, description */
const TASK_LINE_RE =
  /^(- \[[xX \->=]\] )(\d{1,2}:\d{2})(\s*\()(\d+)(\s*(?:m|min|mins|minute|minutes)\)\s*)(.+)$/

function extractRoadmapMeta(
  content: string,
  fallbackDays: number,
  fallbackHours: number
): {
  durationDays: number
  hoursPerDay: number
  schedule: string
} {
  const durationMatch = content.match(
    /\*\*Duration:\*\*\s*(\d+(?:\.\d+)?)\s*(day|days|week|weeks|month|months)?/i
  )
  const rawDuration = durationMatch ? parseFloat(durationMatch[1]) : NaN
  const durationUnit = durationMatch?.[2]?.toLowerCase() || 'days'

  let durationDays = fallbackDays
  if (Number.isFinite(rawDuration) && rawDuration > 0) {
    if (durationUnit.startsWith('week')) {
      durationDays = Math.max(1, Math.round(rawDuration * 7))
    } else if (durationUnit.startsWith('month')) {
      durationDays = Math.max(1, Math.round(rawDuration * 30))
    } else {
      durationDays = Math.max(1, Math.round(rawDuration))
    }
  }

  const hoursMatch = content.match(/\*\*Hours\/day:\*\*\s*(\d+(?:\.\d+)?)/i)
  const parsedHours = hoursMatch ? parseFloat(hoursMatch[1]) : NaN
  const hoursPerDay = Number.isFinite(parsedHours) && parsedHours > 0 ? parsedHours : fallbackHours

  const scheduleMatch = content.match(/\*\*Schedule:\*\*\s*(.+)/i)
  const schedule = scheduleMatch?.[1]?.trim() || `Daily ${hoursPerDay}h/day`

  return {
    durationDays,
    hoursPerDay,
    schedule,
  }
}

function buildPlanEntryFromRoadmap(
  candidate: ParsedRoadmapCandidate,
  startDate?: string,
  timezone?: string
): string {
  const start = startDate || getTodayDate(timezone)
  const meta = extractRoadmapMeta(candidate.content, 14, 2)
  const durationDays = meta.durationDays
  const schedule = meta.schedule
  const end = addDays(start, Math.max(durationDays - 1, 0))

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

// ============================================================================
// Tool Factory
// ============================================================================

export interface SecretaryToolsConfig {
  userId: string
  supabase?: SupabaseClient
  model?: string
  timezone?: string
  emitEvent?: (event: { type: string; data: unknown }) => void
}

export function createSecretaryTools(memoryService: MemoryService, config: SecretaryToolsConfig) {
  const readMemoryFile = tool({
    description:
      'Read a memory file by filename (e.g., "Plan.md", "AI.md", "Today.md", "Tomorrow.md", "Plans/optics.md")',
    inputSchema: z.object({
      filename: z.string().describe('The filename to read'),
    }),
    execute: async ({ filename }) => {
      const file = await memoryService.readFile(filename)
      if (!file) return `File "${filename}" not found.`
      return file.content
    },
  })

  const writeMemoryFile = tool({
    description: 'Write or update a memory file. Creates the file if it does not exist.',
    inputSchema: z.object({
      filename: z.string().describe('The filename to write'),
      content: z.string().describe('The content to write'),
    }),
    execute: async ({ filename, content }) => {
      await memoryService.writeFile(filename, content)
      return `File "${filename}" written successfully.`
    },
  })

  const listMemoryFiles = tool({
    description: 'List all memory files, optionally filtered by directory prefix (e.g., "Plans/")',
    inputSchema: z.object({
      prefix: z.string().optional().describe('Optional directory prefix filter'),
    }),
    execute: async ({ prefix }) => {
      const files = await memoryService.listFiles(prefix || undefined)
      if (files.length === 0) return 'No memory files found.'
      return files.map((f) => `- ${f.filename} (updated: ${f.updatedAt})`).join('\n')
    },
  })

  const deleteMemoryFile = tool({
    description: 'Delete a memory file by filename',
    inputSchema: z.object({
      filename: z.string().describe('The filename to delete'),
    }),
    execute: async ({ filename }) => {
      await memoryService.deleteFile(filename)
      return `File "${filename}" deleted.`
    },
  })

  const renameMemoryFile = tool({
    description: 'Rename/move a memory file. Reads old file, writes to new filename, deletes old.',
    inputSchema: z.object({
      oldFilename: z.string().describe('Current filename'),
      newFilename: z.string().describe('New filename'),
    }),
    execute: async ({ oldFilename, newFilename }) => {
      const file = await memoryService.readFile(oldFilename)
      if (!file) return `File "${oldFilename}" not found.`
      await memoryService.writeFile(newFilename, file.content)
      await memoryService.deleteFile(oldFilename)
      return `File renamed from "${oldFilename}" to "${newFilename}".`
    },
  })

  const createRoadmap = tool({
    description:
      'Generate a structured learning roadmap preview using AI. Returns a preview that must be confirmed before saving via save_roadmap.',
    inputSchema: z.object({
      subject: z.string().describe('The subject/topic for the roadmap'),
      durationDays: z.number().optional().describe('Duration in days (default: 14)'),
      hoursPerDay: z.number().optional().describe('Study hours per day (default: 2)'),
    }),
    execute: async ({ subject, durationDays, hoursPerDay }) => {
      const duration = durationDays || 14
      const hours = hoursPerDay || 2

      // Generate a real roadmap using AI SDK generateText (was planner subagent)
      const { model, entry } = resolveModel('secretary')
      const userPrompt = `Create a detailed learning roadmap for: "${subject}"
Duration: ${duration} days
Hours per day: ${hours}

Generate a unique short ID (2-4 uppercase letters) and provide the full day-by-day plan.`

      const { text: content } = await generateText({
        model,
        system: buildSystemPrompt(PLANNER_SUBAGENT_PROMPT),
        prompt: userPrompt,
        temperature: 0.4,
        providerOptions: getGoogleProviderOptions(),
        onFinish: trackAISDKUsage({ model: entry.id, taskType: 'secretary' }),
      })

      // Extract ID from the response
      const idMatch = content.match(/^#\s*\[(\w{2,4})\]/m)
      const nameMatch = content.match(/^#\s*\[\w{2,4}\]\s*(.+)/m)

      const preview: RoadmapPreview = {
        id: idMatch?.[1] || subject.slice(0, 3).toUpperCase(),
        name: nameMatch?.[1]?.trim() || `${subject} Roadmap`,
        content,
        durationDays: duration,
        hoursPerDay: hours,
      }

      // Store as pending roadmap for this user
      pendingRoadmaps.set(config.userId, preview)

      return `## Roadmap Preview: ${preview.name}\n\n${preview.content}\n\n---\n*This roadmap is pending. Ask the user to confirm, then call \`save_roadmap\` to save it.*`
    },
  })

  const saveRoadmap = tool({
    description:
      'Save a confirmed roadmap to Plan.md and Plans/<id>-roadmap.md. Uses pending roadmap if roadmapContent not provided.',
    inputSchema: z.object({
      planId: z
        .string()
        .optional()
        .describe('Short plan ID (e.g., "OPT", "AWS"). Optional when a pending roadmap exists.'),
      planName: z
        .string()
        .optional()
        .describe('Full plan name. Optional when a pending roadmap exists.'),
      roadmapContent: z
        .string()
        .optional()
        .describe(
          'Full roadmap markdown content. If omitted, uses the pending roadmap from create_roadmap.'
        ),
      planMdEntry: z
        .string()
        .optional()
        .describe('Plan.md entry line. If omitted, auto-generated.'),
      startDate: z.string().optional().describe('Start date in YYYY-MM-DD format (default: today)'),
    }),
    execute: async ({ planId, planName, roadmapContent, planMdEntry, startDate }) => {
      // Use provided roadmapContent or fall back to pending roadmap
      let content = roadmapContent
      const pending = pendingRoadmaps.get(config.userId)
      if (!content) {
        if (!pending) return 'Error: No pending roadmap and no roadmapContent provided.'
        content = pending.content
        if (!planId) planId = pending.id
        if (!planName) planName = pending.name
      }
      if (!planId || !planName) {
        return 'Error: planId and planName are required when there is no pending roadmap.'
      }

      // Save to Plans/<id>-roadmap.md
      const archiveFilename = `Plans/${planId.toLowerCase()}-roadmap.md`
      await memoryService.writeFile(archiveFilename, content)

      const start = startDate || getTodayDate(config.timezone)
      const fallbackDays = pending?.durationDays || 14
      const fallbackHours = pending?.hoursPerDay || 2
      const meta = extractRoadmapMeta(content, fallbackDays, fallbackHours)
      const end = addDays(start, meta.durationDays - 1)
      const currentTopic =
        planMdEntry?.match(/-\s*Current:\s*(.+)/i)?.[1]?.trim() || 'Week 1 - Getting started'

      // Auto-create linked project folder if supabase is available
      let linkedProjectId: string | undefined
      if (config.supabase) {
        try {
          const { data: existingLink } = await config.supabase
            .from('plan_project_links')
            .select('project_id')
            .eq('user_id', config.userId)
            .eq('plan_id', planId)
            .maybeSingle()

          if (existingLink) {
            linkedProjectId = existingLink.project_id
          } else {
            const { data: project } = await config.supabase
              .from('projects')
              .insert({ name: planName, icon: '📋', color: '#10b981', user_id: config.userId })
              .select('id')
              .single()

            if (project) {
              linkedProjectId = project.id
              await config.supabase
                .from('plan_project_links')
                .insert({ user_id: config.userId, plan_id: planId, project_id: project.id })
            }
          }
        } catch (err) {
          console.warn('secretary.save_roadmap.auto_link_failed', {
            planId,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }

      // Normalize to canonical Plan.md format to prevent stale or conflicting summaries.
      planMdEntry = renderPlanEntryMarkdown({
        planId,
        planName,
        status: 'active',
        progressCurrent: 0,
        progressTotal: meta.durationDays,
        startDate: start,
        endDate: end,
        schedule: meta.schedule,
        currentTopic,
        projectId: linkedProjectId,
      })

      // Update Plan.md with the new entry
      const planFile = await memoryService.readFile('Plan.md')
      const currentContent = planFile?.content || ''
      const updatedContent = insertPlanEntry(currentContent, planMdEntry ?? '')
      await memoryService.writeFile('Plan.md', updatedContent)

      // Clear pending roadmap
      clearPendingRoadmap(config.userId)

      return `Roadmap saved: ${archiveFilename} and Plan.md updated with [${planId}] ${planName}`
    },
  })

  const activateRoadmap = tool({
    description: 'Activate an existing roadmap archive from Plans/*.md into Plan.md Active Plans.',
    inputSchema: z.object({
      roadmapId: z
        .string()
        .optional()
        .describe('Roadmap ID (e.g., "RL"). Optional if there is only one roadmap candidate.'),
      startDate: z
        .string()
        .optional()
        .describe('Activation start date YYYY-MM-DD (default: today).'),
    }),
    execute: async ({ roadmapId, startDate }) => {
      const files = await memoryService.listFiles('Plans/')
      const candidates = parseRoadmapCandidatesFromFiles(files)
      if (candidates.length === 0) {
        return 'No roadmap archive files found under Plans/. Create or save a roadmap first.'
      }

      let selected = roadmapId
        ? candidates.find(
            (c: ParsedRoadmapCandidate) => c.id.toLowerCase() === roadmapId.toLowerCase()
          )
        : undefined

      if (!selected && candidates.length === 1) {
        selected = candidates[0]
      }
      if (!selected) {
        return `Multiple roadmap candidates found. Specify roadmapId. Candidates: ${candidates.map((c: ParsedRoadmapCandidate) => `[${c.id}] ${c.name}`).join(', ')}`
      }

      const planFile = await memoryService.readFile('Plan.md')
      const planContent = planFile?.content || ''
      const parsed = parsePlanMarkdown(planContent)
      const alreadyActive = parsed.activePlans.some(
        (p: LearningRoadmap) => p.id.toLowerCase() === selected.id.toLowerCase()
      )
      if (alreadyActive) {
        return `Roadmap [${selected.id}] is already active in Plan.md.`
      }

      const entry = buildPlanEntryFromRoadmap(selected, startDate, config.timezone)
      const updated = insertPlanEntry(planContent, entry)
      await memoryService.writeFile('Plan.md', updated)
      return `Activated roadmap [${selected.id}] ${selected.name} in Plan.md.`
    },
  })

  const generateDailyPlan = tool({
    description:
      'Generate a time-blocked daily study plan based on active roadmaps and preferences. Reads context, generates via AI, and writes to Today.md or Tomorrow.md.',
    inputSchema: z.object({
      targetDate: z.string().describe('Target date in YYYY-MM-DD format'),
      isForTomorrow: z
        .boolean()
        .default(false)
        .describe('Whether this is for tomorrow (writes to Tomorrow.md)'),
    }),
    execute: async ({ targetDate, isForTomorrow }) => {
      // Read full context — preferences, plans, this week
      const context = await memoryService.getFullContext()
      const filename = isForTomorrow ? 'Tomorrow.md' : 'Today.md'

      if (!context.activePlans.length) {
        if (context.activationSuggestion.action === 'needs_selection') {
          const candidates = context.activationSuggestion.candidates
            .map((c: RoadmapCandidate) => `[${c.id}] ${c.name}`)
            .join(', ')
          return `No active plan is currently selected in Plan.md. I found multiple roadmap archives: ${candidates}. Call activate_roadmap with a roadmapId, then retry generate_daily_plan.`
        }
        return 'No active plans found. Create a roadmap first before generating daily plans.'
      }

      // Build a detailed context string for the LLM to use
      const prefs = context.preferences
      const planSummaries = context.activePlans
        .map(
          (p) =>
            `- [${p.id}] ${p.name} (${p.progress.currentDay}/${p.progress.totalDays} days, ${p.progress.percentComplete}% complete)\n  Current: ${p.currentTopic || 'N/A'}`
        )
        .join('\n')

      // Read detailed archive for each active plan
      const archiveDetails: string[] = []
      for (const plan of context.activePlans) {
        const archive = await memoryService.readFile(plan.archiveFilename)
        if (archive) {
          // Extract only the relevant day section (next ~500 chars)
          const dayPattern = new RegExp(
            `##\\s*Day\\s+${plan.progress.currentDay + 1}[\\s\\S]*?(?=##\\s*Day|$)`,
            'i'
          )
          const dayMatch = archive.content.match(dayPattern)
          if (dayMatch) {
            archiveDetails.push(
              `### ${plan.id} - Day ${plan.progress.currentDay + 1}\n${dayMatch[0].trim().slice(0, 500)}`
            )
          }
        }
      }

      // Use AI SDK generateText to generate the schedule
      const { model: scheduleModel, entry: scheduleEntry } = resolveModel('secretary')

      const dayName = getDayNameForDate(targetDate)
      const isWeekend = ['Saturday', 'Sunday'].includes(dayName)
      const studyHours = isWeekend ? prefs?.weekendHours || 6 : prefs?.weekdayHours || 4
      const startTime = prefs?.focusTime.bestStart || '09:00'
      const breakFreq = prefs?.breakFrequency || 45
      const breakDur = prefs?.breakDuration || 15

      // Load history analytics for pattern-aware scheduling
      const analytics = await memoryService.getHistoryAnalytics()
      let historyContext = ''
      if (analytics.recentDays > 0) {
        historyContext = `\nHistorical Patterns (last ${analytics.recentDays} days):\n- Avg completion: ${analytics.avgCompletionRate}%\n- Current streak: ${analytics.currentStreak} days`
        if (analytics.struggledTopics.length > 0)
          historyContext += `\n- Frequently struggled with: ${analytics.struggledTopics.join(', ')}`
        if (analytics.moodTrend.length > 0)
          historyContext += `\n- Recent mood trend: ${analytics.moodTrend.join(' → ')}`
        if (analytics.avgCompletionRate < 50)
          historyContext +=
            '\nNote: User has been completing less than half their tasks. Consider suggesting a lighter schedule.'
      }

      // Load recurring blocks and carryover tasks
      let recurringContext = ''
      if (context.recurringBlocks) {
        const dayNameShort = dayName.slice(0, 3)
        const blockLines = context.recurringBlocks
          .split('\n')
          .filter((l) => l.startsWith('- **'))
          .filter(
            (l) => l.includes('Daily') || l.toLowerCase().includes(dayNameShort.toLowerCase())
          )
        if (blockLines.length > 0) {
          recurringContext = `\nBLOCKED TIMES (do NOT schedule study during these):\n${blockLines.map((l) => `  ${l}`).join('\n')}`
        }
      }

      let carryoverContext = ''
      if (context.carryoverTasks) {
        carryoverContext = `\nCarried Over from Previous Day (include these in today's schedule):\n${context.carryoverTasks}`
      }

      const prompt = `Generate a time-blocked daily study plan for ${targetDate} (${dayName}).

Active Plans:
${planSummaries}

This Week Schedule:
${context.thisWeekSection || 'No schedule yet'}

${archiveDetails.length > 0 ? `Detailed Topics:\n${archiveDetails.join('\n\n')}` : ''}

User Preferences:
- Start time: ${startTime}
- Study hours: ${studyHours}h
- Break every ${breakFreq} min, ${breakDur} min breaks
- Alternate: 📖 Learn → 💻 Practice → 🔄 Review → ☕ Break
${historyContext}${recurringContext}${carryoverContext}
Output EXACTLY this format (for parsing):
# 📅 ${formatDateHeading(targetDate)}

**Date:** ${targetDate}
**Focus:** [main topics from This Week]

## Schedule

- [ ] HH:MM (XXmin) EMOJI task description [PLAN_ID]
- [ ] HH:MM (XXmin) ☕ Break
...

## AI Notes

> Brief explanation of the schedule

## End of Day

- Mood:
- Completed: /
- Struggled with:
- What went well:`

      const { text: planContent } = await generateText({
        model: scheduleModel,
        system: buildSystemPrompt(
          'You are a schedule planner. Generate precise time-blocked study plans following the exact format requested.'
        ),
        prompt,
        temperature: 0.4,
        providerOptions: getGoogleProviderOptions(),
        onFinish: trackAISDKUsage({ model: scheduleEntry.id, taskType: 'secretary' }),
      })

      // Write the plan to the target file
      await memoryService.writeFile(filename, planContent)

      // Clear carryover tasks after incorporating them into the new plan
      if (context.carryoverTasks) {
        await memoryService.deleteFile('Carryover.md')
      }

      return `Daily plan for ${targetDate} written to ${filename}.\n\n${planContent}`
    },
  })

  const saveReflection = tool({
    description: 'Save end-of-day reflection (mood + text) to Today.md "End of Day" section',
    inputSchema: z.object({
      mood: z.enum(['great', 'good', 'okay', 'struggling', 'overwhelmed']),
      text: z.string().optional().describe('Free-text reflection notes'),
    }),
    execute: async ({ mood, text }) => {
      const todayFile = await memoryService.readFile('Today.md')
      if (!todayFile) return 'No Today.md found. Cannot save reflection.'

      const reflection = `## End of Day\n\n- Mood: ${mood}\n- Reflection: ${text || 'No notes'}\n- Submitted: ${new Date().toISOString()}`
      const endOfDayPattern = /## End of Day[\s\S]*$/
      const updated = endOfDayPattern.test(todayFile.content)
        ? todayFile.content.replace(endOfDayPattern, reflection)
        : todayFile.content + '\n\n' + reflection

      await memoryService.writeFile('Today.md', updated)
      return `Reflection saved: mood=${mood}`
    },
  })

  const modifyPlan = tool({
    description:
      "Modify today's or tomorrow's schedule: remove, reschedule, add, extend, or update tasks. Use 'update' to set a task's time range (e.g. 'from 11am to 4pm' = update with newTime='11:00', duration=300). Use `target` to specify which plan.",
    inputSchema: z.object({
      action: z.enum(['remove', 'reschedule', 'add', 'extend', 'update']),
      target: z
        .enum(['today', 'tomorrow'])
        .default('today')
        .describe('Which plan to modify: today or tomorrow'),
      taskTime: z.string().optional().describe('Current task time (HH:MM) to modify'),
      newTime: z.string().optional().describe('New time (HH:MM) for reschedule or add'),
      taskDescription: z.string().optional().describe('Task description for add action'),
      duration: z
        .number()
        .optional()
        .describe(
          'Duration in minutes. For add/update: sets absolute duration. For extend: adds to existing duration.'
        ),
    }),
    execute: async ({ action, taskTime, newTime, taskDescription, duration, target }) => {
      const filename = target === 'tomorrow' ? 'Tomorrow.md' : 'Today.md'
      const file = await memoryService.readFile(filename)
      if (!file) return `No ${filename} found.`

      let content = file.content

      switch (action) {
        case 'remove': {
          if (!taskTime) return 'taskTime is required for remove action.'
          const escapedTime = escapeRegExp(taskTime)
          const linePattern = new RegExp(
            `^- \\[[xX \\->]\\] ${escapedTime}\\s*\\(\\d+\\s*(?:m|min|mins|minute|minutes)\\).*$(?:\\n)?`,
            'gmi'
          )
          const matches = content.match(linePattern) || []
          if (matches.length === 0) return `No tasks matched time ${taskTime}.`
          content = content.replace(linePattern, '')
          await memoryService.writeFile(filename, content)
          return `Removed ${matches.length} task(s) at ${taskTime}.`
        }
        case 'reschedule': {
          if (!taskTime || !newTime) return 'taskTime and newTime are required for reschedule.'
          const escapedTime = escapeRegExp(taskTime)
          const linePattern = new RegExp(
            `(^- \\[[xX \\->]\\] )${escapedTime}(\\s*\\(\\d+\\s*(?:m|min|mins|minute|minutes)\\).*$)`,
            'gmi'
          )
          let updated = 0
          content = content.replace(
            linePattern,
            (_match: string, prefix: string, suffix: string) => {
              updated += 1
              return `${prefix}${newTime}${suffix}`
            }
          )
          if (updated === 0) return `No tasks matched time ${taskTime}.`
          await memoryService.writeFile(filename, content)
          return `Rescheduled ${updated} task(s) from ${taskTime} to ${newTime}.`
        }
        case 'add': {
          if (!newTime || !taskDescription)
            return 'newTime and taskDescription are required for add.'
          const dur = duration || 45
          const newLine = `- [ ] ${newTime} (${dur}min) ${taskDescription}`
          const scheduleIdx = content.indexOf('## Schedule')
          if (scheduleIdx >= 0) {
            const nextSectionIdx = content.indexOf('\n## ', scheduleIdx + 12)
            if (nextSectionIdx >= 0) {
              content =
                content.slice(0, nextSectionIdx) + '\n' + newLine + content.slice(nextSectionIdx)
            } else {
              content += '\n' + newLine
            }
          } else {
            content = `${content.trimEnd()}\n\n## Schedule\n\n${newLine}\n`
          }
          await memoryService.writeFile(filename, content)
          return `Added task at ${newTime} (${dur}min).`
        }
        case 'extend': {
          if (!taskTime || !duration) return 'taskTime and duration are required for extend.'
          const escapedTime = escapeRegExp(taskTime)
          const durPattern = new RegExp(
            `(^- \\[[xX \\->]\\] ${escapedTime}\\s*\\()(\\d+)(\\s*(?:m|min|mins|minute|minutes)\\).*$)`,
            'gmi'
          )
          let updated = 0
          content = content.replace(
            durPattern,
            (_match: string, prefix: string, current: string, suffix: string) => {
              updated += 1
              const currentMinutes = parseInt(current, 10)
              const nextMinutes = Number.isFinite(currentMinutes)
                ? currentMinutes + duration
                : duration
              return `${prefix}${nextMinutes}${suffix}`
            }
          )
          if (updated === 0) return `No tasks matched time ${taskTime}.`
          await memoryService.writeFile(filename, content)
          return `Extended ${updated} task(s) at ${taskTime} by ${duration} minutes.`
        }
        case 'update': {
          if (!taskTime) return 'taskTime is required for update action.'
          if (!newTime && !duration && !taskDescription)
            return 'At least one of newTime, duration, or taskDescription is required for update.'
          const escapedTime = escapeRegExp(taskTime)
          const linePattern = new RegExp(
            `(^- \\[[xX \\->]\\] )${escapedTime}(\\s*\\()(\\d+)(\\s*(?:m|min|mins|minute|minutes)\\)\\s*)(.+)$`,
            'gmi'
          )
          let updated = 0
          content = content.replace(
            linePattern,
            (
              _match: string,
              prefix: string,
              parenOpen: string,
              currentDur: string,
              parenClose: string,
              desc: string
            ) => {
              updated += 1
              const finalTime = newTime || taskTime
              const finalDur = duration ?? parseInt(currentDur, 10)
              const finalDesc = taskDescription || desc
              return `${prefix}${finalTime}${parenOpen}${finalDur}${parenClose}${finalDesc}`
            }
          )
          if (updated === 0) return `No tasks matched time ${taskTime}.`
          await memoryService.writeFile(filename, content)
          const changes: string[] = []
          if (newTime) changes.push(`time → ${newTime}`)
          if (duration) changes.push(`duration → ${duration}min`)
          if (taskDescription) changes.push(`description → ${taskDescription}`)
          return `Updated ${updated} task(s) at ${taskTime}: ${changes.join(', ')}.`
        }
      }
    },
  })

  // ==========================================================================
  // Tier 1 — Schedule Surgery, Carry-Over, Recurring Blocks, Activity Log
  // ==========================================================================

  const bulkModifyPlan = tool({
    description:
      "Bulk schedule operations on today's or tomorrow's plan. Use shift_after to push all tasks after a time, insert_block to add a blocked period and reflow tasks, or swap to exchange two tasks' content. For single-task edits, use modify_plan instead.",
    inputSchema: z.object({
      action: z.enum(['shift_after', 'insert_block', 'swap']),
      target: z.enum(['today', 'tomorrow']).default('today').describe('Which plan to modify'),
      afterTime: z
        .string()
        .optional()
        .describe('HH:MM — for shift_after: shift tasks at/after this time'),
      shiftMinutes: z
        .number()
        .optional()
        .describe('Minutes to shift (positive=later, negative=earlier). Required for shift_after.'),
      blockStart: z.string().optional().describe('HH:MM — for insert_block: start of blocked time'),
      blockDuration: z
        .number()
        .optional()
        .describe('Minutes — for insert_block: duration of blocked time'),
      blockDescription: z
        .string()
        .optional()
        .describe('Description of the block (e.g., "Doctor appointment")'),
      taskTimeA: z.string().optional().describe('HH:MM — for swap: first task time'),
      taskTimeB: z.string().optional().describe('HH:MM — for swap: second task time'),
    }),
    execute: async ({
      action,
      target,
      afterTime,
      shiftMinutes,
      blockStart,
      blockDuration,
      blockDescription,
      taskTimeA,
      taskTimeB,
    }) => {
      const filename = target === 'tomorrow' ? 'Tomorrow.md' : 'Today.md'
      const file = await memoryService.readFile(filename)
      if (!file) return `No ${filename} found.`

      const lines = file.content.split('\n')
      const inSchedule = (idx: number) => {
        for (let i = idx; i >= 0; i--) {
          if (/^## /.test(lines[i])) return /^## Schedule/i.test(lines[i])
        }
        return false
      }

      switch (action) {
        case 'shift_after': {
          if (!afterTime || shiftMinutes === undefined)
            return 'afterTime and shiftMinutes are required for shift_after.'
          const threshold = timeToMinutes(afterTime)
          let shifted = 0
          for (let i = 0; i < lines.length; i++) {
            if (!inSchedule(i)) continue
            const m = lines[i].match(TASK_LINE_RE)
            if (!m) continue
            const taskMin = timeToMinutes(m[2])
            if (taskMin >= threshold) {
              const newMin = taskMin + shiftMinutes
              lines[i] = `${m[1]}${minutesToTime(newMin)}${m[3]}${m[4]}${m[5]}${m[6]}`
              shifted++
            }
          }
          if (shifted === 0) return `No tasks found at or after ${afterTime}.`
          await memoryService.writeFile(filename, lines.join('\n'))
          return `Shifted ${shifted} task(s) after ${afterTime} by ${shiftMinutes > 0 ? '+' : ''}${shiftMinutes} minutes.`
        }
        case 'insert_block': {
          if (!blockStart || !blockDuration)
            return 'blockStart and blockDuration are required for insert_block.'
          const blockStartMin = timeToMinutes(blockStart)
          const blockEndMin = blockStartMin + blockDuration
          const desc = blockDescription || 'Blocked'
          const blockLine = `- [=] ${blockStart} (${blockDuration}min) ${desc}`

          let insertIdx = -1
          let shifted = 0
          for (let i = 0; i < lines.length; i++) {
            if (!inSchedule(i)) continue
            const m = lines[i].match(TASK_LINE_RE)
            if (!m) continue
            const taskMin = timeToMinutes(m[2])
            if (insertIdx === -1 && taskMin >= blockStartMin) {
              insertIdx = i
            }
            if (taskMin >= blockStartMin && taskMin < blockEndMin) {
              const offset = blockEndMin - taskMin
              lines[i] = `${m[1]}${minutesToTime(taskMin + offset)}${m[3]}${m[4]}${m[5]}${m[6]}`
              shifted++
            }
          }

          if (insertIdx === -1) {
            const schedIdx = lines.findIndex((l: string) => /^## Schedule/i.test(l))
            if (schedIdx >= 0) {
              const nextSection = lines.findIndex(
                (l: string, i: number) => i > schedIdx && /^## /.test(l)
              )
              insertIdx = nextSection >= 0 ? nextSection : lines.length
            } else {
              insertIdx = lines.length
            }
          }

          lines.splice(insertIdx, 0, blockLine)
          await memoryService.writeFile(filename, lines.join('\n'))
          return `Inserted "${desc}" at ${blockStart} (${blockDuration}min). Shifted ${shifted} conflicting task(s).`
        }
        case 'swap': {
          if (!taskTimeA || !taskTimeB) return 'taskTimeA and taskTimeB are required for swap.'
          let idxA = -1
          let idxB = -1
          for (let i = 0; i < lines.length; i++) {
            if (!inSchedule(i)) continue
            const m = lines[i].match(TASK_LINE_RE)
            if (!m) continue
            if (m[2] === taskTimeA && idxA === -1) idxA = i
            if (m[2] === taskTimeB && idxB === -1) idxB = i
          }
          if (idxA === -1) return `No task found at ${taskTimeA}.`
          if (idxB === -1) return `No task found at ${taskTimeB}.`

          const mA = lines[idxA].match(TASK_LINE_RE)!
          const mB = lines[idxB].match(TASK_LINE_RE)!

          // Swap: keep each slot's time, exchange duration + description
          lines[idxA] = `${mA[1]}${mA[2]}${mB[3]}${mB[4]}${mB[5]}${mB[6]}`
          lines[idxB] = `${mB[1]}${mB[2]}${mA[3]}${mA[4]}${mA[5]}${mA[6]}`
          await memoryService.writeFile(filename, lines.join('\n'))
          return `Swapped tasks at ${taskTimeA} and ${taskTimeB}.`
        }
      }
    },
  })

  const carryOverTasks = tool({
    description:
      "Move incomplete tasks from today's plan (or yesterday's history) to tomorrow's or today's plan. Tasks are added with --:-- time (unscheduled) for the user or AI to assign slots.",
    inputSchema: z.object({
      source: z
        .enum(['today', 'yesterday'])
        .default('today')
        .describe('Where to pull incomplete tasks from'),
      destination: z
        .enum(['today', 'tomorrow'])
        .default('tomorrow')
        .describe('Where to add carried-over tasks'),
      filter: z
        .enum(['all_incomplete', 'pending_only', 'in_progress_only'])
        .default('all_incomplete')
        .describe('Which tasks to carry over'),
    }),
    execute: async ({ source, destination, filter }) => {
      let sourceContent: string | null = null
      if (source === 'yesterday') {
        const historyFiles = await memoryService.listFiles('History/')
        const sorted = historyFiles.sort((a, b) => b.filename.localeCompare(a.filename))
        if (sorted.length > 0) sourceContent = sorted[0].content
      } else {
        const file = await memoryService.readFile('Today.md')
        sourceContent = file?.content || null
      }
      if (!sourceContent) return `No ${source === 'yesterday' ? 'history' : 'Today.md'} file found.`

      const taskLineRe =
        /^- \[([xX \->=])\] (\d{1,2}:\d{2})\s*\((\d+)\s*(?:m|min|mins|minute|minutes)\)\s*(.+)$/gm
      const incomplete: Array<{ duration: string; desc: string }> = []
      let match
      while ((match = taskLineRe.exec(sourceContent)) !== null) {
        const status = match[1]
        const isIncomplete =
          filter === 'pending_only'
            ? status === ' '
            : filter === 'in_progress_only'
              ? status === '>'
              : status === ' ' || status === '>'
        if (isIncomplete) {
          incomplete.push({ duration: match[3], desc: match[4] })
        }
      }

      if (incomplete.length === 0) return 'No incomplete tasks found to carry over.'

      const destFilename = destination === 'tomorrow' ? 'Tomorrow.md' : 'Today.md'
      const destFile = await memoryService.readFile(destFilename)
      let destContent = destFile?.content || ''

      const carryLines = incomplete.map((t) => `- [ ] --:-- (${t.duration}min) ${t.desc}`)
      const carrySection = `\n### Carried Over\n\n${carryLines.join('\n')}`

      const schedIdx = destContent.indexOf('## Schedule')
      if (schedIdx >= 0) {
        const nextSectionIdx = destContent.indexOf('\n## ', schedIdx + 12)
        if (nextSectionIdx >= 0) {
          destContent =
            destContent.slice(0, nextSectionIdx) +
            '\n' +
            carrySection +
            destContent.slice(nextSectionIdx)
        } else {
          destContent += '\n' + carrySection
        }
      } else {
        destContent += '\n' + carrySection
      }

      await memoryService.writeFile(destFilename, destContent)
      const taskList = incomplete.map((t) => `  - (${t.duration}min) ${t.desc}`).join('\n')
      return `Carried over ${incomplete.length} task(s) to ${destFilename}:\n${taskList}`
    },
  })

  const manageRecurringBlocks = tool({
    description:
      'Add, list, or remove recurring time blocks (meetings, gym, etc.) stored in Recurring.md. These blocks are respected during plan generation — the AI avoids scheduling study during blocked times.',
    inputSchema: z.object({
      action: z.enum(['add', 'list', 'remove']),
      name: z
        .string()
        .optional()
        .describe('Name of the recurring block (e.g., "Team Standup", "Gym")'),
      days: z
        .array(z.string())
        .optional()
        .describe('Days of week (e.g., ["Mon","Wed","Fri"] or ["Daily"])'),
      startTime: z.string().optional().describe('Start time HH:MM'),
      endTime: z.string().optional().describe('End time HH:MM'),
      category: z
        .enum(['work', 'personal', 'health', 'other'])
        .optional()
        .describe('Category of the block'),
    }),
    execute: async ({ action, name, days, startTime, endTime, category }) => {
      const filename = 'Recurring.md'
      const file = await memoryService.readFile(filename)
      let content = file?.content || '# Recurring Time Blocks\n'

      switch (action) {
        case 'add': {
          if (!name || !days || !startTime || !endTime) {
            return 'name, days, startTime, and endTime are required for add.'
          }
          const daysStr = days.join(',')
          const cat = category || 'other'
          const newLine = `- **${name}** | ${daysStr} | ${startTime}-${endTime} | ${cat}`
          content = content.trimEnd() + '\n' + newLine + '\n'
          await memoryService.writeFile(filename, content)
          return `Added recurring block: ${name} (${daysStr} ${startTime}-${endTime}).`
        }
        case 'list': {
          if (!content.trim() || content.trim() === '# Recurring Time Blocks') {
            return 'No recurring time blocks configured.'
          }
          return content
        }
        case 'remove': {
          if (!name) return 'name is required for remove.'
          const escapedName = escapeRegExp(name)
          const linePattern = new RegExp(`^- \\*\\*${escapedName}\\*\\*.*$\\n?`, 'gmi')
          const matches = content.match(linePattern)
          if (!matches || matches.length === 0) return `No recurring block named "${name}" found.`
          content = content.replace(linePattern, '')
          await memoryService.writeFile(filename, content)
          return `Removed recurring block: ${name}.`
        }
      }
    },
  })

  const logActivity = tool({
    description:
      'Log a completed activity retroactively. Inserts a pre-completed task (marked [x]) into the schedule at the correct chronological position.',
    inputSchema: z.object({
      description: z.string().describe('What was done (e.g., "Watched async Rust tutorial")'),
      startTime: z.string().describe('When it started (HH:MM)'),
      durationMinutes: z.number().describe('How long in minutes'),
      planId: z.string().optional().describe('Associate with a roadmap plan ID (e.g., "RUST")'),
      target: z.enum(['today', 'tomorrow']).default('today').describe('Which plan to log to'),
    }),
    execute: async ({ description, startTime, durationMinutes, planId, target }) => {
      const filename = target === 'tomorrow' ? 'Tomorrow.md' : 'Today.md'
      const file = await memoryService.readFile(filename)
      if (!file) return `No ${filename} found.`

      const planTag = planId ? ` [${planId}]` : ''
      const newLine = `- [x] ${startTime} (${durationMinutes}min) ${description}${planTag}`

      const lines = file.content.split('\n')
      const targetMinutes = timeToMinutes(startTime)

      let schedStart = -1
      let schedEnd = lines.length
      for (let i = 0; i < lines.length; i++) {
        if (/^## Schedule/i.test(lines[i])) {
          schedStart = i
        } else if (schedStart >= 0 && /^## /.test(lines[i])) {
          schedEnd = i
          break
        }
      }

      if (schedStart === -1) {
        const content = `${file.content.trimEnd()}\n\n## Schedule\n\n${newLine}\n`
        await memoryService.writeFile(filename, content)
        return `Logged activity: ${startTime} (${durationMinutes}min) ${description}${planTag}`
      }

      // Insert chronologically within the Schedule section
      let insertIdx = schedEnd
      for (let i = schedStart + 1; i < schedEnd; i++) {
        const m = lines[i].match(TASK_LINE_RE)
        if (m) {
          const taskMin = timeToMinutes(m[2])
          if (taskMin > targetMinutes) {
            insertIdx = i
            break
          }
        }
      }

      lines.splice(insertIdx, 0, newLine)
      await memoryService.writeFile(filename, lines.join('\n'))
      return `Logged activity: ${startTime} (${durationMinutes}min) ${description}${planTag}`
    },
  })

  // Build delegation tools from capability registry
  let delegationTools: Record<string, unknown> = {}
  if (config.supabase) {
    const capCtx: CapabilityContext = {
      userId: config.userId,
      supabase: config.supabase,
      emitEvent: config.emitEvent,
      timezone: config.timezone,
    }
    delegationTools = generateDelegationTools(
      'secretary',
      ['notes.search', 'notes.read', 'notes.create', 'context.time', 'research.quick'],
      capCtx
    )
  }

  return {
    read_memory_file: readMemoryFile,
    write_memory_file: writeMemoryFile,
    list_memory_files: listMemoryFiles,
    delete_memory_file: deleteMemoryFile,
    rename_memory_file: renameMemoryFile,
    create_roadmap: createRoadmap,
    save_roadmap: saveRoadmap,
    activate_roadmap: activateRoadmap,
    generate_daily_plan: generateDailyPlan,
    save_reflection: saveReflection,
    modify_plan: modifyPlan,
    bulk_modify_plan: bulkModifyPlan,
    carry_over_tasks: carryOverTasks,
    manage_recurring_blocks: manageRecurringBlocks,
    log_activity: logActivity,
    ...delegationTools,
  }
}
