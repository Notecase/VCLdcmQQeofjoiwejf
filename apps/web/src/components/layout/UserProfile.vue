<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  ChevronUp,
  Settings,
  LogOut,
  Moon,
  Sun,
  Monitor,
  User,
  MessageCircle,
  Trash2,
} from 'lucide-vue-next'
import { useAuthStore, usePreferencesStore } from '@/stores'
import { useCreditsStore } from '@/stores/credits'

const router = useRouter()
const authStore = useAuthStore()
const preferencesStore = usePreferencesStore()
const creditsStore = useCreditsStore()

const showUserMenu = ref(false)
const userMenuRef = ref<HTMLElement | null>(null)

const userDisplayName = computed(() => {
  if (!authStore.user) return 'Guest'
  return authStore.user.name || authStore.user.email?.split('@')[0] || 'User'
})

const userInitial = computed(() => {
  return userDisplayName.value.charAt(0).toUpperCase()
})

const currentTheme = computed(() => {
  const theme = preferencesStore.theme
  if (theme.includes('dark')) return 'dark'
  if (theme.includes('light')) return 'light'
  return 'system'
})

function setTheme(mode: 'light' | 'dark' | 'system') {
  if (mode === 'light') {
    preferencesStore.setTheme('light')
  } else if (mode === 'dark') {
    preferencesStore.setTheme('one-dark')
  } else {
    preferencesStore.setTheme('one-dark')
  }
}

function toggleUserMenu() {
  showUserMenu.value = !showUserMenu.value
}

function closeUserMenu() {
  showUserMenu.value = false
}

function handleClickOutside(e: MouseEvent) {
  if (showUserMenu.value && userMenuRef.value && !userMenuRef.value.contains(e.target as Node)) {
    showUserMenu.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside, true)
  creditsStore.fetchCredits()
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside, true)
})

function goToSettings() {
  closeUserMenu()
  router.push('/settings')
}

function goToAuth() {
  closeUserMenu()
  router.push('/auth')
}

async function signOut() {
  closeUserMenu()
  await authStore.signOut()
  router.push('/auth')
}
</script>

<template>
  <div
    ref="userMenuRef"
    class="user-section"
  >
    <button
      class="user-profile-btn"
      @click="toggleUserMenu"
    >
      <div class="user-avatar">
        <span>{{ userInitial }}</span>
      </div>
      <div class="user-info">
        <span class="user-name">{{ userDisplayName }}</span>
        <span
          v-if="!authStore.isAuthenticated"
          class="user-badge guest"
          >Guest</span
        >
        <span
          v-else
          class="user-badge"
          :class="{ studious: creditsStore.isActive }"
          >{{ creditsStore.planLabel }}</span
        >
      </div>
      <ChevronUp
        :size="16"
        class="expand-icon"
        :class="{ rotated: !showUserMenu }"
      />
    </button>

    <Transition name="slide-up">
      <div
        v-if="showUserMenu"
        class="user-menu"
        @click.stop
      >
        <div class="theme-toggle">
          <button
            :class="{ active: currentTheme === 'light' }"
            @click="setTheme('light')"
          >
            <Sun :size="14" />
            Light
          </button>
          <button
            :class="{ active: currentTheme === 'dark' }"
            @click="setTheme('dark')"
          >
            <Moon :size="14" />
            Dark
          </button>
          <button
            :class="{ active: currentTheme === 'system' }"
            @click="setTheme('system')"
          >
            <Monitor :size="14" />
            System
          </button>
        </div>

        <div class="menu-divider"></div>

        <button
          class="menu-item"
          @click="goToSettings"
        >
          <Settings :size="16" />
          <span>Settings</span>
          <span class="shortcut">⌘ .</span>
        </button>

        <button
          class="menu-item"
          @click="closeUserMenu"
        >
          <MessageCircle :size="16" />
          <span>Join Discord</span>
        </button>

        <button
          class="menu-item"
          @click="closeUserMenu"
        >
          <Trash2 :size="16" />
          <span>Trash</span>
        </button>

        <div class="menu-divider"></div>

        <template v-if="authStore.isAuthenticated">
          <button
            class="menu-item danger"
            @click="signOut"
          >
            <LogOut :size="16" />
            <span>Log out</span>
          </button>
        </template>
        <template v-else>
          <button
            class="menu-item primary"
            @click="goToAuth"
          >
            <User :size="16" />
            <span>Sign In</span>
          </button>
        </template>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.user-section {
  position: relative;
  padding: 8px 12px;
  border-top: none;
  margin-top: auto;
}

.user-profile-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  background: transparent;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
}

.user-profile-btn:hover {
  background: var(--hover-bg, rgba(255, 255, 255, 0.04));
}

.user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--sec-accent, #f59e0b), var(--sec-accent-dark, #d97706));
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.user-avatar span {
  font-size: 14px;
  font-weight: 600;
  color: white;
}

.user-info {
  flex: 1;
  text-align: left;
  min-width: 0;
}

.user-name {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-badge {
  display: inline-block;
  padding: 2px 6px;
  margin-top: 2px;
  font-size: 10px;
  font-weight: 500;
  color: var(--text-color-secondary, #8b949e);
  background: var(--editor-color-04, rgba(255, 255, 255, 0.04));
  border-radius: 4px;
}

.user-badge.guest {
  color: var(--text-color-secondary, #888);
}

.user-badge.studious {
  color: var(--sec-primary-light, #6ee7b7);
  background: var(--sec-primary-bg, rgba(16, 185, 129, 0.12));
}

.expand-icon {
  color: var(--text-color-secondary);
  transition: transform 0.2s;
}

.expand-icon.rotated {
  transform: rotate(180deg);
}

.user-menu {
  position: absolute;
  bottom: 100%;
  left: 12px;
  right: 12px;
  margin-bottom: 8px;
  background: var(--card-bg, #161b22);
  border: 1px solid var(--border-color, #30363d);
  border-radius: 12px;
  box-shadow: 0 8px 32px var(--glass-shadow, rgba(0, 0, 0, 0.4));
  padding: 8px;
  z-index: 100;
}

.theme-toggle {
  display: flex;
  background: var(--editor-color-04, rgba(22, 27, 34, 0.8));
  border-radius: 8px;
  padding: 4px;
  gap: 2px;
}

.theme-toggle button {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 8px 4px;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: var(--text-color-secondary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.theme-toggle button:hover {
  color: var(--text-color, #e6edf3);
}

.theme-toggle button.active {
  background: var(--hover-bg, rgba(255, 255, 255, 0.08));
  color: var(--text-color, #e6edf3);
  box-shadow: none;
}

.menu-divider {
  height: 1px;
  background: var(--border-color, #21262d);
  margin: 4px 8px;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: var(--text-color);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s;
}

.menu-item:hover {
  background: var(--hover-bg, rgba(255, 255, 255, 0.06));
}

.menu-item .shortcut {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-color-secondary, #8b949e);
  background: var(--editor-color-04, rgba(255, 255, 255, 0.04));
  padding: 2px 6px;
  border-radius: 4px;
}

.menu-item.danger {
  color: #ff6b6b;
}

.menu-item.danger:hover {
  background: rgba(255, 107, 107, 0.15);
}

.menu-item.primary {
  color: #58a6ff;
}

.menu-item.primary:hover {
  background: rgba(88, 166, 255, 0.15);
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.2s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
