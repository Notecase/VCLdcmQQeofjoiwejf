import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeDeviceStartResponse, parsePollResponse } from '../scripts/lib/device-auth.mjs'

test('normalizeDeviceStartResponse enforces required fields and defaults interval', () => {
  const normalized = normalizeDeviceStartResponse({
    device_code: 'dev_123',
    user_code: 'ABCD-EFGH',
    verification_uri: 'https://app.noteshell.io/cli',
  })

  assert.equal(normalized.deviceCode, 'dev_123')
  assert.equal(normalized.userCode, 'ABCD-EFGH')
  assert.equal(normalized.verificationUri, 'https://app.noteshell.io/cli')
  assert.equal(normalized.intervalSeconds, 5)
})

test('normalizeDeviceStartResponse rejects malformed payloads', () => {
  assert.throws(
    () =>
      normalizeDeviceStartResponse({
        user_code: 'ABCD-EFGH',
        verification_uri: 'https://app.noteshell.io/cli',
      }),
    /device_code/
  )
})

test('parsePollResponse returns pending state on authorization_pending error', () => {
  const parsed = parsePollResponse({ error: 'authorization_pending' })
  assert.deepEqual(parsed, { status: 'pending' })
})

test('parsePollResponse returns success payload when tokens are present', () => {
  const parsed = parsePollResponse({
    access_token: 'token_123',
    refresh_token: 'refresh_123',
    token_expires_at: '2026-03-14T09:00:00.000Z',
    user: { id: 'abc', email: 'dev@noteshell.app' },
  })

  assert.equal(parsed.status, 'success')
  assert.equal(parsed.accessToken, 'token_123')
  assert.equal(parsed.user.email, 'dev@noteshell.app')
})
