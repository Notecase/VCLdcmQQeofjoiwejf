# Launch Prep: Fix, Commit, Deploy for First Users

## Context

The `feature/generative-ui` branch has ~30 files of uncommitted work (UI cleanup, AI agent improvements, model migration). Before inviting friends to test, we need to:

1. Fix a pre-existing test failure blocking clean CI
2. Commit and merge all work to `main`
3. Deploy frontend (Vercel) + API (Cloudflare Workers) so friends have a URL
4. Document how to manually seed free credits for test users

**Auth is already working** (Supabase with Google/GitHub OAuth). No onboarding flow needed for friends — they can sign up and start using it.

---

## Task 1: Fix ChatMessage Test Failure

**Problem**: `ChatMessage.vue` calls 4 store functions but the test only mocks 2 of them.

**File**: `apps/web/src/components/ai/ChatMessage.test.ts`

The component uses (lines 58-67 of `ChatMessage.vue`):

- `store.getCompletedArtifactsForMessage()` — mocked ✅
- `store.getPendingEditsForMessage()` — **MISSING** ❌
- `store.getCitationsForMessage()` — **MISSING** ❌
- `store.getCompletedActionsForMessage()` — **MISSING** ❌
- `store.getThinkingStepsForMessage()` — mocked ✅

**Fix**: Add the 3 missing mock functions to the `state` object (line 6-11):

```typescript
const state = {
  activeSession: { messages: [] as ChatMessage[] },
  isProcessing: false,
  getCompletedArtifactsForMessage: vi.fn(() => []),
  getThinkingStepsForMessage: vi.fn(() => []),
  // Add these three:
  getPendingEditsForMessage: vi.fn(() => []),
  getCitationsForMessage: vi.fn(() => []),
  getCompletedActionsForMessage: vi.fn(() => []),
}
```

Also add `.mockClear()` calls in `resetStore()` for the new mocks.

**Verify**: `pnpm test:run` — all 41 test files should pass.

---

## Task 2: Commit & Merge to Main

**Steps**:

1. Stage all changes (the model migration work + test fix + all UI changes on the branch)
2. Create a single commit with a descriptive message covering the full branch scope
3. Merge `feature/generative-ui` into `main`
4. Push `main`

**Pre-commit check**:

```bash
pnpm build && pnpm typecheck && pnpm lint && pnpm test:run
```

---

## Task 3: Deploy API to Cloudflare Workers

**Why CF Workers**: Hono has first-class Cloudflare Workers support. The API only uses `node:crypto` from Node.js stdlib (available in CF Workers via the `nodejs_compat` flag). No `fs`, `path`, or other Node-only APIs.

### 3.1 — Create CF Workers entry point

**New file**: `apps/api/src/worker.ts`

```typescript
import app from './index.worker'
export default app
```

**New file**: `apps/api/src/index.worker.ts`

Copy of `index.ts` but:

- Remove `import { serve } from '@hono/node-server'` and the `serve()` call
- Remove `import { config as loadEnv } from 'dotenv'` (CF uses env bindings)
- Export `app` as default (CF Workers convention)
- Access env vars from Hono's `c.env` context instead of `process.env`

**Key change**: The `config.ts` currently reads `process.env.*`. For CF Workers, env vars come from `wrangler.toml` secrets. Two approaches:

- **Option A (simplest)**: Use CF Workers' `nodejs_compat` + `node_compat` flags which polyfill `process.env` from bindings. This means `config.ts` works as-is.
- **Option B**: Refactor `config.ts` to accept env as a parameter. More correct but bigger change.

**Recommended**: Option A for launch speed. Refactor later.

### 3.2 — Add `wrangler.toml`

**New file**: `apps/api/wrangler.toml`

```toml
name = "inkdown-api"
main = "src/worker.ts"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]

[build]
command = "pnpm build"

# Secrets (set via `wrangler secret put <NAME>`):
# SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY
# GOOGLE_AI_API_KEY, OPENAI_API_KEY
# CORS_ORIGIN (set to your Vercel frontend URL)
```

### 3.3 — Add wrangler dev dependency

```bash
cd apps/api && pnpm add -D wrangler
```

