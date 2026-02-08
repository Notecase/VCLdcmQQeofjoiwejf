<script setup lang="ts">
/**
 * CourseExplainSidebar — AI Tutor sidebar for course viewer.
 * Matches AISidebar agent tab design: glassmorphism, role labels, inline input.
 */
import { ref, watch, nextTick, computed } from 'vue'
import { Minimize2, GraduationCap, ArrowUp, Loader2, Highlighter, X } from 'lucide-vue-next'
import type { Lesson } from '@inkdown/shared/types'
import type { ExplainLessonContext } from '@inkdown/shared/types'
import { useCourseExplainStore } from '@/stores/courseExplain'
import ExplainChatMessage from './ExplainChatMessage.vue'

const props = defineProps<{
  lesson: Lesson | null
  courseTitle?: string
  moduleTitle?: string
}>()

defineEmits<{
  close: []
}>()

const explainStore = useCourseExplainStore()
const messagesAreaRef = ref<HTMLElement>()
const inputValue = ref('')

function scrollToBottom() {
  nextTick(() => {
    const el = messagesAreaRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

watch(() => explainStore.messages.length, scrollToBottom)

function buildLessonContext(): ExplainLessonContext | null {
  if (!props.lesson) return null
  return {
    courseTitle: props.courseTitle || 'Unknown Course',
    moduleTitle: props.moduleTitle || 'Unknown Module',
    lessonTitle: props.lesson.title,
    lessonType: props.lesson.type as ExplainLessonContext['lessonType'],
    markdown: props.lesson.content.markdown || '',
    keyTerms: props.lesson.content.keyTerms,
    keyPoints: props.lesson.content.keyPoints,
    transcript: props.lesson.content.transcript,
  }
}

function handleSubmit() {
  if (!inputValue.value.trim() || explainStore.isStreaming) return
  const ctx = buildLessonContext()
  if (!ctx) return
  const msg = inputValue.value
  inputValue.value = ''
  explainStore.sendMessage(msg, ctx)
}

function handleKeydown(e: globalThis.KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSubmit()
  }
}

function clearHighlight() {
  explainStore.clearHighlightedText()
}

const truncatedHighlight = computed(() => {
  const text = explainStore.highlightedText
  if (!text) return ''
  const max = 80
  return text.length > max ? `${text.slice(0, max)}...` : text
})

const canSend = computed(() => inputValue.value.trim().length > 0 && !explainStore.isStreaming)
</script>

<template>
  <aside class="course-explain-sidebar">
    <!-- Header -->
    <header class="sidebar-header">
      <div class="header-left">
        <GraduationCap :size="14" class="header-icon" />
        <span class="header-title">AI Tutor</span>
      </div>
      <button class="close-btn" title="Close" @click="$emit('close')">
        <Minimize2 :size="14" />
      </button>
    </header>

    <!-- Messages -->
    <div ref="messagesAreaRef" class="messages-area">
      <!-- Welcome state -->
      <div v-if="explainStore.messages.length === 0" class="welcome-state">
        <p class="welcome-text">
          Ask me anything about this lesson. I can help you understand, summarize, or explain concepts.
        </p>
      </div>

      <!-- Messages -->
      <ExplainChatMessage
        v-for="msg in explainStore.messages"
        :key="msg.id"
        :message="msg"
        :is-streaming="explainStore.isStreaming && msg === explainStore.messages[explainStore.messages.length - 1]"
      />

      <!-- Error -->
      <div v-if="explainStore.error" class="error-banner">
        {{ explainStore.error }}
      </div>
    </div>

    <!-- Input Area -->
    <div class="ai-input-wrapper">
      <div class="ai-input-box">
        <!-- Highlight context inside input -->
        <div v-if="explainStore.highlightedText" class="input-context">
          <Highlighter :size="12" class="context-icon" />
          <span class="context-title">{{ truncatedHighlight }}</span>
          <button class="context-dismiss" @click="clearHighlight">
            <X :size="11" />
          </button>
        </div>

        <div class="input-area">
          <textarea
            v-model="inputValue"
            placeholder="Ask about this lesson..."
            :disabled="explainStore.isStreaming"
            rows="1"
            @keydown="handleKeydown"
          />
        </div>

        <div class="input-footer">
          <div class="footer-left" />
          <button
            class="send-circle-btn"
            :class="{ active: canSend }"
            :disabled="!canSend"
            @click="handleSubmit"
          >
            <ArrowUp v-if="!explainStore.isStreaming" :size="16" />
            <Loader2 v-else :size="16" class="spin" />
          </button>
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
/* Sidebar container — matches AISidebar */
.course-explain-sidebar {
  width: 320px;
  flex-shrink: 0;
  height: 100%;
  position: relative;
  background: var(--ai-sidebar-bg, #010409);
  border-left: none;
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.12);
  display: flex;
  flex-direction: column;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

/* Gradient overlay */
.course-explain-sidebar::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 50%;
  background: var(--ai-gradient-overlay, linear-gradient(180deg, rgba(88, 166, 255, 0.02) 0%, transparent 100%));
  pointer-events: none;
  z-index: 0;
}

/* Header — glassmorphism */
.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  border-bottom: 1px solid var(--ai-divider, rgba(255, 255, 255, 0.06));
  background: var(--ai-header-bg, rgba(22, 27, 34, 0.7));
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  height: 44px;
  position: relative;
  z-index: 1;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-icon {
  color: #58a6ff;
}

.header-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color, #e2e8f0);
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: #6e7681;
  cursor: pointer;
  transition: all 0.15s;
}

.close-btn:hover {
  color: #58a6ff;
}

/* Messages area */
.messages-area {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
  position: relative;
  z-index: 1;
}

.messages-area::-webkit-scrollbar {
  width: 4px;
}

.messages-area::-webkit-scrollbar-thumb {
  background: var(--ai-divider, rgba(255, 255, 255, 0.06));
  border-radius: 2px;
}

/* Welcome */
.welcome-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
}

