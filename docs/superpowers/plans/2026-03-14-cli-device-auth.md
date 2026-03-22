# CLI Device Auth Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the email+password `noteshell-setup` CLI auth with a browser-based OAuth 2.0 Device Authorization Grant flow so any Noteshell user (including OAuth/magic-link accounts) can authenticate the MCP CLI.

**Architecture:** The CLI calls `/api/cli/auth/start` to get a device code + user code, opens the browser to `app.noteshell.io/cli?code=XXXX`, and polls `/api/cli/auth/poll` until the user approves on the web. The web app stores the user's Supabase tokens in a `cli_auth_sessions` DB row; the CLI receives them on first successful poll and writes `~/.noteshell.json`.

**Tech Stack:** Hono (API), Vue 3 + Element Plus (frontend), Supabase (DB + auth), `@supabase/supabase-js`, `node:crypto` (device code generation), `node:test` (MCP tests), Vitest (API/web tests).

**Spec:** `docs/superpowers/specs/2026-03-14-cli-device-auth-design.md`

---

## File Map

### Created

| File                                   | Responsibility                    |
| -------------------------------------- | --------------------------------- |
| `supabase/migrations/022_cli_auth.sql` | `cli_auth_sessions` table + index |
| `apps/api/src/routes/cli-auth.ts`      | 4 device auth endpoints           |
| `apps/web/src/views/CliAuthView.vue`   | Browser approval page             |

### Modified

| File                                            | Change                                     |
| ----------------------------------------------- | ------------------------------------------ |
| `apps/api/src/config.ts`                        | Add `baseUrl` from `BASE_URL` env var      |
| `apps/api/src/routes/index.ts`                  | Mount `/api/cli` route                     |
| `apps/web/src/main.ts`                          | Add `/cli` route; exempt from demo guard   |
| `apps/web/src/views/AuthView.vue`               | Honor `?redirect=` query param after login |
| `packages/mcp/scripts/noteshell.mjs`            | New unified CLI (from /tmp patch)          |
| `packages/mcp/scripts/lib/device-auth.mjs`      | Response parsers (from /tmp patch)         |
| `packages/mcp/scripts/lib/noteshell-config.mjs` | Config writer (from /tmp patch)            |
| `packages/mcp/scripts/lib/open-browser.mjs`     | Browser opener (from /tmp patch)           |
| `packages/mcp/scripts/setup.mjs`                | Use `writeNoteshellConfig` from lib        |
| `packages/mcp/test/device-auth.test.mjs`        | Unit tests (from /tmp patch)               |
| `packages/mcp/package.json`                     | New bin entries, test script, v0.2.0       |
| `packages/mcp/src/config.ts`                    | Add `refresh_token`, `expires_at` fields   |
| `packages/mcp/src/db/client.ts`                 | Token auto-refresh on startup              |

---

## Chunk 1: Database + Backend

### Task 1: Database Migration

**Files:**

- Create: `supabase/migrations/022_cli_auth.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- CLI Device Auth Sessions (RFC 8628 Device Authorization Grant)
-- Stores in-flight device auth requests. Rows are consumed after first successful
-- poll and cleaned up on each /start call.

CREATE TABLE cli_auth_sessions (
  device_code       TEXT PRIMARY KEY,
  user_code         TEXT NOT NULL UNIQUE,
  -- status: pending | approved | consumed | denied
  status            TEXT NOT NULL DEFAULT 'pending',
  client_name       TEXT,
  scopes            TEXT[],
  user_id           UUID REFERENCES auth.users,
  access_token      TEXT,
  refresh_token     TEXT,
  token_expires_at  TIMESTAMPTZ,      -- when the stored access_token expires
  expires_at        TIMESTAMPTZ NOT NULL,  -- device code TTL (10 min)
  last_polled_at    TIMESTAMPTZ,
  poll_count        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- Used by poll endpoint and cleanup query
CREATE INDEX idx_cli_auth_sessions_expires ON cli_auth_sessions(expires_at);

-- No RLS policies = service role only (public cannot read/write)
ALTER TABLE cli_auth_sessions ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: Apply migration locally**

```bash
npx supabase db push
# or: npx supabase migration up
```

Expected: migration applies without error.

- [ ] **Step 3: Verify table exists**

```bash
npx supabase db execute "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'cli_auth_sessions' ORDER BY ordinal_position;"
```

Expected: 12 rows, one per column.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/022_cli_auth.sql
git commit -m "feat(db): add cli_auth_sessions table for device auth flow"
```

---

### Task 2: Add BASE_URL to API Config

**Files:**

- Modify: `apps/api/src/config.ts`

- [ ] **Step 1: Add `baseUrl` to the config object**

In `apps/api/src/config.ts`, add one line inside the `export const config = {` block after the `cors` section:

```typescript
  // Base URL for building verification URIs in CLI auth flow
  baseUrl: process.env.BASE_URL || 'https://app.noteshell.io',
```

- [ ] **Step 2: Verify typecheck passes**

```bash
cd apps/api && pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/config.ts
git commit -m "feat(api): add BASE_URL config for CLI auth verification URIs"
```

---

### Task 3: CLI Auth Route

**Files:**

- Create: `apps/api/src/routes/cli-auth.ts`

- [ ] **Step 1: Write unit tests for pure logic helpers**

