<script setup lang="ts">
/**
 * AI Chat / Starting Page - Exact Note3 Design
 * Features:
 * - "SUGGESTED FOR YOU" header with icon
 * - 2x2 grid of recommendation cards
 * - Rounded input with Attach, Mic, Model selector, Research, Send
 */
import { ref, computed, nextTick, onMounted } from 'vue'
import { useAIStore } from '@/stores/ai'
import { useAIChat } from '@/services/ai.service'
import { useEditorStore } from '@/stores'
import ChatMessage from '@/components/ai/ChatMessage.vue'
import {
  ArrowUp,
  Paperclip,
  Globe,
  Mic,
  Zap,
  ChevronDown,
  Loader2,
  Brain,
  Code,
  Lightbulb,
} from 'lucide-vue-next'

// Store and composable
const store = useAIStore()
const editorStore = useEditorStore()
const { sendMessage, clearChat, isProcessing, error, clearError } = useAIChat()

// Local state
const inputValue = ref('')
const selectedModel = ref<'gpt' | 'gemini'>('gpt')
const isModelDropdownOpen = ref(false)
const messagesEndRef = ref<HTMLDivElement | null>(null)
const isRecommendationsExiting = ref(false)

// Computed
const messages = computed(() => store.activeSession?.messages || [])
const hasMessages = computed(() => messages.value.length > 0)

// Scroll to bottom on new messages
function scrollToBottom() {
  nextTick(() => {
    messagesEndRef.value?.scrollIntoView({ behavior: 'smooth' })
  })
}

// Handle submit with animation
async function handleSubmit() {
  const value = inputValue.value.trim()
  if (!value || isProcessing) return

  // Trigger exit animation if first message
  if (!hasMessages.value) {
    isRecommendationsExiting.value = true
    await new Promise((resolve) => setTimeout(resolve, 300))
  }

  inputValue.value = ''
  scrollToBottom()

  await sendMessage(value, 'secretary')
  scrollToBottom()
}

// Handle enter key
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSubmit()
  }
}

// Clear chat
function handleClearChat() {
  clearChat()
  isRecommendationsExiting.value = false
}

// Model selection
function selectModel(model: 'gpt' | 'gemini') {
  selectedModel.value = model
  isModelDropdownOpen.value = false
}

// 2x2 Recommendation cards matching Note3 exactly
const recommendations = [
  {
    id: 'vae',
    icon: Brain,
    title: 'Explain VAE vs DAG',
    description: 'Compare Variational Autoencoders and DAG models from your Deep Learning notes.',
    action: 'Compare',
  },
  {
    id: 'neural',
    icon: Lightbulb,
    title: 'Quiz on Neural Pathways',
    description: 'Test your understanding of synaptic plasticity from Neuroscience 2.',
    action: 'Start Quiz',
  },
  {
    id: 'quantum',
    icon: Zap,
    title: 'Quantum Gates Cheatsheet',
    description: 'Generate a quick reference for Hadamard, CNOT, and Pauli gates.',
    action: 'Generate',
  },
  {
    id: 'react',
    icon: Code,
    title: 'React Hooks Deep Dive',
    description: 'Explain useEffect cleanup and dependency arrays from your React notes.',
    action: 'Explain',
  },
]

function handleRecommendationClick(rec: (typeof recommendations)[0]) {
  inputValue.value = `${rec.action}: ${rec.title}`
}

onMounted(() => {
  setTimeout(() => {
    const textarea = document.querySelector('textarea')
    textarea?.focus()
  }, 100)
})
</script>

