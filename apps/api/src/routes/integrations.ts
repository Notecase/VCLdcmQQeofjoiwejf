/**
 * Integrations API Routes
 *
 * Connects external services (Google Calendar, Notion) to the Secretary.
 *
 * - GET    /api/integrations                — List connected integrations
 * - POST   /api/integrations/gcal/connect   — Get Google OAuth URL
 * - GET    /api/integrations/gcal/callback  — Handle OAuth callback
 * - POST   /api/integrations/gcal/sync      — Manual calendar sync
 * - DELETE /api/integrations/:provider      — Disconnect integration
 * - POST   /api/integrations/notion/connect — Save Notion token (BYOK)
 */

import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { randomBytes } from 'node:crypto'
import { authMiddleware, requireAuth } from '../middleware/auth'
import { getServiceClient } from '../lib/supabase'
import { config } from '../config'

const integrations = new Hono()
// Apply auth to all routes EXCEPT the OAuth callback (which is a browser redirect with no auth header)
integrations.use('/', authMiddleware)
integrations.use('/gcal/connect', authMiddleware)
integrations.use('/gcal/sync', authMiddleware)
integrations.use('/notion/connect', authMiddleware)
integrations.use('/gcal/events', authMiddleware)
integrations.use('/:provider', authMiddleware)

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events.readonly'

// ─────────────────────────────────────────────────────────────────────────────
// List integrations
// ─────────────────────────────────────────────────────────────────────────────