Create `apps/api/src/routes/cli-auth.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'

// Copy these two functions here to test them in isolation before wiring up the route
const USER_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function generateUserCode(bytes: Buffer): string {
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += USER_CODE_CHARS[bytes[i] % USER_CODE_CHARS.length]
    if (i === 3) code += '-'
  }
  return code
}

describe('generateUserCode', () => {
  it('produces XXXX-XXXX format', () => {
    const bytes = Buffer.alloc(8, 0)
    const code = generateUserCode(bytes)
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/)
  })

  it('uses only allowed chars (no 0, 1, I, O)', () => {
    for (let seed = 0; seed < 256; seed++) {
      const bytes = Buffer.alloc(8, seed)
      const code = generateUserCode(bytes).replace('-', '')
      for (const char of code) {
        expect(USER_CODE_CHARS).toContain(char)
      }
    }
  })

  it('always produces exactly 9 chars (8 + hyphen)', () => {
    const bytes = Buffer.from([10, 20, 30, 40, 50, 60, 70, 80])
    expect(generateUserCode(bytes)).toHaveLength(9)
  })
})
```

- [ ] **Step 2: Run tests to confirm they pass**

```bash
pnpm test:run apps/api/src/routes/cli-auth.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 3: Create the route file**

Create `apps/api/src/routes/cli-auth.ts`:

```typescript
/**
 * CLI Device Auth Routes (RFC 8628 Device Authorization Grant)
 *
 * POST /start   — Public: create device session, open browser flow
 * POST /poll    — Public: poll for approval (CLI calls this every 5s)
 * POST /approve — Auth: user approves on web
 * POST /deny    — Auth: user denies on web
 */

import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { randomBytes } from 'node:crypto'
import { authMiddleware, requireAuth } from '../middleware/auth'
import { getServiceClient } from '../lib/supabase'
import { config } from '../config'

const cliAuth = new Hono()

// RFC 8628 recommended alphabet: avoids 0/O/1/I confusion
const USER_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const DEVICE_CODE_TTL_SECONDS = 600 // 10 minutes
const POLL_INTERVAL_SECONDS = 5

function generateDeviceCode(): string {
  return randomBytes(32).toString('hex') // 64 hex chars
}

function generateUserCode(): string {
  const bytes = randomBytes(8)
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += USER_CODE_CHARS[bytes[i] % USER_CODE_CHARS.length]
    if (i === 3) code += '-'
  }
  return code
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /start — Public
// ─────────────────────────────────────────────────────────────────────────────

