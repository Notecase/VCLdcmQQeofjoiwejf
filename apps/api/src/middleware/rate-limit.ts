/**
 * Rate Limiting Middleware
 *
 * In-memory sliding window rate limiter keyed by userId.
 * Returns 429 with Retry-After header when limit exceeded.
 *
 * NOTE: In-memory is fine for single-instance deployments.
 * For multi-instance, migrate to Redis-backed (Upstash) later.
 */

import type { Context, Next } from 'hono'
import { aiSafetyLog } from '@inkdown/ai/observability'
import { config } from '../config'

interface WindowEntry {
  timestamps: number[]
}

const windows = new Map<string, WindowEntry>()

// Periodically clean up old entries to prevent memory leaks
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes
let lastCleanup = Date.now()

function cleanupOldEntries() {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return
  lastCleanup = now

  const windowMs = 60_000
  for (const [key, entry] of windows) {
    entry.timestamps = entry.timestamps.filter((ts) => now - ts < windowMs)
    if (entry.timestamps.length === 0) {
      windows.delete(key)
    }
  }
}

/**
 * Sliding window rate limiter middleware for Hono.
 * Extracts userId from the auth context set by authMiddleware.
 */
export function rateLimitMiddleware() {
  return async (c: Context, next: Next) => {
    // Extract userId from auth context (set by authMiddleware)
    const userId = c.get('userId') as string | undefined
    if (!userId) {
      // No auth context — skip rate limiting (auth middleware will reject)
      return next()
    }

    const now = Date.now()
    const windowMs = 60_000 // 1 minute window
    const maxRequests = config.rateLimit.requestsPerMinute

    // Get or create window entry
    let entry = windows.get(userId)
    if (!entry) {
      entry = { timestamps: [] }
      windows.set(userId, entry)
    }

    // Remove timestamps outside the window
    entry.timestamps = entry.timestamps.filter((ts) => now - ts < windowMs)

    // Check limit
    if (entry.timestamps.length >= maxRequests) {
      const oldestInWindow = entry.timestamps[0]
      const retryAfterMs = windowMs - (now - oldestInWindow)
      const retryAfterSeconds = Math.ceil(retryAfterMs / 1000)

      // Periodic cleanup
      cleanupOldEntries()

      aiSafetyLog('rate_limited', {
        userId,
        requestsInWindow: entry.timestamps.length,
        maxRequests,
        retryAfterSeconds,
      })

      return c.json(
        {
          error: 'Rate limit exceeded',
          retryAfter: retryAfterSeconds,
        },
        429,
        {
          'Retry-After': String(retryAfterSeconds),
        }
      )
    }

    // Record this request
    entry.timestamps.push(now)

    // Periodic cleanup
    cleanupOldEntries()

    return next()
  }
}
