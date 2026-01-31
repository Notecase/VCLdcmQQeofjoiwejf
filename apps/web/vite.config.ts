import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  server: {
    proxy: {
      // Proxy API requests to the backend server
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      // Also proxy health endpoint
      '/health': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'Inkdown',
        short_name: 'Inkdown',
        description: 'AI-enhanced markdown editor for the web',
        theme_color: '#1e1e1e',
        background_color: '#1e1e1e',
        display: 'standalone',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
    }),
  ],
  resolve: {
    extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'],
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Workspace packages - resolve to source for development
      // Note: Subpath must come BEFORE the main package alias
      '@inkdown/muya/assets': fileURLToPath(
        new URL('../../packages/muya/src/assets', import.meta.url)
      ),
      '@inkdown/muya': fileURLToPath(new URL('../../packages/muya/src', import.meta.url)),
      '@inkdown/editor': fileURLToPath(new URL('../../packages/editor', import.meta.url)),
      // Stubs for packages not available in web
      '@marktext/file-icons': fileURLToPath(new URL('./src/stubs/file-icons', import.meta.url)),
      '@marktext/file-icons/build/index.css': fileURLToPath(
        new URL('./src/stubs/file-icons/build/index.css', import.meta.url)
      ),
      // Node.js polyfills for browser
      path: 'path-browserify',
      zlib: 'browserify-zlib',
    },
  },
  define: {
    'process.env': {},
    'process.platform': '"web"',
    'process.version': '"v16.0.0"',
  },
  optimizeDeps: {
    include: ['snapsvg', 'underscore', 'katex', 'mermaid', 'prismjs'],
  },
  build: {
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    rollupOptions: {
      // Suppress external module warnings
      onwarn(warning, warn) {
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return
        warn(warning)
      },
    },
    chunkSizeWarningLimit: 1500,
  },
})
