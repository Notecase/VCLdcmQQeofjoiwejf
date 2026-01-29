/**
 * Shared Error Handling
 *
 * Provides consistent error handling across the Inkdown application.
 */

/**
 * Error codes for the application
 */
export const ErrorCode = {
  // Authentication errors
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  AUTH_EXPIRED: 'AUTH_EXPIRED',
  AUTH_INVALID: 'AUTH_INVALID',

  // Database errors
  DB_CONNECTION_FAILED: 'DB_CONNECTION_FAILED',
  DB_QUERY_FAILED: 'DB_QUERY_FAILED',
  DB_NOT_FOUND: 'DB_NOT_FOUND',
  DB_DUPLICATE: 'DB_DUPLICATE',

  // Validation errors
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  INVALID_INPUT: 'INVALID_INPUT',

  // Storage errors
  STORAGE_UPLOAD_FAILED: 'STORAGE_UPLOAD_FAILED',
  STORAGE_DOWNLOAD_FAILED: 'STORAGE_DOWNLOAD_FAILED',
  STORAGE_DELETE_FAILED: 'STORAGE_DELETE_FAILED',

  // AI errors
  AI_PROVIDER_ERROR: 'AI_PROVIDER_ERROR',
  AI_RATE_LIMIT: 'AI_RATE_LIMIT',
  AI_CONTEXT_TOO_LONG: 'AI_CONTEXT_TOO_LONG',

  // Network errors
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT: 'TIMEOUT',

  // General errors
  UNKNOWN: 'UNKNOWN',
  INTERNAL: 'INTERNAL',
} as const

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode]

/**
 * Application error class with support for error codes and user-friendly messages
 */
export class AppError extends Error {
  public readonly code: ErrorCodeType
  public readonly userMessage: string
  public readonly timestamp: Date
  public readonly context?: Record<string, unknown>

  constructor(
    message: string,
    code: ErrorCodeType = ErrorCode.UNKNOWN,
    userMessage?: string,
    context?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.userMessage = userMessage || getDefaultUserMessage(code)
    this.timestamp = new Date()
    this.context = context

    // Maintains proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError)
    }
  }

  /**
   * Creates a new AppError from an unknown error
   */
  static from(error: unknown, code?: ErrorCodeType, context?: Record<string, unknown>): AppError {
    if (error instanceof AppError) {
      return error
    }

    if (error instanceof Error) {
      return new AppError(error.message, code || ErrorCode.UNKNOWN, undefined, {
        ...context,
        originalError: error.name,
      })
    }

    return new AppError(String(error), code || ErrorCode.UNKNOWN, undefined, context)
  }

  /**
   * Converts the error to a plain object for serialization
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      userMessage: this.userMessage,
      timestamp: this.timestamp.toISOString(),
      context: this.context,
    }
  }
}

/**
 * Get default user-friendly message for an error code
 */
function getDefaultUserMessage(code: ErrorCodeType): string {
  const messages: Record<ErrorCodeType, string> = {
    [ErrorCode.AUTH_REQUIRED]: 'Please sign in to continue.',
    [ErrorCode.AUTH_EXPIRED]: 'Your session has expired. Please sign in again.',
    [ErrorCode.AUTH_INVALID]: 'Invalid credentials. Please try again.',

    [ErrorCode.DB_CONNECTION_FAILED]: 'Unable to connect to the database. Please try again later.',
    [ErrorCode.DB_QUERY_FAILED]: 'An error occurred while fetching data. Please try again.',
    [ErrorCode.DB_NOT_FOUND]: 'The requested item was not found.',
    [ErrorCode.DB_DUPLICATE]: 'This item already exists.',

    [ErrorCode.VALIDATION_FAILED]: 'Please check your input and try again.',
    [ErrorCode.INVALID_INPUT]: 'The provided input is invalid.',

    [ErrorCode.STORAGE_UPLOAD_FAILED]: 'Failed to upload file. Please try again.',
    [ErrorCode.STORAGE_DOWNLOAD_FAILED]: 'Failed to download file. Please try again.',
    [ErrorCode.STORAGE_DELETE_FAILED]: 'Failed to delete file. Please try again.',

    [ErrorCode.AI_PROVIDER_ERROR]: 'AI service is currently unavailable. Please try again later.',
    [ErrorCode.AI_RATE_LIMIT]: 'Too many requests. Please wait a moment and try again.',
    [ErrorCode.AI_CONTEXT_TOO_LONG]: 'The content is too long for the AI to process.',

    [ErrorCode.NETWORK_ERROR]: 'Network error. Please check your connection.',
    [ErrorCode.TIMEOUT]: 'The request timed out. Please try again.',

    [ErrorCode.UNKNOWN]: 'An unexpected error occurred. Please try again.',
    [ErrorCode.INTERNAL]: 'An internal error occurred. Please contact support if this persists.',
  }

  return messages[code] || messages[ErrorCode.UNKNOWN]
}

/**
 * Type guard to check if an error is an AppError
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}

/**
 * Handles an error and returns an AppError
 * Use this in catch blocks for consistent error handling
 */
export function handleError(
  error: unknown,
  defaultCode?: ErrorCodeType,
  context?: Record<string, unknown>
): AppError {
  // Log the error in development
  if (process.env.NODE_ENV === 'development') {
    console.error('[handleError]', error)
  }

  return AppError.from(error, defaultCode, context)
}

/**
 * Result type for operations that can fail
 */
export type Result<T, E = AppError> = { success: true; data: T } | { success: false; error: E }

/**
 * Creates a successful result
 */
export function ok<T>(data: T): Result<T, never> {
  return { success: true, data }
}

/**
 * Creates a failed result
 */
export function err<E = AppError>(error: E): Result<never, E> {
  return { success: false, error }
}

/**
 * Wraps an async function to return a Result type
 */
export async function tryCatch<T>(
  fn: () => Promise<T>,
  defaultCode?: ErrorCodeType,
  context?: Record<string, unknown>
): Promise<Result<T>> {
  try {
    const data = await fn()
    return ok(data)
  } catch (error) {
    return err(handleError(error, defaultCode, context))
  }
}

/**
 * Wraps a sync function to return a Result type
 */
export function tryCatchSync<T>(
  fn: () => T,
  defaultCode?: ErrorCodeType,
  context?: Record<string, unknown>
): Result<T> {
  try {
    const data = fn()
    return ok(data)
  } catch (error) {
    return err(handleError(error, defaultCode, context))
  }
}
