import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { timing } from 'hono/timing'
import { secureHeaders } from 'hono/secure-headers'

import { config, validateConfig, getAvailableProviders } from './config'
import { errorHandler, notFoundHandler } from './middleware/error'
import routes from './routes'

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
    maxAge: 86400, // 24 hours
  })
)

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
    documentation: '/health/detailed',
    endpoints: {
      health: '/health',
      chat: '/api/chat',
      search: '/api/search',
      embed: '/api/embed',
      agent: '/api/agent',
    },
  })
})

// =============================================================================
// Error Handling
// =============================================================================

// Global error handler
app.onError(errorHandler)

// 404 handler
app.notFound(notFoundHandler)

// =============================================================================
// Server Startup
// =============================================================================

function startServer() {
  // Validate configuration
  const validation = validateConfig()

  console.log('\n' + '='.repeat(60))
  console.log('@inkdown/api - AI Backend Server')
  console.log('='.repeat(60))

  if (!validation.valid) {
    console.log('\n⚠️  Configuration warnings:')
    validation.errors.forEach((err) => console.log(`   - ${err}`))
  }

  // Log available providers
  const providers = getAvailableProviders()
  console.log('\n📦 AI Providers:')
  if (providers.length > 0) {
    providers.forEach((p) => console.log(`   ✅ ${p}`))
  } else {
    console.log('   ⚠️  No AI providers configured')
  }

  // Log configuration
  console.log('\n⚙️  Configuration:')
  console.log(`   Port: ${config.port}`)
  console.log(`   Environment: ${config.nodeEnv}`)
  console.log(`   CORS Origin: ${config.cors.origin}`)
  console.log(`   Supabase: ${config.supabase.url ? '✅ Configured' : '❌ Not configured'}`)

  console.log('\n' + '='.repeat(60))

  // Start server
  serve(
    {
      fetch: app.fetch,
      port: config.port,
    },
    (info) => {
      console.log(`\n🚀 Server running at http://localhost:${info.port}`)
      console.log(`   Health: http://localhost:${info.port}/health`)
      console.log(`   API: http://localhost:${info.port}/api`)
      console.log('\n' + '='.repeat(60) + '\n')
    }
  )
}

// Start the server
startServer()

// Export for testing
export default app
