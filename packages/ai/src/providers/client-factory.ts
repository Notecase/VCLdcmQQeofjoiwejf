/**
 * Client Factory
 *
 * Creates configured LLM clients for each provider.
 * Every agent should call these instead of creating clients directly.
 */

import OpenAI from 'openai'
import type { ModelEntry } from './model-registry'

// ============================================================================
// Endpoint Configuration
// ============================================================================

const GEMINI_COMPAT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/'
const OLLAMA_CLOUD_BASE_URL = 'https://ollama.com/v1/'
const OLLAMA_LOCAL_BASE_URL = 'http://localhost:11434/v1/'

// ============================================================================
// OpenAI SDK Client (Pattern A)
// ============================================================================

/**
 * Create an OpenAI SDK client configured for the right provider endpoint.
 * Works for Gemini (via compat), Ollama Cloud/Local (via OpenAI-compat API), and native OpenAI.
 */
export function createOpenAIClient(model: ModelEntry): OpenAI {
  switch (model.provider) {
    case 'gemini':
      return new OpenAI({
        apiKey: process.env.GOOGLE_AI_API_KEY || '',
        baseURL: GEMINI_COMPAT_BASE_URL,
      })

    case 'ollama-cloud':
      return new OpenAI({
        apiKey: process.env.OLLAMA_API_KEY || 'ollama',
        baseURL: process.env.OLLAMA_CLOUD_URL
          ? `${process.env.OLLAMA_CLOUD_URL}/v1/`
          : OLLAMA_CLOUD_BASE_URL,
      })

    case 'ollama-local':
      return new OpenAI({
        apiKey: 'ollama', // Dummy key, no auth needed
        baseURL: process.env.OLLAMA_LOCAL_URL
          ? `${process.env.OLLAMA_LOCAL_URL}/v1/`
          : OLLAMA_LOCAL_BASE_URL,
      })

    case 'openai':
      return new OpenAI({
        apiKey: process.env.OPENAI_API_KEY || '',
      })

    default: {
      const _exhaustive: never = model.provider
      throw new Error(`Unknown provider: ${_exhaustive}`)
    }
  }
}

// ============================================================================
// LangChain Model (Pattern B)
// ============================================================================

/**
 * Create a LangChain chat model for the right provider.
 * Uses dynamic imports to avoid top-level module issues.
 */
export async function createLangChainModel(
  model: ModelEntry,
  options?: {
    temperature?: number
    callbacks?: import('@langchain/core/callbacks/base').BaseCallbackHandler[]
  }
): Promise<import('@langchain/core/language_models/chat_models').BaseChatModel> {
  const temperature = options?.temperature ?? 0.7
  const callbacks = options?.callbacks

  switch (model.provider) {
    case 'gemini': {
      const { ChatGoogleGenerativeAI } = await import('@langchain/google-genai')
      return new ChatGoogleGenerativeAI({
        apiKey: process.env.GOOGLE_AI_API_KEY,
        model: model.id,
        temperature,
        callbacks,
      })
    }

    case 'ollama-cloud':
    case 'ollama-local': {
      const { ChatOllama } = await import('@langchain/ollama')
      const baseUrl =
        model.provider === 'ollama-cloud'
          ? process.env.OLLAMA_CLOUD_URL || 'https://ollama.com'
          : process.env.OLLAMA_LOCAL_URL || 'http://localhost:11434'

      return new ChatOllama({
        baseUrl,
        model: model.id,
        temperature,
        headers:
          model.provider === 'ollama-cloud' && process.env.OLLAMA_API_KEY
            ? { Authorization: `Bearer ${process.env.OLLAMA_API_KEY}` }
            : undefined,
        callbacks,
      })
    }

    case 'openai': {
      const { ChatOpenAI } = await import('@langchain/openai')
      return new ChatOpenAI({
        openAIApiKey: process.env.OPENAI_API_KEY,
        modelName: model.id,
        temperature,
        callbacks,
      })
    }

    default: {
      const _exhaustive: never = model.provider
      throw new Error(`Unknown provider: ${_exhaustive}`)
    }
  }
}
