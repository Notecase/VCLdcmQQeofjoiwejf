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
import type { ChannelMessage } from './types'

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

    const response = await handleIncomingMessage(message)
    await ctx.reply(response.text)
  })

  // Webhook endpoint
  telegram.post('/webhook', async (c) => {
    // Verify webhook secret if configured
    const secret = config.telegram.webhookSecret
    if (secret) {
      const headerSecret = c.req.header('X-Telegram-Bot-Api-Secret-Token')
      if (headerSecret !== secret) {
        return c.json({ error: 'Invalid secret' }, 403)
      }
    }

    const handler = webhookCallback(bot!, 'hono')
    return handler(c)
  })
} else {
  telegram.post('/webhook', (c) => {
    return c.json({ error: 'Telegram bot not configured' }, 503)
  })
}

export default telegram
