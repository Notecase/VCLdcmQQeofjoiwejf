<script setup lang="ts">
/**
 * ChatComposer - Extracted chat input composer
 * Textarea + tool buttons + send button
 */
import { ref, watch, nextTick, onMounted } from 'vue'
import {
  ArrowUp,
  Paperclip,
  Globe,
  Mic,
  Loader2,
} from 'lucide-vue-next'

defineProps<{
  isProcessing: boolean
  placeholder?: string
}>()

const emit = defineEmits<{
  submit: [message: string]
}>()

const inputValue = ref('')
const inputRef = ref<HTMLTextAreaElement | null>(null)

function autoResize() {
  const textarea = inputRef.value
  if (!textarea) return
  textarea.style.height = 'auto'
  textarea.style.height = `${Math.min(textarea.scrollHeight, 140)}px`
}

watch(inputValue, () => {
  nextTick(autoResize)
})

function handleSubmit() {
  const value = inputValue.value.trim()
  if (!value) return
  inputValue.value = ''
  // Reset textarea height after clearing
  nextTick(() => {
    if (inputRef.value) {
      inputRef.value.style.height = 'auto'
    }
  })
  emit('submit', value)
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSubmit()
  }
}

onMounted(() => {
  setTimeout(() => {
    inputRef.value?.focus()
  }, 120)
})

defineExpose({ inputRef })
</script>

<template>
  <footer class="chat-composer">
    <div class="composer-card">
      <div class="composer-input">
        <textarea
          ref="inputRef"
          v-model="inputValue"
          :placeholder="placeholder || 'Ask anything, or type \'@\' to add to a note...'"
          :disabled="isProcessing"
          rows="1"
          @keydown="handleKeydown"
        />
      </div>

      <div class="composer-actions">
        <div class="actions-left">
          <button class="tool-btn stub" disabled title="Coming soon">
            <Paperclip :size="14" />
            Attach
          </button>
          <button class="tool-btn stub" disabled title="Coming soon">
            <Mic :size="14" />
            Voice
          </button>
          <button class="tool-btn stub" disabled title="Coming soon">
            <Globe :size="14" />
            Research
          </button>
        </div>

        <button
          class="send-btn"
          :class="{ active: inputValue.trim() && !isProcessing }"
          :disabled="!inputValue.trim() || isProcessing"
          title="Send (Enter)"
          @click="handleSubmit"
        >
          <Loader2 v-if="isProcessing" :size="16" class="spin" />
          <ArrowUp v-else :size="16" />
        </button>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.chat-composer {
  padding: 0 24px 20px;
  flex-shrink: 0;
}

.composer-card {
  background: var(--card-bg, rgba(255, 255, 255, 0.06));
  border: 1px solid var(--border-color, #30363d);
  border-radius: 16px;
  padding: 14px 16px 12px;
}

.composer-input textarea {
  width: 100%;
  border: none;
  outline: none;
  resize: none;
  background: transparent;
  font-size: 14px;
  font-family: inherit;
  color: var(--text-color, #e6edf3);
  min-height: 28px;
  max-height: 140px;
  overflow-y: auto;
}

.composer-input textarea::placeholder {
  color: var(--text-color-secondary, #8b949e);
}

.composer-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
}

.actions-left {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.tool-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: 999px;
  border: 1px solid var(--border-color, #30363d);
  background: transparent;
  font-size: 12px;
  color: var(--text-color-secondary, #8b949e);
  cursor: pointer;
  transition: all 0.15s;
}

.tool-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-color, #e6edf3);
}

.tool-btn.stub {
  opacity: 0.4;
  cursor: not-allowed;
  pointer-events: none;
}

.send-btn {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-color-secondary, #8b949e);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: not-allowed;
  transition: all 0.2s ease;
}

.send-btn.active {
  background: var(--primary-color, #7c9ef8);
  color: #ffffff;
  cursor: pointer;
}

.send-btn.active:hover {
  transform: translateY(-1px);
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
