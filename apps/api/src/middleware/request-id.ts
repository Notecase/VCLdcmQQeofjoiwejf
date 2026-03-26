import type { Context, Next } from 'hono'
import { randomUUID } from 'node:crypto'

export async function requestIdMiddleware(c: Context, next: Next) {
  const id = randomUUID()
  c.set('requestId', id)
  c.header('X-Request-Id', id)
  await next()
}
