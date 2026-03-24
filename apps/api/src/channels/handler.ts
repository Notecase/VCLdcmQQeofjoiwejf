/**
 * Channel Message Handler
 *
 * Shared logic that all channel adapters call after normalizing messages.
 * Handles: account linking, pairing flow, smart classification,
 * autonomous execution, streaming progress, and clarification sessions.
 */

import { getServiceClient } from '../lib/supabase'
import { classifyInboxMessage } from '@inkdown/ai/agents/inbox-classifier'
import type { ChannelMessage, ChannelReplyHandle } from './types'
import { parseCommand } from './types'
import { executeAction, executeNoteCreationStreaming } from './executor'
import type { SmartClassificationResult } from '@inkdown/shared/types'

/** Clarification session stored in user_channel_links.config */
interface PendingClarification {
  proposalId: string
  question: string
  originalText: string
  partialClassification: Partial<SmartClassificationResult>
  expiresAt: string
}

interface ChannelLinkConfig {
  pendingClarification?: PendingClarification
}

/**
 * Handle an incoming message from any channel.
 * Uses ChannelReplyHandle for streaming send/edit.
 */
export async function handleIncomingMessage(
  message: ChannelMessage,
  reply: ChannelReplyHandle
): Promise<void> {
  const db = getServiceClient()

  // Look up linked account
  const { data: link } = await db
    .from('user_channel_links')
    .select('id, user_id, status, config')
    .eq('channel', message.channel)
    .eq('external_id', message.externalUserId)
    .eq('status', 'active')
    .single()

  // Check for commands
  const cmd = parseCommand(message.text)

  // Handle /start <pairing_code> for account linking
  if (cmd?.command === 'start' && cmd.args) {
    const response = await handlePairing(message, cmd.args)
    await reply.send(response.text, response.parseMode)
    return
  }

  // If not linked, prompt linking
  if (!link) {
    if (cmd?.command === 'help') {
      await reply.send(
        'Link your account first:\n1. Go to Settings > Messaging in the Noteshell app\n2. Click "Link Telegram"\n3. Send me the code or tap the link'
      )
      return
    }
    await reply.send(
      "Your account isn't linked yet. Go to Settings > Messaging in the Noteshell app to link your Telegram."
    )
    return
  }

  // Handle /status command
  if (cmd?.command === 'status') {
    await reply.send(
      'Your account is linked and active. Send any message and it will be processed automatically.'
    )
    return
  }

  // Handle /help command
  if (cmd?.command === 'help') {
    await reply.send(
      "Just send me anything — tasks, vocab, ideas, links — and I'll handle it instantly.\n\nCommands:\n/status — Check link status\n/help — Show this help"
    )
    return
  }

  // Autonomous capture + execute
  await captureAndExecute(
    link.user_id,
    link.id,
    link.config as ChannelLinkConfig | null,
    message,
    reply
  )
}

/**
 * Handle /start <code> pairing flow
 */