### 3.4 — Set secrets & deploy

```bash
cd apps/api
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_KEY
npx wrangler secret put SUPABASE_ANON_KEY
npx wrangler secret put GOOGLE_AI_API_KEY
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put CORS_ORIGIN          # e.g. https://inkdown.vercel.app
npx wrangler secret put ADMIN_USER_IDS       # your Supabase user ID

npx wrangler deploy
```

This gives you a URL like `https://inkdown-api.<your-cf-account>.workers.dev`.

### 3.5 — Update frontend env

In Vercel dashboard (or `apps/web/.env.production`), set:

```
VITE_API_URL=https://inkdown-api.<your-cf-account>.workers.dev
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_PROVIDER=supabase
```

---

## Task 4: Deploy Frontend to Vercel

**Already configured** — `vercel.json` exists with correct settings:

```json
{
  "buildCommand": "pnpm install && pnpm build",
  "outputDirectory": "apps/web/dist",
  "framework": null,
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

**Steps**:

1. Push `main` to GitHub
2. Connect repo to Vercel (if not already): `vercel link`
3. Set env vars in Vercel dashboard:
   - `VITE_API_URL` → CF Workers URL
   - `VITE_SUPABASE_URL` → your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` → anon key
   - `VITE_PROVIDER` → `supabase`
4. Deploy: `vercel --prod` (or auto-deploy on push)

---

## Task 5: Seed Credits for Test Users

**Approach**: Manual via admin endpoint (as requested).

**How it works**:

1. Your Supabase user ID must be in the `ADMIN_USER_IDS` env var
2. After a friend signs up, get their user ID from Supabase dashboard (Auth → Users)
3. Call the grant endpoint:

```bash
curl -X POST https://inkdown-api.<your-cf>.workers.dev/api/settings/credits/grant \
  -H "Authorization: Bearer <your-jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "<friend-user-id>",
    "amount_cents": 500,
    "description": "Beta tester trial credits",
    "plan_type": "trial"
  }'
```

This grants $5.00 worth of credits. The `deduct_credits()` RPC automatically decrements on each AI call.

**Tip**: To get your JWT token, open browser DevTools on the app → Application → Local Storage → find the Supabase auth token.

---

## Files Modified

| #   | File                                             | Task | Change                                             |
| --- | ------------------------------------------------ | ---- | -------------------------------------------------- |
| 1   | `apps/web/src/components/ai/ChatMessage.test.ts` | T1   | Add 3 missing store mock functions                 |
| 2   | `apps/api/src/index.worker.ts`                   | T3   | New CF Workers entry point (adapted from index.ts) |
| 3   | `apps/api/wrangler.toml`                         | T3   | CF Workers config                                  |
| 4   | `apps/api/package.json`                          | T3   | Add wrangler devDependency                         |

---

## Execution Order

1. **Task 1** — Fix test (2 min)
2. **Task 2** — Pre-commit check → commit → merge to main (5 min)
3. **Task 3** — CF Workers setup + deploy (15 min, interactive — secrets)
4. **Task 4** — Vercel deploy (5 min, interactive — env vars)
5. **Task 5** — Seed credits after friends sign up (as needed)

---

## Verification

### After Task 1

```bash
pnpm test:run  # All 41 test files pass
```

### After Task 2

```bash
pnpm build && pnpm typecheck && pnpm lint && pnpm test:run  # All green
git log --oneline -3  # Confirm commit on main
```

### After Tasks 3+4 — Smoke Test

1. Open `https://your-app.vercel.app` → should load the app
2. Sign up / log in with Google → should authenticate
3. Send a chat message → should stream AI response (confirms API + Gemini 2.5 Pro working)
4. Open a note → ask AI to edit → should propose edits
5. Check Settings → Credits should show granted amount

### If something breaks

- **API returns 500**: Check `wrangler tail` for live logs
- **CORS errors**: Verify `CORS_ORIGIN` secret matches your Vercel URL exactly (including `https://`)
- **Auth fails**: Verify `SUPABASE_URL` and `SUPABASE_ANON_KEY` match between frontend and backend
- **AI calls fail**: Check `GOOGLE_AI_API_KEY` is set correctly in CF Workers secrets
