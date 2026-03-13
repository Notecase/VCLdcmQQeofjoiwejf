#!/usr/bin/env node

/**
 * Noteshell Setup — Generate ~/.noteshell.json
 *
 * Usage:
 *   node packages/mcp/scripts/setup.mjs <email> <password>
 *
 * This script signs in to Supabase and writes the config file with a valid access token.
 */

import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const SUPABASE_URL = 'https://lxjxoxwaesqxpgfdwkir.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx4anhveHdhZXNxeHBnZmR3a2lyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0OTQzNzEsImV4cCI6MjA4NDA3MDM3MX0.2hjP6JcoiHgfZMILSvaYyxe2A8BmKx-75XVLCPJrrf8'

const email = process.argv[2]
const password = process.argv[3]

if (!email || !password) {
  console.error('Usage: node packages/mcp/scripts/setup.mjs <email> <password>')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const { data, error } = await supabase.auth.signInWithPassword({ email, password })

if (error) {
  console.error('Login failed:', error.message)
  process.exit(1)
}

const config = {
  supabase_url: SUPABASE_URL,
  supabase_anon_key: SUPABASE_ANON_KEY,
  access_token: data.session.access_token,
}

const configPath = join(homedir(), '.noteshell.json')
writeFileSync(configPath, JSON.stringify(config, null, 2))
console.log(`✅ Config written to ${configPath}`)
console.log(`   User: ${data.user.email} (${data.user.id})`)
console.log(`   Token expires: ${new Date(data.session.expires_at * 1000).toISOString()}`)
