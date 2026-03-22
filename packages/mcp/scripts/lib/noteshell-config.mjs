import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export const DEFAULT_SUPABASE_URL = 'https://lxjxoxwaesqxpgfdwkir.supabase.co'
export const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx4anhveHdhZXNxeHBnZmR3a2lyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0OTQzNzEsImV4cCI6MjA4NDA3MDM3MX0.2hjP6JcoiHgfZMILSvaYyxe2A8BmKx-75XVLCPJrrf8'

export function writeNoteshellConfig({
  supabaseUrl = DEFAULT_SUPABASE_URL,
  supabaseAnonKey = DEFAULT_SUPABASE_ANON_KEY,
  accessToken,
  refreshToken,
  expiresAt,
  userId,
}) {
  const configPath = join(homedir(), '.noteshell.json')
  const config = {
    supabase_url: supabaseUrl,
    supabase_anon_key: supabaseAnonKey,
    access_token: accessToken,
  }

  if (refreshToken) config.refresh_token = refreshToken
  if (expiresAt) config.expires_at = expiresAt
  if (userId) config.user_id = userId

  writeFileSync(configPath, JSON.stringify(config, null, 2))
  return configPath
}
