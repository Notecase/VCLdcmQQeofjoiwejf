#!/usr/bin/env node

/**
 * Pre-dev environment check.
 * Warns if required .env files are missing or misconfigured.
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const warnings = []
const errors = []

// Check apps/api/.env
const apiEnv = resolve(root, 'apps/api/.env')
if (!existsSync(apiEnv)) {
  errors.push(
    `Missing apps/api/.env — AI features and Supabase will not work.\n` +
    `  Fix: cp apps/api/.env.example apps/api/.env && edit apps/api/.env`
  )
}

// Check apps/web/.env
const webEnv = resolve(root, 'apps/web/.env')
if (!existsSync(webEnv)) {
  errors.push(
    `Missing apps/web/.env — the app will be stuck in demo-only mode.\n` +
    `  Fix: cp apps/web/.env.example apps/web/.env`
  )
} else {
  // Check that VITE_API_URL is set (most critical variable)
  const content = readFileSync(webEnv, 'utf-8')
  const hasApiUrl = content.split('\n').some(line => {
    const trimmed = line.trim()
    return !trimmed.startsWith('#') && trimmed.startsWith('VITE_API_URL=') && trimmed.length > 'VITE_API_URL='.length
  })
  if (!hasApiUrl) {
    warnings.push(
      `apps/web/.env exists but VITE_API_URL is not set.\n` +
      `  The app will enter demo-only mode where nothing saves.\n` +
      `  Fix: Add VITE_API_URL=http://localhost:3001 to apps/web/.env`
    )
  }
}

// Warn about root .env (common mistake)
const rootEnv = resolve(root, '.env')
if (existsSync(rootEnv)) {
  warnings.push(
    `Found a root .env file — this is NOT read by either app.\n` +
    `  Environment variables must go in apps/api/.env and apps/web/.env.`
  )
}

// Print results
if (errors.length === 0 && warnings.length === 0) {
  console.log('\x1b[32m✓ Environment files look good.\x1b[0m\n')
} else {
  if (errors.length > 0) {
    console.error('\x1b[31m✗ Environment issues found:\x1b[0m\n')
    errors.forEach((e, i) => console.error(`  ${i + 1}. ${e}\n`))
  }
  if (warnings.length > 0) {
    console.warn('\x1b[33m⚠ Warnings:\x1b[0m\n')
    warnings.forEach((w, i) => console.warn(`  ${i + 1}. ${w}\n`))
  }
}
