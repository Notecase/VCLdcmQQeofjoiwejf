<script setup lang="ts">
/**
 * MessageBubble — renders a single user or assistant message.
 * Assistant messages render markdown; tool calls are rendered inline.
 */
import { ref, computed } from 'vue'
import { ChevronDown, ChevronRight, Brain } from 'lucide-vue-next'
import { renderMathMarkdown } from '@/utils/mathRenderer'
import ToolCallCard from './ToolCallCard.vue'
import type { ClaudeCodeMessage } from '@/stores/claudeCode'

const props = defineProps<{
  message: ClaudeCodeMessage
}>()

const thinkingExpanded = ref(false)

const renderedContent = computed(() => {
  if (!props.message.content) return ''
  return renderMathMarkdown(props.message.content)
})

const hasThinking = computed(() => props.message.thinkingContent.length > 0)
</script>

<template>
  <div
    class="message-bubble"
    :class="message.role"
  >
    <!-- User message -->
    <div
      v-if="message.role === 'user'"
      class="user-content"
    >
      {{ message.content }}
    </div>

    <!-- Assistant message -->
    <div
      v-else
      class="assistant-content"
    >
      <!-- Thinking section (collapsible) -->
      <div
        v-if="hasThinking"
        class="thinking-section"
      >
        <div
          class="thinking-toggle"
          @click="thinkingExpanded = !thinkingExpanded"
        >
          <Brain :size="12" />
          <span>Thinking</span>
          <component
            :is="thinkingExpanded ? ChevronDown : ChevronRight"
            :size="12"
          />
        </div>
        <div
          v-if="thinkingExpanded"
          class="thinking-content"
        >
          {{ message.thinkingContent }}
        </div>
      </div>

      <!-- Tool calls -->
      <ToolCallCard
        v-for="tc in message.toolCalls"
        :key="tc.id"
        :tool-call="tc"
      />

      <!-- Text content (markdown) -->
      <div
        v-if="message.content"
        class="markdown-content"
        v-html="renderedContent"
      />
    </div>
  </div>
</template>

<style scoped>
.message-bubble {
  padding: 8px 12px;
}

.message-bubble.user {
  display: flex;
  justify-content: flex-end;
}

.user-content {
  background: var(--accent-bg, #2a3a2a);
  color: var(--text-primary, #d4d4d4);
  padding: 8px 12px;
  border-radius: 12px 12px 2px 12px;
  max-width: 85%;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
}

.assistant-content {
  max-width: 100%;
}

.thinking-section {
  margin-bottom: 8px;
}

.thinking-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  color: var(--text-secondary, #8b8b8b);
  font-size: 11px;
  padding: 4px 0;
}

.thinking-toggle:hover {
  color: var(--text-primary, #d4d4d4);
}

.thinking-content {
  font-size: 12px;
  color: var(--text-secondary, #8b8b8b);
  padding: 8px;
  background: var(--bg-secondary, #1a1a1a);
  border-radius: 4px;
  white-space: pre-wrap;
  max-height: 200px;
  overflow-y: auto;
  font-style: italic;
}

.markdown-content {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-primary, #d4d4d4);
}

.markdown-content :deep(p) {
  margin: 0.5em 0;
}

.markdown-content :deep(code) {
  background: var(--bg-secondary, #1a1a1a);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 12px;
}

.markdown-content :deep(pre) {
  background: var(--bg-secondary, #1a1a1a);
  padding: 8px;
  border-radius: 4px;
  overflow-x: auto;
  font-size: 12px;
  margin: 8px 0;
}

.markdown-content :deep(ul),
.markdown-content :deep(ol) {
  padding-left: 20px;
  margin: 0.5em 0;
}

.markdown-content :deep(h1),
.markdown-content :deep(h2),
.markdown-content :deep(h3) {
  margin: 0.8em 0 0.4em;
  font-weight: 600;
}
</style>
