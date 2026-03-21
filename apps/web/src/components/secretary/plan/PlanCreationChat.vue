<script setup lang="ts">
/**
 * PlanCreationChat — Step 2 of the plan creation wizard.
 * AI chat that uses the secretary SSE streaming endpoint to
 * collaboratively build a learning roadmap, then saves it.
 */
import { ref, onMounted, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import { authFetchSSE } from '@/utils/api'
import { useSecretaryStore } from '@/stores/secretary'
import SecretaryMessageCard from '@/components/secretary/SecretaryMessageCard.vue'
import type { SecretaryChatMessage, SecretaryToolCall } from '@/stores/secretary'
import type { SecretaryStreamEvent } from '@inkdown/shared/types'
import { ArrowUp, Loader2, Sparkles } from 'lucide-vue-next'
import type { PlanFormData } from './PlanCreationForm.vue'

const props = defineProps<{
  formData: PlanFormData
}>()

const router = useRouter()
const store = useSecretaryStore()

const API_BASE = import.meta.env.VITE_API_BASE?.replace('/api/agent', '') || ''
const SECRETARY_API = `${API_BASE}/api/secretary`
const BROWSER_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone
const TIMEZONE_HEADERS = { 'X-Timezone': BROWSER_TIMEZONE }

// Chat state
const messages = ref<SecretaryChatMessage[]>([])
const isStreaming = ref(false)
const streamingContent = ref('')
const streamingToolCalls = ref<SecretaryToolCall[]>([])
const streamingThinkingSteps = ref<string[]>([])
const inputValue = ref('')
const messagesRef = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLTextAreaElement | null>(null)
const planCreated = ref(false)
const createdPlanId = ref<string | null>(null)
const threadId = ref<string | null>(null)
const seenToolCallSignatures = new Set<string>()
let liveAssistantMsg: SecretaryChatMessage | null = null

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`)
  return `{${entries.join(',')}}`
}

function scrollToBottom() {
  nextTick(() => {
    if (messagesRef.value) {
      messagesRef.value.scrollTop = messagesRef.value.scrollHeight
    }
  })
}

function handleStreamEvent(event: SecretaryStreamEvent) {
  switch (event.event) {
    case 'text':
      streamingContent.value += event.data
      if (liveAssistantMsg) liveAssistantMsg.content = streamingContent.value
      scrollToBottom()
      break

    case 'tool_call': {
      let toolData: Record<string, unknown>
      try {
        toolData = (typeof event.data === 'string' ? JSON.parse(event.data) : event.data) as Record<
          string,
          unknown
        >
      } catch {
        break
      }
      const toolName =
        (toolData.toolName as string | undefined) ||
        (toolData.name as string | undefined) ||
        'unknown'
      const toolArgs =
        (toolData.arguments as Record<string, unknown> | undefined) ||
        (toolData.args as Record<string, unknown> | undefined) ||
        {}
      const semanticSignature = `${toolName}:${stableStringify(toolArgs)}`
      if (seenToolCallSignatures.has(semanticSignature)) break
      seenToolCallSignatures.add(semanticSignature)

      const toolId = (toolData.id as string | undefined) || crypto.randomUUID()
      if (streamingToolCalls.value.some((tc) => tc.id === toolId)) break

      const existingByName = [...streamingToolCalls.value]
        .reverse()
        .find((tc) => tc.toolName === toolName)
      if (existingByName) {
        existingByName.arguments = toolArgs
        existingByName.status = 'running'
        break
      }
      streamingToolCalls.value.push({
        id: toolId,
        toolName,
        arguments: toolArgs,
        status: 'running',
      })
      if (liveAssistantMsg) liveAssistantMsg.toolCalls = [...streamingToolCalls.value]
      scrollToBottom()
      break
    }

    case 'tool_result': {
      let resultData: Record<string, unknown>
      try {
        resultData = (
          typeof event.data === 'string' ? JSON.parse(event.data) : event.data
        ) as Record<string, unknown>
      } catch {
        break
      }
      let toolCall = streamingToolCalls.value.find(
        (tc) =>
          tc.id ===
          ((resultData.id as string | undefined) || (resultData.toolCallId as string | undefined))
      )
      if (!toolCall) {
        toolCall = [...streamingToolCalls.value]
          .reverse()
          .find(
            (tc) =>
              tc.status === 'running' &&
              tc.toolName ===
                ((resultData.toolName as string | undefined) ||
                  (resultData.name as string | undefined))
          )
      }
      if (toolCall) {
        toolCall.result =
          (resultData.result as string | undefined) ||
          (resultData.output as string | undefined) ||
          ''
        toolCall.status = resultData.error ? 'error' : 'complete'
        if (liveAssistantMsg) liveAssistantMsg.toolCalls = [...streamingToolCalls.value]
      }

      // Detect save_roadmap tool completion
      const toolName =
        (resultData.toolName as string | undefined) || (resultData.name as string | undefined) || ''
      if (toolName === 'save_roadmap' && !resultData.error) {
        planCreated.value = true
        // Try to extract plan ID from result
        try {
          const resultStr = (resultData.result as string) || (resultData.output as string) || ''
          const parsed = JSON.parse(resultStr)
          if (parsed?.planId) createdPlanId.value = parsed.planId
        } catch {
          // Non-critical
        }
      }
      scrollToBottom()
      break
    }

    case 'thinking':
      streamingThinkingSteps.value.push(event.data)
      if (liveAssistantMsg) liveAssistantMsg.thinkingSteps = [...streamingThinkingSteps.value]
      break

    case 'memory_updated':
      planCreated.value = true
      // Refresh secretary store memory
      store.refreshMemoryFiles()
      scrollToBottom()
      break

    case 'done': {
      // Check for threadId in done event
      const doneData = typeof event.data === 'string' ? event.data : ''
      try {
        const parsed = JSON.parse(doneData)
        if (parsed?.threadId) threadId.value = parsed.threadId
      } catch {
        // Non-critical
      }
      break
    }

    case 'error':
      // Append error to content
      if (liveAssistantMsg) {
        liveAssistantMsg.content += `\n\n**Error:** ${event.data}`
      }
      break
  }
}

async function sendMessage(message: string) {
  if (!message.trim() || isStreaming.value) return

  // Add user message
  const userMsg: SecretaryChatMessage = {
    id: crypto.randomUUID(),
    role: 'user',
    content: message.trim(),
    createdAt: new Date(),
  }
  messages.value.push(userMsg)

  // Add empty assistant message for in-place streaming
  const assistantMsg: SecretaryChatMessage = {
    id: crypto.randomUUID(),
    role: 'assistant',
    content: '',
    createdAt: new Date(),
    _streaming: true,
  }
  messages.value.push(assistantMsg)
  liveAssistantMsg = assistantMsg

  isStreaming.value = true
  streamingContent.value = ''
  streamingToolCalls.value = []
  streamingThinkingSteps.value = []
  seenToolCallSignatures.clear()

  scrollToBottom()

  try {
    const res = await authFetchSSE(`${SECRETARY_API}/chat`, {
      method: 'POST',
      headers: TIMEZONE_HEADERS,
      body: JSON.stringify({
        message: message.trim(),
        threadId: threadId.value || undefined,
      }),
    })

    if (!res.ok) {
      const errorText = await res.text()
      throw new Error(errorText || `Request failed (${res.status})`)
    }

    if (!res.body) throw new Error('No response body')

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data:')) {
          try {
            const event = JSON.parse(line.slice(5).trim()) as SecretaryStreamEvent
            handleStreamEvent(event)
          } catch {
            // skip malformed JSON
          }
        }
      }
    }
  } catch (err) {
    if (liveAssistantMsg && !liveAssistantMsg.content) {
      liveAssistantMsg.content = `Failed to get response: ${err instanceof Error ? err.message : 'Unknown error'}`
    }
  } finally {
    // Finalize assistant message
    if (liveAssistantMsg) {
      if (streamingContent.value || streamingToolCalls.value.length > 0) {
        liveAssistantMsg.content = streamingContent.value
        liveAssistantMsg.toolCalls =
          streamingToolCalls.value.length > 0 ? [...streamingToolCalls.value] : undefined
        liveAssistantMsg.thinkingSteps =
          streamingThinkingSteps.value.length > 0 ? [...streamingThinkingSteps.value] : undefined
      }
      delete liveAssistantMsg._streaming
    }
    isStreaming.value = false
    streamingContent.value = ''
    streamingToolCalls.value = []
    streamingThinkingSteps.value = []
    liveAssistantMsg = null
  }
}

function handleSubmit() {
  if (!inputValue.value.trim() || isStreaming.value) return
  sendMessage(inputValue.value.trim())
  inputValue.value = ''
  nextTick(() => {
    if (inputRef.value) inputRef.value.style.height = 'auto'
  })
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSubmit()
  }
}

function handleCreatePlan() {
  if (isStreaming.value) return
  sendMessage(
    'Please save this roadmap as a plan now using the save_roadmap tool. Use the plan name, dates, and schedule I provided earlier.'
  )
}

function goToWorkspace() {
  if (createdPlanId.value) {
    router.push(`/calendar/plan/${createdPlanId.value}`)
  } else {
    router.push('/calendar/plans')
  }
}

function autoResize() {
  const textarea = inputRef.value
  if (!textarea) return
  textarea.style.height = 'auto'
  textarea.style.height = `${Math.min(textarea.scrollHeight, 100)}px`
}

watch(inputValue, () => nextTick(autoResize))

// Auto-scroll on new messages
watch(
  () => messages.value.length,
  () => scrollToBottom()
)

// Auto-send initial message on mount
onMounted(() => {
  const daysStr = props.formData.activeDays.join(', ')
  const initialMessage = [
    `I want to create a learning plan with the following details:`,
    `- **Plan name:** ${props.formData.name}`,
    `- **Date range:** ${props.formData.startDate} to ${props.formData.endDate}`,
    `- **Hours per day:** ${props.formData.hoursPerDay}`,
    `- **Active days:** ${daysStr}`,
    ``,
    `Please create a detailed roadmap for this plan. Break it down into phases with specific topics, milestones, and a realistic timeline that fits my schedule.`,
  ].join('\n')

  sendMessage(initialMessage)

  nextTick(() => {
    inputRef.value?.focus()
  })
})
</script>

<template>
  <div class="plan-chat">
    <!-- Messages area -->
    <div
      ref="messagesRef"
      class="chat-messages"
    >
      <SecretaryMessageCard
        v-for="msg in messages"
        :key="msg.id"
        :message="msg"
        :is-streaming="Boolean(msg._streaming)"
      />
    </div>

    <!-- Plan created success -->
    <div
      v-if="planCreated"
      class="plan-created-banner"
    >
      <Sparkles
        :size="18"
        class="banner-icon"
      />
      <span>Plan created successfully!</span>
      <button
        class="go-to-plan-btn"
        @click="goToWorkspace"
      >
        Open workspace
      </button>
    </div>

    <!-- Input area -->
    <div class="chat-input-area">
      <div class="input-composer">
        <textarea
          ref="inputRef"
          v-model="inputValue"
          class="input-field"
          placeholder="Refine the roadmap..."
          :disabled="isStreaming"
          rows="1"
          @keydown="handleKeydown"
        />
        <div class="input-footer">
          <div class="input-left">
            <button
              v-if="!planCreated"
              class="create-plan-btn"
              :disabled="isStreaming || messages.length < 2"
              @click="handleCreatePlan"
            >
              <Sparkles :size="14" />
              Create Plan
            </button>
          </div>
          <button
            class="send-btn"
            :class="{ active: inputValue.trim() && !isStreaming }"
            :disabled="!inputValue.trim() || isStreaming"
            @click="handleSubmit"
          >
            <Loader2
              v-if="isStreaming"
              :size="14"
              class="spin"
            />
            <ArrowUp
              v-else
              :size="14"
            />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.plan-chat {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

/* Messages */
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px 0;
  min-height: 0;
}

.chat-messages::-webkit-scrollbar {
  width: 4px;
}

.chat-messages::-webkit-scrollbar-track {
  background: transparent;
}

.chat-messages::-webkit-scrollbar-thumb {
  background: var(--border-color, #333338);
  border-radius: 2px;
}

/* Success banner */
.plan-created-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  margin: 0 0 12px;
  border: 1px solid var(--sec-primary-border, rgba(16, 185, 129, 0.3));
  border-radius: var(--sec-radius-sm, 8px);
  background: var(--sec-primary-bg, rgba(16, 185, 129, 0.12));
  color: var(--sec-primary-light, #34d399);
  font-size: 14px;
  font-weight: 500;
}

.banner-icon {
  flex-shrink: 0;
}

.go-to-plan-btn {
  margin-left: auto;
  padding: 6px 16px;
  border: none;
  border-radius: var(--sec-radius-sm, 8px);
  background: var(--sec-primary, #10b981);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity var(--sec-transition-fast, 180ms) ease;
}

.go-to-plan-btn:hover {
  opacity: 0.9;
}

/* Input area */
.chat-input-area {
  flex-shrink: 0;
  padding-top: 8px;
}

.input-composer {
  padding: 12px 14px;
  background: var(--sec-surface-card, rgba(255, 255, 255, 0.03));
  border: 1px solid var(--sec-glass-border, rgba(255, 255, 255, 0.08));
  border-radius: var(--sec-radius-md, 12px);
}

.input-field {
  width: 100%;
  border: none;
  outline: none;
  resize: none;
  background: transparent;
  font-size: 14px;
  font-family: inherit;
  color: var(--text-color, #e2e8f0);
  min-height: 24px;
  max-height: 100px;
  overflow-y: auto;
  line-height: 1.5;
}

.input-field::placeholder {
  color: var(--text-color-secondary, #94a3b8);
  opacity: 0.5;
}

.input-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
}

.input-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.create-plan-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border: 1px solid var(--sec-primary-border, rgba(16, 185, 129, 0.3));
  border-radius: var(--sec-radius-pill, 999px);
  background: var(--sec-primary-bg, rgba(16, 185, 129, 0.12));
  color: var(--sec-primary-light, #34d399);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--sec-transition-fast, 180ms) ease;
}

.create-plan-btn:hover:not(:disabled) {
  background: rgba(16, 185, 129, 0.2);
  border-color: rgba(16, 185, 129, 0.4);
}

.create-plan-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.send-btn {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-color-secondary, #94a3b8);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: not-allowed;
  transition: all 0.15s;
}

.send-btn.active {
  background: var(--text-color, #e2e8f0);
  color: var(--app-bg, #010409);
  cursor: pointer;
}

.send-btn.active:hover {
  opacity: 0.9;
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
