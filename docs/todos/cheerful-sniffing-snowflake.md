# Production Testing System — Comprehensive Plan

## Context

Inkdown is being pushed to production for initial testing across three platforms:

- **Vercel** (web SPA) — `app.noteshell.io` / `inkdown.vercel.app` — READY, 20+ successful deploys
- **Railway** (API server) — `api.noteshell.io` — READY, health checks enabled
- **GitHub Actions** (CI/CD) — `Notecase/VCLdcmQQeofjoiwejf` — 3-job pipeline exists

**Problem**: No E2E tests, no integration tests, no pre-commit hooks, no deployment verification automation, no load testing. The CI only runs unit tests and lint — it doesn't verify that production actually works.

**Goal**: Build a complete testing pyramid — from pre-commit hooks through CI/CD hardening, E2E browser tests, deployment smoke tests, and load testing.

---

## Phase 1: Deployment Verification (Immediate — Day 1)

Verify both production services are actually working end-to-end using real HTTP calls and browser automation.

### Step 1.1: API Health Verification Script

Create `scripts/verify-deployment.ts` — a portable script that checks production health.

**File**: `scripts/verify-deployment.ts`

```
Checks to perform:
1. GET https://api.noteshell.io/health → expect { status: 'ok' }
2. GET https://api.noteshell.io/health/detailed → expect 200, check all sub-checks
3. GET https://api.noteshell.io/health/ready → expect { ready: true }
4. GET https://api.noteshell.io/health/live → expect { live: true }
5. Verify CORS headers (Origin: https://app.noteshell.io)
6. Verify SSE endpoint responds (POST /api/agent with test auth token)
```

Add to `package.json`: `"verify:prod": "tsx scripts/verify-deployment.ts"`

### Step 1.2: Frontend Smoke Check

Using browser automation (Playwright or manual checklist):

1. Load `https://app.noteshell.io` → page renders (no blank screen)
2. Check browser console for errors (especially failed API calls)
3. Verify Vue Router works (navigate to `/editor`, `/settings`)
4. Verify demo mode works if no auth
5. Verify Supabase auth flow (login → redirect back)

### Step 1.3: Cross-Service Integration Check

1. Frontend → API connectivity: CORS headers allow `app.noteshell.io`
2. API → Supabase: `/health/detailed` shows database: ok
3. API → AI providers: `/health/detailed` shows aiProviders: ok
4. Auth flow: Login on frontend → token sent to API → API verifies with Supabase
5. SSE streaming: Send a chat message → receive streamed response

### Step 1.4: Environment Variable Audit

**Vercel** (web):

- `VITE_API_URL` = `https://api.noteshell.io` ← CRITICAL
- `VITE_SUPABASE_URL` = production Supabase URL
- `VITE_SUPABASE_ANON_KEY` = production anon key
- `VITE_PROVIDER` = `supabase`

**Railway** (api):

- `NODE_ENV` = `production`
- `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY`
- `CORS_ORIGIN` = `https://app.noteshell.io`
- At least one AI key: `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GOOGLE_AI_API_KEY`
- `PORT` = Railway assigns dynamically (should use `$PORT`)

---

## Phase 2: CI/CD Pipeline Hardening (Day 1-2)

### Step 2.1: Add Pre-Commit Hooks

Install `husky` + `lint-staged` for fast feedback before code leaves the developer's machine.

**Files to create/modify**:

- Root `package.json` — add husky prepare script
- `.husky/pre-commit` — runs lint-staged
- Root `package.json` — add lint-staged config

```json
"lint-staged": {
  "*.{ts,tsx,vue}": ["eslint --fix", "prettier --write"],
  "*.{json,md,yml,yaml}": ["prettier --write"]
}
```

### Step 2.2: Add Branch Protection Rules

Configure via GitHub settings (or `gh` CLI):

- Require CI to pass before merge to `main`
- Require at least 1 review for PRs to `main`
- No direct pushes to `main` (all changes via PR)
- Status checks required: `Build`, `Lint & Typecheck`, `Test`

### Step 2.3: Add Deploy Preview Workflow

Create `.github/workflows/deploy-preview.yml`:

- Trigger: `pull_request` to `main`
- Run full CI checks (already exists)
- Add a job that posts Vercel preview URL as PR comment
- Vercel already auto-deploys previews on PR — just need to surface the URL

### Step 2.4: Add Production Deploy Verification

Create `.github/workflows/verify-production.yml`:

- Trigger: After successful deploy to `main` (on push to main, after CI passes)
- Wait 60s for Railway/Vercel to deploy
- Run `scripts/verify-deployment.ts` against production URLs
- Post results as GitHub commit status or Slack notification

