# Migration: API from Cloudflare Workers to Railway

## Context

The Inkdown/Noteshell API (`apps/api`) runs on Cloudflare Workers but suffers from recurring runtime compatibility issues:
- **Immediate**: AI text generation fails silently (provider singleton caches empty API key before env bindings are injected)
- **Recurring**: 3 CF Workers-specific bugs in recent commits (`setInterval` forbidden, CORS timing, provider singleton timing)
- **Structural**: Dual entry points (`worker.ts` + `index.ts`) create maintenance burden
- **Future**: Product roadmap includes bot integrations and background processing that need a long-running Node.js server

The Node.js entry point (`apps/api/src/index.ts`) already exists and works for local dev. Migration to Railway is ~30 min of code changes + configuration.

### Current Architecture
```
Vercel ──────── Web SPA (Vue 3, app.noteshell.io)
CF Workers ──── API (Hono, inkdown-api.quangcpm6205.workers.dev)
Supabase ────── Database + Edge Functions (heartbeat daemon)
```

### Target Architecture
```
Vercel ──────── Web SPA (Vue 3, app.noteshell.io)  [NO CHANGE]
Railway ─────── API (Hono on Node.js)               [MIGRATED]
Supabase ────── Database + Edge Functions            [NO CHANGE]
```

---

## Pre-Migration Checklist

- [ ] Railway account created (railway.app)
- [ ] Railway CLI installed (`npm i -g @railway/cli && railway login`)
- [ ] All CF Workers secrets documented (Step 1 below)
- [ ] Current production is accessible (verify app.noteshell.io works, even if AI is broken)

---

## Step 1: Document All Required Environment Variables

Collect all secrets currently set in CF Workers. These must be transferred to Railway.

**Required variables** (from `wrangler.toml` comments + `apps/api/.env.example`):

| Variable | Source | Required |
|----------|--------|----------|
| `PORT` | Railway auto-sets this | Auto |
| `NODE_ENV` | Set to `production` | Yes |
| `SUPABASE_URL` | CF Workers secret | Yes |
| `SUPABASE_SERVICE_KEY` | CF Workers secret | Yes |
| `SUPABASE_ANON_KEY` | CF Workers secret | Yes |
| `GOOGLE_AI_API_KEY` | CF Workers secret | Yes |
| `OPENAI_API_KEY` | CF Workers secret | Yes |
| `CORS_ORIGIN` | Set to `https://app.noteshell.io` | Yes |
| `ADMIN_USER_IDS` | CF Workers secret | If set |
| `ANTHROPIC_API_KEY` | If using Anthropic | Optional |

**Action**: Run `npx wrangler secret list` in `apps/api/` to see all configured secrets. Note their names (values won't be shown — you'll need them from your password manager or `.env` files).

**File**: `apps/api/.env.example` — reference for all supported variables

---

## Step 2: Create Railway Project

### 2a. Initialize Railway project

```bash
cd /Users/quangnguyen/CodingPRJ/inkdown
railway init
# Select "Empty Project"
# Name it: noteshell-api
```

### 2b. Configure the service

Railway needs to know this is a monorepo and only the API should be deployed.

**In Railway Dashboard** (or via CLI):
- **Root Directory**: `/` (monorepo root — pnpm workspaces need the full repo)
- **Build Command**: `pnpm install --frozen-lockfile && pnpm build`
- **Start Command**: `node apps/api/dist/index.js`

The `pnpm build` step uses Turborepo which respects dependency order: `@inkdown/shared` -> `@inkdown/ai` -> `apps/api`. This ensures `dist/` is always fresh — the exact bug that started this investigation.

### 2c. Set Node.js version

Create a `.node-version` file or set in Railway:
- **Node.js version**: `20` (matches `.nvmrc` and CI)

### 2d. Configure health check

Railway pings a health endpoint to verify the service is running:
- **Health Check Path**: `/health`
- **Health Check Timeout**: `30s`

**File**: Health endpoint exists at `apps/api/src/routes/health.ts`

---

## Step 3: Set Environment Variables in Railway

```bash
# Required
railway variables set NODE_ENV=production
railway variables set SUPABASE_URL=<value>
railway variables set SUPABASE_SERVICE_KEY=<value>
railway variables set SUPABASE_ANON_KEY=<value>
railway variables set GOOGLE_AI_API_KEY=<value>
railway variables set OPENAI_API_KEY=<value>
railway variables set CORS_ORIGIN=https://app.noteshell.io

# Optional
railway variables set ADMIN_USER_IDS=<value>
railway variables set ANTHROPIC_API_KEY=<value>
```

**Note**: Railway auto-sets `PORT`. The `config.ts` already reads `process.env.PORT` with a default of `3001` (line 15). No code changes needed.

