<script setup lang="ts">
/**
 * SecretaryMessageCard — Rich message rendering for the secretary chat.
 * Renders markdown content, tool call cards, and thinking step indicators.
 */
import { computed } from 'vue'
import type { SecretaryChatMessage, SecretaryToolCall } from '@/stores/secretary'
import { renderMathContent } from '@/utils/mathRenderer'
import ToolCallCard from '@/components/ai/ToolCallCard.vue'
import { Loader2, Brain } from 'lucide-vue-next'

const props = defineProps<{
  message: SecretaryChatMessage
  isStreaming: boolean
}>()

const isUser = computed(() => props.message.role === 'user')
const isAssistant = computed(() => props.message.role === 'assistant')
const renderedContent = computed(() => renderMathContent(props.message.content || ''))
const roleLabel = computed(() => isUser.value ? 'You' : 'Secretary')

const formattedTime = computed(() => {
  if (!props.message.createdAt) return ''
  const date = new Date(props.message.createdAt)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
})

const toolCalls = computed(() => props.message.toolCalls || [])
const thinkingSteps = computed(() => props.message.thinkingSteps || [])

/**
 * Adapt SecretaryToolCall to the ToolCall shape expected by ToolCallCard.
 * ToolCallCard expects { id, toolName, arguments, result?, status }
 */
function toToolCallProp(tc: SecretaryToolCall) {
  return {
    id: tc.id,
    toolName: tc.toolName,
    arguments: tc.arguments,
    result: tc.result,
    status: tc.status,
  }
}
</script>

<template>
  <div
    class="secretary-message"
    :class="{
      user: isUser,
      assistant: isAssistant,
      streaming: isStreaming,
    }"
  >
    <!-- Header -->
    <div class="msg-header">
      <span class="role-label" :class="{ user: isUser, assistant: isAssistant }">
        {{ roleLabel }}
      </span>
      <span v-if="formattedTime" class="timestamp">{{ formattedTime }}</span>
    </div>

    <!-- Thinking steps -->
    <div v-if="thinkingSteps.length > 0" class="thinking-section">
      <div class="thinking-header">
        <Brain :size="12" />
        <span>{{ thinkingSteps.length }} thinking step{{ thinkingSteps.length > 1 ? 's' : '' }}</span>
      </div>
    </div>

    <!-- Tool calls -->
    <ToolCallCard
      v-for="tc in toolCalls"
      :key="tc.id"
      :tool="toToolCallProp(tc)"
      class="embedded-tool"
    />

    <!-- Content -->
    <div class="msg-body">
      <div class="prose" v-html="renderedContent" />
      <span v-if="isStreaming" class="streaming-cursor" />
    </div>

    <!-- Streaming typing indicator (no content yet) -->
    <div v-if="isStreaming && !message.content" class="typing-indicator">
      <Loader2 :size="14" class="spin" />
      <span>Thinking...</span>
    </div>
  </div>
</template>

<style scoped>
.secretary-message {
  padding: 14px 0;
}

.msg-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.role-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-color-secondary, #94a3b8);
}

.role-label.user {
  color: var(--primary-color, #7c9ef8);
}

.role-label.assistant {
  color: #34d399;
}

.timestamp {
  font-size: 11px;
  color: var(--text-color-secondary, #94a3b8);
  opacity: 0.5;
}

/* Thinking */
.thinking-section {
  margin-bottom: 8px;
}

.thinking-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-color-secondary, #94a3b8);
  opacity: 0.7;
}

/* Tool calls */
.embedded-tool {
  margin-bottom: 8px;
}

/* Content */
.msg-body {
  font-size: 14px;
  line-height: 1.65;
  color: var(--text-color, #e2e8f0);
  word-wrap: break-word;
}

.secretary-message.user .msg-body {
  color: var(--text-color-secondary, #94a3b8);
}

.streaming-cursor {
  display: inline-block;
  width: 2px;
  height: 14px;
  background: var(--primary-color, #7c9ef8);
  margin-left: 2px;
  animation: blink 1s step-end infinite;
  vertical-align: text-bottom;
}

@keyframes blink {
  50% { opacity: 0; }
}

/* Prose styling */
.prose :deep(p) {
  margin: 0 0 0.85em 0;
}

.prose :deep(p:last-child) {
  margin-bottom: 0;
}

.prose :deep(code) {
  font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace;
  font-size: 0.9em;
  padding: 0.2em 0.45em;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 5px;
  color: #f0883e;
}

.prose :deep(pre) {
  margin: 1em 0;
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border-color, #333338);
  border-radius: 8px;
  overflow-x: auto;
}

.prose :deep(pre code) {
  padding: 0;
  background: none;
  color: var(--text-color, #e2e8f0);
  font-size: 12px;
  line-height: 1.55;
}

.prose :deep(ul),
.prose :deep(ol) {
  margin: 0.6em 0;
  padding-left: 1.6em;
}

.prose :deep(li) {
  margin: 0.3em 0;
}

.prose :deep(strong) {
  font-weight: 600;
  color: var(--text-color, #e2e8f0);
}

.prose :deep(em) {
  font-style: italic;
}

/* Typing */
.typing-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-color-secondary, #94a3b8);
  font-size: 12px;
  padding: 4px 0;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
