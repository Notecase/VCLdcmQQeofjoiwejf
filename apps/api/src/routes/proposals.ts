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
  status: z.enum(['approved', 'rejected']).optional(),
  category: z.enum(['task', 'vocabulary', 'calendar', 'note', 'reading', 'thought']).optional(),
  targetFile: z.string().optional(),
  proposedContent: z.string().optional(),
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

proposals.post('/approve-all', async (c) => {
  const auth = requireAuth(c)

  const { data, error } = await auth.supabase
    .from('inbox_proposals')
    .update({ status: 'approved', updated_at: new Date().toISOString() })
    .eq('user_id', auth.userId)
    .eq('status', 'pending')
    .not('category', 'is', null)
    .select('id')

  if (error) {
    return c.json({ error: 'Failed to approve' }, 500)
  }

  return c.json({ approved: data?.length ?? 0 })
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /apply — Apply approved proposals to memory files
// ─────────────────────────────────────────────────────────────────────────────

proposals.post('/apply', async (c) => {
  const auth = requireAuth(c)
  const db = getServiceClient()

  // Fetch approved proposals
  const { data: approved, error } = await auth.supabase
    .from('inbox_proposals')
    .select('*')
    .eq('user_id', auth.userId)
    .eq('status', 'approved')
    .not('target_file', 'is', null)
    .not('proposed_content', 'is', null)
    .order('created_at', { ascending: true })

  if (error || !approved || approved.length === 0) {
    return c.json({ applied: 0, updatedFiles: [] })
  }

  // Group by target file
  const fileGroups = new Map<string, string[]>()
  for (const item of approved) {
    const file = item.target_file as string
    const content = item.proposed_content as string
    if (!fileGroups.has(file)) fileGroups.set(file, [])
    fileGroups.get(file)!.push(content)
  }

  const updatedFiles: string[] = []

  // Append content to each target file
  for (const [filename, contents] of fileGroups) {
    const { data: existing } = await db
      .from('secretary_memory')
      .select('content')
      .eq('user_id', auth.userId)
      .eq('filename', filename)
      .single()

    const currentContent = existing?.content || `# ${filename.replace('.md', '')}\n\n`
    const newContent = currentContent.trimEnd() + '\n' + contents.join('\n') + '\n'

    await db.from('secretary_memory').upsert(
      {
        user_id: auth.userId,
        filename,
        content: newContent,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,filename' }
    )

    updatedFiles.push(filename)
  }

  // Mark all as applied
  const ids = approved.map((p) => p.id)
  await db
    .from('inbox_proposals')
    .update({ status: 'applied', updated_at: new Date().toISOString() })
    .in('id', ids)
    .eq('user_id', auth.userId)

  return c.json({ applied: ids.length, updatedFiles })
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export default proposals
