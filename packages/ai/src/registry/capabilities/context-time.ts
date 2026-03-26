/**
 * context.time Capability
 *
 * Returns current date, time, and timezone. Zero cost.
 */

import { z } from 'zod'
import { getTodayDate, getDayNameForDate } from '@inkdown/shared/secretary'
import type { Capability, CapabilityContext } from '../types'

const inputSchema = z.object({})

async function execute(_input: unknown, context: CapabilityContext): Promise<string> {
  const tz = context.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
  const today = getTodayDate(tz)
  const dayName = getDayNameForDate(today)

  const now = new Date()
  const localTime = now.toLocaleTimeString('en-US', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  return `Current date: ${today} (${dayName}). Timezone: ${tz}. Local time: ${localTime}.`
}

export const contextTime: Capability = {
  name: 'context.time',
  description: 'Get the current date, time, day of the week, and timezone.',
  inputSchema,
  execute,
}
