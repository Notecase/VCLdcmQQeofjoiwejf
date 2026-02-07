<script setup lang="ts">
/**
 * HomePage - Starting page with AI chat, sidebar, and note preview panel
 *
 * Layout: SideBar + NavigationDock (left) | Chat panel (center) | NotePreviewPanel (right)
 * The center panel shows a hero state initially, then a message thread + composer.
 * The right panel slides in when AI creates/edits a note.
 */
import { ref, computed, nextTick, onMounted, watch } from 'vue'
import { useAIStore } from '@/stores/ai'
import { useEditorStore, useLayoutStore } from '@/stores'
import { useAIChat } from '@/services/ai.service'
import ChatMessage from '@/components/ai/ChatMessage.vue'
import ChatComposer from '@/components/ai/ChatComposer.vue'
import ChatHero from '@/components/ai/ChatHero.vue'
import ClarificationDialog from '@/components/ai/ClarificationDialog.vue'
import NotePreviewPanel from '@/components/ai/NotePreviewPanel.vue'
import SideBar from '@/components/layout/SideBar.vue'
import NavigationDock from '@/components/ui/NavigationDock.vue'
import { Loader2 } from 'lucide-vue-next'

const aiStore = useAIStore()
const editorStore = useEditorStore()
const layoutStore = useLayoutStore()
const { sendMessage, clearChat, isProcessing, error, clearError } = useAIChat()

const messagesEndRef = ref<HTMLDivElement | null>(null)

const messages = computed(() => aiStore.activeSession?.messages || [])
const hasMessages = computed(() => messages.value.length > 0)

// CSS variable for sidebar width (matches EditorView)
const sidebarWidthStyle = computed(() => ({
  '--sidebar-width': `${layoutStore.sidebarWidth}px`,
}))

function scrollToBottom() {
  nextTick(() => {
    messagesEndRef.value?.scrollIntoView({ behavior: 'smooth' })
  })
}

async function handleSubmit(value: string) {
  if (!value.trim() || isProcessing.value) return
  scrollToBottom()
  await sendMessage(value, 'secretary')
  scrollToBottom()
}

function handleNewSession() {
  clearChat()
}

function handleRecommendation(rec: { action: string; title: string }) {
  handleSubmit(`${rec.action}: ${rec.title}`)
}

watch(
  () => messages.value.length,
  () => scrollToBottom()
)

// Clarification handlers
async function handleClarificationSelect(blockIds: string[]) {
  const instruction = aiStore.pendingClarification?.instruction || ''
  const options = aiStore.pendingClarification?.options || []

  const selectedLineNumbers = options
    .filter(opt => blockIds.includes(opt.id))
    .map(opt => opt.line)

  aiStore.resolveClarification(blockIds)

  await sendMessage(instruction, 'secretary', {
    selectedBlockIds: blockIds,
    selectedLineNumbers,
  })
}

function handleClarificationCancel() {
  aiStore.cancelClarification()
}

onMounted(async () => {
  // Load documents for SideBar note tree
  await editorStore.loadDocuments()
})
</script>

