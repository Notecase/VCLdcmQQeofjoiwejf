<script setup lang="ts">
import { ref, computed, nextTick, onMounted, watch } from 'vue'
import { useAIStore } from '@/stores/ai'
import { useAIChat } from '@/services/ai.service'
import ChatMessage from '@/components/ai/ChatMessage.vue'
import AgentConsole from '@/components/ai/AgentConsole.vue'
import {
  ArrowUp,
  Paperclip,
  Globe,
  Mic,
  ChevronDown,
  Loader2,
  Sparkles,
  Brain,
  Code,
  Lightbulb,
} from 'lucide-vue-next'

const store = useAIStore()
const { sendMessage, clearChat, isProcessing, error, clearError } = useAIChat()

const inputValue = ref('')
const selectedModel = ref<'gpt' | 'gemini'>('gpt')
const isModelDropdownOpen = ref(false)
const messagesEndRef = ref<HTMLDivElement | null>(null)
const inputRef = ref<HTMLTextAreaElement | null>(null)

const messages = computed(() => store.activeSession?.messages || [])
const hasMessages = computed(() => messages.value.length > 0)

function scrollToBottom() {
  nextTick(() => {
    messagesEndRef.value?.scrollIntoView({ behavior: 'smooth' })
  })
}

async function handleSubmit() {
  const value = inputValue.value.trim()
  if (!value || isProcessing.value) return

  inputValue.value = ''
  scrollToBottom()

  await sendMessage(value, 'secretary')
  scrollToBottom()
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSubmit()
  }
}

function handleClearChat() {
  clearChat()
}

function selectModel(model: 'gpt' | 'gemini') {
  selectedModel.value = model
  isModelDropdownOpen.value = false
}

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
    icon: Sparkles,
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
  inputRef.value?.focus()
}

watch(
  () => messages.value.length,
  () => {
    scrollToBottom()
  }
)

onMounted(() => {
  setTimeout(() => {
    inputRef.value?.focus()
  }, 120)
})
</script>

