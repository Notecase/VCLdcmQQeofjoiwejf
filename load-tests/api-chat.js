import http from 'k6/http'
import { check, sleep } from 'k6'
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.1.0/index.js'

const BASE_URL = __ENV.BASE_URL || 'https://api.noteshell.io'
const AUTH_TOKEN = __ENV.K6_AUTH_TOKEN || ''

export const options = {
  stages: [
    { duration: '10s', target: 10 }, // ramp up to 10 VUs
    { duration: '40s', target: 10 }, // hold at 10 VUs
    { duration: '10s', target: 0 }, // ramp down
  ],
  thresholds: {
    http_req_waiting: ['p(95)<3000'], // TTFB p95 under 3s
    http_req_failed: ['rate<0.05'], // error rate under 5%
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
        'Set it via: k6 run -e K6_AUTH_TOKEN=<token> api-chat.js'
    )
  }

  return headers
}

export default function () {
  const payload = JSON.stringify({
    messages: [{ role: 'user', content: 'Hello' }],
    noteId: 'test',
  })

  const res = http.post(`${BASE_URL}/api/agent`, payload, {
    headers: getHeaders(),
    timeout: '30s',
  })

  check(res, {
    'status is 200': (r) => r.status === 200,
    'response is SSE stream': (r) =>
      r.headers['Content-Type'] && r.headers['Content-Type'].includes('text/event-stream'),
    'body is not empty': (r) => r.body && r.body.length > 0,
  })

  sleep(2)
}

export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: '  ', enableColors: true }),
    'load-tests/results/api-chat.json': JSON.stringify(data, null, 2),
  }
}
