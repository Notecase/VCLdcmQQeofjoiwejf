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
  actionType: z
    .enum([
      'create_note',
      'add_task',
      'add_calendar_event',
      'add_vocabulary',
      'add_reading',
      'add_thought',
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

  // Fetch approved proposals (both smart-classified and legacy)
  const { data: approved, error } = await auth.supabase
    .from('inbox_proposals')
    .select('*')
    .eq('user_id', auth.userId)
    .eq('status', 'approved')
    .order('created_at', { ascending: true })

  if (error || !approved || approved.length === 0) {
    return c.json({ applied: 0, updatedFiles: [], createdNotes: [] })
  }

  const updatedFiles: string[] = []
  const createdNotes: string[] = []
  const appliedIds: string[] = []

  // Separate create_note proposals from file-append proposals
  const noteProposals = approved.filter((p) => p.action_type === 'create_note')
  const appendProposals = approved.filter(
    (p) => p.action_type !== 'create_note' && p.target_file && p.proposed_content
  )

  // Handle create_note proposals via NoteAgent
  for (const proposal of noteProposals) {
    try {
      const payload = (proposal.payload || {}) as { title?: string; content?: string }
      const title = payload.title || 'Untitled'
      const content = payload.content || proposal.proposed_content || ''

      const { createNoteAgent } = await import('@inkdown/ai/agents')
      const agent = createNoteAgent({ supabase: db, userId: auth.userId })
      const result = await agent.run({
        action: 'create',
        input: `Create a note titled "${title}":\n\n${content}`,
      })

      if (result?.noteId) {
        createdNotes.push(result.noteId)
        await db
          .from('inbox_proposals')
          .update({
            metadata: { ...(proposal.metadata as Record<string, unknown>), noteId: result.noteId },
          })
          .eq('id', proposal.id)
      }
      appliedIds.push(proposal.id)
    } catch {
      console.error(`[proposals/apply] Failed to create note for proposal ${proposal.id}`)
    }
  }

  // Handle file-append proposals (tasks, calendar, vocabulary, reading, thoughts, legacy)
  const fileGroups = new Map<string, string[]>()
  for (const item of appendProposals) {
    const file = item.target_file as string
    const content = item.proposed_content as string
    if (!fileGroups.has(file)) fileGroups.set(file, [])
    fileGroups.get(file)!.push(content)
    appliedIds.push(item.id)
  }

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

  // Mark applied proposals
  if (appliedIds.length > 0) {
    await db
      .from('inbox_proposals')
      .update({ status: 'applied', updated_at: new Date().toISOString() })
      .in('id', appliedIds)
      .eq('user_id', auth.userId)
  }

  return c.json({ applied: appliedIds.length, updatedFiles, createdNotes })
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export default proposals
