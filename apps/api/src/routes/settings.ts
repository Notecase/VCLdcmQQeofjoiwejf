/**
 * Settings API Routes
 *
 * Manages BYOK API keys and AI preferences for autonomous agent features.
 *
 * - GET    /api/settings/api-keys       — List user's API keys (hints only, never full keys)
 * - POST   /api/settings/api-keys       — Add/update an API key for a provider
 * - DELETE /api/settings/api-keys/:provider — Remove an API key
 * - GET    /api/settings/ai-preferences — Get user's AI model preferences
 * - PUT    /api/settings/ai-preferences — Update AI model preferences
 * - GET    /api/settings/heartbeat      — Get heartbeat state
 * - PUT    /api/settings/heartbeat      — Update heartbeat configuration
 * - GET    /api/settings/heartbeat/logs — Get heartbeat action logs
 */

import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { authMiddleware, requireAuth } from '../middleware/auth'

const settings = new Hono()
settings.use('*', authMiddleware)

// ============================================================================
// API Key Management
// ============================================================================

const ApiKeySchema = z.object({
  provider: z.enum(['google', 'openai', 'anthropic']),
  api_key: z.string().min(10).max(500),
})

/**
 * GET /api/settings/api-keys
 * List user's configured API keys (hints only, never the actual key)
 */
settings.get('/api-keys', async (c) => {
  const auth = requireAuth(c)

  const { data, error } = await auth.supabase
    .from('user_api_keys')
    .select('provider, key_hint, is_valid, last_validated_at, created_at')
    .eq('user_id', auth.userId)
    .order('provider')

  if (error) {
    return c.json({ error: 'Failed to fetch API keys' }, 500)
  }

  return c.json({ keys: data ?? [] })
})

/**
 * POST /api/settings/api-keys
 * Add or update an API key for a provider. The key is stored encrypted.
 */
