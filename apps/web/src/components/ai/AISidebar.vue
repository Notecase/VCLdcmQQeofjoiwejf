<script setup lang="ts">
/**
 * AI Sidebar - Exact Note3 Design
 * 3-tab structure: Agent, Recommend, Settings
 * Features:
 * - Tab navigation
 * - Agent: Search knowledge base, Quick Commands (purple box)
 * - Recommend: billboard cards (Resources, Slides)
 * - Bottom input with @ Mention and attachments
 */
import { ref, computed } from 'vue'
import { useAIStore } from '@/stores/ai'
import { useAIChat } from '@/services/ai.service'
import { useEditorStore, useLayoutStore } from '@/stores'
import ChatMessage from './ChatMessage.vue'
import {
  Search, Maximize2, Minimize2, Plus, X, Loader2, Send,
  Paperclip, Globe, AtSign, ArrowUp, FileText
} from 'lucide-vue-next'

// Props
defineProps<{
  noteContext?: {
    id: string
    title: string
  }
}>()

// Store and composable
const store = useAIStore()
const editorStore = useEditorStore()
const layoutStore = useLayoutStore()
const { sendMessage, isProcessing } = useAIChat()

// Tab state
type TabId = 'agent' | 'recommend' | 'settings'
const activeTab = ref<TabId>('agent')

// Local state
const inputValue = ref('')
const searchQuery = ref('')

// Computed
const messages = computed(() => store.activeSession?.messages || [])
const activeNote = computed(() => editorStore.currentDocument)

// Quick Commands for Agent tab
const quickCommands = [
  { cmd: '/artifact', desc: 'Create live code' },
  { cmd: '/database', desc: 'Create table' },
  { cmd: '/tasks', desc: 'Create task list' },
  { cmd: '@NoteName', desc: 'Reference another note' }
]

// Recommendations for Recommend tab - matching Note3 design
const recommendations = [
  {
    id: 'mindmap',
    title: 'Generate Mindmap',
    badge: 'NEW',
    description: 'Visualize your study guide as an interactive mindmap. See connections between concepts and understand the big picture.',
    tags: ['Visual', 'Structure', 'Overview'],
    primaryAction: 'View',
    secondaryAction: 'Dismiss'
  },
  {
    id: 'advanced',
    title: 'Advanced Concepts',
    description: 'Explore advanced topics and related concepts. Each concept builds on your current understanding.',
    tags: ['Deep Dive', 'Learning', 'Theory'],
    primaryAction: 'View',
    secondaryAction: 'Dismiss'
  },
  {
    id: 'flashcards',
    title: 'Flashcards',
    description: 'Interactive flashcards to memorize key concepts and test your knowledge.',
    tags: ['Memory', 'Practice', 'Quiz'],
    primaryAction: 'Start',
    secondaryAction: 'Dismiss'
  }
]

const dismissedCards = ref<Set<string>>(new Set())
const activeCard = ref<string | null>(null)

function dismissCard(id: string) {
  dismissedCards.value.add(id)
}

const visibleRecommendations = computed(() => 
  recommendations.filter(r => !dismissedCards.value.has(r.id))
)

// Handle submit
async function handleSubmit() {
  if (!inputValue.value.trim() || isProcessing.value) return

  const msg = inputValue.value
  inputValue.value = ''

  await sendMessage(msg, 'secretary')
}

// Handle enter key
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSubmit()
  }
}

// Close sidebar
function closeSidebar() {
  layoutStore.toggleRightPanel()
}
</script>

