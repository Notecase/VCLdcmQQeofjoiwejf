import { Hono } from 'hono'
import health from './health'
import chat from './chat'
import search from './search'
import embed from './embed'
import agent from './agent'
import recommend from './recommend'
import orchestration from './orchestration'
import slides from './slides'
import sources from './sources'
import learningResources from './learningResources'

/**
 * API Routes
 *
 * Structure:
 * - /health/*                  - Health checks (no auth)
 * - /api/chat/*                - Chat endpoints (auth required)
 * - /api/search/*              - Search endpoints (auth required)
 * - /api/embed/*               - Embedding endpoints (auth required)
 * - /api/agent/*               - Agent endpoints (auth required)
 * - /api/recommend/*           - Recommendation endpoints (auth required)
 * - /api/orchestration/*       - Workflow orchestration (auth required)
 * - /api/slides/*              - Slide generation (auth required)
 * - /api/sources/*             - Source management (auth required)
 * - /api/learning-resources/*  - Learning resources (auth required)
 */

const routes = new Hono()

// Health routes (public)
routes.route('/health', health)

// API routes (all require authentication)
routes.route('/api/chat', chat)
routes.route('/api/search', search)
routes.route('/api/embed', embed)
routes.route('/api/agent', agent)
routes.route('/api/recommend', recommend)
routes.route('/api/orchestration', orchestration)
routes.route('/api/slides', slides)
routes.route('/api/sources', sources)
routes.route('/api/learning-resources', learningResources)

export default routes
