/**
 * Channel Abstraction Types
 *
 * Interfaces for the multi-platform messaging capture system.
 * Each platform adapter normalizes messages into ChannelMessage format.
 */

import type { ChannelType } from '@inkdown/shared/types'

/** Normalized message from any channel */
export interface ChannelMessage {
  channel: ChannelType
  externalUserId: string
  displayName: string | null
  text: string
  timestamp: Date
  mediaType?: 'text' | 'photo' | 'voice' | 'document'
  rawPayload?: unknown
}

/** Response to send back to the channel */
export interface ChannelResponse {
  text: string
  parseMode?: 'Markdown' | 'HTML'
}

/** Callback handle for sending/editing replies in a channel */
export interface ChannelReplyHandle {
  send(text: string, parseMode?: 'Markdown' | 'HTML'): Promise<void>
  edit(text: string, parseMode?: 'Markdown' | 'HTML'): Promise<void>
}

/** Command parsed from a channel message */
export interface ParsedCommand {
  command: string // 'start', 'status', 'help'
  args: string // everything after the command
}

/**
 * Parse a /command from message text
 * Returns null if the message isn't a command
 */
export function parseCommand(text: string): ParsedCommand | null {
  const match = text.trim().match(/^\/(\w+)(?:\s+(.*))?$/)
  if (!match) return null
  return { command: match[1], args: (match[2] || '').trim() }
}
