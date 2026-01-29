<script setup lang="ts">
/**
 * Chat Message Component
 * Renders a single message with markdown and action buttons
 */
import { computed } from 'vue'
import type { ChatMessage } from '@/stores/ai'
import { renderMathContent } from '@/utils/mathRenderer'

const props = defineProps<{
  message: ChatMessage
}>()

const isUser = computed(() => props.message.role === 'user')
const isAssistant = computed(() => props.message.role === 'assistant')
const displayContent = computed(() => props.message.content || '')

// Use math renderer for assistant messages, basic for user
const renderedContent = computed(() => renderMathContent(displayContent.value))

function copyMessage() {
  navigator.clipboard.writeText(displayContent.value)
}
</script>

<template>
  <div
    class="chat-message"
    :class="{ 'user-message': isUser, 'assistant-message': isAssistant }"
  >
    <!-- Avatar -->
    <div class="message-avatar">
      <span v-if="isUser">👤</span>
      <span v-else>✨</span>
    </div>

    <!-- Content -->
    <div class="message-content">
      <div
        class="message-text"
        v-html="renderedContent"
      ></div>

      <!-- Actions (only for assistant) -->
      <div
        v-if="isAssistant && displayContent"
        class="message-actions"
      >
        <button
          @click="copyMessage"
          title="Copy"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
          >
            <path
              d="M2 5C2 3.89543 2.89543 3 4 3H10C11.1046 3 12 3.89543 12 5V11C12 12.1046 11.1046 13 10 13H4C2.89543 13 2 12.1046 2 11V5Z"
              stroke="currentColor"
              stroke-width="1.5"
            />
            <path
              d="M4 3V2C4 1.44772 4.44772 1 5 1H12C13.1046 1 14 1.89543 14 3V12C14 12.5523 13.5523 13 13 13H12"
              stroke="currentColor"
              stroke-width="1.5"
            />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ============================================
 * CHAT MESSAGE - Theme-aware styling
 * Uses CSS variables from variables.css
 * ============================================ */
.chat-message {
  display: flex;
  gap: 0.75rem;
  padding: 1rem 0;
}

.user-message {
  flex-direction: row-reverse;
}

.user-message .message-content {
  align-items: flex-end;
}

/* Avatar */
.message-avatar {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--ai-card-bg);
  border: 1px solid var(--ai-card-border);
  font-size: 1rem;
}

.user-message .message-avatar {
  background: var(--primary-color);
  border-color: var(--primary-color);
}

/* Message Content Container */
.message-content {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-width: 80%;
}

/* Message Text Bubble */
.message-text {
  padding: 0.75rem 1rem;
  border-radius: 16px;
  font-size: 0.9375rem;
  line-height: 1.5;
  color: var(--text-color);
}

.user-message .message-text {
  background: var(--primary-color);
  color: white;
  border-bottom-right-radius: 4px;
}

.assistant-message .message-text {
  background: var(--ai-card-bg);
  border: 1px solid var(--ai-card-border);
  border-bottom-left-radius: 4px;
}

/* Code Blocks */
.message-text :deep(.code-block),
.message-text :deep(.math-code-block) {
  display: block;
  margin: 0.5rem 0;
  padding: 0.75rem;
  background: var(--app-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow-x: auto;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.8125rem;
}

/* Inline Code */
.message-text :deep(.inline-code),
.message-text :deep(.math-inline-code) {
  padding: 0.125rem 0.375rem;
  background: var(--ai-cmd-bg);
  border-radius: 4px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.875em;
}

/* Math Styles */
.message-text :deep(.math-display) {
  margin: 0.5rem 0;
  overflow-x: auto;
}

.message-text :deep(.math-inline) {
  display: inline;
}

.message-text :deep(.katex) {
  font-size: 1.05em;
}

.message-text :deep(.katex-display) {
  margin: 0.5rem 0;
  overflow-x: auto;
  overflow-y: hidden;
}

/* Action Buttons */
.message-actions {
  display: flex;
  gap: 0.25rem;
  opacity: 0;
  transition: opacity 0.15s;
}

.chat-message:hover .message-actions {
  opacity: 1;
}

.message-actions button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: none;
  border: none;
  border-radius: 6px;
  color: var(--text-color-secondary);
  cursor: pointer;
  transition: all 0.15s;
}

.message-actions button:hover {
  background: var(--ai-card-bg);
  color: var(--text-color);
}
</style>
