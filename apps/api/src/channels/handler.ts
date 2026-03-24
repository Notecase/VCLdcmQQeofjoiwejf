/**
 * Channel Message Handler
 *
 * Shared logic that all channel adapters call after normalizing messages.
 * Handles: account linking, pairing flow, and message capture to inbox_proposals.
 */

import { getServiceClient } from '../lib/supabase'
import type { ChannelMessage, ChannelResponse } from './types'
import { parseCommand } from './types'

/**
 * Handle an incoming message from any channel.
 * Returns a ChannelResponse to send back.
 */
export async function handleIncomingMessage(message: ChannelMessage): Promise<ChannelResponse> {
  const db = getServiceClient()

  // Look up linked account
  const { data: link } = await db
    .from('user_channel_links')
    .select('id, user_id, status')
    .eq('channel', message.channel)
    .eq('external_id', message.externalUserId)
    .eq('status', 'active')
    .single()

  // Check for commands
  const cmd = parseCommand(message.text)

  // Handle /start <pairing_code> for account linking
  if (cmd?.command === 'start' && cmd.args) {
    return handlePairing(message, cmd.args)
  }

  // If not linked, prompt linking
  if (!link) {
    if (cmd?.command === 'help') {
      return {
        text: 'Link your account first:\n1. Go to Settings > Messaging in the Noteshell app\n2. Click "Link Telegram"\n3. Send me the code or tap the link',
      }
    }
    return {
      text: "Your account isn't linked yet. Go to Settings > Messaging in the Noteshell app to link your Telegram.",
    }
  }

  // Handle /status command
  if (cmd?.command === 'status') {
    return {
      text: 'Your account is linked and active. Send any message to capture it to your inbox.',
    }
  }

  // Handle /help command
  if (cmd?.command === 'help') {
    return {
      text: 'Just send me anything — tasks, vocab, ideas, links — and it will appear in your Inbox tab.\n\nCommands:\n/status — Check link status\n/help — Show this help',
    }
  }

  // Capture message to inbox_proposals
  return captureToProposals(link.user_id, message)
}

/**
 * Handle /start <code> pairing flow
 */
async function handlePairing(message: ChannelMessage, code: string): Promise<ChannelResponse> {
  const db = getServiceClient()

  // Find pending pairing with this code
  const { data: pending, error } = await db
    .from('user_channel_links')
    .select('id, user_id, channel, pairing_expires_at')
    .eq('pairing_code', code.toUpperCase())
    .eq('status', 'pending')
    .single()

  if (error || !pending) {
    return { text: 'Invalid or expired code. Generate a new one in Settings > Messaging.' }
  }

  // Check expiry
  if (pending.pairing_expires_at && new Date(pending.pairing_expires_at) < new Date()) {
    return { text: 'This code has expired. Generate a new one in Settings > Messaging.' }
  }

  // Check channel matches
  if (pending.channel !== message.channel) {
    return { text: `This code is for ${pending.channel}, not ${message.channel}.` }
  }

  // Complete linking
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
    text: "Linked! Send me anything — tasks, vocab, ideas — and it'll appear in your Inbox tab.",
  }
}

/**
 * Insert message into inbox_proposals as a raw capture
 */
async function captureToProposals(
  userId: string,
  message: ChannelMessage
): Promise<ChannelResponse> {
  const db = getServiceClient()

  const { error } = await db.from('inbox_proposals').insert({
    user_id: userId,
    source: message.channel,
    raw_text: message.text,
    status: 'pending',
    metadata: {
      displayName: message.displayName,
      timestamp: message.timestamp.toISOString(),
      mediaType: message.mediaType || 'text',
    },
  })

  if (error) {
    return { text: 'Failed to capture. Please try again.' }
  }

  return { text: 'Captured.' }
}
