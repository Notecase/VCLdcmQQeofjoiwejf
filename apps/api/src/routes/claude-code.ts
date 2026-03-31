/**
 * Claude Code WebSocket Route
 *
 * Handles WebSocket connections at /ws/claude-code.
 * Auth via ?token= query parameter (browsers can't set WS headers).
 * Process is spawned lazily on the first message (not on connect),
 * because Claude Code `-p --input-format stream-json` expects stdin input immediately.
 */

import { Hono } from 'hono'
import type { WSContext } from 'hono/ws'
import { verifyToken } from '../lib/supabase'
import { processManager } from '../services/claude-process'
import type { WsClientPayload } from '@inkdown/shared/types'

/**
 * Create the Claude Code WebSocket route.
 * Requires `upgradeWebSocket` from @hono/node-ws to be passed in.
 */
export function createClaudeCodeRoute(
  upgradeWebSocket: (
    createEvents: (c: unknown) => {
      onOpen?: (evt: unknown, ws: WSContext) => void
      onMessage?: (evt: { data: unknown }, ws: WSContext) => void
      onClose?: (evt: unknown, ws: WSContext) => void
      onError?: (evt: unknown, ws: WSContext) => void
    }
  ) => unknown
) {
  const route = new Hono()

  route.get(
    '/',
    upgradeWebSocket((c) => {
      let sessionId: string | null = null
      let userId: string | null = null
      let accessToken: string | null = null
      let authenticated = false

      return {
        async onOpen(_evt, ws) {
          // Extract token from query param
          const url = new URL((c as { req: { url: string } }).req.url, 'http://localhost')
          const token = url.searchParams.get('token')

          if (!token) {
            ws.send(JSON.stringify({ type: 'error', message: 'Missing token parameter' }))
            ws.close(4001, 'Unauthorized')
            return
          }

          // Verify JWT
          const user = await verifyToken(token)
          if (!user) {
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid or expired token' }))
            ws.close(4001, 'Unauthorized')
            return
          }

          userId = user.userId
          accessToken = token
          authenticated = true

          // Check for existing session — rewire callback
          const existing = processManager.findSessionByUser(userId)
          if (existing) {
            sessionId = existing.id
            existing.onEvent = (event) => {
              try {
                ws.send(JSON.stringify(event))
              } catch {
                // WS may have closed
              }
            }
            ws.send(JSON.stringify({ type: 'session.state', state: 'idle' }))
            return
          }

          // Signal ready — process will be spawned on first message
          ws.send(JSON.stringify({ type: 'session.state', state: 'idle' }))
        },

        onMessage(evt, ws) {
          if (!authenticated || !userId || !accessToken) return

          const data = typeof evt.data === 'string' ? evt.data : String(evt.data)

          let payload: WsClientPayload
          try {
            payload = JSON.parse(data)
          } catch {
            return
          }

          switch (payload.type) {
            case 'message': {
              // Lazy spawn: create session on first message so stdin has data immediately
              if (!sessionId) {
                if (processManager.isAtCapacity) {
                  ws.send(
                    JSON.stringify({
                      type: 'error',
                      message: 'Server at maximum session capacity',
                    })
                  )
                  return
                }

                try {
                  sessionId = processManager.createSession(userId, {
                    accessToken: accessToken,
                    initialPrompt: payload.content,
                    context: payload.context,
                    onEvent: (event) => {
                      try {
                        ws.send(JSON.stringify(event))
                      } catch {
                        // WS may have closed
                      }
                    },
                  })
                } catch (err) {
                  ws.send(
                    JSON.stringify({
                      type: 'error',
                      message: `Failed to create session: ${(err as Error).message}`,
                    })
                  )
                }
                return
              }

              // Existing session — send message to stdin
              processManager.sendMessage(sessionId, payload.content, payload.context)
              break
            }
            case 'interrupt':
              if (sessionId) processManager.interrupt(sessionId)
              break
          }
        },

        onClose() {
          // Don't destroy session immediately — let idle timer handle it
        },

        onError() {
          // Same as close — rely on idle timer
        },
      }
    }) as never
  )

  return route
}
