/**
 * Context API Routes
 *
 * Hono routes for the Shared Context Bus:
 * - GET  /api/context/soul     — Read user's soul content
 * - PUT  /api/context/soul     — Update user's soul content
 * - GET  /api/context/entries  — List recent context entries (debug/UI)
 */

import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { authMiddleware, requireAuth } from '../middleware/auth'

const context = new Hono()

context.use('*', authMiddleware)

// ============================================================================
// Soul CRUD
// ============================================================================

/**
 * GET /api/context/soul
 * Read user's soul content (goals, preferences, style)
 */
context.get('/soul', async (c) => {
  const auth = requireAuth(c)

  const { data } = await auth.supabase
    .from('user_soul')
    .select('content, updated_at')
    .eq('user_id', auth.userId)
    .maybeSingle()

  return c.json({
    content: data?.content || '',
    updatedAt: data?.updated_at || null,
  })
})

const SoulUpdateSchema = z.object({
  content: z.string().max(5000),
})

/**
 * PUT /api/context/soul
 * Update user's soul content
 */
context.put('/soul', zValidator('json', SoulUpdateSchema), async (c) => {
  const auth = requireAuth(c)
  const { content } = c.req.valid('json')

  const { error } = await auth.supabase.from('user_soul').upsert(
    {
      user_id: auth.userId,
      content,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  )

  if (error) {
    return c.json({ error: `Failed to update soul: ${error.message}` }, 500)
  }

  return c.json({ success: true })
})

// ============================================================================
// Context Entries (debug/UI)
// ============================================================================

/**
 * GET /api/context/entries
 * List recent context entries for the user
 */
context.get('/entries', async (c) => {
  const auth = requireAuth(c)
  const limit = Math.min(Number(c.req.query('limit') || '20'), 50)

  const { data, error } = await auth.supabase
    .from('user_context_entries')
    .select('id, agent, type, summary, payload, created_at')
    .eq('user_id', auth.userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    return c.json({ error: `Failed to fetch entries: ${error.message}` }, 500)
  }

  return c.json({ entries: data || [] })
})

export default context
