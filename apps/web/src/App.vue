<script setup lang="ts">
import { computed } from 'vue'
import { usePreferencesStore } from './stores'

const preferencesStore = usePreferencesStore()

const appClasses = computed(() => ({
  'typewriter-mode': preferencesStore.typewriter,
  'focus-mode': preferencesStore.focus,
  'source-code-mode': preferencesStore.sourceCode
}))
</script>

<template>
  <div id="marktext-app" :class="appClasses">
    <router-view />
  </div>
</template>

<style>
#marktext-app {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-color);
  color: var(--text-color);
}
</style>