```yaml
# Rough structure:
name: Production Verification
on:
  workflow_run:
    workflows: ['CI']
    types: [completed]
    branches: [main]
jobs:
  verify:
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
    runs-on: ubuntu-latest
    steps:
      - checkout
      - setup pnpm/node
      - install
      - run: pnpm verify:prod
      - name: Post status
        if: failure()
        # Notify on failure (GitHub issue, Slack, etc.)
```

### Step 2.5: Add Staging Environment (Optional but recommended)

- Create `develop` branch as staging
- Railway: Add staging service (same app, different env vars)
- Vercel: Preview deployments on `develop` branch serve as staging
- CI deploys to staging first, then promote to production

---

## Phase 3: E2E Browser Tests (Day 2-3)

### Step 3.1: Install & Configure Playwright

```bash
pnpm add -D @playwright/test -w
npx playwright install --with-deps chromium
```

**Files to create**:

- `playwright.config.ts` — root config
- `e2e/` — test directory

**Config** (`playwright.config.ts`):

```ts
export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'pnpm dev',
        port: 5173,
        reuseExistingServer: true,
      },
})
```

### Step 3.2: Write Core E2E Test Suites

**e2e/smoke.spec.ts** — Basic page loads:

```
- Home page loads without errors
- Editor page loads
- Settings page loads
- Demo mode works (IndexedDB)
- No console errors on any page
```

**e2e/auth.spec.ts** — Authentication flow:

```
- Login page renders
- OAuth redirect works (Supabase)
- After login, redirected to /editor
- Auth token stored in localStorage/cookie
- Protected routes redirect to login when unauthenticated
```

**e2e/ai-chat.spec.ts** — AI features (requires API):

```
- Open editor with a note
- Trigger AI chat
- Send a message
- Receive streamed response (SSE)
- Edit proposal appears in diff view
- Accept/reject edit works
```

**e2e/editor.spec.ts** — Muya editor basics:

```
- Create new note
- Type text, see it render
- Markdown formatting works (bold, headers, lists)
- Save document (auto-save)
- Navigate between notes
```

### Step 3.3: Add E2E to CI Pipeline

Add to `.github/workflows/ci.yml`:

```yaml
e2e:
  name: E2E Tests
  runs-on: ubuntu-latest
  needs: build
  steps:
    - checkout
    - setup pnpm/node
    - download build artifacts
    - install + install playwright browsers
    - run: pnpm exec playwright test
    # Upload test report on failure
    - uses: actions/upload-artifact@v4
      if: failure()
      with:
        name: playwright-report
        path: playwright-report/
```

### Step 3.4: E2E Against Production (Post-Deploy)

In the `verify-production.yml` workflow, add:

```yaml
- name: E2E against production
  env:
    E2E_BASE_URL: https://app.noteshell.io
  run: pnpm exec playwright test e2e/smoke.spec.ts
```

Only run smoke tests against production (not full suite — too slow and flaky).

---

## Phase 4: Load & Stress Testing (Day 3-4)

### Step 4.1: Install k6 (Grafana k6)

k6 is the best tool for this — scriptable in JavaScript, great for API load testing.

```bash
brew install k6  # local
# In CI: use grafana/k6 Docker image
```

### Step 4.2: Write Load Test Scripts

**load-tests/api-health.js** — Baseline health check under load:

```js
// 50 VUs for 2 minutes, check health endpoint
// Expect: p95 < 200ms, error rate < 1%
```

**load-tests/api-chat.js** — Chat endpoint under load:

```js
// 10 VUs for 1 minute, send chat messages
// Each VU: POST /api/agent with test payload
// Expect: first byte < 2s (SSE start), error rate < 5%
// Note: Requires valid auth tokens — use test user
```

**load-tests/api-sse-concurrent.js** — SSE streaming concurrency:

```js
// 20 concurrent SSE connections
// Hold connections for 30s each
// Verify all connections receive data
// This tests Railway's ability to handle concurrent long-lived connections
```

**load-tests/frontend-pages.js** — Static asset performance:

```js
// 100 VUs for 1 minute, load main pages
// Check: TTFB < 500ms, full load < 2s
// Verify Vercel CDN is caching properly
```

### Step 4.3: Add Load Test Script

Add to root `package.json`:

```json
"test:load": "k6 run load-tests/api-health.js",
"test:load:chat": "k6 run load-tests/api-chat.js",
"test:load:sse": "k6 run load-tests/api-sse-concurrent.js"
```

### Step 4.4: Performance Baselines

Establish baselines and thresholds:

| Endpoint                    | Metric         | Threshold |
| --------------------------- | -------------- | --------- |
| GET /health                 | p95 latency    | < 100ms   |
| GET /health/detailed        | p95 latency    | < 500ms   |
| POST /api/agent (SSE start) | p95 TTFB       | < 3s      |
| POST /api/chat              | p95 TTFB       | < 2s      |
| GET app.noteshell.io        | p95 TTFB       | < 300ms   |
| SSE connections             | concurrent max | 50+       |

---

