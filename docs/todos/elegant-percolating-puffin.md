# Deploy Noteshell to Vercel

## Context

The Noteshell app and its landing page need to be deployed to Vercel:
- **Landing page** (`NoteCase landing page` project) → `noteshell.io`
- **Inkdown app** → `app.noteshell.io` (demo gate auto-redirects to `/demo`)

The inkdown Vercel project already exists (`prj_rxuTPXuvLeH3pTznJztzycGITt1c`). The landing page needs a new Vercel project. Both need the Noteshell favicon.

## Deployment Plan

### Step 1: Copy Noteshell favicon to landing page

The landing page still uses `vite.svg`. Copy the Noteshell favicons over and update its `index.html`.

**Files to copy** (from `apps/web/public/` → `NoteCase landing page/public/`):
- `favicon.svg`
- `favicon.ico`
- `favicon-32x32.png`
- `apple-touch-icon.png`

**Modify** `NoteCase landing page/index.html`:
- Replace `<link rel="icon" type="image/svg+xml" href="/vite.svg" />` with the same favicon links used in inkdown's `index.html`
- Delete `NoteCase landing page/public/vite.svg`

### Step 2: Add vercel.json to landing page

The landing page uses `react-router-dom` (client-side routing), so it needs SPA rewrites:

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

Create at: `/Users/quangnguyen/CodingPRJ/NoteCase landing page/vercel.json`

### Step 3: Deploy landing page to Vercel

```bash
cd "/Users/quangnguyen/CodingPRJ/NoteCase landing page"
vercel --yes                    # Creates project, deploys preview
vercel --prod                   # Deploy to production
vercel domains add noteshell.io # Assign domain
```

### Step 4: Deploy inkdown app to Vercel

The inkdown project is already linked. The existing `vercel.json` config is correct:
- Build: `pnpm install && pnpm build`
- Output: `apps/web/dist`
- SPA rewrites configured

No `base` path changes needed — the app deploys at root of `app.noteshell.io`, and the built-in demo gate (`isProductionDemo` check in `main.ts`) automatically redirects visitors to `/demo` when `VITE_API_URL` is not set.

```bash
cd /Users/quangnguyen/CodingPRJ/inkdown
vercel --prod                        # Deploy to production
vercel domains add app.noteshell.io  # Assign subdomain
```

### Step 5: Configure DNS (if not already done)

The user said domains are already configured. If DNS records are needed:
- `noteshell.io` → CNAME to `cname.vercel-dns.com`
- `app.noteshell.io` → CNAME to `cname.vercel-dns.com`

## Key Files

| File | Role |
|------|------|
| `/Users/quangnguyen/CodingPRJ/inkdown/vercel.json` | Inkdown Vercel config (already correct) |
| `/Users/quangnguyen/CodingPRJ/inkdown/apps/web/src/main.ts` | Demo gate logic (lines 76-83) |
| `/Users/quangnguyen/CodingPRJ/NoteCase landing page/index.html` | Landing page HTML (needs favicon update) |
| `/Users/quangnguyen/CodingPRJ/NoteCase landing page/vite.config.ts` | Landing page Vite config (no changes needed) |

## Verification

1. After landing page deploy: visit `noteshell.io` — check page loads, favicon shows
2. After inkdown deploy: visit `app.noteshell.io` — should auto-redirect to `/demo` gate
3. Check favicons appear correctly in both Chrome and Safari on the production domains
4. Check PWA icons load (DevTools → Application → Manifest)