cliAuth.post(
  '/start',
  zValidator(
    'json',
    z.object({
      client_name: z.string().min(1).max(100).optional(),
      scopes: z.array(z.string()).optional(),
    })
  ),
  async (c) => {
    const { client_name, scopes } = c.req.valid('json')
    const db = getServiceClient()

    // Housekeeping: delete sessions older than 1 hour past their TTL
    await db
      .from('cli_auth_sessions')
      .delete()
      .lt('expires_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())

    const deviceCode = generateDeviceCode()
    const userCode = generateUserCode()
    const expiresAt = new Date(Date.now() + DEVICE_CODE_TTL_SECONDS * 1000).toISOString()

    const { error } = await db.from('cli_auth_sessions').insert({
      device_code: deviceCode,
      user_code: userCode,
      client_name: client_name ?? '@noteshell/mcp',
      scopes: scopes ?? [],
      expires_at: expiresAt,
    })

    if (error) {
      return c.json({ error: 'Failed to create auth session' }, 500)
    }

    const verificationUri = `${config.baseUrl}/cli`
    return c.json({
      device_code: deviceCode,
      user_code: userCode,
      verification_uri: verificationUri,
      verification_uri_complete: `${verificationUri}?code=${encodeURIComponent(userCode)}`,
      interval: POLL_INTERVAL_SECONDS,
      expires_in: DEVICE_CODE_TTL_SECONDS,
    })
  }
)

// ─────────────────────────────────────────────────────────────────────────────
// POST /poll — Public
// ─────────────────────────────────────────────────────────────────────────────

cliAuth.post(
  '/poll',
  zValidator('json', z.object({ device_code: z.string().min(1) })),
  async (c) => {
    const { device_code } = c.req.valid('json')
    const db = getServiceClient()

    const { data: session, error } = await db
      .from('cli_auth_sessions')
      .select('*')
      .eq('device_code', device_code)
      .single()

    if (error || !session) {
      return c.json({ error: 'expired_token' }, 400)
    }

    // Expired TTL
    if (new Date(session.expires_at) < new Date()) {
      return c.json({ error: 'expired_token' }, 400)
    }

    if (session.status === 'denied') {
      return c.json({ error: 'access_denied' }, 400)
    }

    if (session.status === 'consumed') {
      return c.json({ error: 'expired_token' }, 400)
    }

    if (session.status === 'pending') {
      const now = new Date()
      const tooFast =
        session.last_polled_at &&
        new Date(session.last_polled_at) > new Date(now.getTime() - POLL_INTERVAL_SECONDS * 1000)

      // Update poll tracking regardless
      await db
        .from('cli_auth_sessions')
        .update({ last_polled_at: now.toISOString(), poll_count: session.poll_count + 1 })
        .eq('device_code', device_code)

      if (session.poll_count > 100) {
        return c.json({ error: 'expired_token' }, 400)
      }

      if (tooFast) {
        return c.json({ error: 'slow_down' }, 400)
      }

      return c.json({ error: 'authorization_pending' }, 400)
    }

    if (session.status === 'approved') {
      // Consume: clear tokens to prevent replay
      await db
        .from('cli_auth_sessions')
        .update({ status: 'consumed', access_token: null, refresh_token: null })
        .eq('device_code', device_code)

      return c.json({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        token_expires_at: session.token_expires_at,
        supabase_url: config.supabase.url,
        supabase_anon_key: config.supabase.anonKey,
        user: { id: session.user_id },
      })
    }

    return c.json({ error: 'expired_token' }, 400)
  }
)

// ─────────────────────────────────────────────────────────────────────────────
// POST /approve — Auth required (web user)
// ─────────────────────────────────────────────────────────────────────────────

cliAuth.post(
  '/approve',
  authMiddleware,
  zValidator(
    'json',
    z.object({
      user_code: z.string().min(1),
      access_token: z.string().min(1),
      refresh_token: z.string().min(1),
      token_expires_at: z.string().min(1),
    })
  ),
  async (c) => {
    const auth = requireAuth(c)
    const { user_code, access_token, refresh_token, token_expires_at } = c.req.valid('json')

    // The token in the body must match the authenticated request's token
    if (access_token !== auth.accessToken) {
      return c.json({ error: 'Token mismatch' }, 400)
    }

    const db = getServiceClient()

    const { data: session, error } = await db
      .from('cli_auth_sessions')
      .select('device_code, status, expires_at')
      .eq('user_code', user_code)
      .single()

    if (
      error ||
      !session ||
      session.status !== 'pending' ||
      new Date(session.expires_at) < new Date()
    ) {
      return c.json({ error: 'Code not found or expired' }, 404)
    }

    const { error: updateError } = await db
      .from('cli_auth_sessions')
      .update({
        status: 'approved',
        user_id: auth.userId,
        access_token,
        refresh_token,
        token_expires_at,
      })
      .eq('user_code', user_code)

    if (updateError) {
      return c.json({ error: 'Failed to approve' }, 500)
    }

    return c.json({ success: true })
  }
)

// ─────────────────────────────────────────────────────────────────────────────
// POST /deny — Auth required (web user)
// ─────────────────────────────────────────────────────────────────────────────

cliAuth.post(
  '/deny',
  authMiddleware,
  zValidator('json', z.object({ user_code: z.string().min(1) })),
  async (c) => {
    requireAuth(c)
    const { user_code } = c.req.valid('json')
    const db = getServiceClient()

    await db
      .from('cli_auth_sessions')
      .update({ status: 'denied' })
      .eq('user_code', user_code)
      .eq('status', 'pending')

    return c.json({ success: true })
  }
)

export default cliAuth
```

- [ ] **Step 4: Run typecheck**

```bash
cd apps/api && pnpm typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/cli-auth.ts apps/api/src/routes/cli-auth.test.ts
git commit -m "feat(api): add CLI device auth endpoints (RFC 8628)"
```

---

### Task 4: Register the Route

**Files:**

- Modify: `apps/api/src/routes/index.ts`

- [ ] **Step 1: Import and mount the route**

In `apps/api/src/routes/index.ts`, add the import after the existing imports:

```typescript
import cliAuth from './cli-auth'
```

And in the routes section, add before the closing `export default routes`:

```typescript
// CLI device auth (public endpoints + auth-gated approve/deny)
routes.route('/api/cli/auth', cliAuth)
```

- [ ] **Step 2: Update the JSDoc comment block** in `index.ts` to add:

```
 * - /api/cli/auth/*              - CLI device auth flow (start/poll public, approve/deny auth required)
```

- [ ] **Step 3: Run typecheck and start the server to verify no startup errors**

```bash
cd apps/api && pnpm typecheck
pnpm dev &
sleep 2
curl -s -X POST http://localhost:3001/api/cli/auth/start \
  -H "Content-Type: application/json" \
  -d '{"client_name":"test"}' | jq .
kill %1
```

Expected: JSON response with `device_code`, `user_code`, `verification_uri`, etc.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/index.ts
git commit -m "feat(api): register /api/cli/auth routes"
```

---

## Chunk 2: Frontend

### Task 5: AuthView Redirect Fix

**Files:**

- Modify: `apps/web/src/views/AuthView.vue`

- [ ] **Step 1: Add `useRoute` import and redirect logic**

In `apps/web/src/views/AuthView.vue`, update the `<script setup>` block:

```typescript
// Add useRoute to the import
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores'

const router = useRouter()
const route = useRoute() // ← add this
const authStore = useAuthStore()
```

- [ ] **Step 2: Update `handleSubmit` and `skipAuth` to use the redirect param**

In `AuthView.vue` there are two `router.push('/')` calls to update:

1. In `handleSubmit` (after successful sign-in/sign-up):

```typescript
const redirectTo = (route.query.redirect as string) || '/'
router.push(redirectTo)
```

2. In `skipAuth` (the "Continue without account" button):

```typescript
function skipAuth() {
  const redirectTo = (route.query.redirect as string) || '/'
  router.push(redirectTo)
}
```

The OAuth path (`handleOAuth`) still redirects via Supabase's own mechanism — the `CliAuthView` handles that case via `sessionStorage`.

- [ ] **Step 3: Run typecheck**

```bash
cd apps/web && pnpm typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/views/AuthView.vue
git commit -m "feat(web): honor ?redirect= query param after login"
```

---

### Task 6: CLI Auth View

**Files:**

- Create: `apps/web/src/views/CliAuthView.vue`

- [ ] **Step 1: Create the component**

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores'
import { supabase } from '@/services/supabase'
import { Loading } from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

type PageState =
  | 'loading'
  | 'code-entry'
  | 'approval'
  | 'submitting'
  | 'success'
  | 'denied'
  | 'error'

const state = ref<PageState>('loading')
const userCode = ref('')
const codeInput = ref('')
const errorMessage = ref('')

const SESSION_KEY = 'noteshell_cli_pending_code'

onMounted(async () => {
  const codeFromUrl = route.query.code as string | undefined
  const codeFromStorage = sessionStorage.getItem(SESSION_KEY)
  const code = codeFromUrl || codeFromStorage

  if (codeFromUrl) {
    // Persist so OAuth callback can restore it
    sessionStorage.setItem(SESSION_KEY, codeFromUrl)
  }

  if (!authStore.isAuthenticated) {
    const redirectTo = `/cli${code ? `?code=${encodeURIComponent(code)}` : ''}`
    router.push(`/auth?redirect=${encodeURIComponent(redirectTo)}`)
    return
  }

  if (!code) {
    state.value = 'code-entry'
    return
  }

  userCode.value = code.toUpperCase()
  state.value = 'approval'
})

function handleCodeSubmit() {
  const code = codeInput.value.trim().toUpperCase()
  if (!code) return
  userCode.value = code
  state.value = 'approval'
}

async function getSession() {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session
}

async function handleApprove() {
  state.value = 'submitting'
  try {
    const session = await getSession()
    if (!session) {
      errorMessage.value = 'Session expired. Please refresh and try again.'
      state.value = 'error'
      return
    }

    const res = await fetch('/api/cli/auth/approve', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        user_code: userCode.value,
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        token_expires_at: new Date(session.expires_at! * 1000).toISOString(),
      }),
    })

    if (!res.ok) {
      const data = await res.json()
      errorMessage.value = data.error || 'Failed to authorize. The code may have expired.'
      state.value = 'error'
      return
    }

    sessionStorage.removeItem(SESSION_KEY)
    state.value = 'success'
  } catch {
    errorMessage.value = 'Something went wrong. Please try again.'
    state.value = 'error'
  }
}

async function handleDeny() {
  state.value = 'submitting'
  try {
    const session = await getSession()
    await fetch('/api/cli/auth/deny', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token || ''}`,
      },
      body: JSON.stringify({ user_code: userCode.value }),
    })
    sessionStorage.removeItem(SESSION_KEY)
    state.value = 'denied'
  } catch {
    state.value = 'denied'
  }
}
</script>

<template>
  <div class="auth-view">
    <div class="auth-card">
      <!-- Loading -->
      <div v-if="state === 'loading'" class="cli-state">
        <el-icon class="cli-icon" :size="40"><Loading /></el-icon>
      </div>

      <!-- Code entry (user navigated manually without ?code=) -->
      <div v-else-if="state === 'code-entry'" class="cli-state">
        <div class="cli-icon-wrap">
          <span class="cli-terminal-icon">&gt;_</span>
        </div>
        <h2>Connect Noteshell CLI</h2>
        <p class="cli-sub">Enter the code shown in your terminal</p>
        <div class="cli-code-form">
          <el-input
            v-model="codeInput"
            placeholder="ABCD-1234"
            size="large"
            @keyup.enter="handleCodeSubmit"
          />
          <el-button
            type="primary"
            size="large"
            style="width:100%; margin-top:12px"
            @click="handleCodeSubmit"
          >
            Continue
          </el-button>
        </div>
      </div>

      <!-- Approval screen -->
      <div v-else-if="state === 'approval'" class="cli-state">
        <div class="cli-icon-wrap">
          <span class="cli-terminal-icon">&gt;_</span>
        </div>
        <h2>Authorize Noteshell CLI</h2>
        <p class="cli-sub"><strong>Noteshell MCP</strong> wants to connect to your account</p>
        <div class="cli-code-display">{{ userCode }}</div>
        <p class="cli-hint">Confirm this code matches what's in your terminal</p>
        <div class="cli-actions">
          <el-button type="primary" size="large" style="width:100%" @click="handleApprove">
            Authorize
          </el-button>
          <el-button
            type="text"
            size="large"
            style="width:100%; margin-top:4px"
            @click="handleDeny"
          >
            Deny
          </el-button>
        </div>
      </div>

      <!-- Submitting -->
      <div v-else-if="state === 'submitting'" class="cli-state">
        <el-icon class="cli-icon spin" :size="40"><Loading /></el-icon>
        <p class="cli-sub">Processing...</p>
      </div>

      <!-- Success -->
      <div v-else-if="state === 'success'" class="cli-state">
        <div class="cli-result-icon success">✓</div>
        <h2>Authorized</h2>
        <p class="cli-sub">You can close this tab. Your CLI is now connected.</p>
      </div>

      <!-- Denied -->
      <div v-else-if="state === 'denied'" class="cli-state">
        <div class="cli-result-icon denied">✕</div>
        <h2>Request Denied</h2>
        <p class="cli-sub">You can close this tab.</p>
      </div>

      <!-- Error -->
      <div v-else-if="state === 'error'" class="cli-state">
        <el-alert :title="errorMessage" type="error" :closable="false" style="margin-bottom:16px" />
        <el-button @click="state = 'approval'">Try again</el-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Reuses auth-view + auth-card from AuthView.vue */
.auth-view {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: var(--bg-color);
  padding: 20px;
}

.auth-card {
  width: 100%;
  max-width: 400px;
  padding: 40px;
  background: var(--editor-bg);
  border-radius: 12px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
}

.cli-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 8px;
}

