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

// CORS configuration
app.use(
  '*',
  cors({
    origin: config.cors.origin,
    credentials: config.cors.credentials,
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

app.use('*', async (_c, next) => {
  if (!initialized) {
    initialized = true

    const validation = validateConfig()
    if (!validation.valid) {
      console.warn('[worker] Config warnings:', validation.errors)
    }

    const providers = getAvailableProviders()
    console.log('[worker] AI providers:', providers)

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