<template>
  <div class="home-page">
    <!-- Left Area: Header + Sidebar + Chat -->
    <div class="left-area">
      <!-- Header with dock + actions -->
      <header class="home-header" :style="sidebarWidthStyle">
        <div class="dock-area">
          <NavigationDock :pill-mode="!layoutStore.sidebarVisible" />
        </div>

        <div class="header-actions">
          <div class="status-chip" :class="{ live: isProcessing }">
            <span class="status-dot"></span>
            {{ isProcessing ? 'Streaming' : 'Ready' }}
          </div>
          <button class="ghost-action" @click="handleNewSession">New session</button>
        </div>
      </header>

      <!-- Body: Sidebar + Chat Main -->
      <div class="home-body">
        <SideBar v-if="layoutStore.sidebarVisible" />

        <div class="chat-main">
          <!-- Scrollable chat area -->
          <div class="chat-scroll">
            <div class="chat-content">
              <ChatHero v-if="!hasMessages" @select="handleRecommendation" />

              <div class="chat-thread" :class="{ empty: !hasMessages }">
                <ChatMessage v-for="msg in messages" :key="msg.id" :message="msg" />

                <div v-if="isProcessing" class="stream-indicator">
                  <Loader2 :size="14" class="spin" />
                  <span>Streaming response...</span>
                </div>

                <div ref="messagesEndRef" />
              </div>
            </div>
          </div>

          <!-- Composer at bottom -->
          <ChatComposer
            :is-processing="isProcessing"
            @submit="handleSubmit"
          />
        </div>
      </div>
    </div>

    <!-- Right: Note Preview Panel (slides in when AI creates/edits a note) -->
    <Transition name="slide-right">
      <NotePreviewPanel v-if="aiStore.previewPanelVisible" />
    </Transition>

    <!-- Error banner -->
    <Transition name="slide-up">
      <div v-if="error" class="error-banner">
        <span>{{ error }}</span>
        <button @click="clearError">x</button>
      </div>
    </Transition>

    <!-- Clarification Dialog -->
    <ClarificationDialog
      v-if="aiStore.hasPendingClarification"
      :options="aiStore.pendingClarification?.options || []"
      :reason="aiStore.pendingClarification?.reason || ''"
      :is-visible="aiStore.hasPendingClarification"
      @select="handleClarificationSelect"
      @cancel="handleClarificationCancel"
    />
  </div>
</template>

<style scoped>
.home-page {
  display: flex;
  flex-direction: row;
  height: 100vh;
  width: 100vw;
  background: var(--app-bg, #0d1117);
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  overflow: hidden;
}

/* Left Area: Header + Body, fills available space */
.left-area {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  height: 100vh;
}

/* Header: Dock + Actions (matches EditorView pattern) */
.home-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  flex-shrink: 0;
  padding: 8px 16px 8px 0;
  background: var(--app-bg, #0d1117);
}

.dock-area {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--sidebar-width, 260px);
  flex-shrink: 0;
  transition: width 0.25s ease;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: auto;
}

.status-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.04);
  font-size: 12px;
  font-weight: 500;
  color: var(--text-color-secondary, #8b949e);
}

.status-chip.live {
  color: #3fb950;
  background: rgba(63, 185, 80, 0.1);
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
}

.ghost-action {
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid var(--border-color, #30363d);
  background: transparent;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-color, #e6edf3);
  cursor: pointer;
  transition: all 0.15s;
}

.ghost-action:hover {
  background: rgba(255, 255, 255, 0.06);
}

/* Body: Sidebar + Chat Main side by side */
.home-body {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* Chat Main: scroll area + composer */
.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

/* Scrollable chat area */
.chat-scroll {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

/* Centered content column */
.chat-content {
  max-width: 768px;
  margin: 0 auto;
  padding: 0 16px;
}

/* Chat thread */
.chat-thread {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding-bottom: 16px;
}

.chat-thread.empty {
  padding-top: 0;
}

.stream-indicator {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-color-secondary, #8b949e);
  padding: 8px 0;
}

/* Error banner */
.error-banner {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: rgba(248, 81, 73, 0.12);
  border: 1px solid rgba(248, 81, 73, 0.3);
  border-radius: 10px;
  color: #f85149;
  font-size: 13px;
  z-index: 10;
}

.error-banner button {
  background: none;
  border: none;
  color: inherit;
  font-size: 16px;
  cursor: pointer;
}

/* Animations */
.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Slide right transition for NotePreviewPanel */
.slide-right-enter-active,
.slide-right-leave-active {
  transition:
    transform 0.3s cubic-bezier(0.4, 0, 0.2, 1),
    opacity 0.3s ease;
}

.slide-right-enter-from,
.slide-right-leave-to {
  transform: translateX(100%);
  opacity: 0;
}

/* Slide up for error banner */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translate(-50%, 12px);
}
</style>
