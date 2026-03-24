/**
 * Inbox Proposals Routes (JWT auth)
 *
 * GET    /api/inbox/proposals           — List proposals
 * POST   /api/inbox/proposals/categorize — Trigger AI categorization
 * PATCH  /api/inbox/proposals/:id       — Update proposal (approve, reject, edit)
 * POST   /api/inbox/proposals/approve-all — Bulk approve pending
 * POST   /api/inbox/proposals/apply     — Apply approved proposals to memory files
 */

import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { authMiddleware, requireAuth } from '../middleware/auth'
import { getServiceClient } from '../lib/supabase'
import { categorizeInboxItems } from '@inkdown/ai/agents/inbox-categorizer'

const proposals = new Hono()

// All routes require JWT auth
proposals.use('/*', authMiddleware)

// ─────────────────────────────────────────────────────────────────────────────
// GET / — List proposals
// ─────────────────────────────────────────────────────────────────────────────

proposals.get('/', async (c) => {
  const auth = requireAuth(c)
  const status = c.req.query('status')
  const category = c.req.query('category')

  let query = auth.supabase
    .from('inbox_proposals')
    .select('*')
    .eq('user_id', auth.userId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (status) {
    query = query.eq('status', status)
  }
  if (category) {
    query = query.eq('category', category)
  }

  const { data, error } = await query

  if (error) {
    return c.json({ error: 'Failed to fetch proposals' }, 500)
  }

  return c.json({
    proposals: (data ?? []).map(mapProposal),
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /categorize — Trigger AI categorization
// ─────────────────────────────────────────────────────────────────────────────

proposals.post('/categorize', async (c) => {
  const auth = requireAuth(c)
  const db = getServiceClient()

  // Fetch uncategorized items
  const { data: items, error } = await auth.supabase
    .from('inbox_proposals')
    .select('*')
    .eq('user_id', auth.userId)
    .eq('status', 'pending')
    .is('category', null)
    .order('created_at', { ascending: true })
    .limit(50)

  if (error) {
    return c.json({ error: 'Failed to fetch items' }, 500)
  }

  if (!items || items.length === 0) {
    return c.json({ categorized: 0 })
  }

  // Get user context (memory files list)
  const { data: memoryFiles } = await auth.supabase
    .from('secretary_memory')
    .select('filename')
    .eq('user_id', auth.userId)

  const existingFiles = (memoryFiles ?? []).map((f) => f.filename)

  // Run AI categorization
  const batchId = crypto.randomUUID()
  const results = await categorizeInboxItems({
    items: items.map((i) => ({ id: i.id, text: i.raw_text, source: i.source })),
    existingFiles,
    userId: auth.userId,
  })

  // Update proposals with categorization results
  for (const result of results) {
    await db
      .from('inbox_proposals')
      .update({
        category: result.category,
        target_file: result.targetFile,
        proposed_content: result.proposedContent,
        confidence: result.confidence,
        batch_id: batchId,
        metadata: result.metadata,
        updated_at: new Date().toISOString(),
      })
      .eq('id', result.id)
      .eq('user_id', auth.userId)
  }

  return c.json({ categorized: results.length, batchId })
})

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /:id — Update a proposal
// ─────────────────────────────────────────────────────────────────────────────

const UpdateProposalSchema = z.object({
  status: z
    .enum([
      'pending',
      'executing',
      'awaiting_clarification',
      'approved',
      'rejected',
      'applied',
      'failed',
    ])
    .optional(),
  category: z.enum(['task', 'vocabulary', 'calendar', 'note', 'reading', 'thought']).optional(),
  targetFile: z.string().optional(),
  proposedContent: z.string().optional(),
  actionType: z
    .enum([
      'create_note',
      'add_task',
      'add_calendar_event',
      'add_vocabulary',
      'add_reading',
      'add_thought',
      'needs_clarification',
    ])
    .optional(),
  payload: z.record(z.unknown()).optional(),
})

proposals.patch('/:id', zValidator('json', UpdateProposalSchema), async (c) => {
  const auth = requireAuth(c)
  const id = c.req.param('id')
  const updates = c.req.valid('json')

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  if (updates.status) updateData.status = updates.status
  if (updates.category) updateData.category = updates.category
  if (updates.targetFile) updateData.target_file = updates.targetFile
  if (updates.proposedContent) updateData.proposed_content = updates.proposedContent
  if (updates.actionType) updateData.action_type = updates.actionType
  if (updates.payload) updateData.payload = updates.payload

  const { error } = await auth.supabase
    .from('inbox_proposals')
    .update(updateData)
    .eq('id', id)
    .eq('user_id', auth.userId)

  if (error) {
    return c.json({ error: 'Failed to update proposal' }, 500)
  }

  return c.json({ success: true })
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /approve-all — Bulk approve categorized pending items
// ─────────────────────────────────────────────────────────────────────────────

// DEPRECATED: Actions now execute autonomously. Kept for backward compatibility.
proposals.post('/approve-all', async (c) => {
  requireAuth(c)
  return c.json({ approved: 0, deprecated: true })
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /apply — Apply approved proposals to memory files
// ─────────────────────────────────────────────────────────────────────────────

// DEPRECATED: Actions now execute autonomously. Kept for backward compatibility.
proposals.post('/apply', async (c) => {
  requireAuth(c)
  return c.json({ applied: 0, updatedFiles: [], createdNotes: [], deprecated: true })
})

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function mapProposal(row: Record<string, unknown>) {
  return {
    id: row.id,
    source: row.source,
    rawText: row.raw_text,
    category: row.category,
    targetFile: row.target_file,
    proposedContent: row.proposed_content,
    confidence: row.confidence,
    status: row.status,
    batchId: row.batch_id,
    metadata: row.metadata,
    actionType: row.action_type ?? null,
    payload: row.payload ?? null,
    previewText: row.preview_text ?? null,
    executionResult: row.execution_result ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export default proposals
