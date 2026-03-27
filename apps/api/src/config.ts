import { config as loadEnv } from 'dotenv'

// Load .env file
loadEnv()

/**
 * Application configuration
 *
 * Uses getters so process.env is read at access time, not module load time.
 */
export const config = {
  // Server
  get port() {
    return parseInt(process.env.PORT || '3001', 10)
  },
  get nodeEnv() {
    return process.env.NODE_ENV || 'development'
  },
  get isDev() {
    return process.env.NODE_ENV !== 'production'
  },

  // Supabase
  supabase: {
    get url() {
      return process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
    },
    get serviceKey() {
      return process.env.SUPABASE_SERVICE_KEY || ''
    },
    get anonKey() {
      return process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
    },
  },

  // AI Providers
  ai: {
    openai: {
      get apiKey() {
        return process.env.OPENAI_API_KEY || ''
      },
    },
    anthropic: {
      get apiKey() {
        return process.env.ANTHROPIC_API_KEY || ''
      },
    },
    google: {
      get apiKey() {
        return process.env.GOOGLE_AI_API_KEY || ''
      },
    },
    ollama: {
      get cloudUrl() {
        return process.env.OLLAMA_CLOUD_URL || 'https://ollama.com'
      },
      get apiKey() {
        return process.env.OLLAMA_API_KEY || ''
      },
      get localUrl() {
        return process.env.OLLAMA_LOCAL_URL || 'http://localhost:11434'
      },
    },
  },

  // Model Defaults
  models: {
    get defaultChat() {
      return process.env.DEFAULT_CHAT_MODEL || 'gemini-2.5-pro'
    },
    get defaultEmbedding() {
      return process.env.DEFAULT_EMBEDDING_MODEL || 'text-embedding-3-large'
    },
    get embeddingDimensions() {
      return parseInt(process.env.EMBEDDING_DIMENSIONS || '1536', 10)
    },
  },

  // Rate Limiting
  rateLimit: {
    get requestsPerMinute() {
      return parseInt(process.env.RATE_LIMIT_REQUESTS_PER_MINUTE || '150', 10)
    },
    get tokensPerDay() {
      return parseInt(process.env.RATE_LIMIT_TOKENS_PER_DAY || '100000', 10)
    },
  },

  // CORS
  cors: {
    get origin() {
      return process.env.CORS_ORIGIN || 'http://localhost:5173'
    },
    credentials: true,
  },

  // Base URL for building verification URIs in CLI auth flow
  get baseUrl() {
    return process.env.BASE_URL || 'https://app.noteshell.io'
  },

  // Telegram
  telegram: {
    get botToken() {
      return process.env.TELEGRAM_BOT_TOKEN || ''
    },
    get webhookSecret() {
      return process.env.TELEGRAM_WEBHOOK_SECRET || ''
    },
    get botUsername() {
      return process.env.TELEGRAM_BOT_USERNAME || ''
    },
  },

  // Feature flags
  flags: {
    get missionHubV1() {
      return !['0', 'false', 'off', 'no'].includes(
        String(
          process.env.MISSION_HUB_V1 ?? (process.env.NODE_ENV === 'production' ? 'false' : 'true')
        )
          .trim()
          .toLowerCase()
      )
    },
  },
}

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