<template>
  <aside class="ai-sidebar">
    <!-- Header with tabs -->
    <header class="sidebar-header">
      <nav class="sidebar-tabs">
        <button 
          class="tab-btn" 
          :class="{ active: activeTab === 'agent' }"
          @click="activeTab = 'agent'"
        >
          Agent
        </button>
        <button 
          class="tab-btn" 
          :class="{ active: activeTab === 'recommend' }"
          @click="activeTab = 'recommend'"
        >
          Recommend
        </button>
        <button 
          class="tab-btn" 
          :class="{ active: activeTab === 'settings' }"
          @click="activeTab = 'settings'"
        >
          Settings
        </button>
      </nav>
      <button class="expand-btn" @click="closeSidebar" title="Close">
        <Minimize2 :size="14" />
      </button>
    </header>

    <!-- Agent Tab -->
    <div v-if="activeTab === 'agent'" class="tab-content">
      <!-- New chat & Search row -->
      <div class="agent-search-row">
        <div class="new-chat-btn" title="New Chat">
          <Plus :size="14" />
        </div>
        <div class="search-input">
          <Search :size="14" />
          <input 
            v-model="searchQuery" 
            type="text" 
            placeholder="Search knowledge base..."
          />
        </div>
      </div>

      <!-- Messages or welcome -->
      <div class="messages-area">
        <template v-if="messages.length === 0">
          <!-- Welcome message -->
          <div class="welcome-section">
            <span class="ai-label">AI AGENT</span>
            <p class="welcome-text">
              Hi! I'm your AI assistant. I can help you understand your notes and answer questions about them.
            </p>
            <p class="welcome-text">
              Select a note from the sidebar and ask me anything about its content!
            </p>
          </div>

          <!-- Quick Commands - Box style matching Note3 -->
          <div class="quick-commands-box">
            <div class="commands-header">Quick Commands</div>
            <div class="commands-list">
              <div v-for="cmd in quickCommands" :key="cmd.cmd" class="command-row">
                <code class="command-code">{{ cmd.cmd }}</code>
                <span class="command-desc">{{ cmd.desc }}</span>
              </div>
            </div>
          </div>
        </template>

        <!-- Chat messages -->
        <template v-else>
          <ChatMessage
            v-for="msg in messages"
            :key="msg.id"
            :message="msg"
          />
        </template>

        <!-- Loading -->
        <div v-if="isProcessing" class="loading-indicator">
          <Loader2 :size="14" class="spin" />
          <span>Thinking...</span>
        </div>
      </div>
    </div>

    <!-- Recommend Tab -->
    <div v-else-if="activeTab === 'recommend'" class="tab-content recommend-tab">
      <!-- Context Indicator -->
      <div class="context-indicator" v-if="!activeNote">
        <span class="radio-dot"></span>
        <span>Select a note to get recommendations</span>
      </div>

      <!-- Recommendations List -->
      <div class="recommendations-list">
        <div
          v-for="rec in visibleRecommendations"
          :key="rec.id"
          class="recommendation-card"
        >
          <div class="card-header">
            <span class="card-title">{{ rec.title }}</span>
            <span v-if="rec.badge" class="card-badge" :class="rec.badge.toLowerCase()">{{ rec.badge }}</span>
          </div>

          <p class="card-desc">{{ rec.description }}</p>

          <div class="card-tags">
            <span v-for="tag in rec.tags" :key="tag" class="card-tag">
              {{ tag }}
            </span>
          </div>

          <div class="card-actions">
            <button class="action-btn primary">{{ rec.primaryAction }}</button>
            <button class="action-btn secondary" @click="dismissCard(rec.id)">
              {{ rec.secondaryAction }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Settings Tab -->
    <div v-else-if="activeTab === 'settings'" class="tab-content">
      <div class="settings-placeholder">
        <p>Settings coming soon...</p>
      </div>
    </div>

    <!-- Bottom Input Area -->
    <div class="ai-input-wrapper">
      <div class="ai-input-box">
        <!-- Note Context Inside Input Box -->
        <div class="input-context" v-if="activeNote">
          <FileText :size="12" class="context-icon" />
          <span class="context-title">{{ activeNote.title }}</span>
        </div>

        <div class="input-area">
          <textarea
            v-model="inputValue"
            :placeholder="activeNote ? 'Ask about this note... (@ to reference)' : 'What\'s on your mind?'"
            :disabled="isProcessing"
            @keydown="handleKeydown"
            rows="1"
          />
        </div>

        <div class="input-footer">
          <div class="footer-left">
            <button class="footer-btn" title="Attach">
              <Paperclip :size="14" />
            </button>
            <button class="footer-btn labeled">
              <Globe :size="14" />
              <span>Search</span>
            </button>
            <button class="footer-btn labeled">
              <AtSign :size="14" />
              <span>Mention</span>
            </button>
          </div>

          <button
            class="send-cirle-btn"
            :class="{ active: inputValue.trim() }"
            :disabled="!inputValue.trim() || isProcessing"
            @click="handleSubmit"
          >
            <ArrowUp v-if="!isProcessing" :size="16" />
            <Loader2 v-else :size="16" class="spin" />
          </button>
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
/* ============================================
 * AI SIDEBAR - Theme-aware using CSS variables
 * Supports light and dark themes
 * ============================================ */

/* Sidebar container */
.ai-sidebar {
  width: 360px;
  height: 100%;
  background: var(--ai-sidebar-bg);
  border-left: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

/* Header with glassmorphism */
.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  border-bottom: 1px solid var(--border-color);
  background: var(--ai-header-bg);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  height: 48px;
}

.sidebar-tabs {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 16px;
  flex: 1;
}

.tab-btn {
  height: 100%;
  background: none;
  border: none;
  color: var(--ai-tab-color);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  position: relative;
  transition: color 0.15s ease;
  padding: 0;
}

.tab-btn:hover {
  color: var(--ai-tab-active);
}

.tab-btn.active {
  color: var(--ai-tab-active);
}

/* Active tab indicator */
.tab-btn.active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--primary-color);
  border-radius: 2px 2px 0 0;
}

