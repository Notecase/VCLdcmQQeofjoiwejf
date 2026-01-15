<script setup lang="ts">
import { computed } from 'vue'
import { useEditorStore, usePreferencesStore, useAuthStore } from '@/stores'
import { useRouter } from 'vue-router'

const router = useRouter()
const editorStore = useEditorStore()
const preferencesStore = usePreferencesStore()
const authStore = useAuthStore()

const currentTitle = computed(() => editorStore.currentDocument?.title || 'MarkText')
const isSaved = computed(() => editorStore.activeTab?.isSaved ?? true)

const wordCount = computed(() => {
  const wc = editorStore.wordCount
  return `${wc.words} words, ${wc.characters} characters`
})

async function saveDocument() {
  await editorStore.saveDocument()
}

function toggleTheme() {
  const themes = ['one-dark', 'dark', 'light', 'material-dark'] as const
  const currentIndex = themes.indexOf(preferencesStore.theme as typeof themes[number])
  const nextTheme = themes[(currentIndex + 1) % themes.length]
  preferencesStore.setTheme(nextTheme as any)
}

function goToAuth() {
  router.push('/auth')
}

async function signOut() {
  await authStore.signOut()
}
</script>

<template>
  <header class="title-bar">
    <div class="title-section">
      <span class="document-title">{{ currentTitle }}</span>
      <span v-if="!isSaved" class="unsaved-indicator">•</span>
    </div>

    <div class="tabs-section">
      <div
        v-for="tab in editorStore.tabs"
        :key="tab.id"
        class="tab"
        :class="{ active: tab.id === editorStore.activeTabId }"
        @click="editorStore.switchTab(tab.id)"
      >
        <span class="tab-title">{{ tab.document.title }}</span>
        <span v-if="!tab.isSaved" class="tab-unsaved">•</span>
        <button class="tab-close" @click.stop="editorStore.closeTab(tab.id)">×</button>
      </div>
    </div>

    <div class="actions-section">
      <span class="word-count">{{ wordCount }}</span>
      
      <button
        class="action-btn"
        :disabled="isSaved || editorStore.isSaving"
        @click="saveDocument"
        title="Save"
      >
        💾
      </button>
      
      <button class="action-btn" @click="toggleTheme" title="Toggle Theme">
        🎨
      </button>

      <div class="user-menu">
        <template v-if="authStore.isAuthenticated">
          <span class="user-email">{{ authStore.user?.email }}</span>
          <button class="action-btn" @click="signOut">Sign Out</button>
        </template>
        <template v-else>
          <button class="action-btn" @click="goToAuth">Sign In</button>
        </template>
      </div>
    </div>
  </header>
</template>

<style scoped>
.title-bar {
  height: 40px;
  display: flex;
  align-items: center;
  padding: 0 16px;
  background: var(--sidebar-bg);
  border-bottom: 1px solid var(--border-color);
  gap: 16px;
  user-select: none;
  -webkit-app-region: drag;
}

.title-section {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 150px;
}

.document-title {
  font-weight: 500;
  font-size: 14px;
}

.unsaved-indicator {
  color: var(--primary-color);
  font-size: 20px;
  line-height: 1;
}

.tabs-section {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 4px;
  overflow-x: auto;
  -webkit-app-region: no-drag;
}

.tab {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
  font-size: 13px;
  
  &:hover {
    background: var(--bg-color);
  }
  
  &.active {
    background: var(--editor-bg);
  }
}

.tab-title {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tab-unsaved {
  color: var(--primary-color);
  font-size: 16px;
}

.tab-close {
  width: 16px;
  height: 16px;
  border: none;
  background: transparent;
  color: var(--text-color-secondary);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  
  &:hover {
    background: var(--border-color);
    color: var(--text-color);
  }
}

.actions-section {
  display: flex;
  align-items: center;
  gap: 8px;
  -webkit-app-region: no-drag;
}

.word-count {
  font-size: 12px;
  color: var(--text-color-secondary);
  padding: 0 8px;
}

.action-btn {
  padding: 4px 8px;
  background: transparent;
  border: none;
  color: var(--text-color);
  border-radius: 4px;
  font-size: 13px;
  
  &:hover:not(:disabled) {
    background: var(--border-color);
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.user-menu {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 8px;
  padding-left: 8px;
  border-left: 1px solid var(--border-color);
}

.user-email {
  font-size: 12px;
  color: var(--text-color-secondary);
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
