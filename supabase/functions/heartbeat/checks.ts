/**
 * Heartbeat Cheap Checks
 *
 * Deterministic checks that run before any LLM call.
 * Pure date math and DB reads — zero AI cost.
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export interface HeartbeatUser {
  user_id: string
  config: {
    timezone?: string
    morning_hour?: number
    evening_hour?: number
  }
  last_morning_at: string | null
  last_evening_at: string | null
  last_weekly_at: string | null
}

export type HeartbeatAction = 'morning' | 'evening' | 'weekly' | 'archive' | 'process_inbox' | 'sync_integrations' | 'plan_schedule' | 'idle'

export interface CheckResult {
  action: HeartbeatAction
  reason: string
}

/**
 * Get current hour in user's timezone
 */
function getUserHour(timezone: string): number {
  try {
    const now = new Date()
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    })
    return parseInt(formatter.format(now), 10)
  } catch {
    // Fallback to UTC
    return new Date().getUTCHours()
  }
}

/**
 * Get today's date string in user's timezone
 */
function getUserDate(timezone: string): string {
  try {
    const now = new Date()
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone })
    return formatter.format(now)
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

/**
 * Check if a timestamp is from today in the user's timezone
 */
function isToday(timestamp: string | null, timezone: string): boolean {
  if (!timestamp) return false
  try {
    const date = new Date(timestamp)
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone })
    return formatter.format(date) === getUserDate(timezone)
  } catch {
    return false
  }
}

/**
 * Check if a timestamp is from this week (Mon-Sun) in the user's timezone
 */
function isThisWeek(timestamp: string | null, timezone: string): boolean {
  if (!timestamp) return false
  try {
    const date = new Date(timestamp)
    const now = new Date()
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone })
    const dateStr = formatter.format(date)
    const nowStr = formatter.format(now)

    const d = new Date(dateStr)
    const n = new Date(nowStr)
    const dayOfWeek = n.getDay() || 7 // Convert Sunday=0 to 7
    const weekStart = new Date(n)
    weekStart.setDate(n.getDate() - dayOfWeek + 1)

    return d >= weekStart && d <= n
  } catch {
    return false
  }
}

/**
 * Run cheap-first checks to determine what action (if any) to take.
 * Returns the highest-priority action needed.
 */
export function determineAction(user: HeartbeatUser): CheckResult {
  const timezone = user.config.timezone || 'UTC'
  const morningHour = user.config.morning_hour ?? 8
  const eveningHour = user.config.evening_hour ?? 21
  const currentHour = getUserHour(timezone)

  // Check 1: Is it morning window? (morning_hour to morning_hour + 2)
  if (currentHour >= morningHour && currentHour < morningHour + 2) {
    if (!isToday(user.last_morning_at, timezone)) {
      return { action: 'morning', reason: 'Morning window, no morning routine run today' }
    }
  }

  // Check 2: Is it evening window? (evening_hour to evening_hour + 2)
  if (currentHour >= eveningHour && currentHour < eveningHour + 2) {
    if (!isToday(user.last_evening_at, timezone)) {
      return { action: 'evening', reason: 'Evening window, no evening reflection run today' }
    }
  }

  // Check 3: Is it evening window? Process inbox if it has content
  if (currentHour >= eveningHour && currentHour < eveningHour + 2) {
    // Inbox processing is checked separately from evening reflection
    // It runs as a distinct action so both can fire in the same window
  }

  // Check 4: Is it Sunday or Monday morning? (weekly review)
  const dayOfWeek = new Date().getDay()
  if ((dayOfWeek === 0 || dayOfWeek === 1) && currentHour >= morningHour) {
    if (!isThisWeek(user.last_weekly_at, timezone)) {
      return { action: 'weekly', reason: 'Weekly review window, no review this week' }
    }
  }

  // Check 5: Morning sync integrations (runs after morning routine)
  if (currentHour >= morningHour && currentHour < morningHour + 2) {
    // sync_integrations is handled separately via checkIntegrations()
  }

  return { action: 'idle', reason: 'No action needed' }
}

/**
 * Check if Today.md is stale (archive check — no LLM needed)
 */
export async function checkStaleTodayMd(
  supabase: SupabaseClient,
  userId: string,
  timezone: string
): Promise<boolean> {
  const { data } = await supabase
    .from('secretary_memory')
    .select('content')
    .eq('user_id', userId)
    .eq('filename', 'Today.md')
    .single()

  if (!data?.content) return false

  const dateMatch = data.content.match(/(\d{4}-\d{2}-\d{2})/)
  if (!dateMatch) return false

  const todayDate = getUserDate(timezone)
  return dateMatch[1] !== todayDate
}

/**
 * Check if user has unprocessed inbox captures
 */
export async function checkInbox(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('secretary_memory')
    .select('content')
    .eq('user_id', userId)
    .eq('filename', 'Inbox.md')
    .single()

  if (!data?.content?.trim()) return false
  return data.content.includes('- [')
}

/**
 * Check if user has active integrations that need syncing
 */
export async function checkIntegrations(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('user_integrations')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1)

  return (data?.length ?? 0) > 0
}

/**
 * Fetch all users with heartbeat enabled and due for action
 */
/**
 * Check if any plan schedules are due for execution
 */
export interface DuePlanSchedule {
  id: string
  plan_id: string
  title: string
  instructions: string | null
  workflow: string
  frequency: string
  time: string
  days: string[] | null
}

export async function checkPlanSchedules(
  supabase: SupabaseClient,
  userId: string
): Promise<DuePlanSchedule[]> {
  const now = new Date().toISOString()
  const { data } = await supabase
    .from('plan_schedules')
    .select('id, plan_id, title, instructions, workflow, frequency, time, days')
    .eq('user_id', userId)
    .eq('enabled', true)
    .or(`next_run_at.is.null,next_run_at.lte.${now}`)
    .limit(5)

  return (data ?? []) as DuePlanSchedule[]
}

export async function fetchDueUsers(
  supabase: SupabaseClient,
  batchSize = 50
): Promise<HeartbeatUser[]> {
  const { data, error } = await supabase
    .from('agent_heartbeat_state')
    .select('user_id, config, last_morning_at, last_evening_at, last_weekly_at')
    .eq('enabled', true)
    .order('updated_at', { ascending: true })
    .limit(batchSize)

  if (error) {
    console.error('heartbeat.fetchDueUsers.error', error.message)
    return []
  }

  return (data ?? []) as HeartbeatUser[]
}
