# CLI Device Auth — Design Spec

**Date:** 2026-03-14
**Status:** Approved (v2 — post review fixes)
**Problem:** `@noteshell/mcp` v0.1.0 uses email+password auth (`noteshell-setup`). Users with OAuth/magic-link accounts get `Invalid login credentials`. Need a browser-based device flow (RFC 8628) so any Noteshell user can authenticate the CLI regardless of how they signed up.

---

## Background

The local patch at `/tmp/noteshell-mcp` already implements the CLI side of the device flow:

- `scripts/noteshell.mjs` — unified CLI entrypoint with `login`, `setup`, `mcp` commands
- `scripts/lib/device-auth.mjs` — normalizes start/poll API responses
- `scripts/lib/noteshell-config.mjs` — writes `~/.noteshell.json`
- `scripts/lib/open-browser.mjs` — cross-platform browser opener
- `test/device-auth.test.mjs` — unit tests for response parsers

What's missing: the backend endpoints, the database table, and the frontend approval page.

---

## Auth Flow (OAuth 2.0 Device Authorization Grant, RFC 8628)

```
CLI                         API                          Web (user)
 |                           |                               |
 |-- POST /api/cli/auth/start -->|                           |
 |<-- {device_code, user_code, verification_uri} ------------|
 |                           |                               |
 | opens browser → app.noteshell.io/cli?code=ABCD-1234      |
 |                           |                 user logs in, sees approval page
 |                           |                 POST /api/cli/auth/approve
 |                           |                   body: {user_code, access_token, refresh_token, token_expires_at}
 |                           |<-- stores tokens in session row --|
 |                           |                               |
 | polls POST /api/cli/auth/poll {device_code} every 5s     |
 |<-- {access_token, refresh_token, token_expires_at, user} -|
 |                           |
 | writes ~/.noteshell.json  |
 | ✓ Logged in as user@example.com
```

---

## Section 1: Database

**Migration:** `supabase/migrations/022_cli_auth.sql`

```sql
CREATE TABLE cli_auth_sessions (
  device_code       TEXT PRIMARY KEY,
  user_code         TEXT NOT NULL UNIQUE,
  status            TEXT NOT NULL DEFAULT 'pending',
  -- status values: pending | approved | consumed | denied | expired
  client_name       TEXT,
  scopes            TEXT[],
  user_id           UUID REFERENCES auth.users,
  access_token      TEXT,
  refresh_token     TEXT,
  token_expires_at  TIMESTAMPTZ,       -- when the Supabase access_token expires
  expires_at        TIMESTAMPTZ NOT NULL,  -- device code TTL (~10 min)
  last_polled_at    TIMESTAMPTZ,
  poll_count        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- Index for TTL-based cleanup and poll lookups
CREATE INDEX idx_cli_auth_sessions_expires ON cli_auth_sessions(expires_at);

-- Only service role can read/write (no public access)
ALTER TABLE cli_auth_sessions ENABLE ROW LEVEL SECURITY;
-- No RLS policies = service key only
```

**Columns:**

- `device_code`: 32-char random hex string, opaque, only known to the CLI
- `user_code`: format `XXXX-XXXX` using uppercase letters A-Z and digits 2-9 (RFC 8628 recommended set, avoids 0/O/1/I confusion). 8 characters from a 32-char alphabet = ~1 trillion combinations.
- `expires_at`: device code TTL, set to `now() + 10 minutes`
- `token_expires_at`: when the stored Supabase `access_token` expires (passed in by the frontend on approve)
- `last_polled_at` + `poll_count`: used to detect fast polling and enforce attempt limits
- `access_token` / `refresh_token`: cleared (set to NULL) after first successful poll (`status` set to `consumed`) to prevent replay

**Cleanup:** The `/start` endpoint runs a DELETE of expired rows on each call:

```sql
DELETE FROM cli_auth_sessions WHERE expires_at < now() - interval '1 hour';
```

This keeps the table small with no extra infrastructure.

---

## Section 2: Backend

**New file:** `apps/api/src/routes/cli-auth.ts`
**Mounted at:** `/api/cli` in `apps/api/src/routes/index.ts`
**Auth:** `start` and `poll` are public (no `authMiddleware`); `approve` and `deny` require auth.
**Rate limiting:** All four endpoints are covered by the existing rate-limit middleware. Public endpoints additionally enforce per-IP limits at the reverse proxy level (Supabase edge / Cloudflare).
**`BASE_URL`:** Added to `apps/api/src/config.ts` as `process.env.BASE_URL || 'https://app.noteshell.io'`. Used to build `verification_uri`.

