<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useSecretaryStore } from '@/stores/secretary'
import { useLayoutStore } from '@/stores'
import NavigationDock from '@/components/ui/NavigationDock.vue'
import SecretaryDashboard from '@/components/secretary/SecretaryDashboard.vue'
import MemoryFileList from '@/components/secretary/MemoryFileList.vue'
import MemoryFileEditor from '@/components/secretary/MemoryFileEditor.vue'
import HistoryBrowser from '@/components/secretary/HistoryBrowser.vue'
import PlansBrowser from '@/components/secretary/PlansBrowser.vue'
import SecretaryPanel from '@/components/secretary/SecretaryPanel.vue'
import SkeletonLoader from '@/components/secretary/SkeletonLoader.vue'
import FloatingChatFab from '@/components/secretary/FloatingChatFab.vue'
import ChatDrawer from '@/components/secretary/ChatDrawer.vue'

const secretaryStore = useSecretaryStore()
const layoutStore = useLayoutStore()
const route = useRoute()
const isReady = ref(false)

const sidebarWidthStyle = computed(() => ({
  '--sidebar-width': `${layoutStore.sidebarWidth}px`,
}))
const isChatOpen = ref(false)
const routeSection = computed<'dashboard' | 'history' | 'plans'>(() => {
  if (route.name === 'secretary-history') return 'history'
  if (route.name === 'secretary-plans') return 'plans'
  return 'dashboard'
})

onMounted(async () => {
  await secretaryStore.initialize()
  isReady.value = true
  secretaryStore.checkAndAutoPrepareTomorrow()
})

onUnmounted(() => {
  secretaryStore.stopTaskNotifications()
})
</script>

<template>
  <div class="secretary-view">
    <!-- Header with NavigationDock -->
    <header
      class="secretary-header"
      :style="sidebarWidthStyle"
    >
      <div class="dock-area">
        <NavigationDock />
      </div>
      <div class="header-title">
        <h1>Secretary</h1>
        <span class="subtitle">AI Daily Planner</span>
      </div>
    </header>

    <!-- Main Layout: 3 columns -->
    <div
      v-if="isReady"
      class="secretary-body"
    >
      <!-- Left: Memory File List -->
      <aside class="file-sidebar">
        <MemoryFileList />
      </aside>

      <!-- Center: Dashboard, History, or File Editor -->
      <main class="main-content">
        <MemoryFileEditor v-if="secretaryStore.selectedFile" />
        <HistoryBrowser v-else-if="routeSection === 'history'" />
        <PlansBrowser v-else-if="routeSection === 'plans'" />
        <SecretaryDashboard v-else />
      </main>

      <!-- Right: Secretary Panel -->
      <aside class="right-panel">
        <SecretaryPanel />
      </aside>
    </div>

    <!-- Loading State -->
    <div
      v-else
      class="loading-state"
    >
      <div class="skeleton-grid">
        <div class="skeleton-left">
          <SkeletonLoader variant="file-list" />
        </div>
        <div class="skeleton-center">
          <SkeletonLoader variant="plan-card" />
          <SkeletonLoader variant="task-list" />
        </div>
        <div class="skeleton-right">
          <SkeletonLoader variant="chat-message" />
        </div>
      </div>
    </div>

    <!-- Floating Chat -->
    <FloatingChatFab v-model="isChatOpen" />
    <ChatDrawer
      :open="isChatOpen"
      @close="isChatOpen = false"
    />
  </div>
</template>

<style scoped>
.secretary-view {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  background: var(--app-bg, #010409);
  font-family:
    'Inter',
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    sans-serif;
  overflow: hidden;
}

.secretary-header {
  display: flex;
  align-items: center;
  height: 56px;
  flex-shrink: 0;
  padding: 8px 16px 8px 0;
  gap: 16px;
}

.dock-area {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--sidebar-width, 260px);
  flex-shrink: 0;
  transition: width 0.25s ease;
}

.header-title {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.header-title h1 {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-color, #e2e8f0);
  margin: 0;
}

.header-title .subtitle {
  font-size: 12px;
  color: var(--text-color-secondary, #94a3b8);
}

.secretary-body {
  display: flex;
  flex: 1;
  min-height: 0;
  gap: 1px;
  padding: 0 20px 20px 0;
}

.file-sidebar {
  width: 220px;
  flex-shrink: 0;
  overflow-y: auto;
}

.main-content {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 0 16px;
  margin-right: 12px;
}

.main-content::-webkit-scrollbar {
  width: 4px;
}

.main-content::-webkit-scrollbar-track {
  background: transparent;
}

.main-content::-webkit-scrollbar-thumb {
  background: var(--border-color, #333338);
  border-radius: 2px;
}

.right-panel {
  width: 300px;
  flex-shrink: 0;
  overflow-y: auto;
}

.loading-state {
  flex: 1;
  padding: 0 16px 16px;
}

.skeleton-grid {
  display: flex;
  gap: 16px;
  height: 100%;
}

.skeleton-left {
  width: 220px;
  flex-shrink: 0;
}

.skeleton-center {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 0 16px;
}

.skeleton-right {
  width: 300px;
  flex-shrink: 0;
}
</style>
