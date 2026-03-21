<script setup lang="ts">
/**
 * AI Sidebar - Note3 Design with Full Feature Integration
 *
 * 3-tab structure: Agent, Recommend, Workflows
 * Features:
 * - Tab navigation with blue underline
 * - Agent: Search knowledge base, Quick Commands, Chat
 * - Recommend: AI-generated content cards with modals
 * - Workflows: Template-based content generation
 * - Bottom input with @ Mention and attachments
 */
import { ref, computed, watch, onUnmounted } from 'vue'
import { useAIStore } from '@/stores/ai'
import { useRecommendationsStore } from '@/stores/recommendations'
import { useAIChat } from '@/services/ai.service'
import { useEditorStore, useLayoutStore } from '@/stores'
import ChatMessage from './ChatMessage.vue'
import RecommendTab from './RecommendTab.vue'
import WorkflowsTab from './WorkflowsTab.vue'
import LearningResourcesTab from './LearningResourcesTab.vue'
import ClarificationDialog from './ClarificationDialog.vue'
import PreActionQuestionCard from './PreActionQuestionCard.vue'

// Modal components
import MindmapModal from './modals/MindmapModal.vue'
import FlashcardsModal from './modals/FlashcardsModal.vue'
import ConceptsModal from './modals/ConceptsModal.vue'
import ExercisesModal from './modals/ExercisesModal.vue'
import ResourcesModal from './modals/ResourcesModal.vue'
import SlidesModal from './modals/SlidesModal.vue'

