/**
 * Noteshell MCP Config
 *
 * Loads ~/.noteshell.json and validates with zod.
 * Falls back to environment variables.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { z } from 'zod'

const ConfigSchema = z
  .object({
    supabase_url: z.string().url(),
    supabase_anon_key: z.string().min(1),
    access_token: z.string().min(1).optional(),
    refresh_token: z.string().min(1).optional(),
    expires_at: z.string().optional(), // ISO string — when access_token expires
    service_key: z.string().min(1).optional(),
    user_id: z.string().uuid().optional(),
  })
  .refine((c) => c.access_token || (c.service_key && c.user_id), {
    message: 'Provide either access_token OR service_key + user_id',
  })

export type NoteshellConfig = z.infer<typeof ConfigSchema>

/**
 * Load config from ~/.noteshell.json or environment variables.
 * Throws on invalid/missing config.
 */
export function loadConfig(): NoteshellConfig {
  // Try file first
  const configPath = join(homedir(), '.noteshell.json')
  try {
    const raw = readFileSync(configPath, 'utf-8')
    const parsed = JSON.parse(raw)
    return ConfigSchema.parse(parsed)
  } catch {
    // Fall back to env vars
  }

  const fromEnv = {
    supabase_url: process.env.SUPABASE_URL,
    supabase_anon_key: process.env.SUPABASE_ANON_KEY,
    access_token: process.env.NOTESHELL_ACCESS_TOKEN || undefined,
    service_key: process.env.SUPABASE_SERVICE_KEY || undefined,
    user_id: process.env.NOTESHELL_USER_ID || undefined,
  }

  try {
    return ConfigSchema.parse(fromEnv)
  } catch {
    throw new Error(
      'Missing Noteshell config. Create ~/.noteshell.json with {supabase_url, supabase_anon_key, access_token} ' +
        'or {supabase_url, supabase_anon_key, service_key, user_id}. ' +
        'Alternatively set SUPABASE_URL, SUPABASE_ANON_KEY, and either NOTESHELL_ACCESS_TOKEN or SUPABASE_SERVICE_KEY + NOTESHELL_USER_ID env vars.'
    )
  }
}