<template>
  <div class="starting-page">
    <!-- Chat Mode: Messages -->
    <template v-if="hasMessages">
      <div class="messages-area">
        <div class="messages-container">
          <ChatMessage
            v-for="msg in messages"
            :key="msg.id"
            :message="msg"
          />

          <!-- Loading indicator -->
          <div
            v-if="isProcessing"
            class="loading-indicator"
          >
            <Loader2
              :size="16"
              class="spin"
            />
            <span>AI is thinking...</span>
          </div>

          <div ref="messagesEndRef" />
        </div>
      </div>

      <!-- Fixed input at bottom -->
      <div class="input-area">
        <div class="input-wrapper">
          <div class="chat-input">
            <textarea
              v-model="inputValue"
              placeholder="Ask anything, or type '@' to add to a note..."
              :disabled="isProcessing"
              @keydown="handleKeydown"
              rows="1"
            />

            <div class="input-toolbar">
              <div class="toolbar-left">
                <button
                  class="toolbar-btn"
                  title="Attach file"
                >
                  <Paperclip :size="16" />
                </button>
                <button
                  class="toolbar-btn"
                  title="Voice input"
                >
                  <Mic :size="16" />
                </button>

                <div class="toolbar-divider" />

                <!-- Model selector -->
                <div
                  class="model-selector"
                  @click.stop
                >
                  <button
                    class="model-btn"
                    @click="isModelDropdownOpen = !isModelDropdownOpen"
                  >
                    <span class="model-icon">🤖</span>
                    <span>{{ selectedModel === 'gpt' ? 'GPT-5.2' : 'Gemini' }}</span>
                    <ChevronDown
                      :size="12"
                      :class="{ rotated: isModelDropdownOpen }"
                    />
                  </button>
                  <Transition name="dropdown">
                    <div
                      v-if="isModelDropdownOpen"
                      class="model-dropdown"
                    >
                      <button
                        @click="selectModel('gpt')"
                        :class="{ active: selectedModel === 'gpt' }"
                      >
                        🤖 GPT-5.2
                      </button>
                      <button
                        @click="selectModel('gemini')"
                        :class="{ active: selectedModel === 'gemini' }"
                      >
                        ✨ Gemini 3 Pro
                      </button>
                    </div>
                  </Transition>
                </div>

                <button class="toolbar-btn research">
                  <Globe :size="14" />
                  <span>Research</span>
                </button>
              </div>

              <button
                class="send-btn"
                :class="{ active: inputValue.trim() && !isProcessing }"
                :disabled="!inputValue.trim() || isProcessing"
                @click="handleSubmit"
              >
                <Loader2
                  v-if="isProcessing"
                  :size="16"
                  class="spin"
                />
                <ArrowUp
                  v-else
                  :size="16"
                />
              </button>
            </div>
          </div>

          <button
            v-if="hasMessages"
            class="clear-btn"
            @click="handleClearChat"
          >
            Clear conversation
          </button>
        </div>
      </div>
    </template>

    <!-- Empty State: Centered with recommendations -->
    <template v-else>
      <div
        class="empty-state"
        :class="{ exiting: isRecommendationsExiting }"
      >
        <div class="centered-content">
          <!-- Recommendations -->
          <div class="recommendations-section">
            <div class="recommendations-header">
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="currentColor"
              >
                <path
                  d="M9.5 1.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM7.25 4a.75.75 0 0 1 .75-.75h.5a.75.75 0 0 1 .75.75v6.5a.75.75 0 0 1-.75.75h-.5a.75.75 0 0 1-.75-.75V4Z"
                />
              </svg>
              <span>SUGGESTED FOR YOU</span>
            </div>

            <!-- 2x2 Grid -->
            <div class="recommendations-grid">
              <button
                v-for="rec in recommendations"
                :key="rec.id"
                class="recommendation-card"
                @click="handleRecommendationClick(rec)"
              >
                <div class="card-icon">
                  <component
                    :is="rec.icon"
                    :size="20"
                  />
                </div>
                <h3 class="card-title">{{ rec.title }}</h3>
                <p class="card-description">{{ rec.description }}</p>
                <span class="card-action">{{ rec.action }} →</span>
              </button>
            </div>
          </div>

          <!-- Centered Input -->
          <div class="chat-input">
            <textarea
              v-model="inputValue"
              placeholder="Ask anything, or type '@' to add to a note..."
              :disabled="isProcessing"
              @keydown="handleKeydown"
              rows="1"
            />

            <div class="input-toolbar">
              <div class="toolbar-left">
                <button
                  class="toolbar-btn"
                  title="Attach file"
                >
                  <Paperclip :size="16" />
                </button>
                <button
                  class="toolbar-btn"
                  title="Voice input"
                >
                  <Mic :size="16" />
                </button>

                <div class="toolbar-divider" />

                <!-- Model selector -->
                <div
                  class="model-selector"
                  @click.stop
                >
                  <button
                    class="model-btn"
                    @click="isModelDropdownOpen = !isModelDropdownOpen"
                  >
                    <span class="model-icon">🤖</span>
                    <span>{{ selectedModel === 'gpt' ? 'GPT-5.2' : 'Gemini' }}</span>
                    <ChevronDown
                      :size="12"
                      :class="{ rotated: isModelDropdownOpen }"
                    />
                  </button>
                  <Transition name="dropdown">
                    <div
                      v-if="isModelDropdownOpen"
                      class="model-dropdown"
                    >
                      <button
                        @click="selectModel('gpt')"
                        :class="{ active: selectedModel === 'gpt' }"
                      >
                        🤖 GPT-5.2
                      </button>
                      <button
                        @click="selectModel('gemini')"
                        :class="{ active: selectedModel === 'gemini' }"
                      >
                        ✨ Gemini 3 Pro
                      </button>
                    </div>
                  </Transition>
                </div>

                <button class="toolbar-btn research">
                  <Globe :size="14" />
                  <span>Research</span>
                </button>
              </div>

              <button
                class="send-btn"
                :class="{ active: inputValue.trim() && !isProcessing }"
                :disabled="!inputValue.trim() || isProcessing"
                @click="handleSubmit"
              >
                <Loader2
                  v-if="isProcessing"
                  :size="16"
                  class="spin"
                />
                <ArrowUp
                  v-else
                  :size="16"
                />
              </button>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Error Display -->
    <Transition name="slide-up">
      <div
        v-if="error"
        class="error-banner"
      >
        <span>{{ error }}</span>
        <button @click="clearError">×</button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* Base Layout - Note3 dark theme */
