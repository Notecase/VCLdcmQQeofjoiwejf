import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
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
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'muya': fileURLToPath(new URL('./src/muya', import.meta.url)),
      // Node.js polyfills for browser
      'path': 'path-browserify',
      'zlib': 'browserify-zlib'
    }
  },
  define: {
    'process.env': {},
    'process.platform': '"web"',
    'process.version': '"v16.0.0"'
  },
  optimizeDeps: {
    include: ['snapsvg', 'underscore', 'katex', 'mermaid', 'prismjs']
  },
  build: {
    commonjsOptions: {
      transformMixedEsModules: true
    },
    rollupOptions: {
      // Suppress external module warnings
      onwarn(warning, warn) {
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return
        warn(warning)
      }
    },
    chunkSizeWarningLimit: 1500
  }
})