---

## Step 4: Code Changes (Minimal)

### 4a. Add `railway.toml` for deployment config

**Create**: `railway.toml` at repo root

```toml
[build]
builder = "nixpacks"
buildCommand = "corepack enable && pnpm install --frozen-lockfile && pnpm build"

[deploy]
startCommand = "node apps/api/dist/index.js"
healthcheckPath = "/health"
healthcheckTimeout = 30
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3
```

**Why `corepack enable`**: Railway's Nixpacks builder needs corepack to use pnpm 9.

### 4b. Add `.railwayignore` at repo root

```
apps/web/dist
apps/web/node_modules
.turbo
.git
```

Prevents uploading large unnecessary files.

### 4c. Update `apps/api/src/index.ts` — production CORS

The current `index.ts` uses static CORS from config. This already works because `config.cors.origin` reads `process.env.CORS_ORIGIN` via a getter.

**File**: `apps/api/src/index.ts:30-40` — **NO CHANGE NEEDED**. The CORS middleware already reads from `config.cors.origin` which uses a getter that reads `process.env.CORS_ORIGIN` at access time.

### 4d. Update `apps/api/src/index.ts` — add provider reset (match worker.ts pattern)

The provider singleton issue exists in both entry points. On Node.js with `dotenv`, it works because `.env` is loaded at module evaluation time. But for robustness, add the same reset pattern:

**File**: `apps/api/src/index.ts` — inside `startServer()`, after the usage persister init, add:

```typescript
// Defensive: reset provider singletons after env is fully loaded
try {
  const { resetAIProviders } = await import('@inkdown/ai/providers')
  resetAIProviders()
} catch (err) {
  console.warn('AI provider reset failed:', err)
}
```

### 4e. Remove diagnostic logging (cleanup from debugging)

**File**: `packages/ai/src/providers/ai-sdk-factory.ts:37-47` — Remove the diagnostic `console.info` from `getGoogleProvider()`. The singleton issue is solved by moving off CF Workers.

**File**: `packages/ai/src/agents/secretary/agent.ts:165-168` — Remove `streamEventCount === 0` error yield (was debugging aid).

**File**: `apps/api/src/routes/secretary.ts:277-294` — Remove `NO_TEXT_GENERATED` diagnostic block (was debugging aid).

### 4f. (Optional) Keep `worker.ts` as fallback

Do NOT delete `worker.ts` or `wrangler.toml` yet. Keep them as a rollback option until Railway is verified working in production. Can be removed in a follow-up cleanup PR.

---

## Step 5: Update Web App to Point to Railway API

### 5a. Get Railway URL

After first deploy, Railway provides a URL like:
```
noteshell-api-production.up.railway.app
```

### 5b. Set custom domain: `api.noteshell.io`

You own `noteshell.io` and manage DNS via Cloudflare. Add a subdomain for the API:

1. **In Railway Dashboard** → Service → Settings → Domains → Add Custom Domain: `api.noteshell.io`
2. Railway gives you a CNAME target (e.g., `cname.railway.app`)
3. **In Cloudflare DNS** → Add record:
   - Type: `CNAME`
   - Name: `api`
   - Target: `<railway-provided-target>`
   - Proxy status: **DNS only** (grey cloud, NOT orange — Railway handles SSL)
4. Railway auto-provisions SSL certificate for `api.noteshell.io`

**Result**:
- `app.noteshell.io` → Vercel (web SPA) — no change
- `api.noteshell.io` → Railway (API) — new

### 5c. Update Vercel environment variables

The web app is deployed on Vercel. Update the env vars in Vercel Dashboard (or CLI):

```bash
# In Vercel Dashboard → Project Settings → Environment Variables
# Or via Vercel CLI:
vercel env add VITE_API_BASE production
# Value: https://api.noteshell.io/api/agent
# (or https://noteshell-api-production.up.railway.app/api/agent if no custom domain)
```

**How the web app uses this** (verified across all service files):

```typescript
// ai.service.ts:16 — Agent endpoint
const API_BASE = import.meta.env.VITE_API_BASE || '/api/agent'

// secretary.ts:54 — Secretary (strips /api/agent, appends /api/secretary)
const API_BASE = import.meta.env.VITE_API_BASE?.replace('/api/agent', '') || ''
const SECRETARY_API = `${API_BASE}/api/secretary`
```

So setting `VITE_API_BASE=https://api.noteshell.io/api/agent` makes all services point to Railway.

**Also update** `VITE_API_URL`:
```bash
vercel env add VITE_API_URL production
# Value: https://api.noteshell.io
```

### 5d. Trigger Vercel rebuild

```bash
# Push a commit or trigger manually:
vercel --prod
```

