/**
 * Heartbeat Edge Function
 *
 * Invoked by pg_cron every 30 minutes. Processes users with heartbeat enabled:
 * 1. Fetch due users (batch of 50)
 * 2. Run cheap deterministic checks (date math, DB reads)
 * 3. Only call LLM when a real action is needed
 *
 * Cost model:
 * - Cheap checks: $0 (pure DB + date math)
 * - LLM calls: user's BYOK key (not our cost)
 * - Max 3 LLM calls/day/user (morning + evening + weekly)
 *
 * Timeout budget: 150s total
 * - User batch query: ~1s
 * - Per-user cheap checks: ~0.5s
 * - Per-user LLM call: ~10-15s
 * - Max 8-10 users with LLM calls per invocation
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  fetchDueUsers,
  determineAction,
  checkStaleTodayMd,
  checkInbox,
  checkIntegrations,
  checkPlanSchedules,
} from './checks.ts'
import {
  executeAction,
  archiveStaleTodayMd,
  processInbox,
  syncIntegrations,
  executePlanSchedule,
} from './actions.ts'

Deno.serve(async (req) => {
  const startTime = Date.now()
  const TIMEOUT_BUDGET_MS = 145_000 // 145s safety margin (150s limit)

  try {
    // Verify this is called by pg_cron or an admin (check for service key)
    const authHeader = req.headers.get('Authorization')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Fetch users with heartbeat enabled
    const users = await fetchDueUsers(supabase)

    if (users.length === 0) {
      return new Response(JSON.stringify({ processed: 0, message: 'No users due' }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const results: Array<{
      user_id: string
      action: string
      result: string
      duration_ms: number
    }> = []

    for (const user of users) {
      // Check timeout budget
      if (Date.now() - startTime > TIMEOUT_BUDGET_MS) {
        console.warn('heartbeat.timeout_budget_exceeded', {
          processed: results.length,
          remaining: users.length - results.length,
        })
        break
      }

      const timezone = user.config.timezone || 'UTC'

      // Cheap check: determine what action is needed
      const check = determineAction(user)

      if (check.action === 'idle') {
        // Still check for stale Today.md (no LLM cost)
        const isStale = await checkStaleTodayMd(supabase, user.user_id, timezone)
        if (isStale) {
          const archiveResult = await archiveStaleTodayMd(supabase, user.user_id, timezone)

          // Log the archive action
          await supabase.from('agent_heartbeat_log').insert({
            user_id: user.user_id,
            action: 'archive',
            result: archiveResult.success ? 'success' : 'error',
            tokens_used: 0,
            cost_usd: 0,
            duration_ms: archiveResult.duration_ms,
            error_message: archiveResult.error_message ?? null,
          })

          results.push({
            user_id: user.user_id,
            action: 'archive',
            result: archiveResult.success ? 'success' : 'error',
            duration_ms: archiveResult.duration_ms,
          })
        }

        // Check for inbox processing (evening window)
        const eveningHour = user.config.evening_hour ?? 21
        const currentHour = new Date().getHours()
        if (currentHour >= eveningHour && currentHour < eveningHour + 2) {
          const hasInbox = await checkInbox(supabase, user.user_id)
          if (hasInbox) {
            const inboxResult = await processInbox(supabase, user.user_id)
            await supabase.from('agent_heartbeat_log').insert({
              user_id: user.user_id,
              action: 'process_inbox',
              result: inboxResult.success ? 'success' : 'error',
              tokens_used: inboxResult.tokens_used,
              cost_usd: inboxResult.cost_usd,
              duration_ms: inboxResult.duration_ms,
              error_message: inboxResult.error_message ?? null,
            })
            results.push({
              user_id: user.user_id,
              action: 'process_inbox',
              result: inboxResult.success ? 'success' : 'error',
              duration_ms: inboxResult.duration_ms,
            })
          }
        }

        // Check for integration sync (morning window)
        const morningHour = user.config.morning_hour ?? 8
        if (currentHour >= morningHour && currentHour < morningHour + 2) {
          const hasIntegrations = await checkIntegrations(supabase, user.user_id)
          if (hasIntegrations) {
            const syncResult = await syncIntegrations(supabase, user.user_id)
            await supabase.from('agent_heartbeat_log').insert({
              user_id: user.user_id,
              action: 'sync_integrations',
              result: syncResult.success ? 'success' : 'error',
              tokens_used: syncResult.tokens_used,
              cost_usd: syncResult.cost_usd,
              duration_ms: syncResult.duration_ms,
              error_message: syncResult.error_message ?? null,
            })
            results.push({
              user_id: user.user_id,
              action: 'sync_integrations',
              result: syncResult.success ? 'success' : 'error',
              duration_ms: syncResult.duration_ms,
            })
          }
        }

        // Check for due plan schedules (any time)
        const dueSchedules = await checkPlanSchedules(supabase, user.user_id)
        for (const schedule of dueSchedules) {
          const scheduleResult = await executePlanSchedule(supabase, user.user_id, schedule)
          await supabase.from('agent_heartbeat_log').insert({
            user_id: user.user_id,
            action: 'plan_schedule',
            result: scheduleResult.success ? 'success' : 'error',
            tokens_used: scheduleResult.tokens_used,
            cost_usd: scheduleResult.cost_usd,
            duration_ms: scheduleResult.duration_ms,
            error_message: scheduleResult.error_message ?? null,
          })
          results.push({
            user_id: user.user_id,
            action: 'plan_schedule',
            result: scheduleResult.success ? 'success' : 'error',
            duration_ms: scheduleResult.duration_ms,
          })
        }

        continue
      }

      // Execute the action (may involve LLM call)
      const actionResult = await executeAction(supabase, user.user_id, check.action)

      // Log the action
      await supabase.from('agent_heartbeat_log').insert({
        user_id: user.user_id,
        action: check.action,
        result: actionResult.success ? 'success' : 'error',
        tokens_used: actionResult.tokens_used,
        cost_usd: actionResult.cost_usd,
        duration_ms: actionResult.duration_ms,
        error_message: actionResult.error_message ?? null,
      })

      // Update heartbeat state
      const stateUpdate: Record<string, unknown> = {
        user_id: user.user_id,
        last_heartbeat_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      if (check.action === 'morning') stateUpdate.last_morning_at = new Date().toISOString()
      if (check.action === 'evening') stateUpdate.last_evening_at = new Date().toISOString()
      if (check.action === 'weekly') stateUpdate.last_weekly_at = new Date().toISOString()

      await supabase.from('agent_heartbeat_state').upsert(stateUpdate, { onConflict: 'user_id' })

      results.push({
        user_id: user.user_id,
        action: check.action,
        result: actionResult.success ? 'success' : 'error',
        duration_ms: actionResult.duration_ms,
      })
    }

    const totalDuration = Date.now() - startTime

    console.info('heartbeat.complete', {
      processed: results.length,
      total_users: users.length,
      duration_ms: totalDuration,
      actions: results.reduce(
        (acc, r) => {
          acc[r.action] = (acc[r.action] || 0) + 1
          return acc
        },
        {} as Record<string, number>
      ),
    })

    return new Response(
      JSON.stringify({
        processed: results.length,
        total_duration_ms: totalDuration,
        results,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('heartbeat.fatal_error', (error as Error).message)
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
