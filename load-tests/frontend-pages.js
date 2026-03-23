import http from 'k6/http'
import { check, sleep } from 'k6'
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.1.0/index.js'

const BASE_URL = __ENV.BASE_URL || 'https://app.noteshell.io'

const PAGES = ['/', '/editor', '/auth', '/settings']

export const options = {
  stages: [
    { duration: '10s', target: 100 }, // ramp up to 100 VUs
    { duration: '40s', target: 100 }, // hold at 100 VUs
    { duration: '10s', target: 0 }, // ramp down
  ],
  thresholds: {
    http_req_waiting: ['p(95)<500'], // TTFB p95 under 500ms
    http_req_duration: ['p(95)<2000'], // full load p95 under 2s
  },
}

export default function () {
  // Pick a random page each iteration
  const page = PAGES[Math.floor(Math.random() * PAGES.length)]
  const url = `${BASE_URL}${page}`

  const res = http.get(url, {
    headers: {
      Accept: 'text/html',
    },
  })

  check(res, {
    'status is 200': (r) => r.status === 200,
    'HTML content present': (r) =>
      (r.body && r.body.includes('<!DOCTYPE html')) || r.body.includes('<html'),
    [`page ${page} loaded`]: (r) => r.status === 200,
  })

  sleep(0.5)
}

export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: '  ', enableColors: true }),
    'load-tests/results/frontend-pages.json': JSON.stringify(data, null, 2),
  }
}
