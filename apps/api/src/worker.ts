/**
 * Cloudflare Workers entry point
 *
 * Adapted from index.ts for the CF Workers runtime.
 * Uses nodejs_compat flag so process.env works from bindings.
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { timing } from 'hono/timing'
import { secureHeaders } from 'hono/secure-headers'

import { config, validateConfig, getAvailableProviders } from './config'
import { errorHandler, notFoundHandler } from './middleware/error'
import routes from './routes'
import { getServiceClient } from './lib/supabase'

// Create Hono app
const app = new Hono()

// =============================================================================
// Global Middleware
// =============================================================================

// Security headers
app.use('*', secureHeaders())

// Request logging
app.use('*', logger())

// Request timing
app.use('*', timing())

// CORS configuration — read origin from CF Workers env binding at request time
app.use(
  '*',
  cors({
    origin: (origin, c) => {
      const allowed = (c.env as Record<string, string>)?.CORS_ORIGIN || config.cors.origin
      return origin === allowed ? allowed : null
    },
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposeHeaders: ['X-Response-Time'],
    maxAge: 86400,
  })
)

// =============================================================================
// Lazy initialization (runs once on first request)
// =============================================================================

let initialized = false

app.use('*', async (c, next) => {
  if (!initialized) {
    initialized = true

    // CF Workers passes secrets via c.env, not process.env.
    // Copy bindings into process.env so config.ts getters can read them.
    const env = c.env as Record<string, string>
    for (const [key, value] of Object.entries(env)) {
      if (typeof value === 'string' && !process.env[key]) {
        process.env[key] = value
      }
    }

    const validation = validateConfig()
    if (!validation.valid) {
      console.warn('[worker] Config warnings:', validation.errors)
    }

    const providers = getAvailableProviders()
    console.log('[worker] AI providers:', providers)

    // Reset AI provider singletons so they pick up the freshly-injected keys
    try {
      const { resetAIProviders } = await import('@inkdown/ai/providers')
      resetAIProviders()
    } catch (err) {
      console.warn('[worker] AI provider reset failed:', err)
    }

    try {
      const { initUsagePersister } = await import('@inkdown/ai')
      initUsagePersister(getServiceClient())
    } catch (err) {
      console.warn('[worker] Usage persister init failed:', err)
    }
  }
  await next()
})

// =============================================================================
// Routes
// =============================================================================

// Mount all routes
app.route('/', routes)

// Root endpoint
app.get('/', (c) => {
  return c.json({
    name: '@inkdown/api',
    version: '0.1.0',
    status: 'running',
    runtime: 'cloudflare-workers',
    endpoints: {
      health: '/health',
      agent: '/api/agent',
    },
  })
})

// =============================================================================
// Error Handling
// =============================================================================

app.onError(errorHandler)
app.notFound(notFoundHandler)

// Export for Cloudflare Workers
export default app
