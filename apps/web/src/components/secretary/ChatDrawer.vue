<script setup lang="ts">
/**
 * ChatPopup — Notion-style floating AI chat box.
 * Small popup (480x540) anchored bottom-right, no backdrop overlay.
 * Header with title + window controls, Notion-style empty state.
 */
import { ref, computed, nextTick, watch } from 'vue'
import { useSecretaryStore } from '@/stores/secretary'
import SecretaryMessageCard from './SecretaryMessageCard.vue'
import ThreadList from './ThreadList.vue'
import {
  Shell,
  ChevronDown,
  SquarePen,
  Maximize2,
  Minus,
  History,
  FileText,
  Languages,
  Search,
  CalendarCheck,
  Route,
  BookOpen,
  ArrowUp,
  Loader2,
} from 'lucide-vue-next'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const store = useSecretaryStore()
const messagesRef = ref<HTMLElement | null>(null)
const inputValue = ref('')
const inputRef = ref<HTMLTextAreaElement | null>(null)
const showThreads = ref(false)
const isExpanded = ref(false)

const hasMessages = computed(() => store.chatMessages.length > 0)

const activeThreadTitle = computed(() => {
  if (!store.activeThreadId) return 'New AI chat'
  const thread = store.threads.find((t) => t.id === store.activeThreadId)
  return thread?.title || 'AI chat'
})

function sendMessage(message: string) {
  if (!message.trim()) return
  store.sendChatMessage(message.trim())
  inputValue.value = ''
  nextTick(() => {
    if (inputRef.value) inputRef.value.style.height = 'auto'
  })
}

function handleSubmit() {
  sendMessage(inputValue.value)
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSubmit()
  }
}

function handleQuickAction(prompt: string) {
  sendMessage(prompt)
}

function handleNewChat() {
  store.createNewThread()
  showThreads.value = false
}

function autoResize() {
  const textarea = inputRef.value
  if (!textarea) return
  textarea.style.height = 'auto'
  textarea.style.height = `${Math.min(textarea.scrollHeight, 100)}px`
}

watch(inputValue, () => nextTick(autoResize))

// Auto-scroll
watch(
  () => store.chatMessages.length,
  () => {
    nextTick(() => {
      if (messagesRef.value) messagesRef.value.scrollTop = messagesRef.value.scrollHeight
    })
  }
)
watch(
  () => store.streamingContent,
  () => {
    nextTick(() => {
      if (messagesRef.value) messagesRef.value.scrollTop = messagesRef.value.scrollHeight
    })
  }
)

// Focus input when opened
watch(
  () => props.open,
  (val) => {
    if (val) {
      nextTick(() => {
        setTimeout(() => inputRef.value?.focus(), 100)
      })
    }
  }
)
</script>

