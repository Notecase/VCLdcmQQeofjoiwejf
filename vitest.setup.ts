/**
 * Vitest Global Setup
 *
 * This file is run before all tests.
 */

// Polyfill for crypto.randomUUID
if (typeof globalThis.crypto === 'undefined') {
  Object.defineProperty(globalThis, 'crypto', {
    value: {
      randomUUID: () => {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0
          const v = c === 'x' ? r : (r & 0x3) | 0x8
          return v.toString(16)
        })
      },
    },
  })
}

// Suppress console.error in tests unless explicitly testing error handling
// Uncomment if needed:
// beforeEach(() => {
//   vi.spyOn(console, 'error').mockImplementation(() => {})
// })
