# Fix: Friend Cannot Run Inkdown (friend-ready branch)

## Context

A friend cloned the `friend-ready` branch but cannot use the app. Symptoms:
- AI buttons don't generate anything
- Typing doesn't save, data lost on refresh
- Non-AI buttons also don't work
- Backend shows "No AI providers configured" and "Supabase: Not configured" despite claiming API keys were entered

---

## Root Cause Analysis

### Root Cause #1 (CRITICAL): `.env` files in wrong location

**The problem:** The app needs TWO separate `.env` files:
- `apps/api/.env` — read by dotenv (CWD = `apps/api/` when Turbo runs it)
- `apps/web/.env` — read by Vite (project root = `apps/web/`)

But the README says "Copy `.env.example` to `.env`" without specifying WHERE. The friend almost certainly created a single root `.env` which **neither app reads**.

**Evidence:** Screenshot shows `"No AI providers configured"` and `"Supabase: Not configured"` despite friend saying they entered keys.

**Files:**
- `apps/api/src/config.ts:4` — `loadEnv()` (dotenv) reads from CWD = `apps/api/`
- `apps/web/src/services/supabase.ts:3-4` — `import.meta.env.VITE_*` reads from `apps/web/.env`
- `apps/web/src/main.ts:77` — `import.meta.env.VITE_API_URL` checked for demo mode

### Root Cause #2 (CRITICAL): Demo mode trap — explains "data lost on refresh"

Without `apps/web/.env`, `VITE_API_URL` is undefined. This triggers:

```typescript
// main.ts:77
const isProductionDemo = !import.meta.env.VITE_API_URL || import.meta.env.VITE_API_URL === ''
```

→ `true` → all routes redirect to `/demo` gate → after entering password, `isDemoMode()` returns `true`.

Then **every store** skips its real logic:
```typescript
// editor.ts:272 — saveDocument is a NO-OP
async saveDocument() {
  if (isDemoMode()) return  // Nothing saves!
}
// editor.ts:145 — createDocument is a NO-OP
async createDocument() {
  if (isDemoMode()) return null
}
```

This is exactly why "typing doesn't save, refresh loses everything" and "buttons don't work."

### Root Cause #3: Variable name mismatch in root `.env.example`

The root `.env.example` has wrong/missing variable names vs what `config.ts` reads:

| Root `.env.example`         | What API `config.ts` reads | Match? |
|-----------------------------|---------------------------|--------|
| *(missing entirely!)*       | `SUPABASE_URL`            | NO     |
| `SUPABASE_SERVICE_ROLE_KEY` | `SUPABASE_SERVICE_KEY`    | NO     |
| *(missing entirely!)*       | `GOOGLE_AI_API_KEY`       | NO     |
| *(missing entirely!)*       | `VITE_API_URL`            | NO — the critical demo-mode variable! |

Even if the friend copied values from root `.env.example` to the correct locations, they'd be using wrong variable names.

### Root Cause #4: No `apps/web/.env.example` exists

There's `apps/api/.env.example` (correct names) but NO `apps/web/.env.example`. The friend has zero guidance on what the web app needs.

### Root Cause #5: Node.js version too old

Friend has `20.13.1`, Vite 7.3.1 requires `20.19+`. Screenshot shows the warning. May cause subtle runtime issues.

---

## Fix Plan

### Step 1: Create `apps/web/.env.example`

**File:** `apps/web/.env.example` (NEW)

```env
# =============================================================================
# Inkdown Web App - Environment Variables
# =============================================================================
# Copy this file to .env and fill in your values:
#   cp apps/web/.env.example apps/web/.env

# AI Backend API (REQUIRED — without this, app enters demo-only mode)
VITE_API_URL=http://localhost:3001

# Supabase (Optional — skip for local-only mode)
# Get from: Supabase Dashboard > Settings > API
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=

# Provider Selection: 'supabase' or 'local'
# Use 'local' if you don't have Supabase credentials
VITE_PROVIDER=local

# Feature Flags
VITE_ENABLE_AI=true

# Demo mode password (optional)
# VITE_DEMO_PASSWORD=noteshell2026
```

