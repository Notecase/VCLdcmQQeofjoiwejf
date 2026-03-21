/**
 * Inbox API Routes
 *
 * Quick capture endpoint for mobile devices (Apple Shortcuts, PWA).
 * Captures are appended to Inbox.md in secretary_memory, then processed
 * by the evening heartbeat into Tomorrow.md.
 *
 * - POST   /api/inbox/capture            — Capture text (X-Capture-Token auth)
 * - GET    /api/inbox                     — Read Inbox.md (JWT auth)
 * - DELETE /api/inbox                     — Clear Inbox.md (JWT auth)
 * - POST   /api/inbox/tokens             — Generate capture token (JWT auth)
 * - GET    /api/inbox/tokens             — List tokens (JWT auth)
 * - DELETE /api/inbox/tokens/:id         — Revoke token (JWT auth)
 */

import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { createHash, randomBytes } from 'node:crypto'
import { authMiddleware, requireAuth } from '../middleware/auth'
import { getServiceClient } from '../lib/supabase'

const inbox = new Hono()

const MAX_CAPTURE_LENGTH = 2000
const MAX_CAPTURES_PER_DAY = 100

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function formatTimestamp(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /capture — Token auth (no JWT needed)
// ─────────────────────────────────────────────────────────────────────────────

const CaptureSchema = z.object({
  text: z.string().min(1).max(MAX_CAPTURE_LENGTH),
})

inbox.post('/capture', zValidator('json', CaptureSchema), async (c) => {
  const captureToken = c.req.header('X-Capture-Token')
  const db = getServiceClient()
  let userId: string
  let tokenRowId: string | null = null

  if (captureToken) {
    // Token-based auth (Apple Shortcuts, external clients)
    const tokenHash = hashToken(captureToken)
    const { data: tokenRow, error: tokenError } = await db
      .from('user_capture_tokens')
      .select('id, user_id, is_active')
      .eq('token_hash', tokenHash)
      .eq('is_active', true)
      .single()

    if (tokenError || !tokenRow) {
      return c.json({ error: 'Invalid or revoked token' }, 401)
    }
    userId = tokenRow.user_id
    tokenRowId = tokenRow.id
  } else {
    // JWT auth fallback (PWA capture page)
    const authHeader = c.req.header('Authorization')
    if (!authHeader) {
      return c.json({ error: 'Missing X-Capture-Token or Authorization header' }, 401)
    }
    const { verifyToken } = await import('../lib/supabase')
    const token = authHeader.replace('Bearer ', '')
    const user = await verifyToken(token)
    if (!user) {
      return c.json({ error: 'Invalid or expired token' }, 401)
    }
    userId = user.userId
  }

  // Rate limit: count today's captures
  const today = new Date().toISOString().slice(0, 10)
  const { data: inboxFile } = await db
    .from('secretary_memory')
    .select('content')
    .eq('user_id', userId)
    .eq('filename', 'Inbox.md')
    .single()

  const currentContent = inboxFile?.content || ''
  const todayCaptures = (currentContent.match(new RegExp(`^- \\[${today}`, 'gm')) || []).length

  if (todayCaptures >= MAX_CAPTURES_PER_DAY) {
    return c.json({ error: 'Daily capture limit reached' }, 429)
  }

  // Append capture to Inbox.md
  const { text } = c.req.valid('json')
  const timestamp = formatTimestamp()
  const newLine = `- [${timestamp}] ${text}\n`

  const header = '# Inbox\n\n'
  let updatedContent: string
  if (!currentContent.trim()) {
    updatedContent = header + newLine
  } else {
    updatedContent = currentContent.trimEnd() + '\n' + newLine
  }

  await db.from('secretary_memory').upsert(
    {
      user_id: userId,
      filename: 'Inbox.md',
      content: updatedContent,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,filename' }
  )

  // Update last_used_at on token (only for token-based auth)
  if (tokenRowId) {
    await db
      .from('user_capture_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', tokenRowId)
  }

  return c.json({ success: true, timestamp })
})

// ─────────────────────────────────────────────────────────────────────────────
// JWT-authenticated endpoints
// ─────────────────────────────────────────────────────────────────────────────

// Apply auth middleware to all remaining routes
inbox.use('/*', authMiddleware)

/**
 * GET /api/inbox — Read Inbox.md content
 */
inbox.get('/', async (c) => {
  const auth = requireAuth(c)

  const { data } = await auth.supabase
    .from('secretary_memory')
    .select('content, updated_at')
    .eq('user_id', auth.userId)
    .eq('filename', 'Inbox.md')
    .single()

  return c.json({
    content: data?.content || '',
    updatedAt: data?.updated_at || null,
  })
})

/**
 * DELETE /api/inbox — Clear Inbox.md
 */
inbox.delete('/', async (c) => {
  const auth = requireAuth(c)

  await auth.supabase.from('secretary_memory').upsert(
    {
      user_id: auth.userId,
      filename: 'Inbox.md',
      content: '# Inbox\n\n',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,filename' }
  )

  return c.json({ success: true })
})

// ─────────────────────────────────────────────────────────────────────────────
// Token Management
// ─────────────────────────────────────────────────────────────────────────────

const TokenCreateSchema = z.object({
  label: z.string().min(1).max(100).optional(),
})

/**
 * POST /api/inbox/tokens — Generate a new capture token
 * Returns the raw token ONCE — it cannot be retrieved again.
 */
inbox.post('/tokens', zValidator('json', TokenCreateSchema), async (c) => {
  const auth = requireAuth(c)
  const { label } = c.req.valid('json')

  const rawToken = randomBytes(32).toString('hex')
  const tokenHash = hashToken(rawToken)
  const tokenHint = rawToken.slice(-4)

  const { error } = await auth.supabase.from('user_capture_tokens').insert({
    user_id: auth.userId,
    token_hash: tokenHash,
    token_hint: tokenHint,
    label: label || 'default',
  })

  if (error) {
    return c.json({ error: 'Failed to create token' }, 500)
  }

  return c.json({
    token: rawToken,
    hint: '...' + tokenHint,
    label: label || 'default',
    message: 'Save this token — it cannot be shown again.',
  })
})

/**
 * GET /api/inbox/tokens — List capture tokens (hints only)
 */
inbox.get('/tokens', async (c) => {
  const auth = requireAuth(c)

  const { data, error } = await auth.supabase
    .from('user_capture_tokens')
    .select('id, token_hint, label, is_active, last_used_at, created_at')
    .eq('user_id', auth.userId)
    .order('created_at', { ascending: false })

  if (error) {
    return c.json({ error: 'Failed to fetch tokens' }, 500)
  }

  return c.json({
    tokens: (data ?? []).map((t) => ({
      id: t.id,
      hint: '...' + t.token_hint,
      label: t.label,
      isActive: t.is_active,
      lastUsedAt: t.last_used_at,
      createdAt: t.created_at,
    })),
  })
})

/**
 * DELETE /api/inbox/tokens/:id — Revoke a capture token
 */
inbox.delete('/tokens/:id', async (c) => {
  const auth = requireAuth(c)
  const tokenId = c.req.param('id')

  const { error } = await auth.supabase
    .from('user_capture_tokens')
    .update({ is_active: false })
    .eq('id', tokenId)
    .eq('user_id', auth.userId)

  if (error) {
    return c.json({ error: 'Failed to revoke token' }, 500)
  }

  return c.json({ success: true })
})

export default inbox
