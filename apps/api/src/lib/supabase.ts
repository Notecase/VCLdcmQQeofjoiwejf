import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { config } from '../config'

/**
 * Service role Supabase client
 * Has full access, bypasses RLS - use for server-side operations
 */
let serviceClient: SupabaseClient | null = null

export function getServiceClient(): SupabaseClient {
  if (!serviceClient) {
    if (!config.supabase.url || !config.supabase.serviceKey) {
      throw new Error('Supabase URL and service key are required')
    }

    serviceClient = createClient(config.supabase.url, config.supabase.serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  }

  return serviceClient
}

/**
 * Create a user-scoped Supabase client from JWT token
 * Respects RLS policies - use for user-authenticated requests
 */
export function createUserClient(accessToken: string): SupabaseClient {
  if (!config.supabase.url || !config.supabase.anonKey) {
    throw new Error('Supabase URL and anon key are required')
  }

  return createClient(config.supabase.url, config.supabase.anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

/**
 * Verify a Supabase JWT token and return user info
 */
export async function verifyToken(accessToken: string): Promise<{
  userId: string
  email?: string
  role?: string
} | null> {
  try {
    const client = getServiceClient()

    const {
      data: { user },
      error,
    } = await client.auth.getUser(accessToken)

    if (error || !user) {
      return null
    }

    return {
      userId: user.id,
      email: user.email,
      role: user.role,
    }
  } catch {
    return null
  }
}

export type { SupabaseClient }