.welcome-text {
  font-size: 13px;
  color: var(--text-color-secondary, #8b949e);
  margin: 0;
  line-height: 1.6;
}

/* Error */
.error-banner {
  margin: 8px 0;
  padding: 8px 12px;
  border-radius: 6px;
  background: rgba(248, 81, 73, 0.1);
  border: 1px solid rgba(248, 81, 73, 0.2);
  color: #f85149;
  font-size: 12px;
}

/* Input wrapper — matches AISidebar */
.ai-input-wrapper {
  padding: 12px;
  position: relative;
  z-index: 1;
}

.ai-input-box {
  background: rgba(22, 27, 34, 0.65);
  backdrop-filter: blur(12px) saturate(180%);
  -webkit-backdrop-filter: blur(12px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.04);
  border-radius: 12px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.1);
  transition: border-color 0.2s;
}

.ai-input-box:focus-within {
  border-color: rgba(88, 166, 255, 0.15);
}

/* Context pill inside input */
.input-context {
  display: flex;
  align-items: center;
  gap: 6px;
}

.context-icon {
  color: #f59e0b;
  flex-shrink: 0;
}

.context-title {
  font-size: 12px;
  color: #8b949e;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

.context-dismiss {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 3px;
  border: none;
  background: transparent;
  color: #6e7681;
  cursor: pointer;
  transition: all 0.15s;
}

.context-dismiss:hover {
  color: #e2e8f0;
}

/* Textarea */
.input-area textarea {
  width: 100%;
  background: transparent;
  border: none;
  color: var(--text-color, #e2e8f0);
  font-size: 13px;
  line-height: 1.5;
  resize: none;
  outline: none;
  font-family: inherit;
  min-height: 20px;
  max-height: 120px;
}

.input-area textarea::placeholder {
  color: #484f58;
}

/* Footer */
.input-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.footer-left {
  display: flex;
  align-items: center;
  gap: 2px;
}

/* Send button — circular, matches AISidebar */
.send-circle-btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #21262d;
  color: #6e7681;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: not-allowed;
  transition: all 0.2s;
}

.send-circle-btn.active {
  background: var(--primary-gradient, linear-gradient(135deg, #10b981, #059669));
  color: white;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
}

.send-circle-btn.active:hover {
  transform: scale(1.05);
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.spin {
  animation: spin 1s linear infinite;
}
</style>
