#!/usr/bin/env node

/**
 * Pre-dev environment check.
 * Errors block startup (exit 1). Warnings print but allow startup.
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const warnings = []
const errors = []

/** Read a non-commented value from an env file. Returns empty string if not found. */
function getEnvValue(filePath, key) {
  if (!existsSync(filePath)) return ''
  const content = readFileSync(filePath, 'utf-8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('#') || !trimmed.includes('=')) continue
    const [k, ...rest] = trimmed.split('=')
    if (k.trim() === key) return rest.join('=').trim()
  }
  return ''
}

/** Check if a value looks like an unfilled placeholder. */
function isPlaceholder(value) {
  if (!value) return true
  const lower = value.toLowerCase()
  return (
    lower.startsWith('your-') ||
    lower.startsWith('your_') ||
    lower === 'sk-...' ||
    lower === 'sk-ant-...' ||
    lower === 'eyj...' ||
    lower === '...' ||
    /^https?:\/\/your-/.test(lower)
  )
}

// ─── Check apps/api/.env ─────────────────────────────────────────────────────

const apiEnv = resolve(root, 'apps/api/.env')
if (!existsSync(apiEnv)) {
  errors.push(
    `Missing apps/api/.env — AI features and Supabase will not work.\n` +
    `  Fix: cp apps/api/.env.example apps/api/.env && edit apps/api/.env`
  )
} else {
  // Check for placeholder values in critical fields
  const supabaseUrl = getEnvValue(apiEnv, 'SUPABASE_URL')
  if (isPlaceholder(supabaseUrl)) {
    warnings.push(
      `apps/api/.env: SUPABASE_URL looks like a placeholder ("${supabaseUrl}").\n` +
      `  Replace it with your actual Supabase project URL.`
    )
  }
  const serviceKey = getEnvValue(apiEnv, 'SUPABASE_SERVICE_KEY')
  if (isPlaceholder(serviceKey)) {
    warnings.push(
      `apps/api/.env: SUPABASE_SERVICE_KEY looks like a placeholder.\n` +
      `  Get it from: Supabase Dashboard > Settings > API > service_role key`
    )
  }
  // AI provider keys — warn if none are set
  const openai = getEnvValue(apiEnv, 'OPENAI_API_KEY')
  const anthropic = getEnvValue(apiEnv, 'ANTHROPIC_API_KEY')
  const google = getEnvValue(apiEnv, 'GOOGLE_AI_API_KEY')
  if (isPlaceholder(openai) && isPlaceholder(anthropic) && isPlaceholder(google)) {
    warnings.push(
      `apps/api/.env: No AI provider API keys are configured.\n` +
      `  Set at least one of: OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_AI_API_KEY`
    )
  }
}

// ─── Check apps/web/.env ─────────────────────────────────────────────────────

const webEnv = resolve(root, 'apps/web/.env')
if (!existsSync(webEnv)) {
  errors.push(
    `Missing apps/web/.env — the app will be stuck in demo-only mode.\n` +
    `  Fix: cp apps/web/.env.example apps/web/.env`
  )
} else {
  const apiUrl = getEnvValue(webEnv, 'VITE_API_URL')
  if (!apiUrl) {
    warnings.push(
      `apps/web/.env: VITE_API_URL is not set.\n` +
      `  The app will enter demo-only mode where nothing saves.\n` +
      `  Fix: Add VITE_API_URL=http://localhost:3001 to apps/web/.env`
    )
  }

  // If provider is supabase, check that credentials are filled
  const provider = getEnvValue(webEnv, 'VITE_PROVIDER')
  if (provider === 'supabase') {
    const url = getEnvValue(webEnv, 'VITE_SUPABASE_URL')
    const key = getEnvValue(webEnv, 'VITE_SUPABASE_ANON_KEY')
    if (!url || !key) {
      warnings.push(
        `apps/web/.env: VITE_PROVIDER=supabase but Supabase credentials are missing.\n` +
        `  Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, or use VITE_PROVIDER=local.`
      )
    }
  }
}

// ─── Warn about root .env (common mistake) ───────────────────────────────────

const rootEnv = resolve(root, '.env')
if (existsSync(rootEnv)) {
  warnings.push(
    `Found a root .env file — this is NOT read by either app.\n` +
    `  Environment variables must go in apps/api/.env and apps/web/.env.`
  )
}

// ─── Print results ───────────────────────────────────────────────────────────

if (errors.length === 0 && warnings.length === 0) {
  console.log('\x1b[32m✓ Environment files look good.\x1b[0m\n')
} else {
  if (errors.length > 0) {
    console.error('\x1b[31m✗ Environment errors (must fix before starting):\x1b[0m\n')
    errors.forEach((e, i) => console.error(`  ${i + 1}. ${e}\n`))
  }
  if (warnings.length > 0) {
    console.warn('\x1b[33m⚠ Warnings:\x1b[0m\n')
    warnings.forEach((w, i) => console.warn(`  ${i + 1}. ${w}\n`))
  }
}

// Errors block startup; warnings do not
if (errors.length > 0) {
  console.error('\x1b[31mFix the errors above, then run pnpm dev again.\x1b[0m\n')
  process.exit(1)
}
