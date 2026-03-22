#!/usr/bin/env node

/**
 * Noteshell Setup — Legacy email/password login
 * Prefer: npx @noteshell/mcp login  (browser flow)
 *
 * Usage:
 *   noteshell-setup <email> <password>
 */

import { createClient } from '@supabase/supabase-js'
import {
  DEFAULT_SUPABASE_URL,
  DEFAULT_SUPABASE_ANON_KEY,
  writeNoteshellConfig,
} from './lib/noteshell-config.mjs'

const email = process.argv[2]
const password = process.argv[3]

if (!email || !password) {
  console.error('Usage: noteshell-setup <email> <password>')
  console.error('Tip: use "noteshell login" for browser-based login (works with all account types)')
  process.exit(1)
}

const supabase = createClient(DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_ANON_KEY)
const { data, error } = await supabase.auth.signInWithPassword({ email, password })

if (error) {
  console.error('Login failed:', error.message)
  process.exit(1)
}

const configPath = writeNoteshellConfig({
  supabaseUrl: DEFAULT_SUPABASE_URL,
  supabaseAnonKey: DEFAULT_SUPABASE_ANON_KEY,
  accessToken: data.session.access_token,
  refreshToken: data.session.refresh_token ?? undefined,
  expiresAt: new Date(data.session.expires_at * 1000).toISOString(),
  userId: data.user.id,
})

console.log(`✅ Config written to ${configPath}`)
console.log(`   User: ${data.user.email} (${data.user.id})`)
console.log(`   Token expires: ${new Date(data.session.expires_at * 1000).toISOString()}`)
