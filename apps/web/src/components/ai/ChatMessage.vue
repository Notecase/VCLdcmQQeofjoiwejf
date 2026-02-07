<script setup lang="ts">
/**
 * ChatMessage - Minimal Flow Design
 *
 * Features:
 * - Borderless layout with spacing-based separation
 * - Simple text role labels (no pill badges)
 * - Model chip next to role
 * - Timestamp on far right (subtle)
 * - Hover actions slide in from right
 * - Streaming state with subtle glow
 * - Inline tool call cards
 */
import { computed, ref } from 'vue'
import type { ChatMessage, CompletedArtifact } from '@/stores/ai'
import { useAIStore } from '@/stores/ai'
import { renderMathContent } from '@/utils/mathRenderer'
import {
  Copy,
  Check,
  RotateCcw,
  ThumbsUp,
  ThumbsDown,
} from 'lucide-vue-next'
import StreamingCursor from './shared/StreamingCursor.vue'
import ToolCallCard from './ToolCallCard.vue'
import ArtifactSummaryCard from './ArtifactSummaryCard.vue'
import MessageThinkingSteps from './MessageThinkingSteps.vue'

const props = defineProps<{
  message: ChatMessage
}>()

const emit = defineEmits<{
  retry: []
}>()

const store = useAIStore()

// Computed properties
const isUser = computed(() => props.message.role === 'user')
const isAssistant = computed(() => props.message.role === 'assistant')
const displayContent = computed(() => props.message.content || '')
const renderedContent = computed(() => renderMathContent(displayContent.value))

// Check if this message is currently streaming
const isStreaming = computed(() => {
  if (!isAssistant.value) return false
  const session = store.activeSession
  if (!session) return false
  const messages = session.messages
  const lastMessage = messages[messages.length - 1]
  return store.isProcessing && lastMessage?.id === props.message.id
})

// Tool calls from message (if any)
const toolCalls = computed(() => props.message.toolCalls || [])

// Completed artifacts linked to this message
const completedArtifacts = computed(() =>
  store.getCompletedArtifactsForMessage(props.message.id)
)

// Check if there are thinking steps for this message
const hasThinkingSteps = computed(() =>
  store.getThinkingStepsForMessage(props.message.id).length > 0
)

// Format timestamp
const formattedTime = computed(() => {
  if (!props.message.createdAt) return ''
  const date = new Date(props.message.createdAt)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
})

// Role display
const roleLabel = computed(() => (isUser.value ? 'You' : 'AI'))
const roleClass = computed(() => (isUser.value ? 'user' : 'assistant'))

// Hover state for actions
const isHovered = ref(false)
const showActions = computed(() => isHovered.value && isAssistant.value && displayContent.value)

// Copy functionality
const copied = ref(false)

function copyMessage() {
  window.navigator.clipboard.writeText(displayContent.value)
  copied.value = true
  setTimeout(() => {
    copied.value = false
  }, 2000)
}

function handleRetry() {
  emit('retry')
}

// Feedback (placeholder for future implementation)
function handleFeedback(type: 'up' | 'down') {
  console.log('Feedback:', type, props.message.id)
  // TODO: Implement feedback functionality
}

// Artifact action handlers
function handleScrollToArtifact(artifact: CompletedArtifact) {
  // TODO: Implement scroll to artifact in editor
  console.log('Scroll to artifact:', artifact.title, 'in note:', artifact.noteId)
}

function handleEditArtifact(artifact: CompletedArtifact) {
  // TODO: Implement edit artifact
  console.log('Edit artifact:', artifact.title)
}

function handleDeleteArtifact(artifact: CompletedArtifact) {
  // TODO: Implement delete artifact
  console.log('Delete artifact:', artifact.title)
}
</script>

