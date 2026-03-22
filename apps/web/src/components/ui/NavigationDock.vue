<script setup lang="ts">
/**
 * Navigation Dock - Exact Note3 Horizontal Dock
 * Matches the Note3 desktop design exactly
 *
 * When pillMode is true, the dock gets wrapped in a frosted glass container
 * that appears when the sidebar is closed.
 */
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useLayoutStore } from '@/stores'
import { FileText, Calendar, GraduationCap, PanelLeft, PanelRight, Home } from 'lucide-vue-next'
import { isDemoMode } from '@/utils/demo'

// Props for pill mode
defineProps<{
  pillMode?: boolean
}>()

const router = useRouter()
const route = useRoute()
const layoutStore = useLayoutStore()

// Navigate helper
function navigate(path: string) {
  router.push(path)
}

// Check if route is active
const isCalendarActive = computed(
  () => route.path === '/calendar' || route.path.startsWith('/calendar/')
)
const isCoursesActive = computed(
  () => route.path === '/courses' || route.path.startsWith('/courses/')
)

const isNoteActive = computed(() => {
  return route.path === '/editor' || route.name === 'editor'
})

const isHomeActive = computed(() => {
  return route.path === '/' || route.name === 'home'
})

const inDemoMode = computed(() => isDemoMode())
</script>

<template>
  <nav
    class="nav-dock"
    :class="{ 'pill-mode': pillMode }"
  >
    <!-- Left Sidebar Toggle -->
    <button
      class="dock-item toggle-btn"
      :class="{ active: layoutStore.sidebarVisible }"
      title="Toggle Sidebar (Cmd+B)"
      @click="layoutStore.toggleSidebar"
    >
      <PanelLeft :size="18" />
    </button>

    <!-- Notes (Main Editor) -->
    <button
      class="dock-item nav-notes"
      :class="{ active: isNoteActive }"
      title="Notes"
      @click="navigate('/editor')"
    >
      <FileText :size="18" />
    </button>

    <!-- Calendar -->
    <button
      class="dock-item nav-calendar"
      :class="{ active: isCalendarActive }"
      title="Calendar"
      @click="navigate('/calendar')"
    >
      <Calendar :size="18" />
    </button>

    <!-- Courses -->
    <button
      class="dock-item nav-courses"
      :class="{ active: isCoursesActive }"
      title="Courses"
      @click="navigate('/courses')"
    >
      <GraduationCap :size="18" />
    </button>

    <!-- Right Sidebar (AI) Toggle -->
    <button
      class="dock-item toggle-btn"
      :class="{ active: layoutStore.rightPanelVisible }"
      title="Toggle AI Sidebar (Cmd+J)"
      @click="layoutStore.toggleRightPanel"
    >
      <PanelRight :size="18" />
    </button>

    <!-- Vertical Divider -->
    <div class="dock-divider"></div>

    <!-- Home -->
    <button
      class="dock-item nav-home"
      :class="{ active: isHomeActive }"
      title="Home"
      @click="navigate('/')"
    >
      <Home :size="18" />
    </button>

    <!-- Demo Mode Badge -->
    <span
      v-if="inDemoMode"
      class="demo-badge"
    >
      Demo
    </span>
  </nav>
</template>

<style scoped>
/* Seamless dock - blends into sidebar background, no borders */
.nav-dock {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 8px 12px;
  background: transparent;
  border: none;
}

.dock-item {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  color: var(--text-color-secondary, #7d8590);
  cursor: pointer;
  transition: all 0.2s ease;
}

.dock-item:hover {
  background: transparent;
  color: var(--text-color, #e6edf3);
}

/* Nav icons: neutral by default, colored only when active */
.nav-notes:hover,
.nav-calendar:hover,
.nav-courses:hover,
.nav-home:hover {
  color: var(--text-color, #e6edf3);
  background: var(--hover-bg, rgba(139, 148, 158, 0.08));
}

/* Active state - tinted background */
.dock-item.active {
  background: transparent;
  border-color: transparent;
}

.nav-notes.active {
  color: #58a6ff;
  background: rgba(88, 166, 255, 0.12);
}
.nav-calendar.active {
  color: #f0c36d;
  background: rgba(240, 195, 109, 0.12);
}
.nav-courses.active {
  color: #a78bfa;
  background: rgba(167, 139, 250, 0.12);
}
.nav-home.active {
  color: #3fb950;
  background: rgba(63, 185, 80, 0.12);
}

.dock-item.active:hover {
  background: transparent;
}

.nav-notes.active:hover {
  background: rgba(88, 166, 255, 0.16);
}
.nav-calendar.active:hover {
  background: rgba(240, 195, 109, 0.16);
}
.nav-courses.active:hover {
  background: rgba(167, 139, 250, 0.16);
}
.nav-home.active:hover {
  background: rgba(63, 185, 80, 0.16);
}

/* Toggle buttons styling */
.toggle-btn {
  color: var(--text-color-secondary, #8b949e);
}

.toggle-btn:hover {
  color: var(--text-color, #c9d1d9);
  background: var(--hover-bg, rgba(139, 148, 158, 0.08));
}

.toggle-btn.active {
  color: var(--text-color, #c9d1d9);
  background: var(--hover-bg, rgba(139, 148, 158, 0.12));
  border-color: transparent;
}

/* Divider */
.dock-divider {
  width: 1px;
  height: 14px;
  background-color: var(--border-color, #30363d);
  margin: 0 4px;
}

/* ============================================
 * PILL MODE - Frosted glass container
 * Appears when sidebar is closed
 * ============================================ */

.nav-dock.pill-mode {
  background: var(--app-bg, #010409);
  backdrop-filter: blur(12px) saturate(180%);
  -webkit-backdrop-filter: blur(12px) saturate(180%);
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
  border-radius: 12px;
  padding: 8px 12px; /* Match non-pill padding exactly */
  box-shadow:
    0 4px 16px var(--glass-shadow, rgba(0, 0, 0, 0.2)),
    0 0 0 1px var(--glass-inset, rgba(255, 255, 255, 0.05)) inset;
  animation: pill-fade-in 0.2s ease-out;
}

@keyframes pill-fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* Slightly smaller items in pill mode for compactness */
.nav-dock.pill-mode .dock-item {
  width: 28px;
  height: 28px;
}

/* Demo badge */
.demo-badge {
  font-size: 10px;
  font-weight: 600;
  color: #a78bfa;
  background: rgba(167, 139, 250, 0.12);
  padding: 2px 8px;
  border-radius: 6px;
  margin-left: 4px;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.nav-dock.pill-mode .dock-divider {
  height: 14px; /* Match non-pill height */
  margin: 0 4px; /* Match non-pill margin */
  background-color: var(--border-color, rgba(255, 255, 255, 0.1));
}
</style>