.expand-btn {
  padding: 6px;
  background: none;
  border: none;
  color: var(--ai-tab-color);
  cursor: pointer;
  border-radius: 4px;
}

.expand-btn:hover {
  color: var(--ai-tab-active);
  background: var(--hover-bg);
}

/* Content Area */
.tab-content {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  padding: 32px 20px 16px;
}

/* Agent Tab specific */
.agent-search-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 24px;
}

.new-chat-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ai-tab-color);
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.2s;
}

.new-chat-btn:hover {
  background: var(--hover-bg);
  color: var(--ai-tab-active);
}

.search-input {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--ai-input-bg);
  border: 1px solid var(--ai-input-border);
  border-radius: 8px;
  padding: 6px 12px;
  color: var(--ai-tab-color);
  transition: border-color 0.2s, box-shadow 0.2s;
}

.search-input:focus-within {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px var(--ai-input-focus);
}

.search-input input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  color: var(--text-color);
  font-size: 13px;
}

.search-input input::placeholder {
  color: var(--text-color-secondary);
}

/* Welcome Area */
.welcome-section {
  margin-bottom: 24px;
}

.ai-label {
  display: block;
  font-size: 10px;
  font-weight: 600;
  color: var(--text-color-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 8px;
}

.welcome-text {
  font-size: 13px;
  color: var(--text-color-secondary);
  line-height: 1.5;
  margin-bottom: 10px;
}

/* Quick Commands Box */
.quick-commands-box {
  background: var(--ai-card-bg);
  border: 1px solid var(--ai-card-border);
  border-radius: 10px;
  padding: 12px 14px;
  margin: 12px 0;
  box-shadow: var(--ai-card-shadow);
}

.commands-header {
  font-size: 10px;
  font-weight: 600;
  color: var(--ai-cmd-header);
  margin-bottom: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.commands-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}

.command-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.command-code {
  font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace;
  font-size: 11px;
  color: var(--text-color);
  background: var(--ai-cmd-bg);
  padding: 3px 8px;
  border-radius: 4px;
  min-width: 80px;
}

.command-desc {
  font-size: 11px;
  color: var(--text-color);
}

/* Recommend Tab */
.recommend-tab {
  padding: 16px;
}

.context-indicator {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  margin-bottom: 20px;
  border-bottom: none;
}

.radio-dot {
  width: 14px;
  height: 14px;
  border: 2px solid var(--border-color);
  border-radius: 50%;
  background: transparent;
}

.context-indicator span:last-child {
  font-size: 13px;
  color: var(--text-color-secondary);
}

/* Recommendations List */
.recommendations-list {
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.recommendation-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--ai-card-bg);
  border: 1px solid var(--ai-card-border);
  border-radius: 12px;
  padding: 16px;
  text-align: left;
  box-shadow: var(--ai-card-shadow);
  transition: box-shadow 0.2s, transform 0.2s;
}