## Phase 5: Real-Time Monitoring & MCP Integration (Day 4-5)

### Step 5.1: GitHub MCP for CI/CD Monitoring

Use GitHub MCP tools to:

- `mcp__github__list_pull_requests` — Check PR status
- `mcp__github__get_pull_request_status` — Verify CI checks passing
- Fix: Need to configure GitHub MCP auth (currently returning "Bad credentials")

**Action needed**: Verify GitHub token is configured for MCP server. The repo is `Notecase/VCLdcmQQeofjoiwejf`.

### Step 5.2: Vercel MCP for Deployment Monitoring

Already working. Use:

- `mcp__claude_ai_Vercel__list_deployments` — Check deploy status
- `mcp__claude_ai_Vercel__get_deployment` — Inspect specific deploys
- `mcp__claude_ai_Vercel__get_deployment_build_logs` — Debug build failures
- `mcp__claude_ai_Vercel__get_runtime_logs` — Check runtime errors

### Step 5.3: Browser Automation for Visual Verification

Use Playwright MCP or Claude-in-Chrome to:

- Navigate to `app.noteshell.io`
- Screenshot key pages
- Check for console errors
- Verify SSE streaming works in real browser

### Step 5.4: Automated Alerts

Options (pick one):

- **GitHub Issues**: Create issue on verification failure
- **Discord/Slack webhook**: Post to channel on failure
- **Uptime monitoring**: Use UptimeRobot/BetterStack for `/health` endpoint

---

## Implementation Order (Recommended)

| Priority | Phase   | What                                   | Effort |
| -------- | ------- | -------------------------------------- | ------ |
| 1        | 1.1     | Deployment verification script         | 30min  |
| 2        | 1.4     | Environment variable audit             | 15min  |
| 3        | 1.2-1.3 | Manual smoke test via browser          | 30min  |
| 4        | 2.1     | Pre-commit hooks (husky + lint-staged) | 20min  |
| 5        | 2.4     | Production verify workflow             | 30min  |
| 6        | 2.2     | Branch protection rules                | 10min  |
| 7        | 3.1-3.2 | Playwright setup + smoke tests         | 1-2hr  |
| 8        | 3.3     | E2E in CI pipeline                     | 30min  |
| 9        | 4.1-4.2 | k6 load test scripts                   | 1hr    |
| 10       | 5.1-5.3 | MCP integration & monitoring           | 30min  |
| 11       | 2.3     | Deploy preview comments                | 20min  |
| 12       | 2.5     | Staging environment                    | 1hr    |

**Total estimated work: ~6-8 hours**

---

## Critical Files to Create/Modify

| File                                      | Action | Purpose                         |
| ----------------------------------------- | ------ | ------------------------------- |
| `scripts/verify-deployment.ts`            | CREATE | Production health verification  |
| `playwright.config.ts`                    | CREATE | E2E test configuration          |
| `e2e/smoke.spec.ts`                       | CREATE | Basic page load tests           |
| `e2e/auth.spec.ts`                        | CREATE | Authentication flow tests       |
| `e2e/ai-chat.spec.ts`                     | CREATE | AI feature E2E tests            |
| `e2e/editor.spec.ts`                      | CREATE | Editor functionality tests      |
| `load-tests/api-health.js`                | CREATE | k6 health endpoint load test    |
| `load-tests/api-chat.js`                  | CREATE | k6 chat endpoint load test      |
| `load-tests/api-sse-concurrent.js`        | CREATE | k6 SSE concurrency test         |
| `.github/workflows/verify-production.yml` | CREATE | Post-deploy verification        |
| `.github/workflows/ci.yml`                | MODIFY | Add E2E test job                |
| `.husky/pre-commit`                       | CREATE | Pre-commit hook                 |
| `package.json` (root)                     | MODIFY | Add husky, lint-staged, scripts |
| `.gitignore`                              | MODIFY | Add playwright artifacts        |

---

## Verification Plan

After each phase, verify by:

1. **Phase 1**: Run `pnpm verify:prod` → all checks green
2. **Phase 2**: Push a PR → CI runs all jobs → branch protection blocks bad code
3. **Phase 3**: Run `pnpm exec playwright test` locally → all E2E pass. Push to CI → E2E job passes
4. **Phase 4**: Run `pnpm test:load` → all thresholds met, no errors
5. **Phase 5**: Use Vercel MCP to check latest deploy status, use browser to verify app.noteshell.io

---

## Existing Utilities to Reuse

- `scripts/check-env.js` — Already validates env files locally, can extend for production
- `apps/api/src/routes/health.ts` — Already has `/health`, `/health/detailed`, `/health/ready`, `/health/live`
- `apps/api/src/config.ts` — `validateConfig()` and `getAvailableProviders()` used by health checks
- `vitest.config.ts` — Existing test config (don't conflict with Playwright)
- `.github/workflows/ci.yml` — Extend, don't replace
