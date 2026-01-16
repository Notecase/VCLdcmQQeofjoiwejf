import { Hono } from 'hono'
import health from './health'
import chat from './chat'
import search from './search'
import embed from './embed'
import agent from './agent'

/**
 * API Routes
 *
 * Structure:
 * - /health/*     - Health checks (no auth)
 * - /api/chat/*   - Chat endpoints (auth required)
 * - /api/search/* - Search endpoints (auth required)
 * - /api/embed/*  - Embedding endpoints (auth required)
 * - /api/agent/*  - Agent endpoints (auth required)
 */

const routes = new Hono()

// Health routes (public)
routes.route('/health', health)

// API routes (all require authentication)
routes.route('/api/chat', chat)
routes.route('/api/search', search)
routes.route('/api/embed', embed)
routes.route('/api/agent', agent)

export default routes