<template>
  <div class="ai-chat">
    <header class="ai-header">
      <div class="header-title">
        <span class="eyebrow">Agent Workspace</span>
        <h1>Inkdown AI Studio</h1>
        <p>Plan, search, and rewrite with a transparent trace of every step.</p>
      </div>

      <div class="header-actions">
        <div class="status-chip" :class="{ live: isProcessing }">
          <span class="status-dot"></span>
          {{ isProcessing ? 'Streaming' : 'Ready' }}
        </div>

        <div class="model-selector" @click.stop>
          <button class="model-btn" @click="isModelDropdownOpen = !isModelDropdownOpen">
            <span class="model-icon">AI</span>
            <span>{{ selectedModel === 'gpt' ? 'GPT-5.2' : 'Gemini 3 Pro' }}</span>
            <ChevronDown :size="12" :class="{ rotated: isModelDropdownOpen }" />
          </button>
          <Transition name="dropdown">
            <div v-if="isModelDropdownOpen" class="model-dropdown">
              <button @click="selectModel('gpt')" :class="{ active: selectedModel === 'gpt' }">
                GPT-5.2
              </button>
              <button
                @click="selectModel('gemini')"
                :class="{ active: selectedModel === 'gemini' }"
              >
                Gemini 3 Pro
              </button>
            </div>
          </Transition>
        </div>

        <button class="ghost-action" @click="handleClearChat">New session</button>
      </div>
    </header>

    <main class="ai-shell">
      <section class="chat-panel">
        <div class="chat-body">
          <div v-if="!hasMessages" class="chat-hero">
            <div class="hero-card">
              <div class="hero-icon">
                <Sparkles :size="18" />
              </div>
              <div>
                <h2>Start a guided session</h2>
                <p>
                  Ask for summaries, generate study plans, or draft edits with inline diffs you can
                  review.
                </p>
              </div>
            </div>

            <div class="prompt-grid">
              <button
                v-for="rec in recommendations"
                :key="rec.id"
                class="prompt-card"
                @click="handleRecommendationClick(rec)"
              >
                <div class="prompt-icon">
                  <component :is="rec.icon" :size="18" />
                </div>
                <div>
                  <h3>{{ rec.title }}</h3>
                  <p>{{ rec.description }}</p>
                  <span class="prompt-action">{{ rec.action }} -></span>
                </div>
              </button>
            </div>
          </div>

          <div class="chat-thread" :class="{ empty: !hasMessages }">
            <ChatMessage v-for="msg in messages" :key="msg.id" :message="msg" />

            <div v-if="isProcessing" class="stream-indicator">
              <Loader2 :size="14" class="spin" />
              <span>Streaming response...</span>
            </div>

            <div ref="messagesEndRef" />
          </div>
        </div>
      </section>

      <AgentConsole class="agent-panel" />
    </main>

    <footer class="ai-composer">
      <div class="composer-card">
        <div class="composer-input">
          <textarea
            ref="inputRef"
            v-model="inputValue"
            placeholder="Ask anything, or type '@' to add to a note..."
            :disabled="isProcessing"
            rows="1"
            @keydown="handleKeydown"
          />
        </div>

        <div class="composer-actions">
          <div class="actions-left">
            <button class="tool-btn" title="Attach file">
              <Paperclip :size="14" />
              Attach
            </button>
            <button class="tool-btn" title="Voice input">
              <Mic :size="14" />
              Voice
            </button>
            <button class="tool-btn" title="Research">
              <Globe :size="14" />
              Research
            </button>
          </div>

          <button
            class="send-btn"
            :class="{ active: inputValue.trim() && !isProcessing }"
            :disabled="!inputValue.trim() || isProcessing"
            @click="handleSubmit"
          >
            <Loader2 v-if="isProcessing" :size="16" class="spin" />
            <ArrowUp v-else :size="16" />
          </button>
        </div>
      </div>
    </footer>

    <Transition name="slide-up">
      <div v-if="error" class="error-banner">
        <span>{{ error }}</span>
        <button @click="clearError">x</button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.ai-chat {
  --font-sans: 'Open Sans', 'Noto Sans', sans-serif;
  --font-mono: 'DejaVu Sans Mono', 'JetBrains Mono', monospace;
  --bg: #f6f7fb;
  --panel-bg: rgba(255, 255, 255, 0.86);
  --panel-border: rgba(148, 163, 184, 0.35);
  --panel-shadow: 0 24px 60px rgba(15, 23, 42, 0.1);
  --radius-xl: 22px;
  --ink: #0f172a;
  --text-soft: #5b6777;
  --muted: #728197;
  --accent: #2563eb;
  --accent-strong: #1d4ed8;
  --text-primary: #0f172a;
  --text-secondary: #334155;
  --text-muted: #64748b;
  --surface-1: rgba(255, 255, 255, 0.92);
  --surface-2: rgba(15, 23, 42, 0.05);
  --surface-3: rgba(15, 23, 42, 0.08);
  --border-subtle: rgba(148, 163, 184, 0.4);
  --stream-cursor: #2563eb;
  --stream-glow: 0 0 0 1px rgba(37, 99, 235, 0.35);
  --role-user-bg: rgba(37, 99, 235, 0.12);
  --role-user-color: #1d4ed8;
  --role-assistant-bg: rgba(16, 185, 129, 0.12);
  --role-assistant-color: #047857;
  --chat-card-bg: rgba(255, 255, 255, 0.9);
  --chat-card-border: rgba(148, 163, 184, 0.3);
  --chat-card-border-hover: rgba(37, 99, 235, 0.35);
  --chat-card-radius: 18px;
  --chat-card-padding: 18px;
  --chat-message-gap: 18px;
  --transition-fast: 120ms;
  --transition-normal: 200ms;
  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
  --tool-card-bg: rgba(15, 23, 42, 0.04);
  --tool-card-border: rgba(148, 163, 184, 0.3);
  --tool-card-border-hover: rgba(37, 99, 235, 0.25);
  --tool-running-border: rgba(37, 99, 235, 0.4);
  --tool-running-glow: rgba(37, 99, 235, 0.18);
  --diff-remove-border: #ef4444;
  --chat-divider: rgba(148, 163, 184, 0.35);
  --chat-user-bg: rgba(37, 99, 235, 0.1);
  --chat-user-border: rgba(37, 99, 235, 0.35);
  --chat-assistant-bg: rgba(255, 255, 255, 0.9);
  --chat-assistant-border: rgba(148, 163, 184, 0.3);

  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg);
  color: var(--ink);
  font-family: var(--font-sans);
  position: relative;
  overflow: hidden;
}

.ai-chat::before,
.ai-chat::after {
  content: '';
  position: absolute;
  width: 60vw;
  height: 60vw;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(37, 99, 235, 0.12), transparent 60%);
  top: -20vw;
  right: -10vw;
  z-index: 0;
}

.ai-chat::after {
  width: 40vw;
  height: 40vw;
  background: radial-gradient(circle, rgba(16, 185, 129, 0.12), transparent 65%);
  top: auto;
  bottom: -15vw;
  left: -10vw;
}

.ai-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  padding: 28px 32px 12px;
  position: relative;
  z-index: 1;
}

.header-title h1 {
  font-size: 28px;
  font-weight: 700;
  margin-bottom: 6px;
}

.header-title p {
  font-size: 14px;
  color: var(--text-soft);
  max-width: 520px;
}

.eyebrow {
  font-size: 11px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--muted);
  font-weight: 600;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.status-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.06);
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
}

.status-chip.live {
  color: #15803d;
  background: rgba(34, 197, 94, 0.15);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}

.ghost-action {
  padding: 8px 14px;
  border-radius: 999px;
  border: 1px solid var(--panel-border);
  background: transparent;
  font-size: 12px;
  font-weight: 600;
  color: var(--ink);
}

