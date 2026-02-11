# NoteShell

A modern, AI-enhanced markdown editor with real-time collaboration features.

## Getting Started

### Prerequisites

- **Node.js** ≥ 20 ([download](https://nodejs.org/))
- **pnpm** 9.x (`npm install -g pnpm@9` — other package managers will not work)
- **Supabase** project ([free tier](https://supabase.com/dashboard)) — for persistent storage
- At least one **AI provider key**: [OpenAI](https://platform.openai.com/api-keys), [Anthropic](https://console.anthropic.com/), or [Google AI](https://aistudio.google.com/app/apikey)

### Setup (5 steps)

**1. Install dependencies**

```bash
pnpm install
```

> Using `npm install` or `yarn install` will fail — the repo requires pnpm workspaces.

**2. Create environment files**

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

> Do **not** copy the root `.env.example` — it is an informational file only. Each app has its own `.env`.

**3. Configure `apps/api/.env`**

Open `apps/api/.env` and fill in your values:

| Variable | Required | Where to get it |
|----------|----------|-----------------|
| `SUPABASE_URL` | Yes | Supabase Dashboard → Settings → API → Project URL |
| `SUPABASE_SERVICE_KEY` | Yes | Supabase Dashboard → Settings → API → `service_role` key |
| `SUPABASE_ANON_KEY` | Yes | Supabase Dashboard → Settings → API → `anon` key |
| `OPENAI_API_KEY` | Recommended | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| `ANTHROPIC_API_KEY` | Optional | [console.anthropic.com](https://console.anthropic.com/) |
| `GOOGLE_AI_API_KEY` | Optional | [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) |

**4. Configure `apps/web/.env`**

Open `apps/web/.env` and fill in:

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `VITE_API_URL` | **Yes** | `http://localhost:3001` | Must point to the API server. Without this, the app enters demo mode. |
| `VITE_SUPABASE_URL` | For Supabase | — | Same URL as in the API config |
| `VITE_SUPABASE_ANON_KEY` | For Supabase | — | Same anon key as in the API config |
| `VITE_PROVIDER` | No | `local` | `supabase` for persistent cloud storage, `local` for IndexedDB |

**5. Start development**

```bash
pnpm dev
```

This runs an environment check, then starts:
- **Web app** at [http://localhost:5173](http://localhost:5173)
- **API server** at [http://localhost:3001](http://localhost:3001)

## Demo Mode

If `VITE_API_URL` is not set (or empty) in `apps/web/.env`, the app automatically enters **demo mode**:

- You'll see a password gate — the password is `noteshell2026`
- All data is stored in-memory and **lost on page refresh**
- AI features do not work

This is intentional for the hosted demo at [noteshell.app](https://noteshell.app). For local development, make sure `VITE_API_URL=http://localhost:3001` is set in `apps/web/.env`.

## Project Structure

```
noteshell/
├── apps/
│   ├── api/            # Hono API server (port 3001)
│   └── web/            # Vue 3 SPA (Vite, port 5173)
├── packages/
│   ├── shared/         # Types, errors, utilities (foundation)
│   ├── ai/             # AI provider abstraction + agents
│   ├── editor/         # Shared editor types
│   └── muya/           # Markdown editor engine (Muya fork)
└── supabase/           # Migrations and config
```

## Common Commands

```bash
pnpm dev              # Start all dev servers
pnpm build            # Build all packages
pnpm typecheck        # TypeScript validation
pnpm lint             # ESLint check
pnpm lint:fix         # Auto-fix lint issues
pnpm test             # Run tests (watch mode)
pnpm test:run         # Run tests (single run)
```

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| Stuck on demo password screen | `VITE_API_URL` not set in `apps/web/.env` | Add `VITE_API_URL=http://localhost:3001` |
| `npm install` fails with workspace errors | Wrong package manager | Use `pnpm install` instead |
| AI features don't work | No AI API keys configured | Add at least one key to `apps/api/.env` |
| Data lost on page refresh | Running in demo mode or `VITE_PROVIDER=local` | Set up Supabase and use `VITE_PROVIDER=supabase` |
| API server crashes on start | Missing Supabase credentials in `apps/api/.env` | Fill in `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` |
| `pnpm dev` exits immediately | Missing `.env` files | Run the `cp` commands from step 2 |
| Port 3001 already in use | Another process on that port | Change `PORT` in `apps/api/.env` or kill the other process |

## License

MIT