import {
  Search,
  Minimize2,
  Plus,
  Loader2,
  ArrowUp,
  FileText,
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
const recommendStore = useRecommendationsStore()
const editorStore = useEditorStore()
const layoutStore = useLayoutStore()
const { sendMessage, isProcessing } = useAIChat()

// Tab state
type TabId = 'agent' | 'recommend' | 'workflows' | 'resources'
const activeTab = ref<TabId>('agent')

// Resize functionality
const sidebarRef = ref<HTMLElement | null>(null)
const isResizing = ref(false)

function startResize(e: MouseEvent) {
  e.preventDefault()
  isResizing.value = true
  document.addEventListener('mousemove', onResize)
  document.addEventListener('mouseup', stopResize)
  document.body.style.cursor = 'ew-resize'
  document.body.style.userSelect = 'none'
}

function onResize(e: MouseEvent) {
  if (!isResizing.value || !sidebarRef.value) return
  const newWidth = window.innerWidth - e.clientX
  if (newWidth >= 260 && newWidth <= 500) {
    sidebarRef.value.style.width = `${newWidth}px`
  }
}

function stopResize() {
  isResizing.value = false
  document.removeEventListener('mousemove', onResize)
  document.removeEventListener('mouseup', stopResize)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

onUnmounted(() => {
  document.removeEventListener('mousemove', onResize)
  document.removeEventListener('mouseup', stopResize)
})

// Local state
const inputValue = ref('')
// Computed
const messages = computed(() => store.activeSession?.messages || [])
const activeNote = computed(() => editorStore.currentDocument)
const error = computed(() => store.error)

// Watch for note changes and update recommendation store
watch(
  () => activeNote.value?.id,
  (id) => {
    if (id) {
      recommendStore.setCurrentNote(id)
    }
  }
)

// Quick Commands for Agent tab
const quickCommands = [
  { cmd: '/artifact', desc: 'Create live code' },
  { cmd: '/database', desc: 'Create table' },
  { cmd: '/tasks', desc: 'Create task list' },
  { cmd: '@NoteName', desc: 'Reference another note' },
]

// Handle submit
async function handleSubmit() {
  if (!inputValue.value.trim() || isProcessing) return

  const msg = inputValue.value
  inputValue.value = ''

  // Pass current note context so the AI can read the note content
  const context = activeNote.value
    ? {
        currentNoteId: activeNote.value.id,
      }
    : undefined

  await sendMessage(msg, 'secretary', context)
}

// Handle enter key
function handleKeydown(e: globalThis.KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSubmit()
  }
}

// Handle pre-action question responses
function handleQuestionSelect(optionLabel: string) {
  store.resolvePreActionQuestion()
  // Send the user's selection as a follow-up message to continue the AI flow
  const context = activeNote.value ? { currentNoteId: activeNote.value.id } : undefined
  sendMessage(optionLabel, 'secretary', context)
}

function handleQuestionFreeText(text: string) {
  store.resolvePreActionQuestion()
  const context = activeNote.value ? { currentNoteId: activeNote.value.id } : undefined
  sendMessage(text, 'secretary', context)
}

function handleQuestionSkip() {
  store.resolvePreActionQuestion()
  const context = activeNote.value ? { currentNoteId: activeNote.value.id } : undefined
  sendMessage('Skip — proceed with your best judgment', 'secretary', context)
}

// Close sidebar
function closeSidebar() {
  layoutStore.toggleRightPanel()
}

// Modal handlers
function closeModal() {
  recommendStore.closeModal()
}

// eslint-disable-next-line no-unused-vars
function handleAddToNote(_content: string) {
  // TODO: Integrate with editor to add content
  closeModal()
}

// Clarification handlers
async function handleClarificationSelect(blockIds: string[]) {
  const instruction = store.pendingClarification?.instruction || ''
  const options = store.pendingClarification?.options || []

  // Extract line numbers from the selected options for stable matching
  // Line numbers remain consistent even when the document is re-parsed
  const selectedLineNumbers = options
    .filter((opt) => blockIds.includes(opt.id))
    .map((opt) => opt.line)

  store.resolveClarification(blockIds)

  // Re-send with both blockIds (for backward compat) and lineNumbers (for stable matching)
  const context = activeNote.value
    ? {
        currentNoteId: activeNote.value.id,
        selectedBlockIds: blockIds,
        selectedLineNumbers,
      }
    : undefined
  await sendMessage(instruction, 'secretary', context)
}

function handleClarificationCancel() {
  store.cancelClarification()
}
</script>

<template>
  <aside
    ref="sidebarRef"
    class="ai-sidebar"
  >
    <!-- Resize Handle -->
    <div
      class="resize-handle"
      :class="{ active: isResizing }"
      @mousedown="startResize"
    />

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
          :class="{ active: activeTab === 'workflows' }"
          @click="activeTab = 'workflows'"
        >
          Workflows
        </button>
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'resources' }"
          @click="activeTab = 'resources'"
        >
          Resources
        </button>
      </nav>
      <button
        class="expand-btn"
        title="Close"
        @click="closeSidebar"
      >
        <Minimize2 :size="14" />
      </button>
    </header>

    <!-- Agent Tab -->
    <div
      v-if="activeTab === 'agent'"
      class="tab-content"
    >
      <!-- New chat & Search row -->
      <div class="agent-search-row">
        <div
          class="new-chat-btn"
          title="New Chat"
        >
          <Plus :size="14" />
        </div>
        <div class="search-input">
          <Search :size="14" />
          <input
            type="text"
            placeholder="Search knowledge base..."
          />
        </div>
      </div>

      <!-- Error state -->
      <div
        v-if="error"
        class="error-banner"
      >
        <div class="error-content">
          <span class="error-icon">!</span>
          <div class="error-text">
            <span class="error-title">Connection Error</span>
            <span class="error-message">{{ error }}</span>
          </div>
        </div>
        <button
          class="error-dismiss"
          @click="store.clearError()"
        >
          Dismiss
        </button>
      </div>

      <!-- Messages or welcome -->
      <div class="messages-area">
        <template v-if="messages.length === 0">
          <!-- Welcome message - simplified -->
          <div class="welcome-section">
            <p class="welcome-text">
              Ask me anything about your notes. I can help you understand, summarize, or expand on
              your content.
            </p>
          </div>

          <!-- Quick Commands -->
          <div class="quick-commands-box">
            <div class="commands-header">Quick Commands</div>
            <div class="commands-list">
              <div
                v-for="cmd in quickCommands"
                :key="cmd.cmd"
                class="command-row"
              >
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

        <!-- Pre-action question card (HITL) -->
        <PreActionQuestionCard
          v-if="store.preActionQuestion"
          :question="store.preActionQuestion"
          @select="handleQuestionSelect"
          @free-text="handleQuestionFreeText"
          @skip="handleQuestionSkip"
        />

        <!-- Loading -->
        <div
          v-if="isProcessing"
          class="loading-indicator"
        >
          <Loader2
            :size="14"
            class="spin"
          />
          <span>Thinking...</span>
        </div>
      </div>
    </div>

    <!-- Recommend Tab -->
    <div
      v-else-if="activeTab === 'recommend'"
      class="tab-content tab-content-no-padding"
    >
      <RecommendTab />
    </div>

    <!-- Workflows Tab -->
    <div
      v-else-if="activeTab === 'workflows'"
      class="tab-content tab-content-no-padding"
    >
      <WorkflowsTab />
    </div>

    <!-- Learning Resources Tab -->
    <div
      v-else-if="activeTab === 'resources'"
      class="tab-content tab-content-no-padding"
    >
      <LearningResourcesTab />
    </div>

    <!-- Bottom Input Area -->
    <div class="ai-input-wrapper">
      <div class="ai-input-box">
        <!-- Note Context Inside Input Box -->
        <div
          v-if="activeNote"
          class="input-context"
        >
          <FileText
            :size="12"
            class="context-icon"
          />
          <span class="context-title">{{ activeNote.title }}</span>
        </div>

        <div class="input-area">
          <textarea
            v-model="inputValue"
            :placeholder="
              activeNote ? 'Ask about this note... (@ to reference)' : 'What\'s on your mind?'
            "
            :disabled="isProcessing"
            rows="1"
            @keydown="handleKeydown"
          />
        </div>

        <div class="input-footer">
          <div class="footer-left"></div>

          <button
            class="send-cirle-btn"
            :class="{ active: inputValue.trim() }"
            :disabled="!inputValue.trim() || isProcessing"
            @click="handleSubmit"
          >
            <ArrowUp
              v-if="!isProcessing"
              :size="16"
            />
            <Loader2
              v-else
              :size="16"
              class="spin"
            />
          </button>
        </div>
      </div>
    </div>

    <!-- Clarification Dialog -->
    <ClarificationDialog
      v-if="store.hasPendingClarification"
      :options="store.pendingClarification?.options || []"
      :reason="store.pendingClarification?.reason || ''"
      :is-visible="store.hasPendingClarification"
      @select="handleClarificationSelect"
      @cancel="handleClarificationCancel"
    />

    <!-- Modals -->
    <MindmapModal
      v-if="recommendStore.activeModal === 'mindmap'"
      @close="closeModal"
      @add-to-note="handleAddToNote"
    />
    <FlashcardsModal
      v-if="recommendStore.activeModal === 'flashcards'"
      @close="closeModal"
    />
    <ConceptsModal
      v-if="recommendStore.activeModal === 'concepts'"
      @close="closeModal"
    />
    <ExercisesModal
      v-if="recommendStore.activeModal === 'exercises'"
      @close="closeModal"
    />
    <ResourcesModal
      v-if="recommendStore.activeModal === 'resources'"
      @close="closeModal"
    />
    <SlidesModal
      v-if="recommendStore.activeModal === 'slides'"
      @close="closeModal"
    />
  </aside>
