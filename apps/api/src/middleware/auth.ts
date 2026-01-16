import { Context, Next } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { verifyToken, createUserClient, SupabaseClient } from '../lib/supabase'

/**
 * User context attached to requests after authentication
 */
export interface AuthContext {
  userId: string
  email?: string
  accessToken: string
  supabase: SupabaseClient
}

/**
 * Extend Hono context with auth info
 */
declare module 'hono' {
  interface ContextVariableMap {
    auth: AuthContext
  }
}

/**
 * Extract Bearer token from Authorization header
 */
function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null

  const parts = authHeader.split(' ')
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return null
  }

  return parts[1]
}

/**
 * Authentication middleware
 * Validates JWT token and attaches user context to request
 */
export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization')
  const token = extractBearerToken(authHeader)

  if (!token) {
    throw new HTTPException(401, {
      message: 'Missing or invalid Authorization header',
    })
  }

  const user = await verifyToken(token)

  if (!user) {
    throw new HTTPException(401, {
      message: 'Invalid or expired token',
    })
  }

  // Create user-scoped Supabase client
  const userSupabase = createUserClient(token)

  // Attach auth context to request
  c.set('auth', {
    userId: user.userId,
    email: user.email,
    accessToken: token,
    supabase: userSupabase,
  })

  await next()
}

/**
 * Optional authentication middleware
 * Attaches user context if token is valid, but doesn't fail if missing
 */
export async function optionalAuthMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization')
  const token = extractBearerToken(authHeader)

  if (token) {
    const user = await verifyToken(token)

    if (user) {
      const userSupabase = createUserClient(token)

      c.set('auth', {
        userId: user.userId,
        email: user.email,
        accessToken: token,
        supabase: userSupabase,
      })
    }
  }

  await next()
}

/**
 * Get auth context from request (throws if not authenticated)
 */
export function requireAuth(c: Context): AuthContext {
  const auth = c.get('auth')

  if (!auth) {
    throw new HTTPException(401, {
      message: 'Authentication required',
    })
  }

  return auth
}

/**
 * Get auth context from request (returns null if not authenticated)
 */
export function getAuth(c: Context): AuthContext | null {
  return c.get('auth') || null
}
