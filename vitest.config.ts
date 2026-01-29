import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  test: {
    // Global test settings
    globals: true,
    environment: 'happy-dom',

    // Include patterns
    include: ['packages/**/src/**/*.{test,spec}.{ts,tsx}', 'apps/**/src/**/*.{test,spec}.{ts,tsx}'],

    // Exclude patterns
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
    ],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['packages/**/src/**/*.ts', 'apps/**/src/**/*.ts', 'apps/**/src/**/*.vue'],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/*.d.ts',
        '**/index.ts',
        '**/*.test.ts',
        '**/*.spec.ts',
      ],
    },

    // Setup files
    setupFiles: ['./vitest.setup.ts'],

    // Timeout for async tests
    testTimeout: 10000,

    // Reporter
    reporters: ['default'],
  },
  resolve: {
    alias: {
      '@inkdown/shared': resolve(__dirname, 'packages/shared/src'),
      '@inkdown/ai': resolve(__dirname, 'packages/ai/src'),
      '@inkdown/editor': resolve(__dirname, 'packages/editor/src'),
      '@inkdown/muya': resolve(__dirname, 'packages/muya/src'),
    },
  },
})
