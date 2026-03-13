/**
 * CLI Device Auth Routes (RFC 8628 Device Authorization Grant)
 *
 * POST /start   — Public: create device session, open browser flow
 * POST /poll    — Public: poll for approval (CLI calls this every 5s)
 * POST /approve — Auth: user approves on web
 * POST /deny    — Auth: user denies on web
 */

import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { randomBytes } from 'node:crypto'
import { authMiddleware, requireAuth } from '../middleware/auth'
import { getServiceClient } from '../lib/supabase'
import { config } from '../config'

const cliAuth = new Hono()

// RFC 8628 recommended alphabet: avoids 0/O/1/I confusion
const USER_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const DEVICE_CODE_TTL_SECONDS = 600   // 10 minutes
const POLL_INTERVAL_SECONDS = 5

function generateDeviceCode(): string {
  return randomBytes(32).toString('hex')  // 64 hex chars
}

function generateUserCode(): string {
  const bytes = randomBytes(8)
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += USER_CODE_CHARS[bytes[i] % USER_CODE_CHARS.length]
    if (i === 3) code += '-'
  }
  return code
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /start — Public
// ─────────────────────────────────────────────────────────────────────────────

cliAuth.post(
  '/start',
  zValidator('json', z.object({
    client_name: z.string().min(1).max(100).optional(),
    scopes: z.array(z.string()).optional(),
  })),
  async (c) => {
    const { client_name, scopes } = c.req.valid('json')
    const db = getServiceClient()

    // Housekeeping: delete sessions older than 1 hour past their TTL
    await db
      .from('cli_auth_sessions')
      .delete()
      .lt('expires_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())

    const deviceCode = generateDeviceCode()
    const userCode = generateUserCode()
    const expiresAt = new Date(Date.now() + DEVICE_CODE_TTL_SECONDS * 1000).toISOString()

    const { error } = await db.from('cli_auth_sessions').insert({
      device_code: deviceCode,
      user_code: userCode,
      client_name: client_name ?? '@noteshell/mcp',
      scopes: scopes ?? [],
      expires_at: expiresAt,
    })

    if (error) {
      return c.json({ error: 'Failed to create auth session' }, 500)
    }

    const verificationUri = `${config.baseUrl}/cli`
    return c.json({
      device_code: deviceCode,
      user_code: userCode,
      verification_uri: verificationUri,
      verification_uri_complete: `${verificationUri}?code=${encodeURIComponent(userCode)}`,
      interval: POLL_INTERVAL_SECONDS,
      expires_in: DEVICE_CODE_TTL_SECONDS,
    })
  }
)

// ─────────────────────────────────────────────────────────────────────────────
// POST /poll — Public
// ─────────────────────────────────────────────────────────────────────────────

cliAuth.post(
  '/poll',
  zValidator('json', z.object({ device_code: z.string().min(1) })),
  async (c) => {
    const { device_code } = c.req.valid('json')
    const db = getServiceClient()

    const { data: session, error } = await db
      .from('cli_auth_sessions')
      .select('*')
      .eq('device_code', device_code)
      .single()

    if (error || !session) {
      return c.json({ error: 'expired_token' }, 400)
    }

    // Expired TTL
    if (new Date(session.expires_at) < new Date()) {
      return c.json({ error: 'expired_token' }, 400)
    }

    if (session.status === 'denied') {
      return c.json({ error: 'access_denied' }, 400)
    }

    if (session.status === 'consumed') {
      return c.json({ error: 'expired_token' }, 400)
    }

    if (session.status === 'pending') {
      const now = new Date()
      const tooFast =
        session.last_polled_at &&
        new Date(session.last_polled_at) > new Date(now.getTime() - POLL_INTERVAL_SECONDS * 1000)

      // Update poll tracking regardless
      await db
        .from('cli_auth_sessions')
        .update({ last_polled_at: now.toISOString(), poll_count: session.poll_count + 1 })
        .eq('device_code', device_code)

      if (session.poll_count > 100) {
        return c.json({ error: 'expired_token' }, 400)
      }

      if (tooFast) {
        return c.json({ error: 'slow_down' }, 400)
      }

      return c.json({ error: 'authorization_pending' }, 400)
    }

    if (session.status === 'approved') {
      // Consume: clear tokens to prevent replay
      await db
        .from('cli_auth_sessions')
        .update({ status: 'consumed', access_token: null, refresh_token: null })
        .eq('device_code', device_code)

      return c.json({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        token_expires_at: session.token_expires_at,
        supabase_url: config.supabase.url,
        supabase_anon_key: config.supabase.anonKey,
        user: { id: session.user_id },
      })
    }

    return c.json({ error: 'expired_token' }, 400)
  }
)

// ─────────────────────────────────────────────────────────────────────────────
// POST /approve — Auth required (web user)
// ─────────────────────────────────────────────────────────────────────────────

cliAuth.post(
  '/approve',
  authMiddleware,
  zValidator('json', z.object({
    user_code: z.string().min(1),
    access_token: z.string().min(1),
    refresh_token: z.string().min(1),
    token_expires_at: z.string().min(1),
  })),
  async (c) => {
    const auth = requireAuth(c)
    const { user_code, access_token, refresh_token, token_expires_at } = c.req.valid('json')

    // The token in the body must match the authenticated request's token
    if (access_token !== auth.accessToken) {
      return c.json({ error: 'Token mismatch' }, 400)
    }

    const db = getServiceClient()

    const { data: session, error } = await db
      .from('cli_auth_sessions')
      .select('device_code, status, expires_at')
      .eq('user_code', user_code)
      .single()

    if (error || !session || session.status !== 'pending' || new Date(session.expires_at) < new Date()) {
      return c.json({ error: 'Code not found or expired' }, 404)
    }

    const { error: updateError } = await db
      .from('cli_auth_sessions')
      .update({
        status: 'approved',
        user_id: auth.userId,
        access_token,
        refresh_token,
        token_expires_at,
      })
      .eq('user_code', user_code)

    if (updateError) {
      return c.json({ error: 'Failed to approve' }, 500)
    }

    return c.json({ success: true })
  }
)

// ─────────────────────────────────────────────────────────────────────────────
// POST /deny — Auth required (web user)
// ─────────────────────────────────────────────────────────────────────────────

cliAuth.post(
  '/deny',
  authMiddleware,
  zValidator('json', z.object({ user_code: z.string().min(1) })),
  async (c) => {
    requireAuth(c)
    const { user_code } = c.req.valid('json')
    const db = getServiceClient()

    await db
      .from('cli_auth_sessions')
      .update({ status: 'denied' })
      .eq('user_code', user_code)
      .eq('status', 'pending')

    return c.json({ success: true })
  }
)

export default cliAuth
