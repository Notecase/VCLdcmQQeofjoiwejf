/**
 * Telegram Channel Adapter (Grammy.js)
 *
 * Webhook-based Telegram bot that captures messages to inbox_proposals.
 * Uses Grammy's native Hono adapter for webhook handling.
 */

import { Hono } from 'hono'
import { Bot, webhookCallback } from 'grammy'
import { config } from '../config'
import { handleIncomingMessage } from './handler'
import type { ChannelMessage, ChannelReplyHandle } from './types'

const telegram = new Hono()

// Only initialize bot if token is configured
const botToken = config.telegram.botToken
let bot: Bot | null = null

if (botToken) {
  bot = new Bot(botToken)

  // Handle all text messages
  bot.on('message:text', async (ctx) => {
    const message: ChannelMessage = {
      channel: 'telegram',
      externalUserId: String(ctx.chat.id),
      displayName: ctx.from?.username ? `@${ctx.from.username}` : ctx.from?.first_name || null,
      text: ctx.message.text,
      timestamp: new Date(ctx.message.date * 1000),
      mediaType: 'text',
    }

    // Build reply handle for streaming send/edit
    let sentMessageId: number | null = null
    const replyHandle: ChannelReplyHandle = {
      async send(text, parseMode) {
        const sent = await ctx.reply(text, { parse_mode: parseMode || undefined })
        sentMessageId = sent.message_id
      },
      async edit(text, parseMode) {
        if (sentMessageId) {
          try {
            await ctx.api.editMessageText(ctx.chat.id, sentMessageId, text, {
              parse_mode: parseMode || undefined,
            })
          } catch {
            // Edit may fail if message content unchanged — ignore
          }
        }
      },
    }

    await handleIncomingMessage(message, replyHandle)
  })

  // Webhook endpoint — Grammy handles secret verification natively
  const secret = config.telegram.webhookSecret
  const handler = webhookCallback(bot!, 'hono', {
    timeoutMilliseconds: 55_000,
    secretToken: secret || undefined,
  })

  telegram.post('/webhook', async (c) => {
    return handler(c)
  })
} else {
  telegram.post('/webhook', (c) => {
    return c.json({ error: 'Telegram bot not configured' }, 503)
  })
}

export default telegram
