<script setup lang="ts">
/**
 * ExplainChatMessage — Chat message renderer for AI Tutor sidebar.
 * Matches AISidebar ChatMessage.vue design: role labels, prose styles, StreamingCursor.
 */
import { computed } from 'vue'
import { renderMathMarkdown } from '@/utils/mathRenderer'
import StreamingCursor from '@/components/ai/shared/StreamingCursor.vue'
import type { ExplainMessage } from '@/stores/courseExplain'

const props = defineProps<{
  message: ExplainMessage
  isStreaming?: boolean
}>()

const isUser = computed(() => props.message.role === 'user')
const isAssistant = computed(() => props.message.role === 'assistant')
const roleLabel = computed(() => (isUser.value ? 'YOU' : 'AI'))
const roleClass = computed(() => (isUser.value ? 'user' : 'assistant'))

const renderedContent = computed(() => {
  if (!isAssistant.value || !props.message.content) return ''
  return renderMathMarkdown(props.message.content)
})
</script>

<template>
  <div
    class="message-card"
    :class="{ user: isUser, assistant: isAssistant, streaming: isStreaming }"
  >
    <!-- Header row -->
    <div class="message-header">
      <span
        class="role-label"
        :class="roleClass"
        >{{ roleLabel }}</span
      >
    </div>

    <!-- Content -->
    <div class="message-body">
      <!-- Highlight context quote -->
      <blockquote
        v-if="message.highlightContext"
        class="highlight-quote"
      >
        {{ message.highlightContext }}
      </blockquote>

      <div
        v-if="isAssistant"
        class="prose"
        v-html="renderedContent"
      />
      <div
        v-else
        class="user-text"
      >
        {{ message.content }}
      </div>
      <StreamingCursor v-if="isStreaming && isAssistant" />
    </div>
  </div>
</template>

<style scoped>
.message-card {
  background: transparent;
  border: none;
  border-radius: 0;
  padding: 16px 0;
  margin-bottom: 0;
  border-bottom: 1px solid var(--chat-separator);
  transition: background 0.15s ease;
  position: relative;
}

.message-card:last-child {
  border-bottom: none;
}

.message-card:hover {
  background: var(--chat-message-hover);
}

.message-card.streaming {
  background: var(--chat-message-streaming);
}

.message-header {
  display: flex;
  align-items: center;
  margin-bottom: 6px;
}

.role-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted, #8b949e);
}

.role-label.user {
  color: var(--role-user-color, #8b949e);
}

.role-label.assistant {
  color: var(--role-assistant-color, #58a6ff);
}

.message-body {
  min-width: 0;
}

.highlight-quote {
  margin: 0 0 10px;
  padding: 6px 10px;
  border-left: 3px solid #f59e0b;
  background: rgba(245, 158, 11, 0.06);
  border-radius: 0 4px 4px 0;
  font-size: 12px;
  color: var(--text-color-secondary, #94a3b8);
  line-height: 1.5;
  max-height: 60px;
  overflow: hidden;
}

.user-text {
  font-size: 14px;
  line-height: 1.65;
  color: var(--text-color, #e2e8f0);
  word-break: break-word;
}

/* Prose deep styles matching ChatMessage */
.prose {
  font-size: 14px;
  line-height: 1.65;
  color: var(--text-color, #e2e8f0);
  word-break: break-word;
}

.prose :deep(p) {
  margin: 0 0 8px;
}

.prose :deep(p:last-child) {
  margin-bottom: 0;
}

.prose :deep(code) {
  font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace;
  font-size: 0.9em;
  padding: 0.2em 0.45em;
  background: var(--surface-2, rgba(255, 255, 255, 0.06));
  border-radius: 5px;
  color: #f0883e;
}

.prose :deep(pre) {
  margin: 1em 0;
  padding: 14px 16px;
  background: var(--surface-1, rgba(0, 0, 0, 0.3));
  border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.04));
  border-radius: 8px;
  overflow-x: auto;
}

.prose :deep(pre code) {
  background: none;
  padding: 0;
  color: inherit;
}

.prose :deep(ul),
.prose :deep(ol) {
  margin: 4px 0 8px;
  padding-left: 20px;
}

.prose :deep(li) {
  margin-bottom: 2px;
}

.prose :deep(strong) {
  color: #ffffff;
}

.prose :deep(blockquote) {
  margin: 1em 0;
  padding: 0.6em 1.2em;
  border-left: 3px solid var(--stream-cursor, #58a6ff);
  color: var(--text-secondary, #8b949e);
  background: var(--surface-2, rgba(255, 255, 255, 0.03));
  border-radius: 0 6px 6px 0;
}

.prose :deep(a) {
  color: #58a6ff;
  text-decoration: none;
}

.prose :deep(a:hover) {
  text-decoration: underline;
}
</style>
