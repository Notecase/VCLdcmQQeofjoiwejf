/**
 * Channel Message Handler
 *
 * Shared logic that all channel adapters call after normalizing messages.
 * Handles: account linking, pairing flow, smart classification,
 * autonomous execution, streaming progress, and clarification sessions.
 */

import { getServiceClient } from '../lib/supabase'
import type { ChannelMessage, ChannelReplyHandle } from './types'
import { parseCommand } from './types'
import { runInboxAgent } from './inbox-agent'

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface ChannelLinkConfig {
  // Reserved for future use (clarification sessions removed with agent approach)
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
 * Autonomous capture + agent execution flow.
 *
 * 1. Idempotency check
 * 2. Insert raw row (status: 'executing')
 * 3. Run inbox agent (classifies AND executes in one call)
 * 4. Update proposal with result
 * 5. Reply via ChannelReplyHandle
 */
async function captureAndExecute(
  userId: string,
  _linkId: string,
  _linkConfig: ChannelLinkConfig | null,
  message: ChannelMessage,
  reply: ChannelReplyHandle
): Promise<void> {
  const db = getServiceClient()

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

  if (duplicates && duplicates.length > 0) {
    return
  }

  // ── Insert raw proposal (status: 'executing') ──────────────────
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
  const proposalId = inserted.id

  // ── Run inbox agent (classifies AND executes in one call) ──────
  const agentResult = await Promise.race([
    runInboxAgent(userId, message.text, message.channel),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 45_000)),
  ])

  if (agentResult) {
    await db
      .from('inbox_proposals')
      .update({
        action_type: agentResult.actionType,
        category: agentResult.category,
        target_file: agentResult.targetFile,
        status: agentResult.success ? 'applied' : 'failed',
        execution_result: {
          noteId: agentResult.noteId,
          updatedFile: agentResult.updatedFile,
          error: agentResult.error,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', proposalId)

    await reply.send(agentResult.message)
    return
  }

  // ── Fallback: agent timed out → save as thought to Inbox.md ────
  await db
    .from('inbox_proposals')
    .update({
      status: 'applied',
      action_type: 'add_thought',
      category: 'thought',
      target_file: 'Inbox.md',
      proposed_content: `- ${message.text}`,
      updated_at: new Date().toISOString(),
    })
    .eq('id', proposalId)

  await reply.send('Captured to your Inbox.')
}
