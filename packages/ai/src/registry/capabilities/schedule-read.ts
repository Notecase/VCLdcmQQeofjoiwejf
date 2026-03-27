/**
 * schedule.read Capability
 *
 * READ-ONLY view of the user's schedule, plans, and preferences.
 * Uses raw file reads (listFiles) instead of getFullContext() to avoid
 * triggering destructive lifecycle operations (day transition, auto-archive).
 *
 * CRITICAL: getFullContext() must NEVER be called from a delegation tool.
 * It performs day transitions, week expansion, and plan archiving as side
 * effects. Calling it mid-session corrupts the Secretary's already-loaded state.
 */

import { z } from 'zod'
import { parsePlanMarkdown } from '@inkdown/shared/secretary'
import type { Capability, CapabilityContext } from '../types'

const inputSchema = z.object({
  include: z
    .array(z.enum(['today', 'tomorrow', 'plans', 'preferences', 'recurring', 'calendar']))
    .optional()
    .describe('Which sections to include. Defaults to all.'),
})

async function execute(input: unknown, context: CapabilityContext): Promise<string> {
  const { include } = inputSchema.parse(input)

  // Read memory files directly from DB — NO lifecycle operations
  const { data: files, error } = await context.supabase
    .from('secretary_memory')
    .select('filename, content')
    .eq('user_id', context.userId)
    .order('filename')

  if (error || !files) {
    return 'Failed to read schedule data.'
  }

  const fileMap = new Map(
    files.map((f: { filename: string; content: string }) => [f.filename, f.content])
  )
  const sections: string[] = []
  const includeAll = !include || include.length === 0

  if (includeAll || include?.includes('preferences')) {
    const aiContent = fileMap.get('AI.md')
    if (aiContent) {
      sections.push(`## Preferences\n${aiContent}`)
    }
  }

  if (includeAll || include?.includes('plans')) {
    const planContent = fileMap.get('Plan.md') || ''
    const parsed = parsePlanMarkdown(planContent)
    if (parsed.activePlans.length > 0) {
      const planSummaries = parsed.activePlans
        .map(
          (p) =>
            `- **${p.name}** (${p.id}): ${p.schedule.studyDays.join(', ')} ${p.schedule.hoursPerDay}h/day`
        )
        .join('\n')
      sections.push(`## Active Plans\n${planSummaries}`)
    } else {
      sections.push('## Active Plans\nNo active plans.')
    }
  }

  if (includeAll || include?.includes('today')) {
    const todayContent = fileMap.get('Today.md')
    sections.push(`## Today\n${todayContent || 'No plan for today.'}`)
  }

  if (includeAll || include?.includes('tomorrow')) {
    const tomorrowContent = fileMap.get('Tomorrow.md')
    sections.push(`## Tomorrow\n${tomorrowContent || 'No plan for tomorrow.'}`)
  }

  if (includeAll || include?.includes('recurring')) {
    const recurringContent = fileMap.get('Recurring.md')
    if (recurringContent) {
      sections.push(`## Recurring Blocks\n${recurringContent}`)
    }
  }

  if (includeAll || include?.includes('calendar')) {
    const calendarContent = fileMap.get('Calendar.md')
    if (calendarContent) {
      sections.push(`## Calendar\n${calendarContent}`)
    }
  }

  if (sections.length === 0) {
    return 'No schedule data found.'
  }

  return sections.join('\n\n')
}

export const scheduleRead: Capability = {
  name: 'schedule.read',
  description:
    "Read the user's schedule, active plans, daily plan, preferences, and calendar from the secretary system. This is read-only and does not modify any data.",
  inputSchema,
  execute,
}