.ai-shell {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 24px;
  padding: 12px 32px 16px;
  flex: 1;
  min-height: 0;
  position: relative;
  z-index: 1;
}

.chat-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: var(--radius-xl);
  box-shadow: var(--panel-shadow);
  backdrop-filter: blur(18px);
}

.chat-body {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}

.chat-hero {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  animation: fadeIn 0.5s ease-out;
}

.hero-card {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 18px;
  border-radius: 18px;
  border: 1px solid rgba(37, 99, 235, 0.2);
  background: rgba(37, 99, 235, 0.08);
}

.hero-card h2 {
  font-size: 18px;
  margin-bottom: 6px;
}

.hero-card p {
  font-size: 13px;
  color: var(--text-soft);
}

.hero-icon {
  width: 38px;
  height: 38px;
  border-radius: 14px;
  background: rgba(37, 99, 235, 0.15);
  color: #1d4ed8;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.prompt-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.prompt-card {
  display: flex;
  gap: 12px;
  padding: 16px;
  border-radius: 18px;
  border: 1px solid var(--panel-border);
  background: rgba(255, 255, 255, 0.75);
  text-align: left;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.prompt-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 14px 30px rgba(15, 23, 42, 0.08);
}

.prompt-card h3 {
  font-size: 14px;
  margin-bottom: 6px;
}

.prompt-card p {
  font-size: 12px;
  color: var(--text-soft);
  margin-bottom: 8px;
}

.prompt-action {
  font-size: 12px;
  color: var(--accent);
  font-weight: 600;
}

.prompt-icon {
  width: 34px;
  height: 34px;
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.06);
  color: var(--accent-strong);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.chat-thread {
  flex: 1;
  overflow-y: auto;
  padding: 18px 24px 24px;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.chat-thread.empty {
  padding-top: 0;
}

.stream-indicator {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--muted);
}

.agent-panel {
  min-height: 0;
}

.ai-composer {
  padding: 0 32px 28px;
  position: relative;
  z-index: 1;
}

.composer-card {
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 20px;
  padding: 16px 18px 14px;
  box-shadow: var(--panel-shadow);
  backdrop-filter: blur(12px);
}

.composer-input textarea {
  width: 100%;
  border: none;
  outline: none;
  resize: none;
  background: transparent;
  font-size: 14px;
  font-family: inherit;
  color: var(--ink);
  min-height: 28px;
}

.composer-input textarea::placeholder {
  color: var(--muted);
}

.composer-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
}

.actions-left {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.tool-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid var(--panel-border);
  background: rgba(255, 255, 255, 0.6);
  font-size: 12px;
  color: var(--ink);
}

.send-btn {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  border: none;
  background: rgba(15, 23, 42, 0.1);
  color: var(--muted);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: not-allowed;
  transition: all 0.2s ease;
}

.send-btn.active {
  background: var(--accent);
  color: #ffffff;
  cursor: pointer;
  box-shadow: 0 10px 24px rgba(37, 99, 235, 0.25);
}

.send-btn.active:hover {
  transform: translateY(-1px);
}

.model-selector {
  position: relative;
}

.model-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 999px;
  border: 1px solid var(--panel-border);
  background: rgba(255, 255, 255, 0.6);
  font-size: 12px;
  font-weight: 600;
  color: var(--ink);
}

.model-btn svg {
  transition: transform 0.2s ease;
}

.model-btn svg.rotated {
  transform: rotate(180deg);
}

.model-dropdown {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  background: #ffffff;
  border: 1px solid var(--panel-border);
  border-radius: 14px;
  overflow: hidden;
  min-width: 180px;
  box-shadow: 0 18px 32px rgba(15, 23, 42, 0.12);
  z-index: 5;
}

.model-dropdown button {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 14px;
  border: none;
  background: none;
  font-size: 12px;
  color: var(--text-soft);
  text-align: left;
}

.model-dropdown button.active {
  background: rgba(37, 99, 235, 0.1);
  color: var(--accent-strong);
}

.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.15s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

.error-banner {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 12px;
  color: #b91c1c;
  z-index: 10;
}

.error-banner button {
  background: none;
  border: none;
  color: inherit;
  font-size: 18px;
}

.spin {
  animation: spin 1s linear infinite;
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translate(-50%, 12px);
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 1100px) {
  .ai-shell {
    grid-template-columns: 1fr;
  }

  .header-actions {
    flex-wrap: wrap;
    justify-content: flex-end;
  }
}

@media (max-width: 720px) {
  .ai-header,
  .ai-shell,
  .ai-composer {
    padding-left: 20px;
    padding-right: 20px;
  }

  .ai-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .prompt-grid {
    grid-template-columns: 1fr;
  }

  .composer-actions {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .send-btn {
    align-self: flex-end;
  }
}
</style>
