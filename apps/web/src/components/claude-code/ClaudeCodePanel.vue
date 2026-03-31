<script setup lang="ts">
/**
 * ClaudeCodePanel — the main chat panel for Claude Code mode.
 * Renders message list, thinking indicator, connection status, and token usage footer.
 */
import { ref, watch, nextTick, computed } from 'vue'
import { useClaudeCodeStore } from '@/stores/claudeCode'
import MessageBubble from './MessageBubble.vue'
import ThinkingIndicator from './ThinkingIndicator.vue'
import { Wifi, WifiOff, AlertCircle } from 'lucide-vue-next'

const store = useClaudeCodeStore()

const messagesContainer = ref<HTMLElement | null>(null)

const connectionLabel = computed(() => {
  switch (store.connectionStatus) {
    case 'connected':
      return 'Connected'
    case 'connecting':
      return 'Connecting...'
    case 'error':
      return 'Disconnected'
    default:
      return 'Offline'
  }
})

const formattedCost = computed(() => {
  if (store.totalCostUsd === 0) return ''
  return `$${store.totalCostUsd.toFixed(4)}`
})

const formattedTokens = computed(() => {
  const { input, output } = store.totalTokens
  if (input === 0 && output === 0) return ''
  const fmt = (n: number) => (n > 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))
  return `${fmt(input)} in / ${fmt(output)} out`
})

// Auto-scroll on new messages or streaming content
watch(
  () => [store.messages.length, store.lastMessage?.content],
  () => {
    nextTick(() => {
      if (messagesContainer.value) {
        messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
      }
    })
  }
)
</script>

<template>
  <div class="claude-code-panel">
    <!-- Connection status banner -->
    <div
      v-if="store.connectionStatus !== 'connected'"
      class="connection-banner"
      :class="store.connectionStatus"
    >
      <WifiOff
        v-if="store.connectionStatus === 'error' || store.connectionStatus === 'disconnected'"
        :size="12"
      />
      <Wifi
        v-else
        :size="12"
        class="pulse"
      />
      <span>{{ connectionLabel }}</span>
    </div>

    <!-- Error banner -->
    <div
      v-if="store.error"
      class="error-banner"
    >
      <AlertCircle :size="12" />
      <span>{{ store.error }}</span>
      <button
        class="dismiss-btn"
        @click="store.clearError()"
      >
        Dismiss
      </button>
    </div>

    <!-- Messages area -->
    <div
      ref="messagesContainer"
      class="messages-area"
    >
      <template v-if="store.messages.length === 0">
        <div class="welcome">
          <p class="welcome-text">
            Claude Code is your AI development partner. Ask it to read, edit, create notes, build
            artifacts, or research topics.
          </p>
        </div>
      </template>

      <MessageBubble
        v-for="msg in store.messages"
        :key="msg.id"
        :message="msg"
      />

      <!-- Thinking indicator -->
      <ThinkingIndicator v-if="store.isThinking" />
    </div>

    <!-- Footer with usage info -->
    <div
      v-if="formattedTokens || formattedCost"
      class="usage-footer"
    >
      <span
        v-if="formattedTokens"
        class="usage-tokens"
        >{{ formattedTokens }}</span
      >
      <span
        v-if="formattedCost"
        class="usage-cost"
        >{{ formattedCost }}</span
      >
    </div>
  </div>
</template>

<style scoped>
.claude-code-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.connection-banner {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 11px;
  color: var(--text-secondary, #8b8b8b);
  background: var(--bg-secondary, #1a1a1a);
  border-bottom: 1px solid var(--border-secondary, #2a2a2a);
}

.connection-banner.connecting .pulse {
  animation: pulse 1.5s ease-in-out infinite;
}

.connection-banner.error {
  color: var(--error-text, #e55);
}

@keyframes pulse {
  0%,
  100% {
    opacity: 0.4;
  }
  50% {
    opacity: 1;
  }
}

.error-banner {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 11px;
  color: var(--error-text, #e55);
  background: var(--error-bg, #2a1a1a);
  border-bottom: 1px solid var(--error-border, #5c2020);
}

.dismiss-btn {
  margin-left: auto;
  background: none;
  border: none;
  color: var(--text-secondary, #8b8b8b);
  cursor: pointer;
  font-size: 11px;
  padding: 2px 6px;
}

.dismiss-btn:hover {
  color: var(--text-primary, #d4d4d4);
}

.messages-area {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.welcome {
  padding: 16px 12px;
}

.welcome-text {
  color: var(--text-secondary, #8b8b8b);
  font-size: 13px;
  line-height: 1.5;
}

.usage-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 12px;
  font-size: 10px;
  color: var(--text-secondary, #8b8b8b);
  border-top: 1px solid var(--border-secondary, #2a2a2a);
}
</style>
