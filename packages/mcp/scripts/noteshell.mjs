#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { normalizeDeviceStartResponse, parsePollResponse } from './lib/device-auth.mjs'
import {
  DEFAULT_SUPABASE_ANON_KEY,
  DEFAULT_SUPABASE_URL,
  writeNoteshellConfig,
} from './lib/noteshell-config.mjs'
import { openBrowser } from './lib/open-browser.mjs'

function usage() {
  console.log(`Noteshell CLI

Usage:
  noteshell login [--api-url URL] [--no-browser]
  noteshell setup <email> <password>
  noteshell mcp

Commands:
  login       Authenticate via browser/device flow
  setup       Legacy email/password login
  mcp         Start MCP server over stdio (default)
`)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function sanitizeApiUrl(value) {
  const trimmed = value.trim()
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  })

  const text = await response.text()
  let body = {}
  if (text.length > 0) {
    try {
      body = JSON.parse(text)
    } catch {
      throw new Error(`Received non-JSON response from ${url}: ${text.slice(0, 200)}`)
    }
  }

  if (!response.ok) {
    const message =
      typeof body.message === 'string' ? body.message :
      typeof body.error_description === 'string' ? body.error_description :
      typeof body.error === 'string' ? body.error :
      `HTTP ${response.status}`
    throw new Error(`${url} failed: ${message}`)
  }

  return body
}

function parseLoginFlags(argv) {
  const options = {
    apiUrl: sanitizeApiUrl(process.env.NOTESHELL_API_URL || 'https://app.noteshell.io'),
    openBrowser: true,
    scopes: [],
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--no-browser') { options.openBrowser = false; continue }
    if (arg === '--api-url') {
      const next = argv[i + 1]
      if (!next || next.startsWith('--')) throw new Error('Missing value for --api-url')
      options.apiUrl = sanitizeApiUrl(next)
      i += 1
      continue
    }
    if (arg === '--scopes') {
      const next = argv[i + 1]
      if (!next || next.startsWith('--')) throw new Error('Missing value for --scopes')
      options.scopes = next.split(',').map((s) => s.trim()).filter(Boolean)
      i += 1
      continue
    }
    if (arg === '--help' || arg === '-h') { options.help = true; continue }
    throw new Error(`Unknown login option: ${arg}`)
  }

  return options
}

async function runDeviceLogin(argv) {
  const options = parseLoginFlags(argv)
  if (options.help) {
    console.log('Usage: noteshell login [--api-url URL] [--no-browser] [--scopes notes:read,notes:write]')
    return
  }

  const startPayload = await postJson(`${options.apiUrl}/api/cli/auth/start`, {
    client_name: '@noteshell/mcp',
    scopes: options.scopes,
  })
  const device = normalizeDeviceStartResponse(startPayload)

  console.log(`Open this URL to authenticate: ${device.verificationUri}`)
  console.log(`Enter code: ${device.userCode}`)

  const verificationLink =
    device.verificationUriComplete ||
    `${device.verificationUri}?code=${encodeURIComponent(device.userCode)}`

  if (options.openBrowser) {
    try {
      openBrowser(verificationLink)
      console.log('✓ Browser opened')
    } catch (error) {
      console.log(`! Could not open browser automatically (${error.message})`)
      console.log(`  Open this link manually: ${verificationLink}`)
    }
  } else {
    console.log(`Open this link manually: ${verificationLink}`)
  }

  console.log('Waiting for approval...')

  let intervalMs = device.intervalSeconds * 1000
  const expiresAtMs = device.expiresAt ? Date.parse(device.expiresAt) : Date.now() + 10 * 60 * 1000

  while (Date.now() < expiresAtMs) {
    await sleep(intervalMs)
    const pollPayload = await postJson(`${options.apiUrl}/api/cli/auth/poll`, {
      device_code: device.deviceCode,
    })
    const pollResult = parsePollResponse(pollPayload)

    if (pollResult.status === 'pending') {
      if (pollResult.slowDown) intervalMs += 5000
      continue
    }

    const configPath = writeNoteshellConfig({
      supabaseUrl: pollResult.supabaseUrl || DEFAULT_SUPABASE_URL,
      supabaseAnonKey: pollResult.supabaseAnonKey || DEFAULT_SUPABASE_ANON_KEY,
      accessToken: pollResult.accessToken,
      refreshToken: pollResult.refreshToken,
      expiresAt: pollResult.expiresAt,
      userId: pollResult.user.id,
    })

    const userLabel = pollResult.user.email ? ` as ${pollResult.user.email}` : ''
    console.log(`✓ Logged in${userLabel}`)
    console.log(`  Config written to ${configPath}`)
    if (pollResult.expiresAt) console.log(`  Token expires: ${pollResult.expiresAt}`)
    return
  }

  throw new Error('Timed out waiting for approval. Run `noteshell login` again.')
}

function runNodeScript(scriptPath, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], { stdio: 'inherit' })
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (signal) { process.kill(process.pid, signal); return }
      resolve(code ?? 0)
    })
  })
}

async function main() {
  const args = process.argv.slice(2)
  const command = args[0]
  const rest = args.slice(1)

  const setupScript = fileURLToPath(new URL('./setup.mjs', import.meta.url))
  const serverScript = fileURLToPath(new URL('../dist/index.js', import.meta.url))

  if (!command || command === 'mcp' || command === 'serve' || command === 'server') {
    process.exit(await runNodeScript(serverScript, rest))
  }

  if (command === 'setup') {
    process.exit(await runNodeScript(setupScript, rest))
  }

  if (command === 'login') {
    await runDeviceLogin(rest)
    return
  }

  if (command === '--help' || command === '-h' || command === 'help') {
    usage()
    return
  }

  throw new Error(`Unknown command: ${command}`)
}

main().catch((error) => {
  console.error(`Noteshell CLI failed: ${error.message}`)
  process.exit(1)
})