### Step 2: Fix root `.env.example`

**File:** `.env.example` (root — EDIT)

Fix mismatched variable names and add the critical missing ones. Add a clear header explaining that this is a **reference** and actual `.env` files go in `apps/api/` and `apps/web/`.

Key changes:
- Add `SUPABASE_URL` (API needs this, currently missing)
- Rename `SUPABASE_SERVICE_ROLE_KEY` → `SUPABASE_SERVICE_KEY` (match config.ts)
- Add `GOOGLE_AI_API_KEY` (currently missing)
- Add `VITE_API_URL=http://localhost:3001` (the critical demo-mode variable)
- Add clear comments about which vars go where

### Step 3: Update README with clear setup instructions

**File:** `README.md` (EDIT)

Replace the vague "Copy `.env.example` to `.env`" with explicit steps:

```markdown
## Setup

1. **Node.js 20.19+** required (check with `node -v`)
2. Install dependencies: `pnpm install`
3. Create environment files:
   ```bash
   # API server config (AI keys go here)
   cp apps/api/.env.example apps/api/.env

   # Web app config
   cp apps/web/.env.example apps/web/.env
   ```
4. Edit `apps/api/.env`:
   - Add at least one AI API key (OPENAI_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_AI_API_KEY)
   - Add Supabase credentials (or leave empty for limited mode)
5. Edit `apps/web/.env`:
   - `VITE_API_URL` should already be `http://localhost:3001` (don't change)
   - Set `VITE_PROVIDER=local` if you don't have Supabase
6. Start: `pnpm dev`
```

### Step 4 (Optional): Add env validation on startup

Create `scripts/check-env.js` that warns if `.env` files are missing:

```javascript
// Check apps/api/.env exists
// Check apps/web/.env exists
// Check VITE_API_URL is set (prevents demo mode trap)
// Print helpful error messages
```

Add to root `package.json`: `"predev": "node scripts/check-env.js"`

---

## Files to Modify

| File | Action | Purpose |
|------|--------|---------|
| `apps/web/.env.example` | CREATE | Template for web app env vars (most critical fix) |
| `.env.example` (root) | EDIT | Fix variable names, add missing vars, add location clarity |
| `README.md` | EDIT | Clear two-file setup instructions |
| `scripts/check-env.js` | CREATE (optional) | Startup validation warns about missing .env files |
| `package.json` (root) | EDIT (optional) | Add `predev` check script |

---

## Immediate Fix for Your Friend (No Code Changes)

Tell your friend to do this right now on the `friend-ready` branch:

1. **Upgrade Node.js** to 20.19+ (`nvm install 20` or download from nodejs.org)
2. **Create `apps/web/.env`** with this content:
   ```env
   VITE_API_URL=http://localhost:3001
   VITE_PROVIDER=local
   VITE_ENABLE_AI=true
   ```
3. **Create `apps/api/.env`** by copying `apps/api/.env.example`:
   ```bash
   cp apps/api/.env.example apps/api/.env
   ```
   Then edit `apps/api/.env` and fill in real API keys (at minimum `OPENAI_API_KEY`)
4. **Restart**: `pnpm dev`

The **single most critical** line is `VITE_API_URL=http://localhost:3001` in `apps/web/.env`. Without it, the entire app is stuck in demo mode where nothing saves and all buttons are disabled.

---

## Verification

After implementing fixes on the `friend-ready` branch:
1. Fresh clone into new directory
2. `pnpm install`
3. Follow updated README setup steps
4. `pnpm dev` → API should show configured providers (not "No AI providers configured")
5. Web app should NOT redirect to `/demo` gate
6. Create a note, type text, refresh → content should persist
7. AI generate button should work with configured API keys
