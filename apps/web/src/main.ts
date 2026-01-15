import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'

import App from './App.vue'
import { useAuthStore, usePreferencesStore } from './stores'

// Import theme variables (must be first to define CSS variables for all themes)
import './assets/themes/variables.css'

// Import global styles
import './assets/styles/index.scss'

// Create router
const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'editor',
      component: () => import('./views/EditorView.vue')
    },
    {
      path: '/auth',
      name: 'auth',
      component: () => import('./views/AuthView.vue')
    }
  ]
})

// Create app
const app = createApp(App)

// Install plugins
app.use(createPinia())
app.use(router)
app.use(ElementPlus)

// Initialize stores before mounting
const authStore = useAuthStore()
const preferencesStore = usePreferencesStore()

Promise.all([
  authStore.initialize(),
  preferencesStore.load()
]).then(() => {
  // Apply theme
  document.documentElement.setAttribute('data-theme', preferencesStore.theme)

  // Mount app
  app.mount('#app')
})
