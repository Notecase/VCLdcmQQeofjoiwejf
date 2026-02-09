<script setup lang="ts">
import { ref, nextTick, watch } from 'vue'
import { useSecretaryStore } from '@/stores/secretary'
import ChatComposer from '@/components/ai/ChatComposer.vue'
import SecretaryMessageCard from './SecretaryMessageCard.vue'
import ThreadList from './ThreadList.vue'
import { History, MessageSquare } from 'lucide-vue-next'
import { isDemoMode } from '@/utils/demo'

const store = useSecretaryStore()
const messagesRef = ref<HTMLElement | null>(null)
const showThreads = ref(false)

function handleSubmit(message: string) {
  store.sendChatMessage(message)
}

// Auto-scroll on new messages
watch(
  () => store.chatMessages.length,
  () => {
    nextTick(() => {
      if (messagesRef.value) {
        messagesRef.value.scrollTop = messagesRef.value.scrollHeight
      }
    })
  }
)

// Also scroll during streaming
watch(
  () => store.streamingContent,
  () => {
    nextTick(() => {
      if (messagesRef.value) {
        messagesRef.value.scrollTop = messagesRef.value.scrollHeight
      }
    })
  }
)
</script>

<template>
  <div class="secretary-chat">
    <div class="chat-header">
      <h4 class="chat-title">Chat with Secretary</h4>
      <button
        class="thread-toggle"
        :class="{ active: showThreads }"
        title="Conversation history"
        @click="showThreads = !showThreads"
      >
        <History :size="14" />
      </button>
    </div>

    <!-- Thread panel -->
    <div
      v-if="showThreads"
      class="thread-panel"
    >
      <ThreadList />
    </div>

    <!-- Messages -->
    <div
      ref="messagesRef"
      class="messages"
    >
      <div
        v-if="store.chatMessages.length === 0"
        class="empty-state"
      >
        <MessageSquare
          :size="32"
          class="empty-icon"
        />
        <p class="empty-text">Start a conversation</p>
        <p class="empty-hint">
          Ask your secretary to plan your day, create roadmaps, or review progress.
        </p>
      </div>

      <SecretaryMessageCard
        v-for="msg in store.chatMessages"
        :key="msg.id"
        :message="msg"
        :is-streaming="Boolean(msg._streaming)"
      />
    </div>

    <!-- Input -->
    <ChatComposer
      :is-processing="store.isChatStreaming"
      :demo-mode="isDemoMode()"
      placeholder="Ask your secretary..."
      @submit="handleSubmit"
    />
  </div>
</template>

<style scoped>
.secretary-chat {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border-radius: 12px;
  background: var(--card-bg, #242428);
  border: 1px solid var(--border-color, #333338);
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.chat-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color, #e2e8f0);
  margin: 0;
}

.thread-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--text-color-secondary, #94a3b8);
  cursor: pointer;
  transition: all 0.15s;
}

.thread-toggle:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-color, #e2e8f0);
}

.thread-toggle.active {
  color: var(--primary-color, #7c9ef8);
  background: rgba(124, 158, 248, 0.1);
}

.thread-panel {
  border-bottom: 1px solid var(--border-color, #333338);
  padding-bottom: 10px;
}

.messages {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  min-height: 100px;
}

.messages::-webkit-scrollbar {
  width: 4px;
}

.messages::-webkit-scrollbar-track {
  background: transparent;
}

.messages::-webkit-scrollbar-thumb {
  background: var(--border-color, #333338);
  border-radius: 2px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
  gap: 6px;
  flex: 1;
}

.empty-icon {
  color: var(--text-color-secondary, #94a3b8);
  opacity: 0.4;
  margin-bottom: 4px;
}

.empty-text {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color-secondary, #94a3b8);
  margin: 0;
}

.empty-hint {
  font-size: 12px;
  color: var(--text-color-secondary, #94a3b8);
  opacity: 0.6;
  margin: 0;
  text-align: center;
  max-width: 280px;
}
</style>
