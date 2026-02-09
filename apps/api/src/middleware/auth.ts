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

/**
 * Verify that the authenticated user owns the specified note
 * Returns the note ID if ownership is verified, null otherwise
 */
export async function verifyNoteOwnership(auth: AuthContext, noteId: string): Promise<boolean> {
  const { data, error } = await auth.supabase
    .from('notes')
    .select('id')
    .eq('id', noteId)
    .eq('user_id', auth.userId)
    .single()

  return !error && !!data
}

/**
 * Require that the user owns the note, throwing HTTPException if not
 */
export async function requireNoteOwnership(auth: AuthContext, noteId: string): Promise<void> {
  const isOwner = await verifyNoteOwnership(auth, noteId)
  if (!isOwner) {
    throw new HTTPException(404, { message: 'Note not found' })
  }
}

/**
 * Get OpenAI API key from environment, throwing if not configured
 */
export function requireOpenAIKey(): string {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new HTTPException(500, { message: 'OpenAI API key not configured' })
  }
  return apiKey
}

/**
 * UUID validation regex
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Validate UUID format
 */
export function isValidUUID(id: string): boolean {
  return UUID_REGEX.test(id)
}

/**
 * Require valid UUID format, throwing HTTPException if invalid
 */
export function requireValidUUID(id: string, paramName = 'id'): void {
  if (!isValidUUID(id)) {
    throw new HTTPException(400, { message: `Invalid ${paramName} format` })
  }
}
