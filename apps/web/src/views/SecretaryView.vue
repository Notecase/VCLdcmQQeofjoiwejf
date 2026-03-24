<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSecretaryStore } from '@/stores/secretary'
import { useLayoutStore } from '@/stores'
import NavigationDock from '@/components/ui/NavigationDock.vue'
import SecretaryDashboard from '@/components/secretary/SecretaryDashboard.vue'
import MemoryFileList from '@/components/secretary/MemoryFileList.vue'
import MemoryFileEditor from '@/components/secretary/MemoryFileEditor.vue'
import HistoryBrowser from '@/components/secretary/HistoryBrowser.vue'
import PlansBrowser from '@/components/secretary/PlansBrowser.vue'
import SecretaryPanel from '@/components/secretary/SecretaryPanel.vue'
import TickerBar from '@/components/secretary/TickerBar.vue'
import CalendarTimelineView from '@/components/secretary/CalendarTimelineView.vue'
import SkeletonLoader from '@/components/secretary/SkeletonLoader.vue'
import FloatingChatFab from '@/components/secretary/FloatingChatFab.vue'
import ChatDrawer from '@/components/secretary/ChatDrawer.vue'
import SecretaryActionSheet from '@/components/secretary/SecretaryActionSheet.vue'
import InboxProposals from '@/components/secretary/InboxProposals.vue'
import type { ScheduledTask } from '@inkdown/shared/types'
const secretaryStore = useSecretaryStore()
const layoutStore = useLayoutStore()
const route = useRoute()
const router = useRouter()
const isReady = ref(false)
const isChatOpen = ref(false)

const sidebarWidthStyle = computed(() => ({
  '--sidebar-width': `${layoutStore.sidebarWidth}px`,
}))

const inboxRef = ref<InstanceType<typeof InboxProposals> | null>(null)

const routeSection = computed<'dashboard' | 'history' | 'plans' | 'calendar' | 'inbox'>(() => {
  if (route.name === 'secretary-history') return 'history'
  if (route.name === 'secretary-plans') return 'plans'
  if (route.name === 'secretary-calendar') return 'calendar'
  if (route.name === 'secretary-inbox') return 'inbox'
  return 'dashboard'
})

const tickerSelectedTask = ref<ScheduledTask | null>(null)

function handleTickerTaskClick(task: ScheduledTask) {
  tickerSelectedTask.value = task
}

