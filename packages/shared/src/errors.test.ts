import { describe, it, expect } from 'vitest'
import { AppError, ErrorCode, handleError, isAppError, ok, err, tryCatchSync } from './errors'

describe('AppError', () => {
  it('creates an error with default values', () => {
    const error = new AppError('Test error')

    expect(error.message).toBe('Test error')
    expect(error.code).toBe(ErrorCode.UNKNOWN)
    expect(error.userMessage).toBe('An unexpected error occurred. Please try again.')
    expect(error.timestamp).toBeInstanceOf(Date)
  })

  it('creates an error with custom code and user message', () => {
    const error = new AppError('Authentication failed', ErrorCode.AUTH_REQUIRED, 'Custom message')

    expect(error.message).toBe('Authentication failed')
    expect(error.code).toBe(ErrorCode.AUTH_REQUIRED)
    expect(error.userMessage).toBe('Custom message')
  })

  it('creates from standard Error', () => {
    const stdError = new Error('Standard error')
    const appError = AppError.from(stdError, ErrorCode.INTERNAL)

    expect(appError).toBeInstanceOf(AppError)
    expect(appError.message).toBe('Standard error')
    expect(appError.code).toBe(ErrorCode.INTERNAL)
  })

  it('returns same instance when creating from AppError', () => {
    const original = new AppError('Original', ErrorCode.AUTH_REQUIRED)
    const result = AppError.from(original)

    expect(result).toBe(original)
  })

  it('serializes to JSON', () => {
    const error = new AppError('Test', ErrorCode.DB_NOT_FOUND)
    const json = error.toJSON()

    expect(json).toHaveProperty('name', 'AppError')
    expect(json).toHaveProperty('message', 'Test')
    expect(json).toHaveProperty('code', ErrorCode.DB_NOT_FOUND)
    expect(json).toHaveProperty('timestamp')
  })
})

describe('isAppError', () => {
  it('returns true for AppError instances', () => {
    const error = new AppError('Test')
    expect(isAppError(error)).toBe(true)
  })

  it('returns false for standard errors', () => {
    const error = new Error('Test')
    expect(isAppError(error)).toBe(false)
  })

  it('returns false for non-error values', () => {
    expect(isAppError(null)).toBe(false)
    expect(isAppError(undefined)).toBe(false)
    expect(isAppError('string')).toBe(false)
  })
})

describe('handleError', () => {
  it('converts unknown errors to AppError', () => {
    const result = handleError('string error')

    expect(result).toBeInstanceOf(AppError)
    expect(result.message).toBe('string error')
  })

  it('uses provided default code', () => {
    const result = handleError(new Error('Test'), ErrorCode.NETWORK_ERROR)

    expect(result.code).toBe(ErrorCode.NETWORK_ERROR)
  })
})

describe('Result helpers', () => {
  it('ok() creates successful result', () => {
    const result = ok(42)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe(42)
    }
  })

  it('err() creates failed result', () => {
    const error = new AppError('Failed')
    const result = err(error)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBe(error)
    }
  })
})

describe('tryCatchSync', () => {
  it('returns ok result for successful function', () => {
    const result = tryCatchSync(() => 'success')

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe('success')
    }
  })

  it('returns err result for throwing function', () => {
    const result = tryCatchSync(() => {
      throw new Error('Test error')
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBeInstanceOf(AppError)
      expect(result.error.message).toBe('Test error')
    }
  })
})
