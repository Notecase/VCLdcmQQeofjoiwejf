import { Hono } from 'hono'
import { config, getAvailableProviders, validateConfig } from '../config'
import { getServiceClient } from '../lib/supabase'

const health = new Hono()

/**
 * Basic health check
 * GET /health
 */
health.get('/', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '0.1.0',
  })
})

/**
 * Detailed health check with dependency status
 * GET /health/detailed
 */
health.get('/detailed', async (c) => {
  const checks: Record<
    string,
    {
      status: 'ok' | 'error' | 'warning'
      message?: string
      latencyMs?: number
    }
  > = {}

  // Check configuration
  const configValidation = validateConfig()
  checks.config = {
    status: configValidation.valid ? 'ok' : 'warning',
    message: configValidation.valid ? undefined : configValidation.errors.join(', '),
  }

  // Check Supabase connection
  try {
    const start = Date.now()
    const supabase = getServiceClient()
    const { error } = await supabase.from('user_profiles').select('count').limit(1)

    checks.database = {
      status: error ? 'error' : 'ok',
      message: error?.message,
      latencyMs: Date.now() - start,
    }
  } catch (err) {
    checks.database = {
      status: 'error',
      message: err instanceof Error ? err.message : 'Unknown error',
    }
  }

  // Check AI providers
  const availableProviders = getAvailableProviders()
  checks.aiProviders = {
    status: availableProviders.length > 0 ? 'ok' : 'error',
    message:
      availableProviders.length > 0
        ? `Available: ${availableProviders.join(', ')}`
        : 'No AI providers configured',
  }

  // Determine overall status
  const hasError = Object.values(checks).some((c) => c.status === 'error')
  const hasWarning = Object.values(checks).some((c) => c.status === 'warning')

  const overallStatus = hasError ? 'error' : hasWarning ? 'warning' : 'ok'

  return c.json(
    {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: '0.1.0',
      environment: config.nodeEnv,
      checks,
    },
    overallStatus === 'error' ? 503 : 200
  )
})

/**
 * Readiness probe for Kubernetes/container orchestration
 * GET /health/ready
 */
health.get('/ready', async (c) => {
  try {
    // Check database is accessible
    const supabase = getServiceClient()
    const { error } = await supabase.from('user_profiles').select('count').limit(1)

    if (error) {
      return c.json({ ready: false, reason: 'database' }, 503)
    }

    return c.json({ ready: true })
  } catch {
    return c.json({ ready: false, reason: 'database' }, 503)
  }
})

/**
 * Liveness probe
 * GET /health/live
 */
health.get('/live', (c) => {
  return c.json({ live: true })
})

export default health
