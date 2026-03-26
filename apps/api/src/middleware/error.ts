import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { ZodError } from 'zod'
import { isAppError, ErrorCode } from '@inkdown/shared'
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

const appErrorStatusMap: Record<string, number> = {
  [ErrorCode.AUTH_REQUIRED]: 401,
  [ErrorCode.AUTH_EXPIRED]: 401,
  [ErrorCode.AUTH_INVALID]: 401,
  [ErrorCode.VALIDATION_FAILED]: 400,
  [ErrorCode.INVALID_INPUT]: 400,
  [ErrorCode.DB_NOT_FOUND]: 404,
  [ErrorCode.DB_DUPLICATE]: 409,
  [ErrorCode.DB_CONNECTION_FAILED]: 503,
  [ErrorCode.DB_QUERY_FAILED]: 500,
  [ErrorCode.AI_PROVIDER_ERROR]: 502,
  [ErrorCode.AI_RATE_LIMIT]: 429,
  [ErrorCode.AI_CONTEXT_TOO_LONG]: 413,
  [ErrorCode.NETWORK_ERROR]: 502,
  [ErrorCode.TIMEOUT]: 504,
  [ErrorCode.INTERNAL]: 500,
  [ErrorCode.UNKNOWN]: 500,
}

/**
 * Global error handler for the API
 */
export function errorHandler(err: Error, c: Context): Response {
  console.error('[API Error]', err)

  // Handle AppError (from @inkdown/shared)
  if (isAppError(err)) {
    const status = appErrorStatusMap[err.code] ?? 500
    return c.json(
      {
        error: {
          message: err.userMessage,
          code: err.code,
          details: config.isDev ? err.context : undefined,
        },
      } satisfies ErrorResponse,
      (status || 500) as ContentfulStatusCode
    )
  }

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