.starting-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #0d1117;
  color: #e6edf3;
}

/* Empty State */
.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  animation: fadeIn 0.5s ease-out;
}

.empty-state.exiting {
  animation: fadeUpAndAway 0.3s cubic-bezier(0.4, 0, 0.6, 1) forwards;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes fadeUpAndAway {
  to {
    opacity: 0;
    transform: translateY(-30px);
  }
}

.centered-content {
  width: 100%;
  max-width: 640px;
  display: flex;
  flex-direction: column;
  gap: 2.5rem;
}

/* Recommendations Section */
.recommendations-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.recommendations-header {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #7d8590;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding-left: 4px;
}

/* 2x2 Grid */
.recommendations-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  border: 1px solid #30363d;
  border-radius: 12px;
  overflow: hidden;
}

.recommendation-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 20px;
  background: transparent;
  border: none;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease;
  color: #e6edf3;
}

.recommendation-card:hover {
  background: #1c2128;
}

/* Card borders - recreate 2x2 grid lines */
.recommendation-card:nth-child(1) {
  border-right: 1px solid #30363d;
  border-bottom: 1px solid #30363d;
}
.recommendation-card:nth-child(2) {
  border-bottom: 1px solid #30363d;
}
.recommendation-card:nth-child(3) {
  border-right: 1px solid #30363d;
}

.card-icon {
  color: #7d8590;
}

.card-title {
  font-size: 14px;
  font-weight: 600;
  margin: 0;
  color: #e6edf3;
}

.card-description {
  font-size: 13px;
  color: #7d8590;
  margin: 0;
  line-height: 1.4;
}