function endTime(task: ScheduledTask): string {
  const [h, m] = task.scheduledTime.split(':').map(Number)
  const totalMin = h * 60 + m + task.durationMinutes
  const endH = Math.floor(totalMin / 60) % 24
  const endM = totalMin % 60
  return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`
}

onMounted(async () => {
  await secretaryStore.initialize()
  isReady.value = true
  secretaryStore.checkAndAutoPrepareTomorrow()
})

onUnmounted(() => {
  secretaryStore.stopTaskNotifications()
})

function navigateSection(section: 'dashboard' | 'history' | 'plans' | 'calendar' | 'inbox') {
  secretaryStore.selectedFilename = null
  if (section === 'history') {
    router.push('/calendar/history')
    return
  }
  if (section === 'plans') {
    router.push('/calendar/plans')
    return
  }
  if (section === 'calendar') {
    router.push('/calendar/view')
    return
  }
  if (section === 'inbox') {
    router.push('/calendar/inbox')
    return
  }
  router.push('/calendar')
}
</script>

<template>
  <div class="secretary-view">
    <header
      class="secretary-header"
      :style="sidebarWidthStyle"
    >
      <div class="dock-area">
        <NavigationDock />
      </div>

      <div class="header-title">
        <h1>Secretary</h1>
        <span class="subtitle">Work and study management</span>
      </div>

      <nav class="section-nav">
        <button
          class="section-chip"
          :class="{
            active:
              routeSection === 'dashboard' ||
              routeSection === 'history' ||
              routeSection === 'plans',
          }"
          @click="navigateSection('dashboard')"
        >
          Dashboard
        </button>
        <button
          class="section-chip"
          :class="{ active: routeSection === 'calendar' }"
          @click="navigateSection('calendar')"
        >
          Calendar
        </button>
        <button
          class="section-chip"
          :class="{ active: routeSection === 'inbox' }"
          @click="navigateSection('inbox')"
        >
          Inbox
          <span
            v-if="inboxRef?.pendingCount && inboxRef.pendingCount > 0"
            class="chip-badge"
            >{{ inboxRef.pendingCount }}</span
          >
        </button>
      </nav>
    </header>

    <TickerBar
      v-if="isReady"
      @select-task="handleTickerTaskClick"
    />

    <div
      v-if="isReady"
      class="secretary-body"
    >
      <template v-if="routeSection === 'inbox'">
        <main class="main-content inbox-main">
          <InboxProposals ref="inboxRef" />
        </main>
      </template>

      <template v-else-if="routeSection === 'calendar'">
        <main class="main-content calendar-main">
          <CalendarTimelineView />
        </main>
      </template>

      <template v-else>
        <aside class="file-sidebar">
          <MemoryFileList />
        </aside>

        <main class="main-content">
          <MemoryFileEditor v-if="secretaryStore.selectedFile" />
          <HistoryBrowser v-else-if="routeSection === 'history'" />
          <PlansBrowser v-else-if="routeSection === 'plans'" />
          <SecretaryDashboard v-else />
        </main>

        <aside class="right-panel">
          <SecretaryPanel />
        </aside>
      </template>
    </div>

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

    <FloatingChatFab v-model="isChatOpen" />
    <ChatDrawer
      :open="isChatOpen"
      @close="isChatOpen = false"
    />

    <SecretaryActionSheet
      :open="Boolean(tickerSelectedTask)"
      :title="tickerSelectedTask?.title || ''"
      :subtitle="
        tickerSelectedTask
          ? `${tickerSelectedTask.scheduledTime} - ${endTime(tickerSelectedTask)}`
          : ''
      "
      :label="tickerSelectedTask?.source || 'Task actions'"
      :artifacts="tickerSelectedTask?.artifacts || []"
      :primary-actions="[]"
      :secondary-actions="[]"
      @close="tickerSelectedTask = null"
    />
  </div>
</template>

<style scoped>
.secretary-view {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  width: 100vw;
  background:
    radial-gradient(circle at top, rgba(16, 185, 129, 0.05), transparent 26%),
    radial-gradient(circle at right, rgba(245, 158, 11, 0.04), transparent 20%),
    var(--app-bg, #010409);
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
  height: 62px;
  flex-shrink: 0;
  padding: 10px 18px 10px 0;
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
  font-weight: 700;
  color: var(--text-color, #e2e8f0);
  margin: 0;
}

.subtitle {
  font-size: 12px;
  color: var(--text-color-secondary, #94a3b8);
}

.section-nav {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 18px;
}

.section-chip {
  min-height: 34px;
  padding: 0 14px;
  border-radius: var(--sec-radius-pill, 999px);
  border: 1px solid var(--sec-glass-border, rgba(255, 255, 255, 0.08));
  background: var(--sec-surface-card, rgba(255, 255, 255, 0.03));
  color: var(--text-color-secondary, #94a3b8);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition:
    border-color var(--sec-transition-fast, 180ms) ease,
    background var(--sec-transition-fast, 180ms) ease;
}

.section-chip.active {
  border-color: rgba(16, 185, 129, 0.28);
  background: rgba(16, 185, 129, 0.13);
  color: #aaf2d2;
}

.secretary-body {
  display: flex;
  flex: 1;
  min-height: 0;
  gap: 18px;
  padding: 0 20px 20px 0;
  overflow: hidden;
}

.file-sidebar {
  width: 200px;
  flex-shrink: 0;
  min-height: 0;
  overflow-y: auto;
}

.main-content {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  padding: 0 16px;
}

.main-content::-webkit-scrollbar,
.right-panel::-webkit-scrollbar {
  width: 4px;
}

.main-content::-webkit-scrollbar-track,
.right-panel::-webkit-scrollbar-track {
  background: transparent;
}

.main-content::-webkit-scrollbar-thumb,
.right-panel::-webkit-scrollbar-thumb {
  background: var(--border-color, #333338);
  border-radius: 999px;
}

.chip-badge {
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: rgba(16, 185, 129, 0.25);
  color: #6ee7b7;
  font-size: 10px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: 4px;
}

.calendar-main,
.inbox-main {
  max-width: 100%;
}

.right-panel {
  width: 320px;
  flex-shrink: 0;
  min-height: 0;
  overflow-y: auto;
  padding-right: 8px;
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
  width: 320px;
  flex-shrink: 0;
}

@media (max-width: 1200px) {
  .section-nav {
    display: none;
  }

  .right-panel {
    display: none;
  }
}

@media (max-width: 900px) {
  .file-sidebar {
    display: none;
  }

  .secretary-body {
    padding: 0 12px 12px 12px;
  }

  .main-content {
    padding: 0;
  }
}
</style>
