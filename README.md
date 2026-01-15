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

- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anon key
- `ANTHROPIC_API_KEY` - Claude API key (for AI features)

## License

MIT
