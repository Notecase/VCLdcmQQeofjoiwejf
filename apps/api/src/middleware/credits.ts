/**
 * Credit Guard & Request Context Middleware
 *
 * creditGuard: Checks credit balance before allowing AI requests.
 * requestContextMiddleware: Propagates userId via AsyncLocalStorage for token tracking.
 */

import { Context, Next } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { getServiceClient } from '../lib/supabase'

/**
 * Per-user concurrent AI request counter.
 * Prevents credit race conditions: without this, two concurrent requests
 * could both pass the balance check before either deducts, allowing free usage.
 * Also prevents abuse from spamming multiple AI requests simultaneously.
 *
 * Limit of 2 allows multi-tab usage (e.g., editor + secretary)
 * while preventing unbounded concurrency.
 *
 * In-memory: resets on server restart, acceptable for single-instance deployment.
 */
const MAX_CONCURRENT_AI_REQUESTS = 2
const inFlightRequests = new Map<string, number>()

/**
 * Decrement a user's in-flight request count.
 * Uses a flag to prevent double-decrement (abort signal + fallback may both fire).
 */
function createDecrementer(userId: string) {
  let called = false
  return () => {
    if (called) return
    called = true
    const remaining = (inFlightRequests.get(userId) ?? 1) - 1
    if (remaining <= 0) {
      inFlightRequests.delete(userId)
    } else {
      inFlightRequests.set(userId, remaining)
    }
  }
}

/**
 * Middleware that blocks requests when user credits are exhausted.
 * Also limits concurrent AI requests per user to prevent credit race conditions.
 * Must be applied AFTER authMiddleware (requires auth context).
 */
export async function creditGuard(c: Context, next: Next) {
  const auth = c.get('auth')
  if (!auth) {
    throw new HTTPException(401, { message: 'Authentication required' })
  }

  // --- Concurrent request limit (prevents credit race condition) ---
  const currentCount = inFlightRequests.get(auth.userId) ?? 0
  if (currentCount >= MAX_CONCURRENT_AI_REQUESTS) {
    throw new HTTPException(429, {
      message: JSON.stringify({
        code: 'CONCURRENT_LIMIT',
        message: 'Please wait for your current AI request to complete before sending another.',
      }),
    })
  }
  inFlightRequests.set(auth.userId, currentCount + 1)

  const decrement = createDecrementer(auth.userId)

  // --- Credit balance check ---
  try {
    const serviceClient = getServiceClient()

    const { data, error } = await serviceClient
      .from('user_credits')
      .select('balance_cents, plan_expires_at')
      .eq('user_id', auth.userId)
      .single()

    // No row = no credits granted yet
    if (error || !data) {
      throw new HTTPException(402, {
        message: JSON.stringify({
          code: 'CREDITS_EXHAUSTED',
          message: 'No AI credits available. Please contact support to get started.',
        }),
      })
    }

    // Check plan expiry
    if (data.plan_expires_at && new Date(data.plan_expires_at) < new Date()) {
      throw new HTTPException(402, {
        message: JSON.stringify({
          code: 'CREDITS_EXHAUSTED',
          message: 'Your plan has expired.',
        }),
      })
    }

    // Check balance
    if (data.balance_cents <= 0) {
      throw new HTTPException(402, {
        message: JSON.stringify({
          code: 'CREDITS_EXHAUSTED',
          message: "You've used all your AI credits.",
        }),
      })
    }

    await next()

    // After next() returns, check if the response is SSE (streaming).
    // For SSE: streamSSE() returns a Response immediately but the stream
    // continues in the background. Decrement via abort signal when the
    // connection actually closes (stream ends or client disconnects).
    // For non-SSE: the request is fully done — decrement immediately.
    const isSSE = c.res?.headers?.get('content-type')?.includes('text/event-stream')
    if (isSSE) {
      // Primary: abort signal fires when client disconnects or connection closes
      c.req.raw.signal.addEventListener('abort', decrement, { once: true })
      // Safety net: auto-decrement after 10 minutes to prevent counter leaks
      // if the abort signal doesn't fire on normal stream completion.
      // The once-flag in createDecrementer prevents double-decrement.
      const timer = setTimeout(decrement, 10 * 60 * 1000)
      if (typeof timer.unref === 'function') timer.unref()
    } else {
      decrement()
    }
  } catch (err) {
    // Error path (402, etc.): request is done, decrement immediately
    decrement()
    throw err
  }
}

/**
 * Middleware that sets up AsyncLocalStorage request context with userId.
 * Enables getCurrentUserId() in downstream token tracking code.
 * Must be applied AFTER authMiddleware.
 */
export async function requestContextMiddleware(c: Context, next: Next) {
  const auth = c.get('auth')
  if (!auth) {
    await next()
    return
  }

  const { requestContext } = await import('@inkdown/ai')
  return requestContext.run({ userId: auth.userId }, () => next())
}
