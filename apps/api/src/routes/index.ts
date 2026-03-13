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
import secretary from './secretary'
import research from './research'
import course from './course'
import explain from './explain'
import context from './context'
import missions from './missions'
import settings from './settings'
import cliAuth from './cli-auth'
import { config } from '../config'

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
 * - /api/secretary/*           - Secretary AI planner (auth required)
 * - /api/research/*            - Deep research agent (auth required)
 * - /api/course/*              - Course generation & management (auth required)
 * - /api/context/*             - Shared context bus (soul + entries) (auth required)
 * - /api/settings/*            - BYOK keys, AI preferences, heartbeat config (auth required)
 * - /api/missions/*            - Mission Hub orchestration (auth required)
 * - /api/cli/auth/*              - CLI device auth flow (start/poll public, approve/deny auth required)
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
routes.route('/api/secretary', secretary)
routes.route('/api/research', research)
routes.route('/api/course', course)
routes.route('/api/explain', explain)
routes.route('/api/context', context)
routes.route('/api/settings', settings)
// CLI device auth (public start/poll + auth-gated approve/deny)
routes.route('/api/cli/auth', cliAuth)
if (config.flags.missionHubV1) {
  routes.route('/api/missions', missions)
}

export default routes
