/**
 * API Utilities
 *
 * Helper functions for making authenticated API requests.
 * Handles auth token retrieval and header creation.
 */

import { getAuthService, isServicesInitialized } from '@/services'

/**
 * Get current access token for API requests
 */
export async function getAccessToken(): Promise<string | null> {
  if (!isServicesInitialized()) return null

  try {
    const auth = getAuthService()
    const result = await auth.getSession()
    return result.data?.access_token || null
  } catch {
    return null
  }
}

/**
 * Create fetch options with auth header
 * @param includeContentType - Whether to include Content-Type: application/json (default: true)
 */
export async function createAuthHeaders(includeContentType = true): Promise<HeadersInit> {
  const token = await getAccessToken()

  return {
    ...(includeContentType ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

/**
 * Authenticated fetch wrapper
 *
 * Automatically adds Authorization header with current access token.
 * Falls back to regular fetch if auth service is not initialized.
 * For FormData bodies, Content-Type is not set (browser sets it with boundary).
 */
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  // Don't set Content-Type for FormData - browser will set it with boundary
  const isFormData = options.body instanceof FormData
  const headers = await createAuthHeaders(!isFormData)

  return fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...(options.headers || {}),
    },
  })
}

/**
 * Authenticated fetch with SSE support
 *
 * Same as authFetch but sets Accept header for SSE streams.
 * For FormData bodies, Content-Type is not set (browser sets it with boundary).
 */
export async function authFetchSSE(url: string, options: RequestInit = {}): Promise<Response> {
  // Don't set Content-Type for FormData - browser will set it with boundary
  const isFormData = options.body instanceof FormData
  const headers = await createAuthHeaders(!isFormData)

  return fetch(url, {
    ...options,
    headers: {
      ...headers,
      Accept: 'text/event-stream',
      ...(options.headers || {}),
    },
  })
}
