<script setup lang="ts">
/**
 * ChatComposer - Wide, short chat input composer with send/stop buttons.
 */
import { ref, watch, nextTick, onMounted } from 'vue'
import { ArrowUp, Square } from 'lucide-vue-next'

const props = defineProps<{
  isProcessing: boolean
  placeholder?: string
  demoMode?: boolean
}>()

const emit = defineEmits<{
  submit: [message: string]
  stop: []
}>()

const inputValue = ref('')
const inputRef = ref<HTMLTextAreaElement | null>(null)

function autoResize() {
  const textarea = inputRef.value
  if (!textarea) return
  textarea.style.height = 'auto'
  textarea.style.height = `${Math.min(textarea.scrollHeight, 80)}px`
}

watch(inputValue, () => {
  nextTick(autoResize)
})

function handleSubmit() {
  const value = inputValue.value.trim()
  if (!value) return
  inputValue.value = ''
  nextTick(() => {
    if (inputRef.value) {
      inputRef.value.style.height = 'auto'
    }
  })
  emit('submit', value)
}

function handleStop() {
  emit('stop')
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSubmit()
  }
}

const dynamicPlaceholder = ref('')
watch(
  () => [props.isProcessing, props.demoMode],
  ([streaming, demo]) => {
    if (demo) {
      dynamicPlaceholder.value = 'AI chat available in full version'
    } else {
      dynamicPlaceholder.value = streaming
        ? 'Running...'
        : props.placeholder || 'Write your message...'
    }
  },
  { immediate: true }
)

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
      <div
        v-if="$slots.top"
        class="composer-top"
      >
        <slot name="top" />
      </div>
      <div class="composer-body">
        <textarea
          ref="inputRef"
          v-model="inputValue"
          :placeholder="dynamicPlaceholder"
          :disabled="isProcessing || demoMode"
          rows="1"
          @keydown="handleKeydown"
        />
        <button
          v-if="isProcessing"
          class="action-btn stop-btn"
          type="button"
          title="Stop"
          @click="handleStop"
        >
          <Square :size="14" />
        </button>
        <button
          v-else
          class="action-btn send-btn"
          :class="{ active: inputValue.trim() }"
          :disabled="!inputValue.trim()"
          title="Send (Enter)"
          type="button"
          @click="handleSubmit"
        >
          <ArrowUp :size="16" />
        </button>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.chat-composer {
  padding: 0 80px 20px;
  flex-shrink: 0;
}

.composer-card {
  background: rgba(22, 27, 34, 0.7);
  backdrop-filter: blur(16px) saturate(180%);
  -webkit-backdrop-filter: blur(16px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 24px;
  overflow: hidden;
  transition:
    border-color 0.2s,
    box-shadow 0.2s;
}

.composer-card:focus-within {
  border-color: rgba(88, 166, 255, 0.25);
  box-shadow: 0 0 0 1px rgba(88, 166, 255, 0.15);
}

.composer-top {
  border-bottom: 1px solid var(--border-color, #30363d);
  background: rgba(255, 255, 255, 0.02);
}

.composer-body {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 20px;
}

.composer-body textarea {
  flex: 1;
  border: none;
  outline: none;
  resize: none;
  background: transparent;
  font-size: 14px;
  font-family: inherit;
  color: var(--text-color, #e2e8f0);
  min-height: 20px;
  max-height: 60px;
  overflow-y: auto;
  padding: 0;
  line-height: 1.4;
}

.composer-body textarea::placeholder {
  color: rgba(139, 148, 158, 0.5);
}

.action-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  cursor: pointer;
  transition: all 0.15s;
}

.send-btn {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(139, 148, 158, 0.4);
  cursor: not-allowed;
}

.send-btn.active {
  background: #58a6ff;
  color: #ffffff;
  cursor: pointer;
}

.send-btn.active:hover {
  background: #79c0ff;
  transform: scale(1.05);
}

.stop-btn {
  background: rgba(248, 81, 73, 0.12);
  color: #f85149;
}

.stop-btn:hover {
  background: rgba(248, 81, 73, 0.2);
}
</style>
