import http from 'k6/http'
import { check, sleep } from 'k6'
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.1.0/index.js'

const BASE_URL = __ENV.BASE_URL || 'https://api.noteshell.io'

export const options = {
  stages: [
    { duration: '20s', target: 50 }, // ramp up to 50 VUs
    { duration: '1m20s', target: 50 }, // hold at 50 VUs
    { duration: '20s', target: 0 }, // ramp down to 0
  ],
  thresholds: {
    http_req_duration: [
      'p(95)<200', // p95 under 200ms
      'p(99)<500', // p99 under 500ms
    ],
    http_req_failed: ['rate<0.01'], // error rate under 1%
  },
}

export default function () {
  const res = http.get(`${BASE_URL}/health`)

  check(res, {
    'status is 200': (r) => r.status === 200,
    'body contains ok': (r) => r.body && r.body.toLowerCase().includes('ok'),
  })

  sleep(1)
}

export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: '  ', enableColors: true }),
    'load-tests/results/api-health.json': JSON.stringify(data, null, 2),
  }
}
