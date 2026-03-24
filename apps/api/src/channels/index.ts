/**
 * Channel Routes Aggregator
 *
 * Mounts all channel adapter webhook routes.
 * Each adapter handles its own webhook verification.
 */

import { Hono } from 'hono'
import telegram from './telegram'

const channelRoutes = new Hono()

// Telegram webhook: POST /api/channels/telegram/webhook
channelRoutes.route('/telegram', telegram)

// Future: Discord, WhatsApp
// channelRoutes.route('/discord', discord)
// channelRoutes.route('/whatsapp', whatsapp)

export { channelRoutes }
