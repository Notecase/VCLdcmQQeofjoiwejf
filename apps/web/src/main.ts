import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'

import App from './App.vue'
import { useAuthStore, usePreferencesStore } from './stores'
import { initializeServices, isSupabaseConfigured } from './services'

// Import theme variables (must be first to define CSS variables for all themes)
import './assets/themes/variables.css'

// Import global styles
import './assets/styles/index.scss'
import './assets/styles/diff-blocks.css'
import './assets/styles/glass-design.css'

// Create router
const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('./views/HomePage.vue'),
    },
    {
      path: '/editor',
      name: 'editor',
      component: () => import('./views/EditorView.vue'),
    },
    {
      path: '/auth',
      name: 'auth',
      component: () => import('./views/AuthView.vue'),
    },
    {
      path: '/calendar',
      name: 'secretary',
      component: () => import('./views/SecretaryView.vue'),
    },
    {
      path: '/calendar/history',
      name: 'secretary-history',
      component: () => import('./views/SecretaryView.vue'),
    },
    {
      path: '/calendar/plans',
      name: 'secretary-plans',
      component: () => import('./views/SecretaryView.vue'),
    },
    {
      path: '/calendar/view',
      name: 'secretary-calendar',
      component: () => import('./views/SecretaryView.vue'),
    },
    {
      path: '/calendar/inbox',
      name: 'secretary-inbox',
      component: () => import('./views/SecretaryView.vue'),
    },
    {
      path: '/calendar/plan/new',
      name: 'plan-create',
      component: () => import('./views/PlanCreateView.vue'),
    },
    {
      path: '/calendar/plan/:planId',
      name: 'plan-workspace',
      component: () => import('./views/PlanWorkspaceView.vue'),
    },
    {
      path: '/courses',
      name: 'courseList',
      component: () => import('./views/CourseListView.vue'),
    },
    {
      path: '/courses/generate',
      name: 'courseGenerator',
      component: () => import('./views/CourseGeneratorView.vue'),
    },
    {
      path: '/courses/:id',
      name: 'courseViewer',
      component: () => import('./views/CourseView.vue'),
    },
    {
      path: '/demo',
      name: 'demo',
      component: () => import('./views/DemoGateView.vue'),
    },
    {
      path: '/capture',
      name: 'capture',
      component: () => import('./views/CaptureView.vue'),
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('./views/SettingsView.vue'),
    },
    {
      path: '/cli',
      name: 'cli-auth',
      component: () => import('./views/CliAuthView.vue'),
    },
  ],
})

// In production (no API backend), require demo mode for all routes
const isProductionDemo = !import.meta.env.VITE_API_URL || import.meta.env.VITE_API_URL === ''
router.beforeEach((to) => {
  const inDemoMode = sessionStorage.getItem('demoMode') === 'true'
  if (
    isProductionDemo &&
    !inDemoMode &&
    to.name !== 'demo' &&
    to.name !== 'cli-auth' &&
    to.name !== 'capture' &&
    to.name !== 'settings'
  ) {
    return { name: 'demo' }
  }
})

// Clean up orphaned overlays on every route change.
// Element Plus dialogs (ElMessageBox) and modals append overlays directly to
// document.body. If a component unmounts while a dialog is open, the overlay
// can persist and block ALL clicks on the page.
router.afterEach(() => {
  // Remove orphaned Element Plus overlays
  document.querySelectorAll('.el-overlay').forEach((el) => el.remove())

  // Reset body styles that modals may have leaked
  document.body.style.overflow = ''
  document.body.style.paddingRight = ''
  document.body.style.userSelect = ''
  document.body.style.cursor = ''

  // Remove any Element Plus body classes left by modals
  document.body.classList.remove('el-popup-parent--hidden')
})

// Create app
const app = createApp(App)

// Install plugins
app.use(createPinia())
app.use(router)
app.use(ElementPlus)

/**
 * Initialize application
 */
async function initApp() {
  // Initialize service provider
  // Force local provider in demo mode so all data goes to IndexedDB
  const inDemoMode = sessionStorage.getItem('demoMode') === 'true'
  const provider = inDemoMode ? 'local' : isSupabaseConfigured ? 'supabase' : 'local'

  try {
    await initializeServices(provider)
    console.log(`Services initialized with ${provider} provider`)
  } catch (error) {
    console.warn('Failed to initialize services, falling back to local:', error)
    await initializeServices('local')
  }

  // Initialize stores SEQUENTIALLY
  // Auth must complete first (preferences might be user-specific)
  const authStore = useAuthStore()
  const preferencesStore = usePreferencesStore()

  try {
    // Auth MUST complete first
    await authStore.initialize()
    console.log('Auth initialized:', authStore.isAuthenticated ? 'authenticated' : 'guest')
  } catch (error) {
    console.error('Auth initialization failed:', error)
    // Continue with guest mode
  }

  try {
    // Load preferences after auth (can now fetch user-specific preferences)
    await preferencesStore.load()
    console.log('Preferences loaded')
  } catch (error) {
    console.error('Preferences load failed:', error)
    // Use defaults
  }

  // Apply theme
  document.documentElement.setAttribute('data-theme', preferencesStore.theme)

  // Mount app
  app.mount('#app')
}

// Start the app
initApp().catch(console.error)
