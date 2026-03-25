/**
 * Channel Pairing & Management Routes (JWT auth)
 *
 * POST /api/channels/pair     — Generate pairing code for a channel
 * GET  /api/channels/status   — List linked channels
 * DELETE /api/channels/:channel — Unlink a channel
 */

import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { authMiddleware, requireAuth } from '../middleware/auth'
import { getServiceClient } from '../lib/supabase'
import { config } from '../config'

const channels = new Hono()

// All routes require JWT auth
channels.use('/*', authMiddleware)

const PAIRING_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const PAIRING_TTL_SECONDS = 600 // 10 minutes

function generatePairingCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += PAIRING_CODE_CHARS[bytes[i] % PAIRING_CODE_CHARS.length]
  }
  return code
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /pair — Generate pairing code
// ─────────────────────────────────────────────────────────────────────────────

const PairSchema = z.object({
  channel: z.enum(['telegram']),
})

channels.post('/pair', zValidator('json', PairSchema), async (c) => {
  const auth = requireAuth(c)
  const { channel } = c.req.valid('json')
  const db = getServiceClient()

  // Check if already linked
  const { data: existing } = await db
    .from('user_channel_links')
    .select('id, status')
    .eq('user_id', auth.userId)
    .eq('channel', channel)
    .single()

  if (existing?.status === 'active') {
    return c.json({ error: 'Channel already linked' }, 409)
  }

  const code = generatePairingCode()
  const expiresAt = new Date(Date.now() + PAIRING_TTL_SECONDS * 1000).toISOString()

  if (existing) {
    // Update existing pending/revoked row
    await db
      .from('user_channel_links')
      .update({
        status: 'pending',
        pairing_code: code,
        pairing_expires_at: expiresAt,
        external_id: '',
        display_name: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
  } else {
    // Create new row
    await db.from('user_channel_links').insert({
      user_id: auth.userId,
      channel,
      external_id: '',
      status: 'pending',
      pairing_code: code,
      pairing_expires_at: expiresAt,
    })
  }

  // Build deep link for Telegram
  let deepLink: string | undefined
  if (channel === 'telegram' && config.telegram.botUsername) {
    deepLink = `https://t.me/${config.telegram.botUsername}?start=${code}`
  }

  return c.json({
    code,
    expiresIn: PAIRING_TTL_SECONDS,
    deepLink,
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /status — List linked channels
// ─────────────────────────────────────────────────────────────────────────────

channels.get('/status', async (c) => {
  const auth = requireAuth(c)

  const { data, error } = await auth.supabase
    .from('user_channel_links')
    .select('id, channel, display_name, status, created_at')
    .eq('user_id', auth.userId)
    .neq('status', 'revoked')
    .order('created_at', { ascending: false })

  if (error) {
    return c.json({ error: 'Failed to fetch channels' }, 500)
  }

  return c.json({
    channels: (data ?? []).map((link) => ({
      id: link.id,
      channel: link.channel,
      displayName: link.display_name,
      status: link.status,
      createdAt: link.created_at,
    })),
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /:channel — Unlink a channel
// ─────────────────────────────────────────────────────────────────────────────

channels.delete('/:channel', async (c) => {
  const auth = requireAuth(c)
  const channel = c.req.param('channel')

  const { error } = await auth.supabase
    .from('user_channel_links')
    .update({ status: 'revoked', updated_at: new Date().toISOString() })
    .eq('user_id', auth.userId)
    .eq('channel', channel)
    .neq('status', 'revoked')

  if (error) {
    return c.json({ error: 'Failed to unlink channel' }, 500)
  }

  return c.json({ success: true })
})

export default channels