<template>
  <div
    class="message-card"
    :class="{
      user: isUser,
      assistant: isAssistant,
      streaming: isStreaming,
    }"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
  >
    <!-- Header row -->
    <div class="message-header">
      <div class="header-left">
        <span class="role-label" :class="roleClass">{{ roleLabel }}</span>
        <span v-if="message.model" class="model-chip">{{ message.model }}</span>
      </div>
      <span v-if="formattedTime" class="timestamp">{{ formattedTime }}</span>
    </div>

    <!-- Thinking steps for this message (assistant only) -->
    <MessageThinkingSteps
      v-if="isAssistant && hasThinkingSteps"
      :message-id="message.id"
      class="message-thinking"
    />

    <!-- Inline tool calls -->
    <ToolCallCard
      v-for="tool in toolCalls"
      :key="tool.id"
      :tool="tool"
      class="embedded-tool"
    />

    <!-- Content -->
    <div class="message-body">
      <div class="prose" v-html="renderedContent" />
      <StreamingCursor v-if="isStreaming" />
    </div>

    <!-- Completed artifact cards -->
    <ArtifactSummaryCard
      v-for="artifact in completedArtifacts"
      :key="artifact.id"
      :title="artifact.title"
      :note-id="artifact.noteId"
      @scroll-to-artifact="handleScrollToArtifact(artifact)"
      @edit-artifact="handleEditArtifact(artifact)"
      @delete-artifact="handleDeleteArtifact(artifact)"
    />

    <!-- Hover actions - positioned below all content -->
    <Transition name="slide-in">
      <div v-if="showActions" class="message-actions">
        <button
          class="action-btn"
          :title="copied ? 'Copied!' : 'Copy'"
          @click="copyMessage"
        >
          <Check v-if="copied" :size="12" />
          <Copy v-else :size="12" />
        </button>
        <button class="action-btn" title="Retry" @click="handleRetry">
          <RotateCcw :size="12" />
        </button>
        <button class="action-btn" title="Good response" @click="handleFeedback('up')">
          <ThumbsUp :size="12" />
        </button>
        <button class="action-btn" title="Bad response" @click="handleFeedback('down')">
          <ThumbsDown :size="12" />
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* ============================================
 * MESSAGE CARD - Minimal Flow Design
 * ============================================ */

.message-card {
  background: transparent;
  border: none;
  border-radius: 0;
  padding: 16px 0;
  margin-bottom: 0;
  border-bottom: 1px solid var(--chat-separator);
  transition: background var(--transition-normal) ease;
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

/* ============================================
 * HEADER
 * ============================================ */

.message-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.role-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
}

.role-label.user {
  color: var(--role-user-color);
}

.role-label.assistant {
  color: var(--role-assistant-color);
}

.model-chip {
  font-size: 10px;
  color: var(--text-muted);
  padding: 2px 8px;
  background: var(--surface-2);
  border-radius: 6px;
  border: 1px solid var(--border-subtle);
}

.timestamp {
  font-size: 11px;
  color: var(--text-muted);
  opacity: 0;
  transition: opacity var(--transition-fast) ease;
}

.message-card:hover .timestamp {
  opacity: 1;
}

/* ============================================
 * EMBEDDED TOOL CALLS
 * ============================================ */

.embedded-tool {
  margin-bottom: 12px;
}

/* ============================================
 * MESSAGE BODY
 * ============================================ */

.message-body {
  font-size: 14px;
  line-height: 1.65;
  color: var(--text-primary);
  word-wrap: break-word;
}

.message-card.user .message-body {
  color: var(--text-secondary);
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
  background: var(--surface-2);
  border-radius: 5px;
  color: #f0883e;
}

.prose :deep(pre) {
  margin: 1em 0;
  padding: 14px 16px;
  background: var(--surface-1);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  overflow-x: auto;
}

.prose :deep(pre code) {
  padding: 0;
  background: none;
  color: var(--text-primary);
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

.prose :deep(blockquote) {
  margin: 1em 0;
  padding: 0.6em 1.2em;
  border-left: 3px solid var(--stream-cursor);
  color: var(--text-secondary);
  background: var(--surface-2);
  border-radius: 0 6px 6px 0;
}

.prose :deep(a) {
  color: var(--stream-cursor);
  text-decoration: none;
}

.prose :deep(a:hover) {
  text-decoration: underline;
}

.prose :deep(strong) {
  font-weight: 600;
  color: var(--text-primary);
}

.prose :deep(em) {
  font-style: italic;
}

/* Math */
.prose :deep(.math-display) {
  margin: 1em 0;
  overflow-x: auto;
}

.prose :deep(.katex) {
  font-size: 1.05em;
}

/* ============================================
 * HOVER ACTIONS - Inline below content
 * ============================================ */

.message-actions {
  display: flex;
  justify-content: flex-end;
  gap: 2px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid transparent;
}

.message-card:hover .message-actions {
  border-top-color: var(--border-subtle);
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--text-muted);
  cursor: pointer;
  transition: all var(--transition-fast) ease;
}

.action-btn:hover {
  background: var(--surface-3);
  color: var(--text-primary);
}

.action-btn:active {
  transform: scale(0.95);
}

/* ============================================
 * TRANSITIONS
 * ============================================ */

.slide-in-enter-active,
.slide-in-leave-active {
  transition: all var(--transition-normal) var(--ease-out-expo);
}

.slide-in-enter-from,
.slide-in-leave-to {
  opacity: 0;
  transform: translateX(8px);
}
</style>
