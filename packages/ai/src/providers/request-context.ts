/**
 * Request Context
 *
 * Uses AsyncLocalStorage to propagate userId through the call stack
 * without modifying every agent's function signatures.
 */

import { AsyncLocalStorage } from 'node:async_hooks'

interface RequestContextData {
  userId: string
}

const storage = new AsyncLocalStorage<RequestContextData>()

export const requestContext = {
  /**
   * Run a callback with userId in context.
   * All downstream code can read getCurrentUserId().
   */
  run<T>(data: RequestContextData, fn: () => T): T {
    return storage.run(data, fn)
  },

  /**
   * Get current context data, or undefined if not in a request context.
   */
  getStore(): RequestContextData | undefined {
    return storage.getStore()
  },
}

/**
 * Get the current userId from request context.
 * Returns undefined if not inside a requestContext.run() call.
 */
export function getCurrentUserId(): string | undefined {
  return storage.getStore()?.userId
}
