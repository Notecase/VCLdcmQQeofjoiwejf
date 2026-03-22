/**
 * Usage Persister
 *
 * Bridges TokenTracker → Supabase DB.
 * On every token usage event:
 * 1. INSERTs into ai_usage table
 * 2. Calls deduct_credits() RPC if userId present and costCents > 0
 *
 * Fire-and-forget: never blocks the stream on DB writes.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { tokenTracker } from './token-tracker'
import type { TokenUsageEvent } from './token-tracker'

/**
 * Initialize the usage persister.
 * Call once at API startup with a service-role Supabase client.
 */
export function initUsagePersister(supabase: SupabaseClient): void {
  tokenTracker.onRecord = (event: TokenUsageEvent) => {
    persistUsage(supabase, event).catch((err) => {
      console.error('[UsagePersister] Failed to persist usage:', err)
    })
  }

  console.log('[UsagePersister] Initialized — ai_usage writes enabled')
}

async function persistUsage(supabase: SupabaseClient, event: TokenUsageEvent): Promise<void> {
  // Skip events with no tokens (e.g. failed calls)
  if (event.inputTokens === 0 && event.outputTokens === 0) return

  // 1. Insert into ai_usage
  const { data: usageRow, error: usageError } = await supabase
    .from('ai_usage')
    .insert({
      user_id: event.userId,
      provider: event.provider,
      model: event.model,
      action_type: event.taskType,
      input_tokens: event.inputTokens,
      output_tokens: event.outputTokens,
      cost_cents: event.costCents,
      session_id: event.sessionId || null,
      latency_ms: event.durationMs,
      success: true,
    })
    .select('id')
    .single()

  if (usageError) {
    console.error('[UsagePersister] ai_usage insert failed:', usageError.message)
    return
  }

  // 2. Deduct credits if userId present and cost > 0
  if (event.userId && event.costCents > 0) {
    const { error: deductError } = await supabase.rpc('deduct_credits', {
      p_user_id: event.userId,
      p_amount: event.costCents,
      p_description: `${event.taskType} (${event.model})`,
      p_ai_usage_id: usageRow?.id || null,
    })

    if (deductError) {
      console.error('[UsagePersister] deduct_credits failed:', deductError.message)
    }
  }
}
