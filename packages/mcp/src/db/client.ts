/**
 * Supabase Client for MCP Server
 *
 * Creates an authenticated Supabase client.
 * Supports two modes:
 *   1. access_token — user JWT, RLS enforced at DB level
 *   2. service_key + user_id — bypasses RLS, queries filter by user_id (dev/local)
 *
 * If access_token is within 5 minutes of expiry and refresh_token is present,
 * automatically refreshes and rewrites ~/.noteshell.json.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { NoteshellConfig } from '../config.js'

export interface DbClient {
  supabase: SupabaseClient
  userId: string
}

/**
 * Extract user_id (sub claim) from a JWT without verification.
 */
function extractUserId(jwt: string): string {
  try {
    const payload = jwt.split('.')[1]
    if (!payload) throw new Error('Invalid JWT format')
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'))
    if (!decoded.sub) throw new Error('JWT missing sub claim')
    return decoded.sub as string
  } catch (e) {
    throw new Error(`Failed to extract user_id from access_token: ${(e as Error).message}`)
  }
}

/**
 * Create a Supabase client from config.
 * If access_token is expired and refresh_token is present, refreshes automatically
 * and rewrites ~/.noteshell.json with the new tokens.
 */
export async function createDbClient(config: NoteshellConfig): Promise<DbClient> {
  // Check if token is within 5 minutes of expiry and we have a refresh token
  if (config.access_token && config.refresh_token && config.expires_at) {
    const expiresAt = new Date(config.expires_at).getTime()
    const fiveMinutes = 5 * 60 * 1000
    if (Date.now() > expiresAt - fiveMinutes) {
      try {
        const tempClient = createClient(config.supabase_url, config.supabase_anon_key, {
          auth: { autoRefreshToken: false, persistSession: false },
        })
        const { data, error } = await tempClient.auth.setSession({
          access_token: config.access_token,
          refresh_token: config.refresh_token,
        })
        if (!error && data.session) {
          // Update config in memory and rewrite ~/.noteshell.json
          const { join } = await import('node:path')
          const { homedir } = await import('node:os')
          const { writeFileSync } = await import('node:fs')
          const updatedConfig = {
            ...config,
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token ?? config.refresh_token,
            expires_at: new Date(data.session.expires_at! * 1000).toISOString(),
          }
          const configPath = join(homedir(), '.noteshell.json')
          writeFileSync(configPath, JSON.stringify(updatedConfig, null, 2))
          // Use refreshed token
          config = updatedConfig
        }
      } catch {
        console.error(
          'Noteshell: token refresh failed — run `npx @noteshell/mcp login` to re-authenticate'
        )
      }
    }
  }

  const bearerToken = config.service_key ?? config.access_token!
  const userId = config.user_id ?? extractUserId(config.access_token!)

  const supabase = createClient(config.supabase_url, config.supabase_anon_key, {
    global: {
      headers: {
        Authorization: `Bearer ${bearerToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  return { supabase, userId }
}