</template>

<style scoped>
/* ============================================
 * AI SIDEBAR - Note3 Design
 * Neutral dark backgrounds with blue accents
 * ============================================ */

/* Sidebar container - Docked mode with shadow instead of border */
.ai-sidebar {
  width: 320px;
  min-width: 260px;
  max-width: 500px;
  height: 100%;
  position: relative;
  background: var(--ai-sidebar-bg);
  border-left: none;
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.12);
  display: flex;
  flex-direction: column;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

/* Subtle blue gradient overlay */
.ai-sidebar::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 50%;
  background: var(--ai-gradient-overlay);
  pointer-events: none;
  z-index: 0;
}

/* Resize handle */
.resize-handle {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  cursor: ew-resize;
  background: transparent;
  z-index: 200;
  transition: background 0.15s ease;
}

.resize-handle:hover,
.resize-handle.active {
  background: var(--primary-color);
  opacity: 0.4;
}

/* Header with glassmorphism */
.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  border-bottom: 1px solid var(--ai-divider);
  background: var(--ai-header-bg);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  height: 44px;
  position: relative;
  z-index: 1;
}

.sidebar-tabs {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 12px;
  flex: 1;
}

.tab-btn {
  height: 100%;
  background: none;
  border: none;
  color: var(--ai-tab-color);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  position: relative;
  transition: color 0.15s ease;
  padding: 0;
}

