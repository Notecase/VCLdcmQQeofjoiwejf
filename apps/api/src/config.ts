import { config as loadEnv } from 'dotenv'

// Load .env file
loadEnv()

/**
 * Application configuration
 * All environment variables are validated and typed here
 */
export const config = {
  // Server
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: process.env.NODE_ENV !== 'production',

  // Supabase
  supabase: {
    url: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
    serviceKey: process.env.SUPABASE_SERVICE_KEY || '',
    anonKey: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '',
  },

  // AI Providers
  ai: {
    openai: {
      apiKey: process.env.OPENAI_API_KEY || '',
    },
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY || '',
    },
    google: {
      apiKey: process.env.GOOGLE_AI_API_KEY || '',
    },
  },

  // Model Defaults
  models: {
    defaultChat: process.env.DEFAULT_CHAT_MODEL || 'claude-sonnet-4-20250514',
    defaultEmbedding: process.env.DEFAULT_EMBEDDING_MODEL || 'text-embedding-3-large',
    embeddingDimensions: parseInt(process.env.EMBEDDING_DIMENSIONS || '1536', 10),
  },

  // Rate Limiting
  rateLimit: {
    requestsPerMinute: parseInt(process.env.RATE_LIMIT_REQUESTS_PER_MINUTE || '60', 10),
    tokensPerDay: parseInt(process.env.RATE_LIMIT_TOKENS_PER_DAY || '100000', 10),
  },

  // CORS
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
  },

  // Base URL for building verification URIs in CLI auth flow
  baseUrl: process.env.BASE_URL || 'https://app.noteshell.io',

  // Feature flags
  flags: {
    missionHubV1: !['0', 'false', 'off', 'no'].includes(
      String(process.env.MISSION_HUB_V1 ?? (process.env.NODE_ENV === 'production' ? 'false' : 'true'))
        .trim()
        .toLowerCase()
    ),
  },
} as const

/**
 * Validate required configuration
 * Call this at startup to ensure all required env vars are set
 */
export function validateConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  // Required for basic operation
  if (!config.supabase.url) {
    errors.push('SUPABASE_URL is required')
  }

  // Service key is needed for backend operations
  if (!config.supabase.serviceKey && !config.isDev) {
    errors.push('SUPABASE_SERVICE_KEY is required in production')
  }

  // AI providers - at least one should be configured
  const hasAnyAiProvider =
    config.ai.openai.apiKey || config.ai.anthropic.apiKey || config.ai.google.apiKey

  if (!hasAnyAiProvider) {
    errors.push(
      'At least one AI provider API key is required (OPENAI_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_AI_API_KEY)'
    )
  }

  // OpenAI is required for embeddings
  if (!config.ai.openai.apiKey) {
    errors.push('OPENAI_API_KEY is required for embedding generation')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Get available AI providers based on configured API keys
 */
export function getAvailableProviders(): string[] {
  const providers: string[] = []

  if (config.ai.openai.apiKey) providers.push('openai')
  if (config.ai.anthropic.apiKey) providers.push('anthropic')
  if (config.ai.google.apiKey) providers.push('google')

  return providers
}

export type Config = typeof config
