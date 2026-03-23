import http from 'k6/http'
import { check, sleep } from 'k6'
import { Counter, Rate } from 'k6/metrics'
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.1.0/index.js'

const BASE_URL = __ENV.BASE_URL || 'https://api.noteshell.io'
const AUTH_TOKEN = __ENV.K6_AUTH_TOKEN || ''

const connectionSuccess = new Rate('sse_connection_success')
const connectionsAttempted = new Counter('sse_connections_attempted')

export const options = {
  scenarios: {
    sse_hold: {
      executor: 'constant-vus',
      vus: 20,
      duration: '30s',
    },
  },
  thresholds: {
    sse_connection_success: ['rate>0.95'], // 95% connection success
  },
}

function getHeaders() {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  }

  if (AUTH_TOKEN) {
    headers['Authorization'] = `Bearer ${AUTH_TOKEN}`
  } else if (__ITER === 0 && __VU === 1) {
    console.warn(
      'K6_AUTH_TOKEN not set. Requests will be sent without auth. ' +
        'Set it via: k6 run -e K6_AUTH_TOKEN=<token> api-sse-concurrent.js'
    )
  }

  return headers
}

export default function () {
  connectionsAttempted.add(1)

  const payload = JSON.stringify({
    messages: [{ role: 'user', content: 'Hello' }],
    noteId: 'test',
  })

  // Send request with a long timeout to simulate holding an SSE connection.
  // k6 does not natively support persistent SSE, so we use a long-timeout POST
  // and check that the server accepted the connection (status 200).
  const res = http.post(`${BASE_URL}/api/agent`, payload, {
    headers: getHeaders(),
    timeout: '35s',
  })

  const connected = check(res, {
    'connection established (status 200)': (r) => r.status === 200,
    'received SSE content-type': (r) =>
      r.headers['Content-Type'] && r.headers['Content-Type'].includes('text/event-stream'),
  })

  connectionSuccess.add(connected ? 1 : 0)

  // Short pause between iterations so VUs don't immediately reconnect
  sleep(1)
}

export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: '  ', enableColors: true }),
    'load-tests/results/api-sse-concurrent.json': JSON.stringify(data, null, 2),
  }
}
