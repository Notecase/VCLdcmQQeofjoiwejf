# Make Codebase Runnable by Others After Cloning

**Date:** 2026-02-11
**Branch:** `nearly-full`
**Goal:** Your friend clones the repo, follows the README, and has the app running in under 5 minutes.

## Context

When your friend clones `main` or `friend-ready` and runs `pnpm dev`, the app is broken because:

1. **Demo mode trap** — `apps/web/src/main.ts:77` checks `VITE_API_URL`. Missing = all routes redirect to `/demo`. This variable is undocumented on `main`.
2. **Misleading root `.env.example`** — README says "copy to `.env`" but root `.env` is NOT read by either app. Each app needs its own `.env`.
3. **Env var name mismatch** — Root `.env.example` uses `SUPABASE_SERVICE_ROLE_KEY`, but `apps/api/src/config.ts:19` reads `SUPABASE_SERVICE_KEY`.
4. **No pnpm enforcement** — `npm install` silently breaks the workspace.
5. **`friend-ready` branch** — Committed 77K+ lines of `dist/` files. Wrong approach.
6. **`check-env.js` exists but never runs** — On `nearly-full` but not wired into any npm script.

## Plan (5 steps + 1 cleanup)

### Step 1: Wire check-env into `pnpm dev` + add pnpm enforcement

**File:** `package.json` (root)

```diff
 "scripts": {
+  "preinstall": "npx -y only-allow pnpm",
-  "dev": "turbo dev",
+  "dev": "node scripts/check-env.js && turbo dev",
   "build": "turbo build",
```

- `preinstall`: blocks `npm install` / `yarn install` with a clear "use pnpm" message
- `dev`: runs env check BEFORE Turbo. If check-env exits non-zero, Turbo never starts.

### Step 2: Upgrade `scripts/check-env.js` — exit codes + value validation

**File:** `scripts/check-env.js`

Changes:
1. **Add `process.exit(1)`** at the end when `errors.length > 0` — currently the script prints errors but always exits 0
2. **Add a `getEnvValue()` helper** to extract non-commented values from env files
3. **Add placeholder detection** for `apps/api/.env` — warn if `SUPABASE_URL` contains `your-`, `eyJ...`, etc.
4. **Add Supabase credential check** for `apps/web/.env` — if `VITE_PROVIDER=supabase`, check that URL and key are filled

Logic:
- **Errors** (missing `.env` files) → block startup with exit 1
- **Warnings** (placeholder values, missing AI keys) → print but allow startup

### Step 3: Replace root `.env.example` with pointer file

**File:** `.env.example` (root)

Replace the misleading 31-line config with a ~12-line informational file:

```env
# ===========================================================================
# DO NOT copy this file to .env — the root .env is not read by either app.
#
# Environment files go in each app directory:
#
#   apps/api/.env   — AI keys, Supabase service key, server config
#   apps/web/.env   — API URL, Supabase client credentials, provider selection
#
# Quick setup:
#   cp apps/api/.env.example apps/api/.env
#   cp apps/web/.env.example apps/web/.env
#
# Then edit each file with your actual values.
# See README.md for full setup instructions.
# ===========================================================================
```

### Step 4: Rewrite README.md

**File:** `README.md`

Key changes from current README:
- **Brand:** NoteShell (not Inkdown)
- **Numbered Getting Started** with explicit steps: install deps → create env files → configure keys → start dev → verify
- **Table of required env vars** with "where to get it" links for each
- **Demo mode documentation** — what it is, the password (`noteshell2026`), how to exit it
- **Troubleshooting table** covering every known failure mode:
  - Stuck on demo password → `VITE_API_URL` not set
  - No AI providers → missing API keys
  - Data lost on refresh → demo mode or no Supabase
  - `npm install` fails → use pnpm

### Step 5: Delete `friend-ready` branch (after verification)

```bash
git branch -D friend-ready
git push notecase --delete friend-ready
```

Only after all other steps are verified working.

## Files Changed

| File | Action | Why |
|------|--------|-----|
| `package.json` | EDIT 2 lines | Add preinstall, modify dev script |
| `scripts/check-env.js` | EDIT ~50 lines | Add exit code, placeholder detection, helper |
| `.env.example` | REPLACE | Misleading config → informational pointer |
| `README.md` | REPLACE | Full rewrite with setup guide + troubleshooting |
| `friend-ready` branch | DELETE | Remove incorrect dist/ commit approach |

**Files NOT changed (already correct on `nearly-full`):**
- `apps/web/.env.example` — has `VITE_API_URL=http://localhost:3001`
- `apps/api/.env.example` — uses correct `SUPABASE_SERVICE_KEY`
- `apps/api/src/config.ts` — startup validation is fine
- `apps/web/src/main.ts` — demo mode logic is correct, just needed documentation

## Verification

After implementation, test these scenarios:

1. **Fresh clone (no .env files):** `pnpm dev` → prints errors about missing env files → exits 1 → does NOT start Turbo
2. **`npm install`:** → fails with "use pnpm" message
3. **Env files with placeholders:** `cp *.env.example *.env` → `pnpm dev` → prints warnings about placeholder values but starts
4. **Missing VITE_API_URL:** web `.env` exists but `VITE_API_URL=` empty → warning about demo mode
5. **Root .env exists:** → warning that root .env is not read
6. **Fully configured:** both `.env` files filled → green checkmark → Turbo starts → web on :5173, API on :3001
7. **Your friend's test:** friend clones `nearly-full`, follows README steps 1-5, app works
