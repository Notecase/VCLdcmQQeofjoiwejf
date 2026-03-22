/**
 * Secretary Tools — 18 tools for memory, plans, tasks, and analytics
 */

import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { DbClient } from '../db/client.js'
import { MemoryDb } from '../db/memory.js'
import { ok, err } from '../format/index.js'
import { formatMemoryFile, formatMemoryList, formatAnalytics } from '../format/memory.js'

export function registerSecretaryTools(server: McpServer, db: DbClient): void {
  const memory = new MemoryDb(db.supabase, db.userId)

  server.tool(
    'secretary_memory_read',
    'Read any memory file by filename (e.g. "Plan.md", "AI.md", "Plans/optics.md").',
    {
      filename: z
        .string()
        .describe('Memory filename (e.g. "Plan.md", "Today.md", "Plans/algo.md")'),
    },
    async ({ filename }) => {
      try {
        const file = await memory.read(filename)
        if (!file) return err(`Memory file "${filename}" not found`)
        return ok(formatMemoryFile(file))
      } catch (e) {
        return err((e as Error).message)
      }
    }
  )

  server.tool(
    'secretary_memory_write',
    'Write/update a memory file (upsert). Creates if not exists.',
    {
      filename: z.string().describe('Memory filename'),
      content: z.string().describe('Full markdown content to write'),
    },
    async ({ filename, content }) => {
      try {
        await memory.write(filename, content)
        return ok(`Written: ${filename}`)
      } catch (e) {
        return err((e as Error).message)
      }
    }
  )

  server.tool(
    'secretary_memory_list',
    'List all memory files. Optional prefix filter (e.g. "Plans/", "History/").',
    { prefix: z.string().optional().describe('Filter by filename prefix') },
    async ({ prefix }) => {
      try {
        const files = await memory.list(prefix)
        return ok(formatMemoryList(files))
      } catch (e) {
        return err((e as Error).message)
      }
    }
  )

  server.tool(
    'secretary_memory_delete',
    'Delete a memory file.',
    { filename: z.string().describe('Memory filename to delete') },
    async ({ filename }) => {
      try {
        await memory.delete(filename)
        return ok(`Deleted: ${filename}`)
      } catch (e) {
        return err((e as Error).message)
      }
    }
  )

  server.tool('secretary_today', "Shortcut: read Today.md (today's daily plan).", {}, async () => {
    try {
      const file = await memory.read('Today.md')
      if (!file || !file.content.trim()) return ok('No plan for today yet.')
      return ok(formatMemoryFile(file))
    } catch (e) {
      return err((e as Error).message)
    }
  })

  server.tool(
    'secretary_tomorrow',
    "Shortcut: read Tomorrow.md (tomorrow's pre-generated plan).",
    {},
    async () => {
      try {
        const file = await memory.read('Tomorrow.md')
        if (!file || !file.content.trim()) return ok('No plan for tomorrow yet.')
        return ok(formatMemoryFile(file))
      } catch (e) {
        return err((e as Error).message)
      }
    }
  )

  server.tool(
    'secretary_plans_list',
    'Read Plan.md (master roadmap index with active plans, schedule, archives).',
    {},
    async () => {
      try {
        const file = await memory.read('Plan.md')
        if (!file || !file.content.trim()) return ok('No plans yet. Plan.md is empty.')
        return ok(formatMemoryFile(file))
      } catch (e) {
        return err((e as Error).message)
      }
    }
  )

  server.tool(
    'secretary_plan_create',
    'Create a new plan: writes Plans/<filename>.md and adds entry to Plan.md index.',
    {
      filename: z.string().describe('Plan filename without path (e.g. "algo-roadmap.md")'),
      content: z.string().describe('Full plan markdown content'),
      plan_entry: z.string().describe('Plan.md index entry to append to Active Plans section'),
    },
    async ({ filename, content, plan_entry }) => {
      try {
        const path = filename.startsWith('Plans/') ? filename : `Plans/${filename}`
        await memory.write(path, content)
        const planFile = await memory.read('Plan.md')
        if (planFile) {
          const updated = insertPlanEntry(planFile.content, plan_entry)
          await memory.write('Plan.md', updated)
        }
        return ok(`Created plan: ${path} and updated Plan.md index`)
      } catch (e) {
        return err((e as Error).message)
      }
    }
  )

  server.tool(
    'secretary_plan_activate',
    "Update a plan's status in Plan.md (active/paused/completed/archived).",
    {
      plan_id: z.string().describe('Plan ID (short code like "OPT", "AWS")'),
      status: z.enum(['active', 'paused', 'completed', 'archived']).describe('New status'),
    },
    async ({ plan_id, status }) => {
      try {
        const planFile = await memory.read('Plan.md')
        if (!planFile) return err('Plan.md not found')
        const escapedId = plan_id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const updated = planFile.content.replace(
          new RegExp(`(###\\s*\\[${escapedId}\\][\\s\\S]*?-\\s*Status:\\s*)\\w+`, 'i'),
          `$1${status}`
        )
        await memory.write('Plan.md', updated)
        return ok(`Plan [${plan_id}] status → ${status}`)
      } catch (e) {
        return err((e as Error).message)
      }
    }
  )

  server.tool(
    'secretary_daily_generate',
    'Write a structured daily plan to Today.md or Tomorrow.md.',
    {
      target: z.enum(['Today.md', 'Tomorrow.md']).describe('Which file to write'),
      content: z.string().describe('Full daily plan markdown'),
    },
    async ({ target, content }) => {
      try {
        await memory.write(target, content)
        return ok(`Daily plan written to ${target}`)
      } catch (e) {
        return err((e as Error).message)
      }
    }
  )

  server.tool(
    'secretary_task_modify',
    'Modify a single task in Today/Tomorrow.md (change time, status, or text).',
    {
      target: z.enum(['Today.md', 'Tomorrow.md']).describe('Which file'),
      task_pattern: z.string().describe('Text pattern to find the task line'),
      replacement: z.string().describe('Full replacement line for the task'),
    },
    async ({ target, task_pattern, replacement }) => {
      try {
        const file = await memory.read(target)
        if (!file) return err(`${target} not found`)
        const lines = file.content.split('\n')
        let found = false
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes(task_pattern)) {
            lines[i] = replacement
            found = true
            break
          }
        }
        if (!found) return err(`Task matching "${task_pattern}" not found in ${target}`)
        await memory.write(target, lines.join('\n'))
        return ok(`Task updated in ${target}`)
      } catch (e) {
        return err((e as Error).message)
      }
    }
  )

  server.tool(
    'secretary_bulk_modify',
    'Bulk modify multiple tasks in Today/Tomorrow.md.',
    {
      target: z.enum(['Today.md', 'Tomorrow.md']).describe('Which file'),
      modifications: z
        .array(
          z.object({
            task_pattern: z.string().describe('Text pattern to find'),
            replacement: z.string().describe('Replacement line'),
          })
        )
        .describe('List of modifications'),
    },
    async ({ target, modifications }) => {
      try {
        const file = await memory.read(target)
        if (!file) return err(`${target} not found`)
        let content = file.content
        let modified = 0
        for (const mod of modifications) {
          if (content.includes(mod.task_pattern)) {
            content = content.replace(mod.task_pattern, mod.replacement)
            modified++
          }
        }
        await memory.write(target, content)
        return ok(`Modified ${modified}/${modifications.length} tasks in ${target}`)
      } catch (e) {
        return err((e as Error).message)
      }
    }
  )

  server.tool(
    'secretary_carryover',
    'Move incomplete tasks from Today.md → Tomorrow.md.',
    {},
    async () => {
      try {
        const today = await memory.read('Today.md')
        if (!today || !today.content.trim()) return ok('Today.md is empty, nothing to carry over.')
        const taskPattern = /^- \[[ >]\] .+$/gm
        const incomplete = today.content.match(taskPattern)
        if (!incomplete || incomplete.length === 0) return ok('No incomplete tasks to carry over.')
        const tomorrow = await memory.read('Tomorrow.md')
        const tomorrowContent = tomorrow?.content ?? ''
        const carryoverSection = `\n\n## Carried Over\n${incomplete.join('\n')}\n`
        await memory.write('Tomorrow.md', tomorrowContent + carryoverSection)
        let updatedToday = today.content
        for (const task of incomplete) {
          updatedToday = updatedToday.replace(task, task.replace('[ ]', '[>]'))
        }
        await memory.write('Today.md', updatedToday)
        return ok(`Carried over ${incomplete.length} tasks to Tomorrow.md`)
      } catch (e) {
        return err((e as Error).message)
      }
    }
  )

  server.tool(
    'secretary_recurring_manage',
    'CRUD recurring blocks in Recurring.md. Used for tasks that repeat daily/weekly.',
    {
      action: z.enum(['read', 'write']).describe('Read or write Recurring.md'),
      content: z.string().optional().describe('Full content for write action'),
    },
    async ({ action, content }) => {
      try {
        if (action === 'read') {
          const file = await memory.read('Recurring.md')
          if (!file || !file.content.trim()) return ok('No recurring blocks defined.')
          return ok(formatMemoryFile(file))
        } else {
          if (!content) return err('Content required for write action')
          await memory.write('Recurring.md', content)
          return ok('Recurring.md updated')
        }
      } catch (e) {
        return err((e as Error).message)
      }
    }
  )

  server.tool(
    'secretary_log_activity',
    'Append an activity entry to Today.md.',
    { entry: z.string().describe('Activity log entry text') },
    async ({ entry }) => {
      try {
        const today = await memory.read('Today.md')
        const content = today?.content ?? "# Today's Plan\n"
        const timestamp = new Date().toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
        const logEntry = `\n- ${timestamp} — ${entry}`
        let updated: string
        if (content.includes('## Activity Log')) {
          const idx = content.indexOf('## Activity Log')
          const nextSection = content.indexOf('\n## ', idx + 1)
          if (nextSection > 0) {
            updated = content.slice(0, nextSection) + logEntry + '\n' + content.slice(nextSection)
          } else {
            updated = content + logEntry
          }
        } else {
          updated = content + '\n\n## Activity Log' + logEntry
        }
        await memory.write('Today.md', updated)
        return ok(`Logged: ${timestamp} — ${entry}`)
      } catch (e) {
        return err((e as Error).message)
      }
    }
  )

  server.tool(
    'secretary_reflect',
    'Write end-of-day reflection to Today.md.',
    {
      mood: z
        .enum(['great', 'good', 'okay', 'struggling', 'overwhelmed'])
        .describe('How the day felt'),
      reflection: z.string().describe('Reflection text'),
      struggled_with: z.string().optional().describe('Topics that were difficult'),
      went_well: z.string().optional().describe('What went well'),
    },
    async ({ mood, reflection, struggled_with, went_well }) => {
      try {
        const today = await memory.read('Today.md')
        const content = today?.content ?? "# Today's Plan\n"
        const parts: string[] = ['\n\n## End of Day']
        parts.push(`Mood: ${mood}`)
        parts.push(reflection)
        if (went_well) parts.push(`What went well: ${went_well}`)
        if (struggled_with) parts.push(`Struggled with: ${struggled_with}`)
        await memory.write('Today.md', content + parts.join('\n'))
        return ok('Reflection saved to Today.md')
      } catch (e) {
        return err((e as Error).message)
      }
    }
  )

  server.tool('secretary_preferences', 'Read study preferences from AI.md.', {}, async () => {
    try {
      const file = await memory.read('AI.md')
      if (!file || !file.content.trim()) return ok('No preferences set. AI.md is empty.')
      return ok(formatMemoryFile(file))
    } catch (e) {
      return err((e as Error).message)
    }
  })

  server.tool(
    'secretary_analytics',
    'Compute analytics from History/*.md: completion rate, streaks, mood trends. Configurable range.',
    {
      days: z
        .number()
        .int()
        .min(1)
        .max(90)
        .optional()
        .describe('Number of days to analyze (default 7)'),
    },
    async ({ days }) => {
      try {
        const analytics = await memory.getHistoryAnalytics(days ?? 7)
        if (analytics.recentDays === 0) return ok('No history data found.')
        return ok(formatAnalytics(analytics))
      } catch (e) {
        return err((e as Error).message)
      }
    }
  )

  server.tool(
    'secretary_plan_progress',
    "Read or increment a plan's day counter in Plan.md.",
    {
      plan_id: z.string().describe('Plan ID (short code like "ALGO", "OPT")'),
      action: z
        .enum(['read', 'increment'])
        .describe('Read current progress or increment day counter'),
    },
    async ({ plan_id, action }) => {
      try {
        if (action === 'read') {
          const progress = await memory.getPlanProgress(plan_id)
          if (!progress) return err(`Plan [${plan_id}] not found in Plan.md`)
          return ok(
            `Plan [${progress.plan_id}]: Day ${progress.current_day}/${progress.total_days} — ${progress.topic}`
          )
        } else {
          const progress = await memory.incrementPlanProgress(plan_id)
          if (!progress) return err(`Plan [${plan_id}] not found in Plan.md`)
          return ok(
            `Plan [${progress.plan_id}] incremented: Day ${progress.current_day}/${progress.total_days} — ${progress.topic}`
          )
        }
      } catch (e) {
        return err((e as Error).message)
      }
    }
  )

  server.tool(
    'secretary_history_bulk',
    'List recent History files WITH full content (avoids N+1 reads).',
    {
      limit: z
        .number()
        .int()
        .min(1)
        .max(30)
        .optional()
        .describe('Number of files to return (default 7)'),
    },
    async ({ limit }) => {
      try {
        const files = await memory.getHistoryBulk(limit ?? 7)
        if (files.length === 0) return ok('No history files found.')
        const parts = files.map(
          (f) => `### ${f.filename}\n_Updated: ${f.updated_at}_\n\n${f.content}`
        )
        return ok(`## History (${files.length} files)\n\n${parts.join('\n\n---\n\n')}`)
      } catch (e) {
        return err((e as Error).message)
      }
    }
  )
}

function insertPlanEntry(planContent: string, entry: string): string {
  const activeSectionPattern = /##\s*Active Plans[^\n]*\n/i
  const match = planContent.match(activeSectionPattern)
  if (!match || match.index === undefined) {
    return `${planContent.trimEnd()}\n\n## Active Plans\n\n${entry}\n`
  }
  const sectionStart = match.index + match[0].length
  const afterActive = planContent.slice(sectionStart)
  const nextSection = afterActive.search(/\n##\s/)
  const sectionEnd = nextSection >= 0 ? sectionStart + nextSection : planContent.length
  const currentBody = planContent.slice(sectionStart, sectionEnd).trim()
  const updated = currentBody ? `${currentBody}\n\n${entry}` : entry
  return `${planContent.slice(0, sectionStart)}\n${updated}\n${planContent.slice(sectionEnd)}`
}
