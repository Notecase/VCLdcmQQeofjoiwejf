import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createWebHistory } from 'vue-router';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import App from './App.vue';
import { useAuthStore, usePreferencesStore } from './stores';
import { initializeServices, isSupabaseConfigured } from './services';
// Import theme variables (must be first to define CSS variables for all themes)
import './assets/themes/variables.css';
// Import global styles
import './assets/styles/index.scss';
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
});
// Create app
const app = createApp(App);
// Install plugins
app.use(createPinia());
app.use(router);
app.use(ElementPlus);
/**
 * Initialize application
 */
async function initApp() {
    // Initialize service provider
    // Use 'supabase' if configured, otherwise 'local' for offline mode
    const provider = isSupabaseConfigured ? 'supabase' : 'local';
    try {
        await initializeServices(provider);
        console.log(`Services initialized with ${provider} provider`);
    }
    catch (error) {
        console.warn('Failed to initialize services, falling back to local:', error);
        await initializeServices('local');
    }
    // Initialize stores SEQUENTIALLY
    // Auth must complete first (preferences might be user-specific)
    const authStore = useAuthStore();
    const preferencesStore = usePreferencesStore();
    try {
        // Auth MUST complete first
        await authStore.initialize();
        console.log('Auth initialized:', authStore.isAuthenticated ? 'authenticated' : 'guest');
    }
    catch (error) {
        console.error('Auth initialization failed:', error);
        // Continue with guest mode
    }
    try {
        // Load preferences after auth (can now fetch user-specific preferences)
        await preferencesStore.load();
        console.log('Preferences loaded');
    }
    catch (error) {
        console.error('Preferences load failed:', error);
        // Use defaults
    }
    // Apply theme
    document.documentElement.setAttribute('data-theme', preferencesStore.theme);
    // Mount app
    app.mount('#app');
}
// Start the app
initApp().catch(console.error);