.card-action {
  font-size: 13px;
  color: #58a6ff;
  font-weight: 500;
  margin-top: 4px;
}

/* Chat Input - Note3 rounded style */
.chat-input {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 32px;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.chat-input textarea {
  width: 100%;
  background: transparent;
  border: none;
  outline: none;
  color: #e6edf3;
  font-size: 14px;
  resize: none;
  min-height: 24px;
  max-height: 120px;
  font-family: inherit;
  line-height: 1.5;
}

.chat-input textarea::placeholder {
  color: #7d8590;
}

/* Input Toolbar */
.input-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 8px;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 4px;
}

.toolbar-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px;
  background: transparent;
  border: none;
  border-radius: 20px;
  color: #7d8590;
  cursor: pointer;
  transition: all 0.15s ease;
  font-size: 12px;
}

.toolbar-btn:hover {
  background: #30363d;
  color: #e6edf3;
}

.toolbar-btn.research {
  padding: 6px 12px;
}

.toolbar-divider {
  width: 1px;
  height: 20px;
  background: #30363d;
  margin: 0 4px;
}

/* Model Selector */
.model-selector {
  position: relative;
}

.model-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: transparent;
  border: none;
  border-radius: 20px;
  color: #7d8590;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.model-btn:hover {
  background: #30363d;
  color: #e6edf3;
}

.model-icon {
  font-size: 14px;
}

.model-btn svg {
  transition: transform 0.2s ease;
}

.model-btn svg.rotated {
  transform: rotate(180deg);
}

.model-dropdown {
  position: absolute;
  bottom: 100%;
  left: 0;
  margin-bottom: 8px;
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 12px;
  overflow: hidden;
  min-width: 160px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  z-index: 100;
}

.model-dropdown button {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 14px;
  background: none;
  border: none;
  color: #7d8590;
  font-size: 12px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  transition: all 0.1s ease;
}

.model-dropdown button:hover {
  background: #30363d;
  color: #e6edf3;
}

.model-dropdown button.active {
  background: rgba(88, 166, 255, 0.1);
  color: #58a6ff;
}

/* Dropdown transition */
.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.15s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

/* Send Button */
.send-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #30363d;
  border: none;
  color: #7d8590;
  cursor: not-allowed;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.send-btn.active {
  background: #238636;
  color: white;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(35, 134, 54, 0.3);
}

.send-btn.active:hover {
  background: #2ea043;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Messages Area */
.messages-area {
  flex: 1;
  overflow-y: auto;
  padding: 2rem;
}

.messages-container {
  max-width: 720px;
  margin: 0 auto;
}

.loading-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 1rem 0;
  color: #7d8590;
  font-size: 14px;
}

/* Input Area (chat mode) */
.input-area {
  background: #0d1117;
  padding: 1.5rem 2rem;
}

.input-wrapper {
  max-width: 640px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.clear-btn {
  align-self: center;
  padding: 6px 12px;
  background: none;
  border: none;
  color: #7d8590;
  font-size: 12px;
  cursor: pointer;
}

.clear-btn:hover {
  color: #e6edf3;
}

/* Error Banner */
.error-banner {
  position: fixed;
  bottom: 100px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: rgba(248, 81, 73, 0.15);
  border: 1px solid rgba(248, 81, 73, 0.3);
  border-radius: 12px;
  color: #f85149;
  z-index: 100;
}

.error-banner button {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  font-size: 1.25rem;
  padding: 0;
}

/* Transitions */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translate(-50%, 20px);
}

/* Responsive */
@media (max-width: 640px) {
  .recommendations-grid {
    grid-template-columns: 1fr;
  }

  .recommendation-card:nth-child(1),
  .recommendation-card:nth-child(2),
  .recommendation-card:nth-child(3) {
    border-right: none;
    border-bottom: 1px solid #30363d;
  }

  .recommendation-card:last-child {
    border-bottom: none;
  }
}
</style>