integrations.get('/', async (c) => {
  const auth = requireAuth(c)

  const { data, error } = await auth.supabase
    .from('user_integrations')
    .select('id, provider, status, external_id, scopes, last_sync_at, sync_error, config, created_at, updated_at')
    .eq('user_id', auth.userId)
    .order('provider')

  if (error) {
    return c.json({ error: 'Failed to fetch integrations' }, 500)
  }

  return c.json({
    integrations: (data ?? []).map((i) => ({
      id: i.id,
      provider: i.provider,
      status: i.status,
      externalId: i.external_id,
      scopes: i.scopes,
      lastSyncAt: i.last_sync_at,
      syncError: i.sync_error,
      calendarId: (i.config as Record<string, unknown>)?.calendarId || null,
      createdAt: i.created_at,
      updatedAt: i.updated_at,
    })),
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Google Calendar OAuth
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/integrations/gcal/connect
 * Returns the Google OAuth authorization URL
 */
integrations.post('/gcal/connect', async (c) => {
  const auth = requireAuth(c)

  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) {
    return c.json({ error: 'Google Calendar integration not configured' }, 503)
  }

  // Generate state token to prevent CSRF
  const state = randomBytes(32).toString('hex')

  // Store state temporarily in user_integrations
  const db = getServiceClient()
  await db
    .from('user_integrations')
    .upsert(
      {
        user_id: auth.userId,
        provider: 'gcal',
        status: 'pending',
        config: { oauth_state: state },
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,provider' }
    )

  const redirectUri = `${config.baseUrl}/api/integrations/gcal/callback`
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_CALENDAR_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state,
  })

  return c.json({ url: `${GOOGLE_AUTH_URL}?${params.toString()}` })
})

/**
 * GET /api/integrations/gcal/callback
 * Handles the OAuth callback from Google
 */
integrations.get('/gcal/callback', async (c) => {
  const code = c.req.query('code')
  const state = c.req.query('state')
  const errorParam = c.req.query('error')

  if (errorParam) {
    return c.redirect(`${config.baseUrl}/settings?integration=gcal&status=error&reason=${encodeURIComponent(errorParam)}`)
  }

  if (!code || !state) {
    return c.redirect(`${config.baseUrl}/settings?integration=gcal&status=error&reason=missing_params`)
  }

  // Look up the integration by state across all users (no auth header in browser redirect)
  const db = getServiceClient()
  const { data: rows } = await db
    .from('user_integrations')
    .select('id, config')
    .eq('provider', 'gcal')
    .eq('status', 'pending')

  const integration = rows?.find((r) => (r.config as Record<string, unknown>)?.oauth_state === state)

  if (!integration) {
    return c.redirect(`${config.baseUrl}/settings?integration=gcal&status=error&reason=invalid_state`)
  }

  // Exchange code for tokens
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = `${config.baseUrl}/api/integrations/gcal/callback`

  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId!,
      client_secret: clientSecret!,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  if (!tokenRes.ok) {
    const errBody = await tokenRes.text()
    console.error('Google token exchange failed:', errBody)
    await db
      .from('user_integrations')
      .update({ status: 'error', sync_error: 'Token exchange failed', updated_at: new Date().toISOString() })
      .eq('id', integration.id)
    return c.redirect(`${config.baseUrl}/settings?integration=gcal&status=error&reason=token_exchange_failed`)
  }

  const tokens = (await tokenRes.json()) as {
    access_token: string
    refresh_token?: string
    expires_in: number
    scope: string
  }

  const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

  await db
    .from('user_integrations')
    .update({
      status: 'active',
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || null,
      token_expires_at: tokenExpiresAt,
      scopes: tokens.scope.split(' '),
      config: { calendarId: 'primary' },
      sync_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', integration.id)

  // Redirect back to settings page
  return c.redirect(`${config.baseUrl}/settings?integration=gcal&status=connected`)
})

/**
 * POST /api/integrations/gcal/sync
 * Manual sync trigger — fetches events and writes to Calendar.md
 */
integrations.post('/gcal/sync', async (c) => {
  const auth = requireAuth(c)
  const db = getServiceClient()

  const { data: integration } = await db
    .from('user_integrations')
    .select('*')
    .eq('user_id', auth.userId)
    .eq('provider', 'gcal')
    .eq('status', 'active')
    .single()

  if (!integration) {
    return c.json({ error: 'Google Calendar not connected' }, 404)
  }

  try {
    // Refresh token if expired
    let accessToken = integration.access_token
    if (integration.token_expires_at && new Date(integration.token_expires_at) < new Date(Date.now() + 5 * 60 * 1000)) {
      if (!integration.refresh_token) {
        await db
          .from('user_integrations')
          .update({ status: 'error', sync_error: 'Refresh token missing, re-connect needed', updated_at: new Date().toISOString() })
          .eq('id', integration.id)
        return c.json({ error: 'Token expired, please reconnect' }, 401)
      }

      const refreshRes = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          refresh_token: integration.refresh_token,
          grant_type: 'refresh_token',
        }),
      })

      if (!refreshRes.ok) {
        await db
          .from('user_integrations')
          .update({ status: 'error', sync_error: 'Token refresh failed', updated_at: new Date().toISOString() })
          .eq('id', integration.id)
        return c.json({ error: 'Failed to refresh token' }, 500)
      }

      const refreshData = (await refreshRes.json()) as { access_token: string; expires_in: number }
      accessToken = refreshData.access_token
      const newExpiry = new Date(Date.now() + refreshData.expires_in * 1000).toISOString()

      await db
        .from('user_integrations')
        .update({ access_token: accessToken, token_expires_at: newExpiry, updated_at: new Date().toISOString() })
        .eq('id', integration.id)
    }

    // Fetch events for today + 30 days
    const now = new Date()
    const timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    const timeMax = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30).toISOString()
    const calendarId = (integration.config as Record<string, unknown>)?.calendarId || 'primary'

    const eventsUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId as string)}/events?` +
      new URLSearchParams({
        timeMin,
        timeMax,
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '250',
      })

    const eventsRes = await fetch(eventsUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!eventsRes.ok) {
      const errText = await eventsRes.text()
      console.error('Google Calendar events fetch failed:', errText)
      await db
        .from('user_integrations')
        .update({ sync_error: 'Events fetch failed', updated_at: new Date().toISOString() })
        .eq('id', integration.id)
      return c.json({ error: 'Failed to fetch events' }, 500)
    }

    const eventsData = (await eventsRes.json()) as {
      items: Array<{
        id?: string
        summary?: string
        start?: { dateTime?: string; date?: string }
        end?: { dateTime?: string; date?: string }
        location?: string
        description?: string
        status?: string
      }>
    }

    // Format events into Calendar.md
    const events = (eventsData.items || []).filter((e) => e.status !== 'cancelled')

    const todayStr = now.toISOString().slice(0, 10)
    const tomorrowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    const tomorrowStr = tomorrowDate.toISOString().slice(0, 10)

    const todayEvents = events.filter((e) => {
      const date = e.start?.dateTime?.slice(0, 10) || e.start?.date
      return date === todayStr
    })

    const tomorrowEvents = events.filter((e) => {
      const date = e.start?.dateTime?.slice(0, 10) || e.start?.date
      return date === tomorrowStr
    })

    const formatEvent = (e: (typeof events)[0]): string => {
      const startTime = e.start?.dateTime
        ? new Date(e.start.dateTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
        : 'All day'
      const endTime = e.end?.dateTime
        ? new Date(e.end.dateTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
        : ''
      const time = endTime ? `${startTime}-${endTime}` : startTime
      const location = e.location ? ` @ ${e.location}` : ''
      return `- ${time} — ${e.summary || 'Untitled'}${location}`
    }

    let calendarMd = `# Calendar\n\n*Last synced: ${new Date().toISOString()}*\n\n`
    calendarMd += `## Today (${todayStr})\n\n`
    if (todayEvents.length > 0) {
      calendarMd += todayEvents.map(formatEvent).join('\n') + '\n'
    } else {
      calendarMd += '*No events*\n'
    }
    calendarMd += `\n## Tomorrow (${tomorrowStr})\n\n`
    if (tomorrowEvents.length > 0) {
      calendarMd += tomorrowEvents.map(formatEvent).join('\n') + '\n'
    } else {
      calendarMd += '*No events*\n'
    }

    // Write to Calendar.md (today + tomorrow summary for AI context)
    await db
      .from('secretary_memory')
      .upsert(
        {
          user_id: auth.userId,
          filename: 'Calendar.md',
          content: calendarMd,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,filename' }
      )

    // Write structured events cache (_calendar_events.json) for frontend
    const rangeStartStr = timeMin.slice(0, 10)
    const rangeEndStr = timeMax.slice(0, 10)
    const structuredEvents = events.map((e) => {
      const isAllDay = !e.start?.dateTime
      const startTime = e.start?.dateTime || e.start?.date || ''
      const endTime = e.end?.dateTime || e.end?.date || ''
      const date = isAllDay ? (e.start?.date || '') : (e.start?.dateTime?.slice(0, 10) || '')
      return {
        id: e.id || crypto.randomUUID(),
        title: e.summary || 'Untitled',
        startTime,
        endTime,
        isAllDay,
        date,
        location: e.location || undefined,
        description: e.description || undefined,
        source: 'gcal' as const,
      }
    })

    const eventsCache = {
      syncedAt: new Date().toISOString(),
      rangeStart: rangeStartStr,
      rangeEnd: rangeEndStr,
      events: structuredEvents,
    }

    await db
      .from('secretary_memory')
      .upsert(
        {
          user_id: auth.userId,
          filename: '_calendar_events.json',
          content: JSON.stringify(eventsCache),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,filename' }
      )

    // Update sync timestamp
    await db
      .from('user_integrations')
      .update({ last_sync_at: new Date().toISOString(), sync_error: null, updated_at: new Date().toISOString() })
      .eq('id', integration.id)

    return c.json({
      success: true,
      events: { today: todayEvents.length, tomorrow: tomorrowEvents.length, total: structuredEvents.length },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await db
      .from('user_integrations')
      .update({ sync_error: msg, updated_at: new Date().toISOString() })
      .eq('id', integration.id)
    return c.json({ error: `Sync failed: ${msg}` }, 500)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Calendar Events (read cached structured events)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/integrations/gcal/events
 * Returns cached structured calendar events from _calendar_events.json
 * Optional query params: ?from=YYYY-MM-DD&to=YYYY-MM-DD
 */
integrations.get('/gcal/events', async (c) => {
  const auth = requireAuth(c)
  const db = getServiceClient()

  const { data } = await db
    .from('secretary_memory')
    .select('content')
    .eq('user_id', auth.userId)
    .eq('filename', '_calendar_events.json')
    .single()

  if (!data) {
    return c.json({ events: [], syncedAt: null, rangeStart: null, rangeEnd: null })
  }

  const cache = JSON.parse(data.content) as {
    syncedAt: string
    rangeStart: string
    rangeEnd: string
    events: Array<{ date: string; [key: string]: unknown }>
  }

  const from = c.req.query('from')
  const to = c.req.query('to')

  let events = cache.events
  if (from) events = events.filter((e) => e.date >= from)
  if (to) events = events.filter((e) => e.date <= to)

  return c.json({
    events,
    syncedAt: cache.syncedAt,
    rangeStart: cache.rangeStart,
    rangeEnd: cache.rangeEnd,
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Notion (BYOK token — simpler than OAuth)
// ─────────────────────────────────────────────────────────────────────────────

const NotionConnectSchema = z.object({
  token: z.string().min(10).max(500),
  database_id: z.string().min(1).max(200),
})

/**
 * POST /api/integrations/notion/connect
 * Save Notion internal integration token (BYOK pattern)
 */
integrations.post('/notion/connect', zValidator('json', NotionConnectSchema), async (c) => {
  const auth = requireAuth(c)
  const { token, database_id } = c.req.valid('json')

  const { error } = await auth.supabase
    .from('user_integrations')
    .upsert(
      {
        user_id: auth.userId,
        provider: 'notion',
        status: 'active',
        access_token: token,
        external_id: database_id,
        scopes: ['read_content'],
        config: { databaseId: database_id },
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,provider' }
    )

  if (error) {
    return c.json({ error: 'Failed to save Notion integration' }, 500)
  }

  return c.json({ success: true })
})

// ─────────────────────────────────────────────────────────────────────────────
// Disconnect
// ─────────────────────────────────────────────────────────────────────────────

/**
 * DELETE /api/integrations/:provider — Disconnect an integration
 */
integrations.delete('/:provider', async (c) => {
  const auth = requireAuth(c)
  const provider = c.req.param('provider')

  if (!['gcal', 'notion', 'obsidian'].includes(provider)) {
    return c.json({ error: 'Invalid provider' }, 400)
  }

  const { error } = await auth.supabase
    .from('user_integrations')
    .update({
      status: 'revoked',
      access_token: null,
      refresh_token: null,
      sync_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', auth.userId)
    .eq('provider', provider)

  if (error) {
    return c.json({ error: 'Failed to disconnect integration' }, 500)
  }

  return c.json({ success: true })
})

export default integrations