.recommendation-card:hover {
  transform: translateY(-2px);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
}

.card-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
}

.card-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.card-badge.new {
  background: rgba(34, 197, 94, 0.15);
  color: #16A34A;
}

.card-badge.update {
  background: rgba(124, 158, 248, 0.15);
  color: var(--primary-color);
}

.card-desc {
  font-size: 13px;
  color: var(--text-color-secondary);
  line-height: 1.5;
  text-align: left;
}

.card-tags {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-start;
  gap: 8px;
  margin-top: 4px;
}

.card-tag {
  font-size: 12px;
  color: var(--text-color-secondary);
  background: var(--hover-bg);
  padding: 4px 12px;
  border-radius: 16px;
  border: none;
}

.card-actions {
  display: flex;
  justify-content: flex-start;
  gap: 16px;
  margin-top: 8px;
}

.action-btn {
  padding: 0;
  border-radius: 0;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  border: none;
  background: transparent;
}

.action-btn.primary {
  color: var(--primary-color);
}

.action-btn.primary:hover {
  opacity: 0.8;
}

.action-btn.secondary {
  color: var(--text-color-secondary);
}

.action-btn.secondary:hover {
  color: var(--text-color);
}

/* Settings placeholder */
.settings-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-color-secondary);
}

/* Input Area - Bottom Fixed */
.ai-input-wrapper {
  padding: 16px;
  background: var(--ai-sidebar-bg);
}

/* Note Context Indicator - Inside input box */
.input-context {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 2px;
}

.context-icon {
  color: var(--primary-color);
  flex-shrink: 0;
}

.context-title {
  font-size: 13px;
  color: var(--text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.input-area textarea {
  width: 100%;
  background: none;
  border: none;
  outline: none;
  color: var(--text-color);
  font-size: 14px;
  resize: none;
  min-height: 24px;
  font-family: inherit;
  line-height: 1.5;
}

.input-area textarea::placeholder {
  color: var(--text-color-secondary);
}

.ai-input-box {
  background: var(--ai-input-bg);
  border: 1px solid var(--ai-input-border);
  border-radius: 12px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.ai-input-box:focus-within {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px var(--ai-input-focus);
}

.input-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.footer-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.footer-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ai-tab-color);
  background: none;
  border: none;
  padding: 4px;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s;
}

.footer-btn:hover {
  color: var(--ai-tab-active);
  background: var(--hover-bg);
}

.footer-btn.labeled {
  gap: 6px;
  padding: 4px 8px;
  font-size: 12px;
}

.send-cirle-btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--ai-send-bg);
  color: var(--text-color-secondary);
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: not-allowed;
  transition: all 0.2s;
}

.send-cirle-btn.active {
  background: var(--ai-send-active-bg);
  color: var(--ai-send-active-color);
  cursor: pointer;
}

.send-cirle-btn.active:hover {
  opacity: 0.9;
}

/* Loading indicator */
.loading-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-color-secondary);
  font-size: 13px;
  padding: 12px 0;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Scrollbar styling */
.tab-content::-webkit-scrollbar {
  width: 6px;
}
.tab-content::-webkit-scrollbar-track {
  background: transparent;
}
.tab-content::-webkit-scrollbar-thumb {
  background: var(--ai-scrollbar-thumb);
  border-radius: 3px;
}
</style>