The web app is rebuilt with the new env vars pointing to Railway.

---

## Step 6: Deploy to Railway

### 6a. First deployment

```bash
cd /Users/quangnguyen/CodingPRJ/inkdown
railway up
```

Or connect GitHub repo in Railway Dashboard for auto-deploys on push.

### 6b. Monitor deployment

```bash
railway logs
```

Expected startup output:
```
@inkdown/api - AI Backend Server
AI Providers: ✅ openai, ✅ google
Server running at http://0.0.0.0:<PORT>
```

### 6c. Test the API directly

```bash
# Health check
curl https://api.noteshell.io/health

# Should return:
# { "status": "ok", "database": "connected", ... }
```

---

## Step 7: End-to-End Verification Checklist

### 7a. API Health
- [ ] `GET /health` returns 200 with `"status": "ok"`
- [ ] Database connection confirmed in health response

### 7b. Authentication
- [ ] Send request with valid JWT → 200
- [ ] Send request without JWT → 401

### 7c. Secretary Chat (the broken feature)
- [ ] Send message on app.noteshell.io secretary chat
- [ ] SSE response includes `thinking` events
- [ ] SSE response includes `text` events (LLM generates text)
- [ ] SSE response includes `done` event
- [ ] No `error` events about empty text generation

### 7d. Other AI Features
- [ ] Editor AI agent (inline editing) — generates edit proposals
- [ ] Note agent — creates/updates notes
- [ ] Chat agent — responds with text
- [ ] Deep agent (compound requests) — works

### 7e. CORS
- [ ] Requests from `https://app.noteshell.io` succeed
- [ ] Requests from other origins are rejected
- [ ] Preflight OPTIONS requests return correct headers

### 7f. SSE Streaming
- [ ] Long-running streams stay connected (no premature disconnect)
- [ ] Heartbeat events arrive every 15s for long streams
- [ ] Client abort (navigate away) doesn't crash the server

### 7g. Non-AI Routes
- [ ] Memory files CRUD works
- [ ] Thread listing works
- [ ] Calendar integration works (if configured)
- [ ] Settings/API keys endpoint works

---

## Step 8: Post-Migration Cleanup (Follow-up PR)

After Railway is verified stable for 24-48 hours:

1. **Remove CF Workers artifacts**:
   - Delete `apps/api/wrangler.toml`
   - Delete `apps/api/src/worker.ts`
   - Remove `wrangler` from `apps/api/package.json` devDependencies
   - Remove `apps/api/.gitignore` (only had `.vercel` ignore)
   - Remove diagnostic logging from `ai-sdk-factory.ts`, `secretary/agent.ts`, `secretary.ts`

2. **Simplify config.ts**: Remove the CF Workers comment about getters (lines 6-12). Keep getters though — they're good practice regardless.

3. **Update CLAUDE.md**: Change deploy instructions from `wrangler deploy` to `railway up` or `git push`.

4. **Update docs/ARCHITECTURE.md**: Change API hosting from CF Workers to Railway.

5. **Decommission CF Worker**: `npx wrangler delete` (only after Railway is confirmed stable)

---

## Files Modified (Implementation Phase)

| File | Action | Purpose |
|------|--------|---------|
| `railway.toml` | CREATE | Railway deployment config |
| `.railwayignore` | CREATE | Exclude unnecessary files |
| `apps/api/src/index.ts` | EDIT | Add defensive `resetAIProviders()` call |
| `packages/ai/src/providers/ai-sdk-factory.ts` | EDIT | Remove diagnostic logging |
| `packages/ai/src/agents/secretary/agent.ts` | EDIT | Remove diagnostic logging |
| `apps/api/src/routes/secretary.ts` | EDIT | Remove diagnostic logging |

**No changes to**: Routes, middleware, config, web app code, build system, Turbo config

---

## Rollback Plan

If Railway has issues:
1. Web app: Revert `VITE_API_BASE` in Vercel to the CF Workers URL
2. API: Run `cd apps/api && pnpm build && npx wrangler deploy` (worker.ts still exists)
3. Trigger Vercel rebuild

The CF Worker continues to exist until explicitly deleted.

---

## Why Not Other Options

| Option | Verdict | Reason |
|--------|---------|--------|
| **Fix CF Workers** | Tried, fragile | 3 bugs in recent commits, singleton fix may not resolve deeper V8 issues |
| **Vercel Functions** | Same problems | Serverless, stateless, same timeout/compatibility concerns |
| **Fly.io** | Good but overkill | More config complexity than Railway for this use case |
| **Raw VPS** | Unnecessary ops | Railway gives VPS-like reliability without server management |
| **Railway** | Best fit | Node.js native, $5/mo, git-push deploy, monorepo support, zero migration friction |
