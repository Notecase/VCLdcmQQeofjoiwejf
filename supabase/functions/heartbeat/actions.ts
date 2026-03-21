/**
 * Heartbeat Actions
 *
 * Executes morning/evening/weekly routines when triggered by cheap checks.
 * Uses the user's BYOK API key to call the LLM.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { HeartbeatAction, DuePlanSchedule } from './checks.ts'

interface ActionResult {
  success: boolean
  tokens_used: number
  cost_usd: number
  duration_ms: number
  error_message?: string
}

/**
 * Get user's API key for their preferred provider
 */
async function getUserApiKey(
  supabase: SupabaseClient,
  userId: string
): Promise<{ provider: string; model: string; apiKey: string } | null> {
  // Get preferences
  const { data: prefs } = await supabase
    .from('user_ai_preferences')
    .select('preferred_provider, preferred_model, fallback_provider')
    .eq('user_id', userId)
    .single()

  const provider = prefs?.preferred_provider ?? 'google'
  const model = prefs?.preferred_model ?? 'gemini-3.1-pro-preview'
  const fallback = prefs?.fallback_provider

  // Try primary key
  const { data: key } = await supabase
    .from('user_api_keys')
    .select('encrypted_key, is_valid')
    .eq('user_id', userId)
    .eq('provider', provider)
    .eq('is_valid', true)
    .single()

  if (key?.encrypted_key) {
    return { provider, model, apiKey: key.encrypted_key }
  }

  // Try fallback
  if (fallback) {
    const { data: fallbackKey } = await supabase
      .from('user_api_keys')
      .select('encrypted_key, is_valid')
      .eq('user_id', userId)
      .eq('provider', fallback)
      .eq('is_valid', true)
      .single()

    if (fallbackKey?.encrypted_key) {
      return { provider: fallback, model, apiKey: fallbackKey.encrypted_key }
    }
  }

  return null
}

/**
 * Check daily spending against user's cap
 */
async function checkDailyCap(
  supabase: SupabaseClient,
  userId: string
): Promise<{ allowed: boolean; spent: number; cap: number }> {
  const today = new Date().toISOString().slice(0, 10)

  const { data: prefs } = await supabase
    .from('user_ai_preferences')
    .select('max_daily_cost_usd')
    .eq('user_id', userId)
    .single()

  const cap = prefs?.max_daily_cost_usd ?? 0.5

  const { data: logs } = await supabase
    .from('agent_heartbeat_log')
    .select('cost_usd')
    .eq('user_id', userId)
    .gte('created_at', `${today}T00:00:00Z`)

  const spent = (logs ?? []).reduce(
    (sum: number, l: { cost_usd: number }) => sum + (l.cost_usd || 0),
    0
  )

  return { allowed: spent < cap, spent, cap }
}

/**
 * Archive a stale Today.md to History/ (no LLM needed)
 */
