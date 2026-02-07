/**
 * Timezone-aware date utilities for the Secretary system.
 *
 * All functions accept an optional `timezone` parameter (IANA identifier,
 * e.g. "America/New_York"). When omitted, it defaults to "America/New_York".
 *
 * Why this exists: `new Date("YYYY-MM-DD")` parses as UTC midnight, so
 * `toLocaleDateString()` in EST (UTC-5) shows the PREVIOUS day after ~7pm.
 * Every function here avoids that pitfall.
 */

const DEFAULT_TIMEZONE = 'America/New_York'

/**
 * Parse a "YYYY-MM-DD" string as LOCAL midnight (no UTC shift).
 * `new Date("2026-02-07")` gives UTC midnight → wrong day in negative-offset
 * timezones. This constructs via `new Date(y, m-1, d)` which is always local.
 */
export function parseDateString(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/**
 * Format a Date as "YYYY-MM-DD" in the given timezone.
 * Uses `en-CA` locale which natively produces "YYYY-MM-DD".
 */
export function formatDateLocal(date: Date, timezone: string = DEFAULT_TIMEZONE): string {
  return date.toLocaleDateString('en-CA', { timeZone: timezone })
}

/**
 * Today's date as "YYYY-MM-DD" in the user's timezone.
 */
export function getTodayDate(timezone: string = DEFAULT_TIMEZONE): string {
  return formatDateLocal(new Date(), timezone)
}

/**
 * Tomorrow's date as "YYYY-MM-DD" in the user's timezone.
 */
export function getTomorrowDate(timezone: string = DEFAULT_TIMEZONE): string {
  const today = parseDateString(getTodayDate(timezone))
  today.setDate(today.getDate() + 1)
  return formatDateLocal(today, timezone)
}

/**
 * Current day-of-week name (e.g. "Friday") in the user's timezone.
 */
export function getDayOfWeek(timezone: string = DEFAULT_TIMEZONE): string {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', timeZone: timezone })
}

/**
 * Day-of-week name for a "YYYY-MM-DD" string (e.g. "Saturday").
 * Parses locally to avoid UTC date shift.
 */
export function getDayNameForDate(dateStr: string): string {
  const d = parseDateString(dateStr)
  return d.toLocaleDateString('en-US', { weekday: 'long' })
}

/**
 * Full heading for a date: "Saturday, February 7, 2026".
 * Parses locally to avoid UTC date shift.
 */
export function formatDateHeading(dateStr: string): string {
  const d = parseDateString(dateStr)
  const dayName = d.toLocaleDateString('en-US', { weekday: 'long' })
  const rest = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  return `${dayName}, ${rest}`
}

/**
 * Add N days to a "YYYY-MM-DD" string, return "YYYY-MM-DD".
 * Uses local parse to avoid UTC shift.
 */
export function addDays(dateStr: string, n: number): string {
  const d = parseDateString(dateStr)
  d.setDate(d.getDate() + n)
  // Use en-CA which formats as YYYY-MM-DD natively (no timezone needed for local dates)
  return d.toLocaleDateString('en-CA')
}

/**
 * Monday of the current week as "YYYY-MM-DD" in the user's timezone.
 */
export function getCurrentWeekMonday(timezone: string = DEFAULT_TIMEZONE): string {
  const todayStr = getTodayDate(timezone)
  const today = parseDateString(todayStr)
  const dayOfWeek = today.getDay() // 0=Sun, 1=Mon, ...
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  today.setDate(today.getDate() + mondayOffset)
  return today.toLocaleDateString('en-CA')
}
