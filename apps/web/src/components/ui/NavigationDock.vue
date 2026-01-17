<script setup lang="ts">
/**
 * Navigation Dock - Exact Note3 Horizontal Dock
 * Matches the Note3 desktop design exactly
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
  Home 
} from 'lucide-vue-next'

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
  <nav class="nav-dock">
    <!-- Left Sidebar Toggle -->
    <button 
      class="dock-item toggle-btn"
      :class="{ active: layoutStore.isSidebarVisible }"
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
      :class="{ active: layoutStore.isRightPanelVisible }"
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
  gap: 4px;
  padding: 12px 16px;
  background: transparent;
  border: none;
}

.dock-item {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  color: #7d8590;
  cursor: pointer;
  transition: all 0.2s ease;
}

.dock-item:hover {
  background: var(--floatHoverColor, rgba(255, 255, 255, 0.08));
  color: #e6edf3;
}

/* Active state - green accent */
.dock-item.active {
  background: rgba(63, 185, 80, 0.15);
  border-color: rgba(63, 185, 80, 0.4);
  color: #3fb950;
}

.dock-item.active:hover {
  background: rgba(63, 185, 80, 0.2);
}

/* Toggle buttons styling */
.toggle-btn {
  color: #8b949e;
}

.toggle-btn.active {
  color: #3fb950;
  background: rgba(63, 185, 80, 0.15);
  border-color: rgba(63, 185, 80, 0.4);
}

/* Divider */
.dock-divider {
  width: 1px;
  height: 16px;
  background-color: var(--border-color, #30363d);
  margin: 0 6px;
}
</style>
