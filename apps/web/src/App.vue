<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { usePreferencesStore, useLayoutStore } from './stores'
import { authFetch } from './utils/api'
import { isDemoMode } from './utils/demo'
import CommandPalette from './components/ui/CommandPalette.vue'
import NotificationToast from './components/ui/NotificationToast.vue'

const preferencesStore = usePreferencesStore()
const layoutStore = useLayoutStore()

const appClasses = computed(() => ({
  'typewriter-mode': preferencesStore.typewriter,
  'focus-mode': preferencesStore.focus || layoutStore.isFocusMode,
  'source-code-mode': layoutStore.isSourceMode,
  'zen-mode': layoutStore.isZenMode,
}))

// Run secretary day-transition on every app load (fire-and-forget).
// This ensures Tomorrow.md → Today.md promotion happens regardless of which page the user lands on.
onMounted(() => {
  if (isDemoMode()) return
  const apiUrl = import.meta.env.VITE_API_URL || ''
  authFetch(`${apiUrl}/api/secretary/day-transition`, {
    method: 'POST',
    headers: { 'X-Timezone': Intl.DateTimeFormat().resolvedOptions().timeZone },
  }).catch(() => {
    // Non-critical — don't block app initialization
  })
})
</script>

<template>
  <div
    id="inkdown-app"
    :class="appClasses"
  >
    <router-view />

    <!-- Global components -->
    <CommandPalette />
    <NotificationToast />
  </div>
</template>

<style>
@import './assets/fonts.css';

#inkdown-app {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-color);
  color: var(--text-color);
  font-family:
    'Open Sans',
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    sans-serif;
}

/* Zen mode - hide sidebar with smooth fade */
#inkdown-app.zen-mode .sidebar {
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s ease;
}
</style>