<template>
  <Teleport to="body">
    <Transition name="popup">
      <div
        v-if="open"
        class="chat-popup"
        :class="{ expanded: isExpanded }"
      >
        <!-- Header -->
        <div class="popup-header">
          <button
            class="thread-selector"
            @click="showThreads = !showThreads"
          >
            <span class="thread-title">{{ activeThreadTitle }}</span>
            <ChevronDown
              :size="14"
              class="chevron"
              :class="{ rotated: showThreads }"
            />
          </button>
          <div class="header-controls">
            <button
              class="ctrl-btn"
              title="New chat"
              @click="handleNewChat"
            >
              <SquarePen :size="15" />
            </button>
            <button
              class="ctrl-btn"
              title="Expand"
              @click="isExpanded = !isExpanded"
            >
              <Maximize2 :size="15" />
            </button>
            <button
              class="ctrl-btn"
              title="Minimize"
              @click="emit('close')"
            >
              <Minus :size="15" />
            </button>
          </div>
        </div>

        <!-- Thread List (dropdown) -->
        <div
          v-if="showThreads"
          class="thread-dropdown"
        >
          <ThreadList />
        </div>

        <!-- Body -->
        <div
          ref="messagesRef"
          class="popup-body"
        >
          <!-- Empty State — Notion style -->
          <div
            v-if="!hasMessages"
            class="empty-state"
          >
            <div class="ai-icon-ring">
              <Shell :size="28" />
            </div>
            <h3 class="empty-title">How can I help you today?</h3>
            <div class="quick-actions">
              <button
                class="action-row"
                @click="handleQuickAction('Plan my day based on active roadmaps')"
              >
                <CalendarCheck
                  :size="16"
                  class="action-icon"
                />
                <span>Plan my day</span>
              </button>
              <button
                class="action-row"
                @click="handleQuickAction('Show my active plans and progress')"
              >
                <Route
                  :size="16"
                  class="action-icon"
                />
                <span>Review my progress</span>
              </button>
              <button
                class="action-row"
                @click="handleQuickAction('Summarize what I studied today')"
              >
                <FileText
                  :size="16"
                  class="action-icon"
                />
                <span>Summarize today</span>
              </button>
              <button
                class="action-row"
                @click="handleQuickAction('Create a new learning roadmap')"
              >
                <BookOpen
                  :size="16"
                  class="action-icon"
                />
                <span>Create a roadmap</span>
              </button>
            </div>
          </div>

          <!-- Messages -->
          <template v-else>
            <SecretaryMessageCard
              v-for="msg in store.chatMessages"
              :key="msg.id"
              :message="msg"
              :is-streaming="Boolean(msg._streaming)"
            />
          </template>
        </div>

        <!-- Input -->
        <div class="popup-input">
          <textarea
            ref="inputRef"
            v-model="inputValue"
            class="input-field"
            placeholder="Do anything with AI..."
            :disabled="store.isChatStreaming"
            rows="1"
            @keydown="handleKeydown"
          />
          <div class="input-footer">
            <div class="input-left">
              <button
                class="input-tool"
                title="History"
                @click="showThreads = !showThreads"
              >
                <History :size="15" />
              </button>
              <button
                class="input-tool"
                title="Search"
                disabled
              >
                <Search :size="15" />
              </button>
              <button
                class="input-tool"
                title="Translate"
                disabled
              >
                <Languages :size="15" />
              </button>
            </div>
            <div class="input-right">
              <span class="model-label">Auto</span>
              <button
                class="send-btn"
                :class="{ active: inputValue.trim() && !store.isChatStreaming }"
                :disabled="!inputValue.trim() || store.isChatStreaming"
                @click="handleSubmit"
              >
                <Loader2
                  v-if="store.isChatStreaming"
                  :size="14"
                  class="spin"
                />
                <ArrowUp
                  v-else
                  :size="14"
                />
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.chat-popup {
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 480px;
  height: 540px;
  z-index: 9998;
  display: flex;
  flex-direction: column;
  background: var(--chat-popup-bg, #080b10);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 16px;
  box-shadow:
    0 24px 48px -12px rgba(0, 0, 0, 0.5),
    0 12px 24px -8px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.chat-popup.expanded {
  width: 620px;
  height: 680px;
}

/* ── Header ── */
.popup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px 10px 16px;
  flex-shrink: 0;
}

.thread-selector {
  display: flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: none;
  color: var(--text-color, #e2e8f0);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: background 0.15s;
}

.thread-selector:hover {
  background: rgba(255, 255, 255, 0.06);
}

.chevron {
  color: var(--text-color-secondary, #94a3b8);
  transition: transform 0.2s;
}

.chevron.rotated {
  transform: rotate(180deg);
}

.thread-title {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header-controls {
  display: flex;
  align-items: center;
  gap: 2px;
}

.ctrl-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-color-secondary, #94a3b8);
  cursor: pointer;
  transition: all 0.15s;
}

.ctrl-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-color, #e2e8f0);
}

/* ── Thread Dropdown ── */
.thread-dropdown {
  max-height: 200px;
  overflow-y: auto;
  padding: 6px;
}

/* ── Body ── */
.popup-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  min-height: 0;
}

.popup-body::-webkit-scrollbar {
  width: 4px;
}

.popup-body::-webkit-scrollbar-track {
  background: transparent;
}

.popup-body::-webkit-scrollbar-thumb {
  background: var(--border-color, #333338);
  border-radius: 2px;
}

/* ── Empty State ── */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32px 16px 16px;
}

.ai-icon-ring {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  color: var(--text-color-secondary, #94a3b8);
  margin-bottom: 16px;
}

.empty-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-color, #e2e8f0);
  margin: 0 0 20px;
}

.quick-actions {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.action-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-color, #e2e8f0);
  font-size: 14px;
  cursor: pointer;
  transition: background 0.15s;
  text-align: left;
}

.action-row:hover {
  background: rgba(255, 255, 255, 0.06);
}

.action-icon {
  color: var(--text-color-secondary, #94a3b8);
  flex-shrink: 0;
}

/* ── Input Area — Floating Composer ── */
.popup-input {
  margin: 0 12px 12px;
  padding: 12px 14px;
  background: var(--chat-composer-bg, #13161b);
  border: 1px solid var(--chat-composer-border, rgba(255, 255, 255, 0.07));
  border-radius: 16px;
  box-shadow: var(--chat-composer-shadow, 0 -4px 20px rgba(0, 0, 0, 0.35));
  flex-shrink: 0;
}

.input-field {
  width: 100%;
  border: none;
  outline: none;
  resize: none;
  background: transparent;
  font-size: 14px;
  font-family: inherit;
  color: var(--text-color, #e2e8f0);
  min-height: 24px;
  max-height: 100px;
  overflow-y: auto;
  line-height: 1.5;
}

.input-field::placeholder {
  color: var(--text-color-secondary, #94a3b8);
  opacity: 0.6;
}

.input-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
}

.input-left {
  display: flex;
  align-items: center;
  gap: 2px;
}

.input-tool {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-color-secondary, #94a3b8);
  cursor: pointer;
  transition: all 0.15s;
}

.input-tool:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-color, #e2e8f0);
}

.input-tool:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.input-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.model-label {
  font-size: 12px;
  color: var(--text-color-secondary, #94a3b8);
  opacity: 0.6;
}

.send-btn {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-color-secondary, #94a3b8);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: not-allowed;
  transition: all 0.15s;
}

.send-btn.active {
  background: var(--text-color, #e2e8f0);
  color: var(--surface-1, #0d1117);
  cursor: pointer;
}

.send-btn.active:hover {
  opacity: 0.9;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* ── Transition ── */
.popup-enter-active {
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.popup-leave-active {
  transition: all 0.2s cubic-bezier(0.4, 0, 1, 1);
}

.popup-enter-from,
.popup-leave-to {
  opacity: 0;
  transform: translateY(12px) scale(0.96);
}
</style>
