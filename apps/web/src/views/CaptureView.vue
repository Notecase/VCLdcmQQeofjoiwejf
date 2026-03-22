<script setup lang="ts">
import { ref } from 'vue'
import { authFetch } from '@/utils/api'

const text = ref('')
const status = ref<'idle' | 'sending' | 'success' | 'error'>('idle')
const errorMsg = ref('')

const apiBase = import.meta.env.VITE_API_URL || ''

async function capture() {
  if (!text.value.trim()) return

  status.value = 'sending'
  errorMsg.value = ''

  try {
    const res = await authFetch(`${apiBase}/api/inbox/capture`, {
      method: 'POST',
      body: JSON.stringify({ text: text.value.trim() }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'Request failed' }))
      throw new Error(body.error || `HTTP ${res.status}`)
    }

    text.value = ''
    status.value = 'success'
    setTimeout(() => {
      status.value = 'idle'
    }, 2000)
  } catch (err) {
    status.value = 'error'
    errorMsg.value = err instanceof Error ? err.message : 'Something went wrong'
  }
}
</script>

<template>
  <div class="capture-page">
    <div class="capture-card">
      <h1 class="capture-title">Quick Capture</h1>
      <p class="capture-subtitle">Jot down a thought, task, or reminder</p>

      <textarea
        v-model="text"
        class="capture-input"
        placeholder="Buy groceries, review PR #42, call dentist..."
        maxlength="2000"
        rows="4"
        :disabled="status === 'sending'"
        @keydown.meta.enter="capture"
        @keydown.ctrl.enter="capture"
      />

      <div class="capture-footer">
        <span class="char-count">{{ text.length }}/2000</span>
        <button
          class="capture-btn"
          :disabled="!text.trim() || status === 'sending'"
          @click="capture"
        >
          {{ status === 'sending' ? 'Sending...' : status === 'success' ? 'Captured!' : 'Capture' }}
        </button>
      </div>

      <p
        v-if="status === 'error'"
        class="capture-error"
      >
        {{ errorMsg }}
      </p>
      <p
        v-if="status === 'success'"
        class="capture-success"
      >
        Added to your inbox. It will be processed into tomorrow's plan.
      </p>
    </div>
  </div>
</template>

<style scoped>
.capture-page {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: var(--bg-primary, #0f0f0f);
}

.capture-card {
  width: 100%;
  max-width: 480px;
  padding: 24px;
  border-radius: 16px;
  background: var(--bg-secondary, #1a1a1a);
  border: 1px solid var(--border-color, #333);
}

.capture-title {
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 4px;
  color: var(--text-primary, #fff);
}

.capture-subtitle {
  font-size: 14px;
  color: var(--text-secondary, #888);
  margin: 0 0 16px;
}

.capture-input {
  width: 100%;
  padding: 12px;
  border-radius: 8px;
  border: 1px solid var(--border-color, #333);
  background: var(--bg-primary, #0f0f0f);
  color: var(--text-primary, #fff);
  font-size: 16px;
  font-family: inherit;
  resize: vertical;
  outline: none;
  transition: border-color 0.2s;
}

.capture-input:focus {
  border-color: var(--accent-color, #646cff);
}

.capture-input:disabled {
  opacity: 0.5;
}

.capture-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
}

.char-count {
  font-size: 12px;
  color: var(--text-tertiary, #666);
}

.capture-btn {
  padding: 8px 20px;
  border-radius: 8px;
  border: none;
  background: var(--accent-color, #646cff);
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.2s;
}

.capture-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.capture-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.capture-error {
  margin-top: 12px;
  font-size: 13px;
  color: #ef4444;
}

.capture-success {
  margin-top: 12px;
  font-size: 13px;
  color: #22c55e;
}
</style>