export async function archiveStaleTodayMd(
  supabase: SupabaseClient,
  userId: string
): Promise<ActionResult> {
  const start = Date.now()

  try {
    const { data: today } = await supabase
      .from('secretary_memory')
      .select('content')
      .eq('user_id', userId)
      .eq('filename', 'Today.md')
      .single()

    if (!today?.content) {
      return { success: true, tokens_used: 0, cost_usd: 0, duration_ms: Date.now() - start }
    }

    // Extract date from header
    const dateMatch = today.content.match(/(\d{4}-\d{2}-\d{2})/)
    if (!dateMatch) {
      return { success: true, tokens_used: 0, cost_usd: 0, duration_ms: Date.now() - start }
    }

    const archiveFilename = `History/${dateMatch[1]}.md`

    // Archive
    await supabase.from('secretary_memory').upsert(
      {
        user_id: userId,
        filename: archiveFilename,
        content: today.content,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,filename' }
    )

    // Carry over incomplete tasks to Tomorrow.md
    const taskPattern = /^- \[[ >]\] .+$/gm
    const incomplete = today.content.match(taskPattern)

    if (incomplete && incomplete.length > 0) {
      const { data: tomorrow } = await supabase
        .from('secretary_memory')
        .select('content')
        .eq('user_id', userId)
        .eq('filename', 'Tomorrow.md')
        .single()

      const tomorrowContent = tomorrow?.content ?? ''
      const carryoverSection = `\n\n## Carried Over\n${incomplete.join('\n')}\n`

      await supabase.from('secretary_memory').upsert(
        {
          user_id: userId,
          filename: 'Tomorrow.md',
          content: tomorrowContent + carryoverSection,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,filename' }
      )
    }

    return { success: true, tokens_used: 0, cost_usd: 0, duration_ms: Date.now() - start }
  } catch (e) {
    return {
      success: false,
      tokens_used: 0,
      cost_usd: 0,
      duration_ms: Date.now() - start,
      error_message: (e as Error).message,
    }
  }
}

/**
 * Process inbox captures: call LLM to categorize items and merge into Tomorrow.md
 */
export async function processInbox(
  supabase: SupabaseClient,
  userId: string
): Promise<ActionResult> {
  const start = Date.now()

  try {
    // Check daily spending cap
    const { allowed, spent, cap } = await checkDailyCap(supabase, userId)
    if (!allowed) {
      return {
        success: false,
        tokens_used: 0,
        cost_usd: 0,
        duration_ms: Date.now() - start,
        error_message: `Daily cap reached: $${spent.toFixed(4)}/$${cap.toFixed(2)}`,
      }
    }

    // Get API key
    const credentials = await getUserApiKey(supabase, userId)
    if (!credentials) {
      return {
        success: false,
        tokens_used: 0,
        cost_usd: 0,
        duration_ms: Date.now() - start,
        error_message: 'No valid API key found',
      }
    }

    // Read memory files
    const fileNames = ['Inbox.md', 'Tomorrow.md', 'Plan.md', 'AI.md', 'Recurring.md']
    const fileMap = new Map<string, string>()
    for (const filename of fileNames) {
      const { data } = await supabase
        .from('secretary_memory')
        .select('content')
        .eq('user_id', userId)
        .eq('filename', filename)
        .single()
      fileMap.set(filename, data?.content || '')
    }

    const inboxContent = fileMap.get('Inbox.md') || ''
    if (!inboxContent.trim() || !inboxContent.includes('- [')) {
      return { success: true, tokens_used: 0, cost_usd: 0, duration_ms: Date.now() - start }
    }

    const tomorrowContent = fileMap.get('Tomorrow.md') || ''
    const aiContent = fileMap.get('AI.md') || ''
    const planContent = fileMap.get('Plan.md') || ''
    const recurringContent = fileMap.get('Recurring.md') || ''

    // Count inbox items for logging
    const inboxLines = inboxContent.split('\n').filter((l: string) => l.startsWith('- ['))
    const inboxCount = inboxLines.length

    // Call LLM to process inbox
    const prompt = `You are a planning assistant. The user captured these items throughout the day:

${inboxContent}

Current tomorrow plan:
${tomorrowContent || '*Empty — no plan yet*'}

User preferences:
${aiContent || '*No preferences set*'}

Active plans (summary):
${planContent.slice(0, 500) || '*No active plans*'}

Recurring blocks:
${recurringContent || '*None*'}

Task: Categorize each inbox item. For items that are tasks, assign appropriate time slots in tomorrow's plan. Respect existing meetings and recurring blocks. For items that are notes/reminders (not actionable tasks), add them to a "Notes" section at the bottom.

Output the COMPLETE updated Tomorrow.md content. Use the format:
# Tomorrow's Plan — YYYY-MM-DD

## Schedule
- [ ] HH:MM (Xmin) Task description [source: notes]

## Notes
- Any non-actionable items`

    // Use Google Gemini API (most common BYOK provider)
    let apiUrl: string
    let headers: Record<string, string>
    let body: string

    if (credentials.provider === 'google') {
      apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${credentials.model}:generateContent?key=${credentials.apiKey}`
      headers = { 'Content-Type': 'application/json' }
      body = JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 2000 },
      })
    } else if (credentials.provider === 'openai') {
      apiUrl = 'https://api.openai.com/v1/chat/completions'
      headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${credentials.apiKey}`,
      }
      body = JSON.stringify({
        model: credentials.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 2000,
      })
    } else {
      apiUrl = 'https://api.anthropic.com/v1/messages'
      headers = {
        'Content-Type': 'application/json',
        'x-api-key': credentials.apiKey,
        'anthropic-version': '2023-06-01',
      }
      body = JSON.stringify({
        model: credentials.model,
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      })
    }

    const llmRes = await fetch(apiUrl, { method: 'POST', headers, body })
    if (!llmRes.ok) {
      const errText = await llmRes.text()
      return {
        success: false,
        tokens_used: 0,
        cost_usd: 0,
        duration_ms: Date.now() - start,
        error_message: `LLM call failed: ${llmRes.status} ${errText.slice(0, 200)}`,
      }
    }

    const llmData = await llmRes.json()
    let updatedTomorrow: string

    if (credentials.provider === 'google') {
      updatedTomorrow = llmData?.candidates?.[0]?.content?.parts?.[0]?.text || ''
    } else if (credentials.provider === 'openai') {
      updatedTomorrow = llmData?.choices?.[0]?.message?.content || ''
    } else {
      updatedTomorrow = llmData?.content?.[0]?.text || ''
    }

    if (!updatedTomorrow.trim()) {
      return {
        success: false,
        tokens_used: 0,
        cost_usd: 0,
        duration_ms: Date.now() - start,
        error_message: 'LLM returned empty response',
      }
    }

    // Estimate tokens used (rough: 1 token ≈ 4 chars)
    const tokensUsed = Math.ceil((prompt.length + updatedTomorrow.length) / 4)
    const costUsd = tokensUsed * 0.000002 // rough estimate

    // Write updated Tomorrow.md
    await supabase.from('secretary_memory').upsert(
      {
        user_id: userId,
        filename: 'Tomorrow.md',
        content: updatedTomorrow,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,filename' }
    )

    // Clear Inbox.md
    await supabase.from('secretary_memory').upsert(
      {
        user_id: userId,
        filename: 'Inbox.md',
        content: '# Inbox\n\n',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,filename' }
    )

    // Write context entry
    await supabase.from('user_context_entries').insert({
      user_id: userId,
      agent: 'heartbeat',
      type: 'active_plan',
      summary: `Processed ${inboxCount} inbox items into tomorrow's plan`,
      payload: { action: 'process_inbox', inboxCount, provider: credentials.provider },
    })

    return {
      success: true,
      tokens_used: tokensUsed,
      cost_usd: costUsd,
      duration_ms: Date.now() - start,
    }
  } catch (e) {
    return {
      success: false,
      tokens_used: 0,
      cost_usd: 0,
      duration_ms: Date.now() - start,
      error_message: (e as Error).message,
    }
  }
}

/**
 * Sync external integrations (Google Calendar, Notion) into memory files
 */
export async function syncIntegrations(
  supabase: SupabaseClient,
  userId: string
): Promise<ActionResult> {
  const start = Date.now()

  try {
    const { data: integrations } = await supabase
      .from('user_integrations')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')

    if (!integrations || integrations.length === 0) {
      return { success: true, tokens_used: 0, cost_usd: 0, duration_ms: Date.now() - start }
    }

    for (const integration of integrations) {
      if (integration.provider === 'gcal') {
        await syncGoogleCalendar(supabase, userId, integration)
      }
      // Notion sync can be added here in Phase 3
    }

    return { success: true, tokens_used: 0, cost_usd: 0, duration_ms: Date.now() - start }
  } catch (e) {
    return {
      success: false,
      tokens_used: 0,
      cost_usd: 0,
      duration_ms: Date.now() - start,
      error_message: (e as Error).message,
    }
  }
}

/**
 * Sync Google Calendar events into Calendar.md
 */
async function syncGoogleCalendar(
  supabase: SupabaseClient,
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  integration: any
): Promise<void> {
  const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

  // Refresh token if expired
  let accessToken = integration.access_token
  if (
    integration.token_expires_at &&
    new Date(integration.token_expires_at) < new Date(Date.now() + 5 * 60 * 1000)
  ) {
    if (!integration.refresh_token) {
      await supabase
        .from('user_integrations')
        .update({
          status: 'error',
          sync_error: 'Refresh token missing',
          updated_at: new Date().toISOString(),
        })
        .eq('id', integration.id)
      return
    }

    // Get Google credentials from env (Deno edge function)
    const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')
    if (!clientId || !clientSecret) {
      await supabase
        .from('user_integrations')
        .update({
          sync_error: 'Google credentials not configured',
          updated_at: new Date().toISOString(),
        })
        .eq('id', integration.id)
      return
    }

    const refreshRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: integration.refresh_token,
        grant_type: 'refresh_token',
      }),
    })

    if (!refreshRes.ok) {
      await supabase
        .from('user_integrations')
        .update({
          status: 'error',
          sync_error: 'Token refresh failed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', integration.id)
      return
    }

    const refreshData = await refreshRes.json()
    accessToken = refreshData.access_token
    const newExpiry = new Date(Date.now() + refreshData.expires_in * 1000).toISOString()

    await supabase
      .from('user_integrations')
      .update({
        access_token: accessToken,
        token_expires_at: newExpiry,
        updated_at: new Date().toISOString(),
      })
      .eq('id', integration.id)
  }

  // Fetch events for today and tomorrow
  const now = new Date()
  const timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const timeMax = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2).toISOString()
  const calendarId = integration.config?.calendarId || 'primary'

  const eventsUrl =
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?` +
    new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '50',
    })

  const eventsRes = await fetch(eventsUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!eventsRes.ok) {
    const errText = await eventsRes.text()
    await supabase
      .from('user_integrations')
      .update({
        sync_error: `Events fetch failed: ${errText.slice(0, 100)}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', integration.id)
    return
  }

  const eventsData = await eventsRes.json()
  const events = (eventsData.items || []).filter(
    (e: { status?: string }) => e.status !== 'cancelled'
  )

  const todayStr = now.toISOString().slice(0, 10)
  const tomorrowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const tomorrowStr = tomorrowDate.toISOString().slice(0, 10)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const formatEvent = (e: any): string => {
    const startTime = e.start?.dateTime
      ? new Date(e.start.dateTime).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
      : 'All day'
    const endTime = e.end?.dateTime
      ? new Date(e.end.dateTime).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
      : ''
    const time = endTime ? `${startTime}-${endTime}` : startTime
    const location = e.location ? ` @ ${e.location}` : ''
    return `- ${time} — ${e.summary || 'Untitled'}${location}`
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const todayEvents = events.filter((e: any) => {
    const date = e.start?.dateTime?.slice(0, 10) || e.start?.date
    return date === todayStr
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tomorrowEvents = events.filter((e: any) => {
    const date = e.start?.dateTime?.slice(0, 10) || e.start?.date
    return date === tomorrowStr
  })

  let calendarMd = `# Calendar\n\n*Last synced: ${new Date().toISOString()}*\n\n`
  calendarMd += `## Today (${todayStr})\n\n`
  calendarMd +=
    todayEvents.length > 0 ? todayEvents.map(formatEvent).join('\n') + '\n' : '*No events*\n'
  calendarMd += `\n## Tomorrow (${tomorrowStr})\n\n`
  calendarMd +=
    tomorrowEvents.length > 0 ? tomorrowEvents.map(formatEvent).join('\n') + '\n' : '*No events*\n'

  // Write Calendar.md
  await supabase.from('secretary_memory').upsert(
    {
      user_id: userId,
      filename: 'Calendar.md',
      content: calendarMd,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,filename' }
  )

  // Update sync timestamp
  await supabase
    .from('user_integrations')
    .update({
      last_sync_at: new Date().toISOString(),
      sync_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', integration.id)
}

/**
 * Execute a plan schedule: create a mission for the scheduled workflow.
 * Reads Plan.md and the plan instructions to build the mission goal.
 */
export async function executePlanSchedule(
  supabase: SupabaseClient,
  userId: string,
  schedule: DuePlanSchedule
): Promise<ActionResult> {
  const start = Date.now()

  try {
    // Read Plan.md to get plan metadata
    const { data: planMd } = await supabase
      .from('secretary_memory')
      .select('content')
      .eq('user_id', userId)
      .eq('filename', 'Plan.md')
      .single()

    // Read plan instructions
    const { data: instrFile } = await supabase
      .from('secretary_memory')
      .select('content')
      .eq('user_id', userId)
      .eq('filename', `Plans/${schedule.plan_id.toLowerCase()}-instructions.md`)
      .single()

    const planContent = planMd?.content || ''
    const instructions = instrFile?.content || ''

    // Extract plan name and current topic from Plan.md
    const planIdPattern = new RegExp(`\\[${schedule.plan_id}\\]\\s*(.+?)(?:\\n|$)`)
    const planMatch = planContent.match(planIdPattern)
    const planName = planMatch?.[1]?.trim() || schedule.plan_id

    // Build goal
    let goal = `${schedule.title} for plan "${planName}".`
    if (schedule.instructions) {
      goal += `\n\nSchedule-specific instructions:\n${schedule.instructions}`
    }
    if (instructions) {
      goal += `\n\nPlan instructions:\n${instructions}`
    }

    // Create a mission via the missions table
    const { data: mission, error: missionError } = await supabase
      .from('missions')
      .insert({
        user_id: userId,
        goal,
        workflow_key: schedule.workflow,
        trigger_source: 'heartbeat',
        status: 'pending',
        constraints: {
          sourcePlanId: schedule.plan_id,
          sourcePlanTitle: planName,
          scheduleId: schedule.id,
        },
      })
      .select('id')
      .single()

    if (missionError) {
      return {
        success: false,
        tokens_used: 0,
        cost_usd: 0,
        duration_ms: Date.now() - start,
        error_message: `Failed to create mission: ${missionError.message}`,
      }
    }

    // Compute next_run_at
    const nextRunAt = computeNextRunAt(schedule.frequency, schedule.time, schedule.days)

    // Update schedule state
    await supabase
      .from('plan_schedules')
      .update({
        last_run_at: new Date().toISOString(),
        next_run_at: nextRunAt,
        run_count: (schedule as unknown as { run_count?: number }).run_count
          ? (schedule as unknown as { run_count: number }).run_count + 1
          : 1,
        last_run_status: 'success',
        last_run_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', schedule.id)

    // Write context entry
    await supabase.from('user_context_entries').insert({
      user_id: userId,
      agent: 'heartbeat',
      type: 'active_plan',
      summary: `Plan schedule "${schedule.title}" executed → mission ${mission.id}`,
      payload: {
        action: 'plan_schedule',
        scheduleId: schedule.id,
        missionId: mission.id,
        workflow: schedule.workflow,
      },
    })

    return { success: true, tokens_used: 0, cost_usd: 0, duration_ms: Date.now() - start }
  } catch (e) {
    // Mark schedule as errored
    await supabase
      .from('plan_schedules')
      .update({
        last_run_status: 'error',
        last_run_error: (e as Error).message,
        updated_at: new Date().toISOString(),
      })
      .eq('id', schedule.id)

    return {
      success: false,
      tokens_used: 0,
      cost_usd: 0,
      duration_ms: Date.now() - start,
      error_message: (e as Error).message,
    }
  }
}

/**
 * Compute the next run time for a schedule
 */
function computeNextRunAt(frequency: string, time: string, days: string[] | null): string {
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
      // Next week's first matching day
      const diff = 7 - currentDay + targetDays[0]
      next.setDate(now.getDate() + diff)
    }
  } else {
    // Default: tomorrow
    if (next <= now) next.setDate(next.getDate() + 1)
  }

  return next.toISOString()
}

/**
 * Execute a heartbeat action for a user.
 * Currently logs the intent; full LLM integration requires the provider SDK
 * to be available in the Deno edge function environment.
 */
export async function executeAction(
  supabase: SupabaseClient,
  userId: string,
  action: HeartbeatAction
): Promise<ActionResult> {
  const start = Date.now()

  // Check daily spending cap
  const { allowed, spent, cap } = await checkDailyCap(supabase, userId)
  if (!allowed) {
    return {
      success: false,
      tokens_used: 0,
      cost_usd: 0,
      duration_ms: Date.now() - start,
      error_message: `Daily cap reached: $${spent.toFixed(4)}/$${cap.toFixed(2)}`,
    }
  }

  // Get API key
  const credentials = await getUserApiKey(supabase, userId)
  if (!credentials) {
    return {
      success: false,
      tokens_used: 0,
      cost_usd: 0,
      duration_ms: Date.now() - start,
      error_message: 'No valid API key found for preferred provider',
    }
  }

  try {
    // For now, perform the deterministic parts and log.
    // Full LLM-powered routines will be added in Phase 2C.
    switch (action) {
      case 'morning': {
        // Phase 2C: Call LLM with morning routine prompt + user's memory state
        // For now, write a notification to context bus
        await supabase.from('user_context_entries').insert({
          user_id: userId,
          agent: 'heartbeat',
          type: 'active_plan',
          summary: `Morning routine triggered (provider: ${credentials.provider}). Full automation coming in Phase 2C.`,
          payload: { action: 'morning', provider: credentials.provider },
        })
        break
      }

      case 'evening': {
        await supabase.from('user_context_entries').insert({
          user_id: userId,
          agent: 'heartbeat',
          type: 'active_plan',
          summary: `Evening reflection triggered (provider: ${credentials.provider}). Full automation coming in Phase 2C.`,
          payload: { action: 'evening', provider: credentials.provider },
        })
        break
      }

      case 'weekly': {
        await supabase.from('user_context_entries').insert({
          user_id: userId,
          agent: 'heartbeat',
          type: 'active_plan',
          summary: `Weekly review triggered (provider: ${credentials.provider}). Full automation coming in Phase 2C.`,
          payload: { action: 'weekly', provider: credentials.provider },
        })
        break
      }

      case 'archive': {
        return await archiveStaleTodayMd(supabase, userId)
      }

      case 'process_inbox': {
        return await processInbox(supabase, userId)
      }

      case 'sync_integrations': {
        return await syncIntegrations(supabase, userId)
      }
    }

    return { success: true, tokens_used: 0, cost_usd: 0, duration_ms: Date.now() - start }
  } catch (e) {
    return {
      success: false,
      tokens_used: 0,
      cost_usd: 0,
      duration_ms: Date.now() - start,
      error_message: (e as Error).message,
    }
  }
}
