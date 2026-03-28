/**
 * Convert a calendar span + study schedule into a lesson count.
 * e.g., 60 calendar days with ['Mon'] → ~9 lessons
 */
export function computeLessonCount(calendarDays: number, studyDays: string[]): number {
  if (studyDays.includes('Daily') || studyDays.length >= 7) return calendarDays
  const weeks = calendarDays / 7
  return Math.max(1, Math.round(weeks * studyDays.length))
}

/**
 * Convert a lesson count + study schedule into a calendar span in days.
 * e.g., 9 lessons with ['Mon'] → 63 calendar days (9 weeks)
 */
export function computeCalendarSpan(totalLessons: number, studyDays: string[]): number {
  if (studyDays.includes('Daily') || studyDays.length >= 7) return totalLessons
  return Math.max(1, Math.ceil(totalLessons / studyDays.length) * 7)
}

/**
 * Compute the next run time for a plan schedule.
 * Extracted from supabase/functions/heartbeat/actions.ts for reuse by the API cron endpoint.
 */
export function computeNextRunAt(frequency: string, time: string, days: string[] | null): string {
  const [hours, minutes] = time.split(':').map(Number)
  const now = new Date()
  const next = new Date(now)
  next.setHours(hours, minutes, 0, 0)

  if (frequency === 'daily') {
    if (next <= now) next.setDate(next.getDate() + 1)
  } else if (frequency === 'weekly' && days && days.length > 0) {
    const dayMap: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    }
    const targetDays = days.map((d) => dayMap[d] ?? 0).sort()
    const currentDay = now.getDay()
    let found = false
    for (const d of targetDays) {
      if (d > currentDay || (d === currentDay && next > now)) {
        next.setDate(now.getDate() + (d - currentDay))
        found = true
        break
      }
    }
    if (!found) {
      const diff = 7 - currentDay + targetDays[0]
      next.setDate(now.getDate() + diff)
    }
  } else {
    if (next <= now) next.setDate(next.getDate() + 1)
  }

  return next.toISOString()
}
