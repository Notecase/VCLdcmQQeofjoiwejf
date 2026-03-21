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
 * Middleware that blocks requests when user credits are exhausted.
 * Must be applied AFTER authMiddleware (requires auth context).
 */
export async function creditGuard(c: Context, next: Next) {
  const auth = c.get('auth')
  if (!auth) {
    throw new HTTPException(401, { message: 'Authentication required' })
  }

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
