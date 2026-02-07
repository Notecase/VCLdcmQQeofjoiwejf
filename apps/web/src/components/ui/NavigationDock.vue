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
import {
  FileText,
  LayoutGrid,
  Calendar,
  GraduationCap,
  PanelLeft,
  PanelRight,
  Home,
} from 'lucide-vue-next'

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
const isActive = (path: string) => route.path === path

const isNoteActive = computed(() => {
  return route.path === '/' || route.name === 'editor'
})
</script>

<template>
  <nav class="nav-dock" :class="{ 'pill-mode': pillMode }">
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
      class="dock-item"
      :class="{ active: isNoteActive }"
      title="Notes"
      @click="navigate('/')"
    >
      <FileText :size="18" />
    </button>

    <!-- Dashboard -->
    <button
      class="dock-item"
      :class="{ active: isActive('/ai') }"
      title="Dashboard"
      @click="navigate('/ai')"
    >
      <LayoutGrid :size="18" />
    </button>

    <!-- Calendar -->
    <button
      class="dock-item"
      :class="{ active: isActive('/calendar') }"
      title="Calendar"
      @click="navigate('/calendar')"
    >
      <Calendar :size="18" />
    </button>

    <!-- Courses -->
    <button
      class="dock-item"
      :class="{ active: isActive('/courses') }"
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
      class="dock-item"
      :class="{ active: isActive('/home') }"
      title="Home"
      @click="navigate('/home')"
    >
      <Home :size="18" />
    </button>
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
  color: #7d8590;
  cursor: pointer;
  transition: all 0.2s ease;
}

.dock-item:hover {
  background: transparent;
  color: #e6edf3;
}

/* Active state - icon color only, no background */
.dock-item.active {
  background: transparent;
  border-color: transparent;
  color: #3fb950;
}

.dock-item.active:hover {
  background: transparent;
}

/* Toggle buttons styling */
.toggle-btn {
  color: #8b949e;
}

.toggle-btn.active {
  color: #3fb950;
  background: transparent;
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
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 5px 10px;
  box-shadow:
    0 4px 16px rgba(0, 0, 0, 0.2),
    0 0 0 1px rgba(255, 255, 255, 0.05) inset;
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

.nav-dock.pill-mode .dock-divider {
  height: 12px;
  margin: 0 3px;
  background-color: rgba(255, 255, 255, 0.1);
}
</style>