### `POST /api/cli/auth/start` — Public

Creates a new device session.

Request:

```json
{ "client_name": "@noteshell/mcp", "scopes": [] }
```

Response `200`:

```json
{
  "device_code": "<32-char-hex>",
  "user_code": "ABCD-1234",
  "verification_uri": "https://app.noteshell.io/cli",
  "verification_uri_complete": "https://app.noteshell.io/cli?code=ABCD-1234",
  "interval": 5,
  "expires_in": 600
}
```

Side effect: deletes expired rows (`expires_at < now() - 1 hour`) before inserting.

---

### `POST /api/cli/auth/poll` — Public

Polls for approval. All error responses return **HTTP 400**. Success returns **HTTP 200**.

Request:

```json
{ "device_code": "<device_code>" }
```

Responses:

| Condition                                                | HTTP | Body                                                     |
| -------------------------------------------------------- | ---- | -------------------------------------------------------- |
| Row not found                                            | 400  | `{ "error": "expired_token" }`                           |
| `status = pending`, polled too fast (< interval seconds) | 400  | `{ "error": "slow_down" }`                               |
| `status = pending`, normal                               | 400  | `{ "error": "authorization_pending" }`                   |
| `status = expired` or `expires_at < now()`               | 400  | `{ "error": "expired_token" }`                           |
| `status = denied`                                        | 400  | `{ "error": "access_denied" }`                           |
| `status = consumed`                                      | 400  | `{ "error": "expired_token" }` (token already retrieved) |
| `status = approved`                                      | 200  | see below                                                |

On approval, return tokens and clear them from the row:

```json
{
  "access_token": "...",
  "refresh_token": "...",
  "token_expires_at": "2026-03-14T10:00:00.000Z",
  "supabase_url": "https://lxjxoxwaesqxpgfdwkir.supabase.co",
  "supabase_anon_key": "...",
  "user": { "id": "...", "email": "user@example.com" }
}
```

After returning: UPDATE row SET `status = 'consumed'`, `access_token = NULL`, `refresh_token = NULL`.

`slow_down` enforcement: if `last_polled_at > now() - interval '5 seconds'`, return `slow_down` and update `last_polled_at`. Also increment `poll_count`; if `poll_count > 100`, treat as expired.

---

### `POST /api/cli/auth/approve` — Auth required

Called by the web frontend after the user clicks Authorize. The frontend calls `supabase.auth.getSession()` to obtain the tokens and passes them all in the body.

Request:

```json
{
  "user_code": "ABCD-1234",
  "access_token": "<supabase-access-token>",
  "refresh_token": "<supabase-refresh-token>",
  "token_expires_at": "2026-03-14T10:00:00.000Z"
}
```

Validation:

- `user_code` must match a `pending` row that hasn't expired
- `access_token` in the request body must match the `access_token` in the Bearer header (same user, prevents one user approving on behalf of another)
- Max 5 failed lookups per `user_code` (enforced via `poll_count` or a separate column — use `poll_count` on the approve side too)

Response `200`: `{ "success": true }`
Response `404`: `{ "error": "Code not found or expired" }`

Side effect: UPDATE row SET `status = 'approved'`, `user_id`, `access_token`, `refresh_token`, `token_expires_at`.

---

### `POST /api/cli/auth/deny` — Auth required

Request: `{ "user_code": "ABCD-1234" }`
Response `200`: `{ "success": true }`

Side effect: UPDATE row SET `status = 'denied'`.

UX on CLI side: the next poll returns `access_denied`, the CLI prints "Login request was denied." and exits with code 1.

---

## Section 3: Frontend

**New file:** `apps/web/src/views/CliAuthView.vue`
**Route:** `/cli` added to `main.ts`

### Router guard changes (main.ts)

The existing production demo guard must exempt `/cli`:

```ts
if (isProductionDemo && !inDemoMode && to.name !== 'demo' && to.name !== 'cli-auth') {
  return { name: 'demo' }
}
```

### Auth redirect (AuthView.vue change)

`AuthView.vue` currently hardcodes `router.push('/')` after login. Update it to consume a `?redirect=` query param:

```ts
const redirectTo = (route.query.redirect as string) || '/'
router.push(redirectTo)
```

This is a small 2-line change to `AuthView.vue`.

### Page states

1. **Unauthenticated** — store the `?code=` value in `sessionStorage`, redirect to `/auth?redirect=/cli?code=XXXX`. `AuthView` will return to `/cli?code=XXXX` after login.