settings.post('/api-keys', zValidator('json', ApiKeySchema), async (c) => {
  const auth = requireAuth(c)
  const { provider, api_key } = c.req.valid('json')

  // Extract hint (last 4 chars)
  const keyHint = '...' + api_key.slice(-4)

  // Upsert the key (encrypted_key stored as-is; Supabase Vault handles encryption at rest)
  const { error } = await auth.supabase.from('user_api_keys').upsert(
    {
      user_id: auth.userId,
      provider,
      encrypted_key: api_key,
      key_hint: keyHint,
      is_valid: true,
      last_validated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,provider' }
  )

  if (error) {
    return c.json({ error: 'Failed to save API key' }, 500)
  }

  return c.json({ success: true, provider, key_hint: keyHint })
})

/**
 * DELETE /api/settings/api-keys/:provider
 * Remove an API key for a provider
 */
settings.delete('/api-keys/:provider', async (c) => {
  const auth = requireAuth(c)
  const provider = c.req.param('provider')

  if (!['google', 'openai', 'anthropic'].includes(provider)) {
    return c.json({ error: 'Invalid provider' }, 400)
  }

  const { error } = await auth.supabase
    .from('user_api_keys')
    .delete()
    .eq('user_id', auth.userId)
    .eq('provider', provider)

  if (error) {
    return c.json({ error: 'Failed to delete API key' }, 500)
  }

  return c.json({ success: true })
})

// ============================================================================
// AI Preferences
// ============================================================================

const AiPreferencesSchema = z.object({
  preferred_provider: z.enum(['google', 'openai', 'anthropic']),
  preferred_model: z.string().min(1).max(100),
  fallback_provider: z.enum(['google', 'openai', 'anthropic']).nullable().optional(),
  max_daily_cost_usd: z.number().min(0).max(100).optional(),
})

/**
 * GET /api/settings/ai-preferences
 * Get user's AI model preferences
 */
settings.get('/ai-preferences', async (c) => {
  const auth = requireAuth(c)

  const { data, error } = await auth.supabase
    .from('user_ai_preferences')
    .select('*')
    .eq('user_id', auth.userId)
    .single()

  if (error || !data) {
    // Return defaults if no preferences set
    return c.json({
      preferences: {
        preferred_provider: 'google',
        preferred_model: 'gemini-2.5-pro',
        fallback_provider: null,
        max_daily_cost_usd: 0.5,
      },
    })
  }

  return c.json({ preferences: data })
})

/**
 * PUT /api/settings/ai-preferences
 * Update AI model preferences
 */
settings.put('/ai-preferences', zValidator('json', AiPreferencesSchema), async (c) => {
  const auth = requireAuth(c)
  const prefs = c.req.valid('json')

  const { error } = await auth.supabase.from('user_ai_preferences').upsert(
    {
      user_id: auth.userId,
      ...prefs,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  )

  if (error) {
    return c.json({ error: 'Failed to save preferences' }, 500)
  }

  return c.json({ success: true })
})

// ============================================================================
// Heartbeat Configuration
// ============================================================================

const HeartbeatConfigSchema = z.object({
  enabled: z.boolean(),
  config: z
    .object({
      timezone: z.string().optional(),
      morning_hour: z.number().int().min(0).max(23).optional(),
      evening_hour: z.number().int().min(0).max(23).optional(),
    })
    .optional(),
})

/**
 * GET /api/settings/heartbeat
 * Get heartbeat state and configuration
 */
settings.get('/heartbeat', async (c) => {
  const auth = requireAuth(c)

  const { data, error } = await auth.supabase
    .from('agent_heartbeat_state')
    .select('*')
    .eq('user_id', auth.userId)
    .single()

  if (error || !data) {
    return c.json({
      state: {
        enabled: false,
        config: { timezone: 'UTC', morning_hour: 8, evening_hour: 21 },
        last_heartbeat_at: null,
        last_morning_at: null,
        last_evening_at: null,
        last_weekly_at: null,
        next_action: null,
        next_action_at: null,
      },
    })
  }

  return c.json({ state: data })
})

/**
 * PUT /api/settings/heartbeat
 * Update heartbeat configuration (enable/disable, timezone, hours)
 */
settings.put('/heartbeat', zValidator('json', HeartbeatConfigSchema), async (c) => {
  const auth = requireAuth(c)
  const { enabled, config: hbConfig } = c.req.valid('json')

  const { error } = await auth.supabase.from('agent_heartbeat_state').upsert(
    {
      user_id: auth.userId,
      enabled,
      config: hbConfig ?? {},
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  )

  if (error) {
    return c.json({ error: 'Failed to update heartbeat config' }, 500)
  }

  return c.json({ success: true })
})

/**
 * GET /api/settings/heartbeat/logs
 * Get recent heartbeat action logs (cost tracking)
 */
settings.get('/heartbeat/logs', async (c) => {
  const auth = requireAuth(c)
  const limit = parseInt(c.req.query('limit') || '50', 10)

  const { data, error } = await auth.supabase
    .from('agent_heartbeat_log')
    .select('*')
    .eq('user_id', auth.userId)
    .order('created_at', { ascending: false })
    .limit(Math.min(limit, 100))

  if (error) {
    return c.json({ error: 'Failed to fetch heartbeat logs' }, 500)
  }

  return c.json({ logs: data ?? [] })
})

// ============================================================================
// Credits & Usage
// ============================================================================

/**
 * GET /api/settings/credits
 * Get current credit balance and plan info
 */
settings.get('/credits', async (c) => {
  const auth = requireAuth(c)

  const { data, error } = await auth.supabase
    .from('user_credits')
    .select(
      'balance_cents, lifetime_granted, lifetime_used, plan_type, plan_expires_at, created_at'
    )
    .eq('user_id', auth.userId)
    .single()

  if (error || !data) {
    return c.json({
      credits: {
        balance_cents: 0,
        lifetime_granted: 0,
        lifetime_used: 0,
        plan_type: 'none',
        plan_expires_at: null,
        created_at: null,
      },
    })
  }

  return c.json({ credits: data })
})

/**
 * GET /api/settings/usage
 * Monthly usage (calls existing get_monthly_ai_usage RPC)
 */
settings.get('/usage', async (c) => {
  const auth = requireAuth(c)

  // Per-feature breakdown from ai_usage table
  const { data, error } = await auth.supabase.rpc('get_monthly_ai_usage', {
    p_user_id: auth.userId,
  })

  if (error) {
    return c.json({ error: 'Failed to fetch usage' }, 500)
  }

  // Authoritative monthly cost from credit_transactions ledger
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const { data: ledgerData } = await auth.supabase
    .from('credit_transactions')
    .select('amount_cents')
    .eq('user_id', auth.userId)
    .eq('type', 'deduction')
    .gte('created_at', startOfMonth.toISOString())

  const ledgerTotalCostCents = (ledgerData ?? []).reduce(
    (sum, row) => sum + Math.abs(Number(row.amount_cents)),
    0
  )

  const rpcUsage = data?.[0] ?? null
  return c.json({
    usage: {
      total_requests: 0,
      total_tokens: 0,
      total_cost_cents: 0,
      requests_by_provider: {},
      requests_by_action: {},
      ...rpcUsage,
      ledger_total_cost_cents: ledgerTotalCostCents,
    },
  })
})

/**
 * GET /api/settings/usage/weekly
 * Weekly usage based on rolling 7-day windows anchored to plan start date.
 * Returns total cost this week + when the current window resets.
 */
settings.get('/usage/weekly', async (c) => {
  const auth = requireAuth(c)

  // Get plan start date (created_at on user_credits)
  const { data: creditRow } = await auth.supabase
    .from('user_credits')
    .select('created_at')
    .eq('user_id', auth.userId)
    .single()

  const planStartedAt = creditRow?.created_at ? new Date(creditRow.created_at) : new Date()
  const now = new Date()

  // Calculate current weekly window: find which 7-day period we're in
  const msSinceStart = now.getTime() - planStartedAt.getTime()
  const weeksSinceStart = Math.floor(msSinceStart / (7 * 24 * 60 * 60 * 1000))
  const windowStart = new Date(planStartedAt.getTime() + weeksSinceStart * 7 * 24 * 60 * 60 * 1000)
  const windowEnd = new Date(windowStart.getTime() + 7 * 24 * 60 * 60 * 1000)

  // Query deductions within the current weekly window
  const { data: ledgerData } = await auth.supabase
    .from('credit_transactions')
    .select('amount_cents')
    .eq('user_id', auth.userId)
    .eq('type', 'deduction')
    .gte('created_at', windowStart.toISOString())
    .lt('created_at', windowEnd.toISOString())

  const totalCostCents = (ledgerData ?? []).reduce(
    (sum, row) => sum + Math.abs(Number(row.amount_cents)),
    0
  )

  return c.json({
    weekly: {
      total_cost_cents: totalCostCents,
      window_start: windowStart.toISOString(),
      window_end: windowEnd.toISOString(),
    },
  })
})

/**
 * GET /api/settings/usage/daily
 * Daily breakdown (calls existing get_daily_ai_usage RPC)
 */
settings.get('/usage/daily', async (c) => {
  const auth = requireAuth(c)

  const { data, error } = await auth.supabase.rpc('get_daily_ai_usage', {
    p_user_id: auth.userId,
  })

  if (error) {
    return c.json({ error: 'Failed to fetch daily usage' }, 500)
  }

  return c.json({ usage: data ?? [] })
})

/**
 * GET /api/settings/transactions
 * Credit transaction history (paginated)
 */
settings.get('/transactions', async (c) => {
  const auth = requireAuth(c)
  const limit = Math.min(parseInt(c.req.query('limit') || '20', 10), 50)

  const { data, error } = await auth.supabase
    .from('credit_transactions')
    .select('id, type, amount_cents, balance_after, description, created_at')
    .eq('user_id', auth.userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    return c.json({ error: 'Failed to fetch transactions' }, 500)
  }

  return c.json({ transactions: data ?? [] })
})

/**
 * POST /api/settings/credits/grant
 * Admin-only: grant credits to a user
 */
settings.post(
  '/credits/grant',
  zValidator(
    'json',
    z.object({
      user_id: z.string().uuid(),
      amount_cents: z.number().positive(),
      description: z.string().optional(),
      plan_type: z.string().optional(),
    })
  ),
  async (c) => {
    const auth = requireAuth(c)
    const body = c.req.valid('json')

    // Check admin authorization
    const adminIds = (process.env.ADMIN_USER_IDS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (!adminIds.includes(auth.userId)) {
      return c.json({ error: 'Unauthorized: admin access required' }, 403)
    }

    const { getServiceClient } = await import('../lib/supabase')
    const serviceClient = getServiceClient()

    const { data, error } = await serviceClient.rpc('grant_credits', {
      p_user_id: body.user_id,
      p_amount: body.amount_cents,
      p_description: body.description || 'Admin grant',
      p_plan_type: body.plan_type || null,
    })

    if (error) {
      return c.json({ error: 'Failed to grant credits' }, 500)
    }

    return c.json({ success: true, new_balance: data })
  }
)

export default settings
