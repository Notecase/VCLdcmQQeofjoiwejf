import { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { ZodError } from 'zod'
import { config } from '../config'

/**
 * Standard error response format
 */
export interface ErrorResponse {
  error: {
    message: string
    code?: string
    details?: unknown
  }
}

/**
 * Global error handler for the API
 */
export function errorHandler(err: Error, c: Context): Response {
  console.error('[API Error]', err)

  // Handle Hono HTTP exceptions
  if (err instanceof HTTPException) {
    const response: ErrorResponse = {
      error: {
        message: err.message,
        code: `HTTP_${err.status}`,
      },
    }

    return c.json(response, err.status)
  }

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    const response: ErrorResponse = {
      error: {
        message: 'Validation error',
        code: 'VALIDATION_ERROR',
        details: config.isDev ? err.errors : undefined,
      },
    }

    return c.json(response, 400)
  }

  // Handle AI provider errors
  if (err.name === 'APIError' || err.name === 'OpenAIError' || err.name === 'AnthropicError') {
    const response: ErrorResponse = {
      error: {
        message: 'AI service error',
        code: 'AI_ERROR',
        details: config.isDev ? err.message : undefined,
      },
    }

    return c.json(response, 502)
  }

  // Handle rate limit errors
  if (err.message?.includes('rate limit') || err.message?.includes('quota')) {
    const response: ErrorResponse = {
      error: {
        message: 'Rate limit exceeded',
        code: 'RATE_LIMIT',
      },
    }

    return c.json(response, 429)
  }

  // Default internal server error
  const response: ErrorResponse = {
    error: {
      message: config.isDev ? err.message : 'Internal server error',
      code: 'INTERNAL_ERROR',
      details: config.isDev ? err.stack : undefined,
    },
  }

  return c.json(response, 500)
}

/**
 * Not found handler
 */
export function notFoundHandler(c: Context): Response {
  const response: ErrorResponse = {
    error: {
      message: `Route not found: ${c.req.method} ${c.req.path}`,
      code: 'NOT_FOUND',
    },
  }

  return c.json(response, 404)
}