async function handlePairing(
  message: ChannelMessage,
  code: string
): Promise<{ text: string; parseMode?: 'Markdown' | 'HTML' }> {
  const db = getServiceClient()

  const { data: pending, error } = await db
    .from('user_channel_links')
    .select('id, user_id, channel, pairing_expires_at')
    .eq('pairing_code', code.toUpperCase())
    .eq('status', 'pending')
    .single()

  if (error || !pending) {
    return { text: 'Invalid or expired code. Generate a new one in Settings > Messaging.' }
  }

  if (pending.pairing_expires_at && new Date(pending.pairing_expires_at) < new Date()) {
    return { text: 'This code has expired. Generate a new one in Settings > Messaging.' }
  }

  if (pending.channel !== message.channel) {
    return { text: `This code is for ${pending.channel}, not ${message.channel}.` }
  }

  const { error: updateError } = await db
    .from('user_channel_links')
    .update({
      external_id: message.externalUserId,
      display_name: message.displayName,
      status: 'active',
      pairing_code: null,
      pairing_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', pending.id)

  if (updateError) {
    return { text: 'Failed to link account. Please try again.' }
  }

  return {
    text: "Linked! Send me anything — tasks, vocab, ideas — and I'll handle it instantly.",
  }
}

/**
 * Autonomous capture + classify + execute flow.
 *
 * 1. Check for pending clarification session
 * 2. Insert raw row (status: 'executing')
 * 3. Smart classify (8s timeout)
 * 4. Execute action immediately
 * 5. Update proposal with result
 * 6. Reply via ChannelReplyHandle
 */
async function captureAndExecute(
  userId: string,
  linkId: string,
  linkConfig: ChannelLinkConfig | null,
  message: ChannelMessage,
  reply: ChannelReplyHandle
): Promise<void> {
  const db = getServiceClient()

  // ── Check for pending clarification session ──────────────────────
  const pending = linkConfig?.pendingClarification
  let clarificationContext: string | null = null

  if (pending) {
    const isExpired = new Date(pending.expiresAt) < new Date()

    // Clear the pending clarification regardless
    await db
      .from('user_channel_links')
      .update({
        config: { ...(linkConfig || {}), pendingClarification: null },
        updated_at: new Date().toISOString(),
      })
      .eq('id', linkId)

    if (!isExpired) {
      // This message is a clarification reply — enrich the context
      clarificationContext = `Original: "${pending.originalText}"\nUser clarified: "${message.text}"`

      // Update the original proposal status from awaiting_clarification to executing
      await db
        .from('inbox_proposals')
        .update({ status: 'executing', updated_at: new Date().toISOString() })
        .eq('id', pending.proposalId)
    }
    // If expired, treat as fresh message (fall through)
  }

  // ── Idempotency check: prevent double execution on Telegram retry ──
  const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString()
  const { data: duplicates } = await db
    .from('inbox_proposals')
    .select('id')
    .eq('user_id', userId)
    .eq('raw_text', message.text)
    .eq('source', message.channel)
    .gte('created_at', oneMinuteAgo)
    .limit(1)

  if (duplicates && duplicates.length > 0 && !clarificationContext) {
    // Already processed this exact message recently
    return
  }

  // ── Insert raw proposal (status: 'executing') ──────────────────
  let proposalId: string

  if (clarificationContext && pending) {
    // Reuse the original proposal
    proposalId = pending.proposalId
  } else {
    const { data: inserted, error } = await db
      .from('inbox_proposals')
      .insert({
        user_id: userId,
        source: message.channel,
        raw_text: message.text,
        status: 'executing',
        metadata: {
          displayName: message.displayName,
          timestamp: message.timestamp.toISOString(),
          mediaType: message.mediaType || 'text',
        },
      })
      .select('id')
      .single()

    if (error || !inserted) {
      await reply.send('Failed to capture. Please try again.')
      return
    }
    proposalId = inserted.id
  }

  // ── Smart classify (8s timeout) ────────────────────────────────
  let classification: SmartClassificationResult | null = null

  try {
    const { data: memoryFiles } = await db
      .from('secretary_memory')
      .select('filename')
      .eq('user_id', userId)

    const existingFiles = (memoryFiles ?? []).map((f: { filename: string }) => f.filename)

    classification = await Promise.race([
      classifyInboxMessage({
        text: clarificationContext || message.text,
        source: message.channel,
        existingFiles,
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
    ])
  } catch {
    // Classification failed — fall through to fallback
  }

  // ── Handle needs_clarification ─────────────────────────────────
  if (classification?.actionType === 'needs_clarification') {
    const question = classification.clarificationQuestion || classification.botReplyText

    // Save clarification session to link config
    const newConfig: ChannelLinkConfig = {
      ...(linkConfig || {}),
      pendingClarification: {
        proposalId,
        question,
        originalText: message.text,
        partialClassification: classification,
        expiresAt: new Date(Date.now() + 2 * 60_000).toISOString(), // 2 minutes
      },
    }

    await db
      .from('user_channel_links')
      .update({ config: newConfig, updated_at: new Date().toISOString() })
      .eq('id', linkId)

    // Update proposal status
    await db
      .from('inbox_proposals')
      .update({
        status: 'awaiting_clarification',
        action_type: 'needs_clarification',
        preview_text: question,
        confidence: classification.confidence,
        updated_at: new Date().toISOString(),
      })
      .eq('id', proposalId)

    await reply.send(question)
    return
  }

  // ── Execute action ─────────────────────────────────────────────
  if (classification) {
    // Update proposal with classification data
    await db
      .from('inbox_proposals')
      .update({
        action_type: classification.actionType,
        category: classification.category,
        target_file: classification.targetFile,
        proposed_content: classification.proposedContent,
        payload: classification.payload,
        preview_text: classification.previewText,
        confidence: classification.confidence,
        updated_at: new Date().toISOString(),
      })
      .eq('id', proposalId)

    // For create_note: use streaming variant with progress updates
    if (classification.actionType === 'create_note') {
      await reply.send(
        `Creating note about '${(classification.payload as { title?: string }).title || 'your topic'}'...`
      )

      let lastEditTime = 0
      const THROTTLE_MS = 800

      const result = await executeNoteCreationStreaming(
        userId,
        classification,
        (progressMessage) => {
          const now = Date.now()
          if (now - lastEditTime >= THROTTLE_MS) {
            lastEditTime = now
            reply.edit(progressMessage).catch(() => {})
          }
        }
      )

      // Update proposal with execution result
      await db
        .from('inbox_proposals')
        .update({
          status: result.status,
          execution_result: {
            noteId: result.noteId,
            updatedFile: result.updatedFile,
            error: result.error,
            durationMs: result.durationMs,
          },
          metadata: result.noteId
            ? { displayName: message.displayName, noteId: result.noteId }
            : undefined,
          updated_at: new Date().toISOString(),
        })
        .eq('id', proposalId)

      await reply.edit(result.resultMessage)
      return
    }

    // For simple appends: execute instantly
    const result = await executeAction(userId, classification)

    // Update proposal with execution result
    await db
      .from('inbox_proposals')
      .update({
        status: result.status,
        execution_result: {
          noteId: result.noteId,
          updatedFile: result.updatedFile,
          error: result.error,
          durationMs: result.durationMs,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', proposalId)

    await reply.send(result.resultMessage)
    return
  }

  // ── Fallback: no classification → save as thought to Inbox.md ──
  const fallbackResult = await executeAction(userId, {
    actionType: 'add_thought',
    category: 'thought',
    targetFile: 'Inbox.md',
    payload: { text: message.text },
    proposedContent: `- ${message.text}`,
    previewText: message.text,
    confidence: 0,
    botReplyText: '📝 Captured to your Inbox.',
  })

  await db
    .from('inbox_proposals')
    .update({
      status: fallbackResult.status,
      action_type: 'add_thought',
      category: 'thought',
      target_file: 'Inbox.md',
      proposed_content: `- ${message.text}`,
      execution_result: {
        updatedFile: fallbackResult.updatedFile,
        error: fallbackResult.error,
        durationMs: fallbackResult.durationMs,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', proposalId)

  await reply.send('📝 Captured to your Inbox.')
}
