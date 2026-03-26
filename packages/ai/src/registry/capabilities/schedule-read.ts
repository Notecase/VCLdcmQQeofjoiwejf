/**
 * schedule.read Capability
 *
 * Reads the user's schedule, plans, and preferences from the secretary system.
 * Zero LLM cost (pure DB reads via MemoryService).
 */

import { z } from 'zod'
import { MemoryService } from '../../agents/secretary/memory'
import type { Capability, CapabilityContext } from '../types'

const inputSchema = z.object({
  include: z
    .array(z.enum(['today', 'tomorrow', 'plans', 'preferences', 'recurring', 'calendar']))
    .optional()
    .describe('Which sections to include. Defaults to all.'),
})

async function execute(input: unknown, context: CapabilityContext): Promise<string> {
  const { include } = inputSchema.parse(input)

  const memoryService = new MemoryService(context.supabase, context.userId, context.timezone)
  const memCtx = await memoryService.getFullContext()

  const sections: string[] = []
  const includeAll = !include || include.length === 0

  if (includeAll || include?.includes('preferences')) {
    if (memCtx.preferences) {
      sections.push(`## Preferences\n${JSON.stringify(memCtx.preferences, null, 2)}`)
    }
  }

  if (includeAll || include?.includes('plans')) {
    if (memCtx.activePlans.length > 0) {
      const planSummaries = memCtx.activePlans
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
    sections.push(`## Today\n${memCtx.todayContent || 'No plan for today.'}`)
  }

  if (includeAll || include?.includes('tomorrow')) {
    sections.push(`## Tomorrow\n${memCtx.tomorrowContent || 'No plan for tomorrow.'}`)
  }

  if (includeAll || include?.includes('recurring')) {
    if (memCtx.recurringBlocks) {
      sections.push(`## Recurring Blocks\n${memCtx.recurringBlocks}`)
    }
  }

  if (includeAll || include?.includes('calendar')) {
    if (memCtx.calendarContent) {
      sections.push(`## Calendar\n${memCtx.calendarContent}`)
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
    "Read the user's schedule, active plans, daily plan, preferences, and calendar from the secretary system.",
  inputSchema,
  execute,
}
