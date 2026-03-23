/**
 * Production deployment health verification script.
 * Checks API health endpoints, CORS headers, and frontend availability.
 *
 * Usage: tsx scripts/verify-deployment.ts
 *
 * Environment variable overrides:
 *   API_URL  — default: https://api.noteshell.io
 *   WEB_URL  — default: https://app.noteshell.io
 */

const API_URL = (process.env.API_URL ?? 'https://api.noteshell.io').replace(/\/$/, '')
const WEB_URL = (process.env.WEB_URL ?? 'https://app.noteshell.io').replace(/\/$/, '')

interface CheckResult {
  name: string
  passed: boolean
  detail: string
}

const results: CheckResult[] = []

function record(name: string, passed: boolean, detail: string) {
  results.push({ name, passed, detail })
  const icon = passed ? '\u2713' : '\u2717'
  console.log(`  ${icon} ${name}: ${detail}`)
}

async function checkBasicHealth() {
  const url = `${API_URL}/health`
  try {
    const res = await fetch(url)
    const body = await res.json()
    const passed = res.ok && body.status === 'ok'
    record(
      'GET /health',
      passed,
      passed ? `status="${body.status}"` : `Unexpected response: ${JSON.stringify(body)}`
    )
  } catch (err) {
    record(
      'GET /health',
      false,
      `Request failed: ${err instanceof Error ? err.message : String(err)}`
    )
  }
}

async function checkDetailedHealth() {
  const url = `${API_URL}/health/detailed`
  try {
    const res = await fetch(url)
    const body = await res.json()

    if (!res.ok) {
      record('GET /health/detailed', false, `HTTP ${res.status}`)
      return
    }

    const checks = body.checks ?? {}
    const subChecks = ['config', 'database', 'aiProviders']
    const missing = subChecks.filter((k) => !(k in checks))

    if (missing.length > 0) {
      record('GET /health/detailed', false, `Missing sub-checks: ${missing.join(', ')}`)
      return
    }

    const errors = subChecks.filter((k) => checks[k]?.status === 'error')
    if (errors.length > 0) {
      record(
        'GET /health/detailed',
        false,
        `Sub-check errors: ${errors.map((k) => `${k}="${checks[k].message ?? 'error'}"`).join(', ')}`
      )
      return
    }

    const summary = subChecks.map((k) => `${k}=${checks[k].status}`).join(', ')
    record('GET /health/detailed', true, summary)
  } catch (err) {
    record(
      'GET /health/detailed',
      false,
      `Request failed: ${err instanceof Error ? err.message : String(err)}`
    )
  }
}

async function checkReadiness() {
  const url = `${API_URL}/health/ready`
  try {
    const res = await fetch(url)
    const body = await res.json()
    const passed = res.ok && body.ready === true
    record(
      'GET /health/ready',
      passed,
      passed ? 'ready=true' : `Unexpected: ${JSON.stringify(body)}`
    )
  } catch (err) {
    record(
      'GET /health/ready',
      false,
      `Request failed: ${err instanceof Error ? err.message : String(err)}`
    )
  }
}

async function checkLiveness() {
  const url = `${API_URL}/health/live`
  try {
    const res = await fetch(url)
    const body = await res.json()
    const passed = res.ok && body.live === true
    record('GET /health/live', passed, passed ? 'live=true' : `Unexpected: ${JSON.stringify(body)}`)
  } catch (err) {
    record(
      'GET /health/live',
      false,
      `Request failed: ${err instanceof Error ? err.message : String(err)}`
    )
  }
}

async function checkCors() {
  const url = `${API_URL}/health`
  try {
    const res = await fetch(url, {
      headers: { Origin: 'https://app.noteshell.io' },
    })
    const acao = res.headers.get('access-control-allow-origin')
    const passed = acao !== null
    record(
      'CORS headers',
      passed,
      passed ? `access-control-allow-origin: ${acao}` : 'Missing access-control-allow-origin header'
    )
  } catch (err) {
    record(
      'CORS headers',
      false,
      `Request failed: ${err instanceof Error ? err.message : String(err)}`
    )
  }
}

async function checkFrontend() {
  try {
    const res = await fetch(WEB_URL)
    const body = await res.text()
    const isHtml =
      body.includes('<html') || body.includes('<!DOCTYPE') || body.includes('<!doctype')
    const passed = res.ok && isHtml
    record(
      'Frontend loads',
      passed,
      passed ? `HTTP ${res.status}, HTML content verified` : `HTTP ${res.status}, HTML=${isHtml}`
    )
  } catch (err) {
    record(
      'Frontend loads',
      false,
      `Request failed: ${err instanceof Error ? err.message : String(err)}`
    )
  }
}

async function main() {
  console.log(`\nVerifying deployment health`)
  console.log(`  API: ${API_URL}`)
  console.log(`  WEB: ${WEB_URL}\n`)

  console.log('API Health Endpoints:')
  await checkBasicHealth()
  await checkDetailedHealth()
  await checkReadiness()
  await checkLiveness()

  console.log('\nCORS:')
  await checkCors()

  console.log('\nFrontend:')
  await checkFrontend()

  // Summary
  const passed = results.filter((r) => r.passed).length
  const failed = results.filter((r) => !r.passed).length
  console.log(`\n--- Summary: ${passed} passed, ${failed} failed ---\n`)

  if (failed > 0) {
    process.exit(1)
  }
}

main()