.tab-btn:hover {
  color: var(--text-color, #c9d1d9);
}

.tab-btn.active {
  color: var(--ai-tab-active, #ffffff);
}

/* Simple underline */
.tab-btn.active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--primary-color, #58a6ff);
  border-radius: 0;
}

.expand-btn {
  padding: 6px;
  background: none;
  border: none;
  color: var(--text-color-secondary, #6e7681);
  cursor: pointer;
  border-radius: 4px;
}

.expand-btn:hover {
  color: var(--primary-color, #58a6ff);
  background: var(--hover-bg, #21262d);
}

/* Content Area */
.tab-content {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  padding: 24px 16px 12px;
  position: relative;
  z-index: 1;
}

.tab-content-no-padding {
  padding: 0;
}

/* Agent Tab specific */
.agent-search-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 20px;
}

.new-chat-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-color-secondary, #6e7681);
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.2s;
}

.new-chat-btn:hover {
  background: var(--hover-bg, #21262d);
  color: var(--primary-color, #58a6ff);
}

/* Search Input - 60% opacity per spec */
.search-input {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--glass-bg, rgba(22, 27, 34, 0.6));
  border: 1px solid var(--border-color, #30363d);
  border-radius: 8px;
  padding: 6px 10px;
  color: var(--text-color-secondary, #6e7681);
  transition: border-color 0.2s;
}

.search-input:focus-within {
  border-color: var(--primary-color, rgba(48, 54, 61, 0.7));
}

.search-input input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  color: var(--text-color, #e6edf3);
  font-size: 13px;
}

.search-input input::placeholder {
  color: var(--text-color-secondary, #6e7681);
}

/* Error Banner */
.error-banner {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  margin-bottom: 12px;
  background: rgba(248, 81, 73, 0.1);
  border: 1px solid rgba(248, 81, 73, 0.3);
  border-radius: 8px;
}

.error-content {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.error-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  background: #f85149;
  color: white;
  font-size: 11px;
  font-weight: 700;
  border-radius: 50%;
  flex-shrink: 0;
}

.error-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.error-title {
  font-size: 12px;
  font-weight: 600;
  color: #f85149;
}

.error-message {
  font-size: 11px;
  color: #ffa198;
  word-break: break-word;
}

.error-dismiss {
  padding: 4px 8px;
  font-size: 10px;
  color: var(--text-color-secondary, #8b949e);
  background: none;
  border: 1px solid var(--border-color, #30363d);
  border-radius: 4px;
  cursor: pointer;
  flex-shrink: 0;
}

.error-dismiss:hover {
  color: var(--text-color, #e6edf3);
  background: var(--hover-bg, #21262d);
}

/* Messages Area */
.messages-area {
  flex: 1;
  overflow-y: auto;
}

/* Welcome Area */
.welcome-section {
  margin-bottom: 16px;
  padding: 12px;
  background: var(--glass-bg, rgba(22, 27, 34, 0.5));
  border-radius: 8px;
  border: 1px solid var(--glass-border, rgba(48, 54, 61, 0.4));
}

.welcome-text {
  font-size: 13px;
  color: var(--text-color-secondary, #8b949e);
  line-height: 1.5;
  margin: 0;
}

/* Quick Commands Box - Semi-transparent to blend with gradient */
.quick-commands-box {
  background: var(--glass-bg, rgba(22, 27, 34, 0.7));
  border: 1px solid var(--glass-border, rgba(48, 54, 61, 0.6));
  border-radius: 10px;
  padding: 10px 12px;
  margin: 12px 0;
}

.commands-header {
  font-size: 10px;
  font-weight: 600;
  color: var(--primary-color, #58a6ff);
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
  font-family:
    ui-monospace,
    SFMono-Regular,
    SF Mono,
    Menlo,
    Consolas,
    Liberation Mono,
    monospace;
  font-size: 11px;
  color: var(--text-color, #e6edf3);
  background: var(--bg-color, #0d1117);
  padding: 3px 8px;
  border-radius: 4px;
  min-width: 80px;
}

.command-desc {
  font-size: 11px;
  color: var(--text-color, #e6edf3);
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
  gap: 20px;
}

.recommendation-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--ai-card-bg);
  border: 1px solid var(--ai-card-border);
  border-radius: 12px;
  padding: 12px;
  text-align: left;
  box-shadow: var(--ai-card-shadow);
  transition:
    transform 0.2s,
    box-shadow 0.3s;
}

.recommendation-card:hover {
  transform: translateY(-2px);
  box-shadow:
    0 6px 20px rgba(0, 0, 0, 0.35),
    0 0 0 1px rgba(124, 158, 248, 0.15);
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
  color: #16a34a;
}

.card-badge.update {
  background: rgba(124, 158, 248, 0.15);
  color: var(--primary-color);
}

.card-desc {
  font-size: 12px;
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
  padding: 12px;
  background: var(--ai-sidebar-bg);
  position: relative;
  z-index: 1;
}

/* Note Context Indicator - Inside input box */
.input-context {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 2px;
}

.context-icon {
  color: var(--primary-color, #58a6ff);
  flex-shrink: 0;
}

.context-title {
  font-size: 13px;
  color: var(--text-color-secondary, #8b949e);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.input-area textarea {
  width: 100%;
  background: none;
  border: none;
  outline: none;
  color: var(--text-color, #e6edf3);
  font-size: 14px;
  resize: none;
  min-height: 24px;
  font-family: inherit;
  line-height: 1.5;
}

.input-area textarea::placeholder {
  color: var(--text-color-secondary, #6e7681);
}

/* Input Box - Glass morphism effect */
.ai-input-box {
  background: var(--glass-bg, rgba(22, 27, 34, 0.65));
  backdrop-filter: blur(12px) saturate(180%);
  -webkit-backdrop-filter: blur(12px) saturate(180%);
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.04));
  border-radius: 12px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-shadow: 0 -4px 20px var(--glass-shadow, rgba(0, 0, 0, 0.1));
  transition: border-color 0.2s;
}

.ai-input-box:focus-within {
  border-color: rgba(88, 166, 255, 0.15);
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

/* Send Button - GREEN when active */
.send-cirle-btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--editor-color-10, #21262d);
  color: var(--text-color-secondary, #6e7681);
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: not-allowed;
  transition: all 0.2s;
}

.send-cirle-btn.active {
  background: var(--primary-gradient);
  color: white;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
}

.send-cirle-btn.active:hover {
  opacity: 0.95;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
}

/* Loading indicator */
.loading-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-color-secondary, #8b949e);
  font-size: 13px;
  padding: 12px 0;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Scrollbar styling */
.tab-content::-webkit-scrollbar {
  width: 6px;
}
.tab-content::-webkit-scrollbar-track {
  background: transparent;
}
.tab-content::-webkit-scrollbar-thumb {
  background: #30363d;
  border-radius: 3px;
}
</style>
