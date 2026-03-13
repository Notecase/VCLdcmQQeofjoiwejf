function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readRequiredString(payload, fieldName) {
  const value = payload[fieldName]
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid auth response: missing ${fieldName}`)
  }
  return value
}

function readOptionalString(payload, fieldName) {
  const value = payload[fieldName]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export function normalizeDeviceStartResponse(payload) {
  if (!isRecord(payload)) {
    throw new Error('Invalid auth response: expected JSON object')
  }

  const deviceCode = readRequiredString(payload, 'device_code')
  const userCode = readRequiredString(payload, 'user_code')
  const verificationUri = readRequiredString(payload, 'verification_uri')
  const verificationUriComplete = readOptionalString(payload, 'verification_uri_complete')

  const interval =
    typeof payload.interval === 'number' && Number.isFinite(payload.interval) && payload.interval > 0
      ? Math.round(payload.interval)
      : 5

  let expiresAt
  if (typeof payload.expires_at === 'string' && payload.expires_at.length > 0) {
    expiresAt = payload.expires_at
  } else if (
    typeof payload.expires_in === 'number' &&
    Number.isFinite(payload.expires_in) &&
    payload.expires_in > 0
  ) {
    expiresAt = new Date(Date.now() + payload.expires_in * 1000).toISOString()
  }

  return {
    deviceCode,
    userCode,
    verificationUri,
    verificationUriComplete,
    intervalSeconds: Math.max(1, interval),
    expiresAt,
  }
}

function normalizeUser(payload) {
  if (!isRecord(payload)) {
    return { id: undefined, email: undefined }
  }
  return {
    id: typeof payload.id === 'string' ? payload.id : undefined,
    email: typeof payload.email === 'string' ? payload.email : undefined,
  }
}

export function parsePollResponse(payload) {
  if (!isRecord(payload)) {
    throw new Error('Invalid poll response: expected JSON object')
  }

  const errorCode = typeof payload.error === 'string' ? payload.error : undefined
  if (errorCode === 'authorization_pending') return { status: 'pending' }
  if (errorCode === 'slow_down') return { status: 'pending', slowDown: true }
  if (errorCode === 'expired_token') throw new Error('Login session expired. Run `noteshell login` again.')
  if (errorCode === 'access_denied') throw new Error('Login request was denied.')
  if (errorCode) throw new Error(`Login failed: ${errorCode}`)

  const accessToken = readRequiredString(payload, 'access_token')

  return {
    status: 'success',
    accessToken,
    refreshToken: readOptionalString(payload, 'refresh_token'),
    expiresAt: readOptionalString(payload, 'token_expires_at'),
    supabaseUrl: readOptionalString(payload, 'supabase_url'),
    supabaseAnonKey: readOptionalString(payload, 'supabase_anon_key'),
    user: normalizeUser(payload.user),
  }
}
