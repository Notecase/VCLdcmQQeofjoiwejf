# Inkdown

A modern, AI-enhanced markdown editor built for scale.

## Getting Started

```bash
# Install dependencies
pnpm install

# Start development
pnpm dev

# Build for production
pnpm build
```

## Project Structure

```
inkdown/
├── apps/
│   └── web/              # Main web application
├── packages/
│   ├── editor/           # Muya editor package
│   ├── ai/               # AI provider abstraction
│   └── shared/           # Shared types and utilities
└── supabase/             # Supabase backend
```

## Environment Variables

Copy `.env.example` to `.env` and fill in your values:

### Web App (apps/web)
- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anon key
- `VITE_PROVIDER` - Provider selection (`supabase` or `local`)
- `VITE_API_BASE` - API base URL (defaults to `/api/agent`)

### API Server (apps/api)
- `ANTHROPIC_API_KEY` - Claude API key (for AI features)
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
- `API_PORT` - API server port (defaults to 3001)

## License

MIT