2. **Code entry** — if no `?code=` query param (user navigated manually), show a text input: "Enter the code displayed in your terminal" with a Continue button.

3. **Approval** — call `GET /api/cli/auth/start` is not needed; the frontend just shows the `user_code` from query params and the `client_name` ("Noteshell MCP"). Two buttons: **Authorize** (primary) / **Deny** (text).

4. **Loading** — spinner while the approve/deny API call is in flight.

5. **Success** — "✓ Authorized — you can close this tab."

6. **Denied** — "Request declined. You can close this tab."

7. **Expired/Error** — "This code has expired or is invalid. Run `noteshell login` again."

### Visual design

Inherits the existing auth card design from `AuthView.vue`:

- Same `.auth-view` outer wrapper (centered, full-height)
- Same `.auth-card` (max-width 400px, border-radius 12px, `--editor-bg` background)
- Terminal/CLI icon (e.g. `>_`) at top instead of the NoteShell wordmark, or show the Noteshell logo
- User code in large monospace: `font-family: 'JetBrains Mono', monospace; font-size: 28px; letter-spacing: 4px`
- All CSS variables (`--primary-color`, `--text-color`, `--border-color`, etc.) — automatically dark/light compatible

---

## Section 4: MCP Package Changes

Merge `/tmp/noteshell-mcp` patch into `packages/mcp`:

| File                               | Action | Notes                                                                                                                                                                                                                    |
| ---------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `scripts/noteshell.mjs`            | Add    | Unified CLI entrypoint. Fix default `apiUrl`: `noteshell.app` → `app.noteshell.io`                                                                                                                                       |
| `scripts/lib/device-auth.mjs`      | Add    | Response parsers, no changes needed                                                                                                                                                                                      |
| `scripts/lib/noteshell-config.mjs` | Add    | Writes `~/.noteshell.json` with refresh_token + expires_at                                                                                                                                                               |
| `scripts/lib/open-browser.mjs`     | Add    | Cross-platform browser opener                                                                                                                                                                                            |
| `test/device-auth.test.mjs`        | Add    | Uses `node:test` (built-in, no extra dep needed)                                                                                                                                                                         |
| `scripts/setup.mjs`                | Update | Replace inline config-write with `writeNoteshellConfig` from lib. Backward-compatible: same output file, same fields.                                                                                                    |
| `package.json`                     | Update | Add `"noteshell": "scripts/noteshell.mjs"` and `"mcp": "scripts/noteshell.mjs"` to `bin`. Add `"test": "node --test test/**/*.test.mjs"` script. Bump version `0.1.0` → `0.2.0`.                                         |
| `src/config.ts`                    | Update | Add `refresh_token: z.string().optional()` and `expires_at: z.string().optional()` to `ConfigSchema`. These are persisted in `~/.noteshell.json` and used by the MCP server to auto-refresh the token before it expires. |

**Token auto-refresh in MCP server:** `src/db/client.ts` should check `expires_at` on startup; if the token is within 5 minutes of expiry, call `supabase.auth.setSession({ access_token, refresh_token })` to get a fresh token and rewrite `~/.noteshell.json`. This is a small addition to the existing `createClient` setup.

---

## Section 5: Publish

```bash
cd packages/mcp
pnpm build          # tsc + chmod +x dist/index.js
node --test test/**/*.test.mjs   # verify tests pass
npm publish --access public
```

Version: `0.1.0` → `0.2.0`

Users upgrade and re-auth:

```bash
npx -y @noteshell/mcp@latest login
```

`noteshell-setup` (email+password) remains as a fallback. No breaking changes.

---

## Implementation Order

1. `supabase/migrations/022_cli_auth.sql` — database first
2. `apps/api/src/config.ts` — add `BASE_URL`
3. `apps/api/src/routes/cli-auth.ts` — all 4 endpoints
4. Register `/api/cli` in `apps/api/src/routes/index.ts`
5. Update `apps/web/src/views/AuthView.vue` — honor `?redirect=` param
6. Add `apps/web/src/views/CliAuthView.vue`
7. Add `/cli` route in `apps/web/src/main.ts` + fix demo guard
8. Merge patch files into `packages/mcp`
9. Update `packages/mcp/src/config.ts` and `src/db/client.ts`
10. Bump version, build, publish

---

## What is NOT changing

- `noteshell-setup` (email+password) remains available as a fallback
- Existing `~/.noteshell.json` files continue to work unchanged
- No changes to MCP tool definitions in `src/tools/`