.cli-icon-wrap {
  margin-bottom: 8px;
}

.cli-terminal-icon {
  display: inline-block;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 32px;
  font-weight: 700;
  color: var(--primary-color);
  background: var(--bg-color);
  border-radius: 10px;
  padding: 10px 16px;
  letter-spacing: -2px;
}

.cli-state h2 {
  margin: 8px 0 0;
  font-size: 22px;
  color: var(--text-color);
}

.cli-sub {
  margin: 4px 0 12px;
  color: var(--text-color-secondary);
  font-size: 14px;
  line-height: 1.5;
}

.cli-code-display {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 30px;
  font-weight: 700;
  letter-spacing: 6px;
  color: var(--primary-color);
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 14px 24px;
  margin: 8px 0;
}

.cli-hint {
  font-size: 12px;
  color: var(--text-color-secondary);
  margin: 0 0 16px;
}

.cli-actions {
  width: 100%;
  display: flex;
  flex-direction: column;
}

.cli-code-form {
  width: 100%;
}

.cli-result-icon {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  font-weight: 700;
  margin-bottom: 8px;
}

.cli-result-icon.success {
  background: rgba(34, 197, 94, 0.15);
  color: var(--diff-add-border);
}

.cli-result-icon.denied {
  background: rgba(239, 68, 68, 0.12);
  color: var(--diff-remove-border);
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
```

- [ ] **Step 2: Run typecheck**

```bash
cd apps/web && pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/views/CliAuthView.vue
git commit -m "feat(web): add CLI device auth approval page"
```

---

### Task 7: Register Route in Router

**Files:**

- Modify: `apps/web/src/main.ts`

- [ ] **Step 1: Add the `/cli` route to the router**

In `apps/web/src/main.ts`, add inside the `routes` array after the `/demo` route:

```typescript
    {
      path: '/cli',
      name: 'cli-auth',
      component: () => import('./views/CliAuthView.vue'),
    },
```

- [ ] **Step 2: Exempt `/cli` from the demo guard**

Find the existing guard:

```typescript
  if (isProductionDemo && !inDemoMode && to.name !== 'demo') {
```

Replace with:

```typescript
  if (isProductionDemo && !inDemoMode && to.name !== 'demo' && to.name !== 'cli-auth') {
```

- [ ] **Step 3: Run typecheck**

```bash
cd apps/web && pnpm typecheck
```

Expected: no errors.

- [ ] **Step 4: Manual smoke test**

```bash
pnpm dev
```

Open `http://localhost:5173/cli?code=TEST-1234` in a browser. Expected: approval screen (or redirect to /auth if not logged in).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/main.ts
git commit -m "feat(web): add /cli route for device auth approval"
```

---

## Chunk 3: MCP Package + Publish

### Task 8: Add Patch Library Files

**Files:**

- Create: `packages/mcp/scripts/lib/device-auth.mjs`
- Create: `packages/mcp/scripts/lib/noteshell-config.mjs`
- Create: `packages/mcp/scripts/lib/open-browser.mjs`
- Create: `packages/mcp/scripts/noteshell.mjs`
- Create: `packages/mcp/test/device-auth.test.mjs`

- [ ] **Step 1: Create directories**

```bash
mkdir -p packages/mcp/scripts/lib packages/mcp/test
```

- [ ] **Step 2: Create `packages/mcp/scripts/lib/device-auth.mjs`**

```javascript
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readRequiredString(payload, fieldName) {
  const value = payload[fieldName]
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid auth response: missing ${fieldName}`)
  }
  return value
}

function readOptionalString(payload, fieldName) {
  const value = payload[fieldName]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export function normalizeDeviceStartResponse(payload) {
  if (!isRecord(payload)) {
    throw new Error('Invalid auth response: expected JSON object')
  }

  const deviceCode = readRequiredString(payload, 'device_code')
  const userCode = readRequiredString(payload, 'user_code')
  const verificationUri = readRequiredString(payload, 'verification_uri')
  const verificationUriComplete = readOptionalString(payload, 'verification_uri_complete')

  const interval =
    typeof payload.interval === 'number' &&
    Number.isFinite(payload.interval) &&
    payload.interval > 0
      ? Math.round(payload.interval)
      : 5

  let expiresAt
  if (typeof payload.expires_at === 'string' && payload.expires_at.length > 0) {
    expiresAt = payload.expires_at
  } else if (
    typeof payload.expires_in === 'number' &&
    Number.isFinite(payload.expires_in) &&
    payload.expires_in > 0
  ) {
    expiresAt = new Date(Date.now() + payload.expires_in * 1000).toISOString()
  }

  return {
    deviceCode,
    userCode,
    verificationUri,
    verificationUriComplete,
    intervalSeconds: Math.max(1, interval),
    expiresAt,
  }
}

function normalizeUser(payload) {
  if (!isRecord(payload)) {
    return { id: undefined, email: undefined }
  }
  return {
    id: typeof payload.id === 'string' ? payload.id : undefined,
    email: typeof payload.email === 'string' ? payload.email : undefined,
  }
}

export function parsePollResponse(payload) {
  if (!isRecord(payload)) {
    throw new Error('Invalid poll response: expected JSON object')
  }

  const errorCode = typeof payload.error === 'string' ? payload.error : undefined
  if (errorCode === 'authorization_pending') return { status: 'pending' }
  if (errorCode === 'slow_down') return { status: 'pending', slowDown: true }
  if (errorCode === 'expired_token')
    throw new Error('Login session expired. Run `noteshell login` again.')
  if (errorCode === 'access_denied') throw new Error('Login request was denied.')
  if (errorCode) throw new Error(`Login failed: ${errorCode}`)

  const accessToken = readRequiredString(payload, 'access_token')

  return {
    status: 'success',
    accessToken,
    refreshToken: readOptionalString(payload, 'refresh_token'),
    expiresAt: readOptionalString(payload, 'token_expires_at'),
    supabaseUrl: readOptionalString(payload, 'supabase_url'),
    supabaseAnonKey: readOptionalString(payload, 'supabase_anon_key'),
    user: normalizeUser(payload.user),
  }
}
```

- [ ] **Step 3: Create `packages/mcp/scripts/lib/noteshell-config.mjs`**

```javascript
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export const DEFAULT_SUPABASE_URL = 'https://lxjxoxwaesqxpgfdwkir.supabase.co'
export const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx4anhveHdhZXNxeHBnZmR3a2lyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0OTQzNzEsImV4cCI6MjA4NDA3MDM3MX0.2hjP6JcoiHgfZMILSvaYyxe2A8BmKx-75XVLCPJrrf8'

export function writeNoteshellConfig({
  supabaseUrl = DEFAULT_SUPABASE_URL,
  supabaseAnonKey = DEFAULT_SUPABASE_ANON_KEY,
  accessToken,
  refreshToken,
  expiresAt,
  userId,
}) {
  const configPath = join(homedir(), '.noteshell.json')
  const config = {
    supabase_url: supabaseUrl,
    supabase_anon_key: supabaseAnonKey,
    access_token: accessToken,
  }

  if (refreshToken) config.refresh_token = refreshToken
  if (expiresAt) config.expires_at = expiresAt
  if (userId) config.user_id = userId

  writeFileSync(configPath, JSON.stringify(config, null, 2))
  return configPath
}
```

- [ ] **Step 4: Create `packages/mcp/scripts/lib/open-browser.mjs`**

```javascript
import { spawnSync } from 'node:child_process'

export function openBrowser(url) {
  let command, args

  if (process.platform === 'darwin') {
    command = 'open'
    args = [url]
  } else if (process.platform === 'win32') {
    command = 'cmd'
    args = ['/c', 'start', '', url]
  } else {
    command = 'xdg-open'
    args = [url]
  }

  const result = spawnSync(command, args, { stdio: 'ignore' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`Failed to open browser (exit code ${result.status})`)
}
```

- [ ] **Step 5: Create `packages/mcp/scripts/noteshell.mjs`** (unified CLI entrypoint)

```javascript
#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { normalizeDeviceStartResponse, parsePollResponse } from './lib/device-auth.mjs'
import {
  DEFAULT_SUPABASE_ANON_KEY,
  DEFAULT_SUPABASE_URL,
  writeNoteshellConfig,
} from './lib/noteshell-config.mjs'
import { openBrowser } from './lib/open-browser.mjs'

function usage() {
  console.log(`Noteshell CLI

Usage:
  noteshell login [--api-url URL] [--no-browser]
  noteshell setup <email> <password>
  noteshell mcp

Commands:
  login       Authenticate via browser/device flow
  setup       Legacy email/password login
  mcp         Start MCP server over stdio (default)
`)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function sanitizeApiUrl(value) {
  const trimmed = value.trim()
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  })

  const text = await response.text()
  let body = {}
  if (text.length > 0) {
    try {
      body = JSON.parse(text)
    } catch {
      throw new Error(`Received non-JSON response from ${url}: ${text.slice(0, 200)}`)
    }
  }

  if (!response.ok) {
    const message =
      typeof body.message === 'string'
        ? body.message
        : typeof body.error_description === 'string'
          ? body.error_description
          : typeof body.error === 'string'
            ? body.error
            : `HTTP ${response.status}`
    throw new Error(`${url} failed: ${message}`)
  }

  return body
}

function parseLoginFlags(argv) {
  const options = {
    apiUrl: sanitizeApiUrl(process.env.NOTESHELL_API_URL || 'https://app.noteshell.io'),
    openBrowser: true,
    scopes: [],
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--no-browser') {
      options.openBrowser = false
      continue
    }
    if (arg === '--api-url') {
      const next = argv[i + 1]
      if (!next || next.startsWith('--')) throw new Error('Missing value for --api-url')
      options.apiUrl = sanitizeApiUrl(next)
      i += 1
      continue
    }
    if (arg === '--scopes') {
      const next = argv[i + 1]
      if (!next || next.startsWith('--')) throw new Error('Missing value for --scopes')
      options.scopes = next
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      i += 1
      continue
    }
    if (arg === '--help' || arg === '-h') {
      options.help = true
      continue
    }
    throw new Error(`Unknown login option: ${arg}`)
  }

  return options
}

async function runDeviceLogin(argv) {
  const options = parseLoginFlags(argv)
  if (options.help) {
    console.log(
      'Usage: noteshell login [--api-url URL] [--no-browser] [--scopes notes:read,notes:write]'
    )
    return
  }

  const startPayload = await postJson(`${options.apiUrl}/api/cli/auth/start`, {
    client_name: '@noteshell/mcp',
    scopes: options.scopes,
  })
  const device = normalizeDeviceStartResponse(startPayload)

  console.log(`Open this URL to authenticate: ${device.verificationUri}`)
  console.log(`Enter code: ${device.userCode}`)

  const verificationLink =
    device.verificationUriComplete ||
    `${device.verificationUri}?code=${encodeURIComponent(device.userCode)}`

  if (options.openBrowser) {
    try {
      openBrowser(verificationLink)
      console.log('✓ Browser opened')
    } catch (error) {
      console.log(`! Could not open browser automatically (${error.message})`)
      console.log(`  Open this link manually: ${verificationLink}`)
    }
  } else {
    console.log(`Open this link manually: ${verificationLink}`)
  }

  console.log('Waiting for approval...')

  let intervalMs = device.intervalSeconds * 1000
  const expiresAtMs = device.expiresAt ? Date.parse(device.expiresAt) : Date.now() + 10 * 60 * 1000

  while (Date.now() < expiresAtMs) {
    await sleep(intervalMs)
    const pollPayload = await postJson(`${options.apiUrl}/api/cli/auth/poll`, {
      device_code: device.deviceCode,
    })
    const pollResult = parsePollResponse(pollPayload)

    if (pollResult.status === 'pending') {
      if (pollResult.slowDown) intervalMs += 5000
      continue
    }

    const configPath = writeNoteshellConfig({
      supabaseUrl: pollResult.supabaseUrl || DEFAULT_SUPABASE_URL,
      supabaseAnonKey: pollResult.supabaseAnonKey || DEFAULT_SUPABASE_ANON_KEY,
      accessToken: pollResult.accessToken,
      refreshToken: pollResult.refreshToken,
      expiresAt: pollResult.expiresAt,
      userId: pollResult.user.id,
    })

    const userLabel = pollResult.user.email ? ` as ${pollResult.user.email}` : ''
    console.log(`✓ Logged in${userLabel}`)
    console.log(`  Config written to ${configPath}`)
    if (pollResult.expiresAt) console.log(`  Token expires: ${pollResult.expiresAt}`)
    return
  }

  throw new Error('Timed out waiting for approval. Run `noteshell login` again.')
}

function runNodeScript(scriptPath, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], { stdio: 'inherit' })
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal)
        return
      }
      resolve(code ?? 0)
    })
  })
}

async function main() {
  const args = process.argv.slice(2)
  const command = args[0]
  const rest = args.slice(1)

  const setupScript = fileURLToPath(new URL('./setup.mjs', import.meta.url))
  const serverScript = fileURLToPath(new URL('../dist/index.js', import.meta.url))

  if (!command || command === 'mcp' || command === 'serve' || command === 'server') {
    process.exit(await runNodeScript(serverScript, rest))
  }

  if (command === 'setup') {
    process.exit(await runNodeScript(setupScript, rest))
  }

  if (command === 'login') {
    await runDeviceLogin(rest)
    return
  }

  if (command === '--help' || command === '-h' || command === 'help') {
    usage()
    return
  }

  throw new Error(`Unknown command: ${command}`)
}

main().catch((error) => {
  console.error(`Noteshell CLI failed: ${error.message}`)
  process.exit(1)
})
```

- [ ] **Step 6: Create `packages/mcp/test/device-auth.test.mjs`**

```javascript
import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeDeviceStartResponse, parsePollResponse } from '../scripts/lib/device-auth.mjs'

test('normalizeDeviceStartResponse enforces required fields and defaults interval', () => {
  const normalized = normalizeDeviceStartResponse({
    device_code: 'dev_123',
    user_code: 'ABCD-EFGH',
    verification_uri: 'https://app.noteshell.io/cli',
  })

  assert.equal(normalized.deviceCode, 'dev_123')
  assert.equal(normalized.userCode, 'ABCD-EFGH')
  assert.equal(normalized.verificationUri, 'https://app.noteshell.io/cli')
  assert.equal(normalized.intervalSeconds, 5)
})

test('normalizeDeviceStartResponse rejects malformed payloads', () => {
  assert.throws(
    () =>
      normalizeDeviceStartResponse({
        user_code: 'ABCD-EFGH',
        verification_uri: 'https://app.noteshell.io/cli',
      }),
    /device_code/
  )
})

test('parsePollResponse returns pending state on authorization_pending error', () => {
  const parsed = parsePollResponse({ error: 'authorization_pending' })
  assert.deepEqual(parsed, { status: 'pending' })
})

test('parsePollResponse returns success payload when tokens are present', () => {
  const parsed = parsePollResponse({
    access_token: 'token_123',
    refresh_token: 'refresh_123',
    token_expires_at: '2026-03-14T09:00:00.000Z',
    user: { id: 'abc', email: 'dev@noteshell.app' },
  })

  assert.equal(parsed.status, 'success')
  assert.equal(parsed.accessToken, 'token_123')
  assert.equal(parsed.user.email, 'dev@noteshell.app')
})
```

- [ ] **Step 7: Run the tests**

```bash
cd packages/mcp && node --test test/device-auth.test.mjs
```

Expected: 4 tests pass.

- [ ] **Step 8: Commit**

```bash
git add packages/mcp/scripts/ packages/mcp/test/
git commit -m "feat(mcp): add CLI device auth scripts and lib helpers"
```

---

### Task 9: Update package.json, setup.mjs, config.ts, and client.ts

**Files:**

- Modify: `packages/mcp/package.json`
- Modify: `packages/mcp/scripts/setup.mjs`
- Modify: `packages/mcp/src/config.ts`
- Modify: `packages/mcp/src/db/client.ts`

- [ ] **Step 1: Update `package.json`**

In `packages/mcp/package.json`, make these changes:

1. Bump version: `"version": "0.1.0"` → `"version": "0.2.0"`

2. Replace the `"bin"` section:

```json
  "bin": {
    "noteshell": "scripts/noteshell.mjs",
    "mcp": "scripts/noteshell.mjs",
    "noteshell-mcp": "dist/index.js",
    "noteshell-setup": "scripts/setup.mjs"
  },
```

3. Add `"test"` to `"scripts"`:

```json
    "test": "node --test test/device-auth.test.mjs",
```

- [ ] **Step 2: Update `setup.mjs` to use the shared config writer**

Replace the entire contents of `packages/mcp/scripts/setup.mjs` with:

```javascript
#!/usr/bin/env node

/**
 * Noteshell Setup — Legacy email/password login
 * Prefer: npx @noteshell/mcp login  (browser flow)
 *
 * Usage:
 *   noteshell-setup <email> <password>
 */

import { createClient } from '@supabase/supabase-js'
import {
  DEFAULT_SUPABASE_URL,
  DEFAULT_SUPABASE_ANON_KEY,
  writeNoteshellConfig,
} from './lib/noteshell-config.mjs'

const email = process.argv[2]
const password = process.argv[3]

if (!email || !password) {
  console.error('Usage: noteshell-setup <email> <password>')
  console.error('Tip: use "noteshell login" for browser-based login (works with all account types)')
  process.exit(1)
}

const supabase = createClient(DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_ANON_KEY)
const { data, error } = await supabase.auth.signInWithPassword({ email, password })

if (error) {
  console.error('Login failed:', error.message)
  process.exit(1)
}

const configPath = writeNoteshellConfig({
  supabaseUrl: DEFAULT_SUPABASE_URL,
  supabaseAnonKey: DEFAULT_SUPABASE_ANON_KEY,
  accessToken: data.session.access_token,
  refreshToken: data.session.refresh_token ?? undefined,
  expiresAt: new Date(data.session.expires_at * 1000).toISOString(),
  userId: data.user.id,
})

console.log(`✅ Config written to ${configPath}`)
console.log(`   User: ${data.user.email} (${data.user.id})`)
console.log(`   Token expires: ${new Date(data.session.expires_at * 1000).toISOString()}`)
```

- [ ] **Step 3: Update `src/config.ts` to add optional token refresh fields**

In `packages/mcp/src/config.ts`, update the `ConfigSchema`:

Find:

```typescript
const ConfigSchema = z.object({
  supabase_url: z.string().url(),
  supabase_anon_key: z.string().min(1),
  access_token: z.string().min(1).optional(),
  service_key: z.string().min(1).optional(),
  user_id: z.string().uuid().optional(),
}).refine(
```

Replace with:

```typescript
const ConfigSchema = z.object({
  supabase_url: z.string().url(),
  supabase_anon_key: z.string().min(1),
  access_token: z.string().min(1).optional(),
  refresh_token: z.string().min(1).optional(),
  expires_at: z.string().optional(),      // ISO string — when access_token expires
  service_key: z.string().min(1).optional(),
  user_id: z.string().uuid().optional(),
}).refine(
```

- [ ] **Step 4: Add token auto-refresh to `src/db/client.ts`**

In `packages/mcp/src/db/client.ts`, update `createDbClient` to auto-refresh an expired token:

Replace the existing `createDbClient` function with:

```typescript
/**
 * Create a Supabase client from config.
 * If access_token is expired and refresh_token is present, refreshes automatically
 * and rewrites ~/.noteshell.json with the new tokens.
 */
export async function createDbClient(config: NoteshellConfig): Promise<DbClient> {
  // Check if token is within 5 minutes of expiry and we have a refresh token
  if (config.access_token && config.refresh_token && config.expires_at) {
    const expiresAt = new Date(config.expires_at).getTime()
    const fiveMinutes = 5 * 60 * 1000
    if (Date.now() > expiresAt - fiveMinutes) {
      try {
        const tempClient = createClient(config.supabase_url, config.supabase_anon_key, {
          auth: { autoRefreshToken: false, persistSession: false },
        })
        const { data, error } = await tempClient.auth.setSession({
          access_token: config.access_token,
          refresh_token: config.refresh_token,
        })
        if (!error && data.session) {
          // Update config in memory
          config = {
            ...config,
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token ?? config.refresh_token,
            expires_at: new Date(data.session.expires_at! * 1000).toISOString(),
          }
          // Rewrite ~/.noteshell.json
          const { join } = await import('node:path')
          const { homedir } = await import('node:os')
          const { writeFileSync } = await import('node:fs')
          const configPath = join(homedir(), '.noteshell.json')
          writeFileSync(configPath, JSON.stringify(config, null, 2))
        }
      } catch {
        // Refresh failed — proceed with existing token (will fail at query time if truly expired)
      }
    }
  }

  const bearerToken = config.service_key ?? config.access_token!
  const userId = config.user_id ?? extractUserId(config.access_token!)

  const supabase = createClient(config.supabase_url, config.supabase_anon_key, {
    global: {
      headers: {
        Authorization: `Bearer ${bearerToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  return { supabase, userId }
}
```

Note: `createDbClient` is now `async`. There is one caller in `packages/mcp/src/index.ts`. Update it:

Find in `packages/mcp/src/index.ts`:

```typescript
const db = createDbClient(config)
```

Replace with:

```typescript
const db = await createDbClient(config)
```

Also ensure the surrounding function is `async` (it likely already is since it starts the MCP server).

- [ ] **Step 5: Run typecheck**

```bash
cd packages/mcp && pnpm typecheck
```

Expected: no errors.

- [ ] **Step 6: Run tests**

```bash
cd packages/mcp && node --test test/device-auth.test.mjs
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add packages/mcp/package.json packages/mcp/scripts/setup.mjs \
        packages/mcp/src/config.ts packages/mcp/src/db/client.ts \
        packages/mcp/src/index.ts
git commit -m "feat(mcp): v0.2.0 — device auth, token auto-refresh, unified CLI"
```

---

### Task 10: Build and Publish

- [ ] **Step 1: Build the package**

```bash
cd packages/mcp
pnpm build
```

Expected: `dist/` rebuilt, `dist/index.js` is executable.

- [ ] **Step 2: Verify the bin entries work**

```bash
node packages/mcp/scripts/noteshell.mjs --help
```

Expected: usage text showing `login`, `setup`, `mcp` commands.

- [ ] **Step 3: Run the full validation suite**

```bash
cd packages/mcp && node --test test/device-auth.test.mjs
pnpm typecheck
```

Expected: all pass.

- [ ] **Step 4: Publish to npm**

```bash
cd packages/mcp
npm publish --access public
```

Expected: `+ @noteshell/mcp@0.2.0`

- [ ] **Step 5: Verify the published package**

```bash
npx --yes @noteshell/mcp@0.2.0 --help
```

Expected: same usage text as Step 2.

- [ ] **Step 6: Final commit (version bump already committed in Task 9)**

If there are any remaining unstaged changes:

```bash
git add -p
git commit -m "chore(mcp): publish v0.2.0"
```

---

## End-to-End Test

After all tasks complete, run the full flow manually:

```bash
# In terminal 1: start dev servers
pnpm dev

# In terminal 2: test the login flow
node packages/mcp/scripts/noteshell.mjs login --api-url http://localhost:3001 --no-browser
# Expected output:
#   Open this URL to authenticate: http://localhost:5173/cli
#   Enter code: ABCD-1234
#   Waiting for approval...
```

Then open `http://localhost:5173/cli?code=ABCD-1234` in a browser, log in, click Authorize.

```
# Terminal 2 should print:
#   ✓ Logged in as your@email.com
#   Config written to ~/.noteshell.json
```

Verify `~/.noteshell.json` contains `access_token`, `refresh_token`, and `expires_at`.
