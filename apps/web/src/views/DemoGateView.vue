<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { DEMO_PASSWORD, enterDemoMode } from '@/utils/demo'

const router = useRouter()
const password = ref('')
const error = ref('')
const isShaking = ref(false)
const showPassword = ref(false)

console.log('[DemoGate] Expected password:', JSON.stringify(DEMO_PASSWORD))

function handleSubmit() {
  console.log('[DemoGate] Entered:', JSON.stringify(password.value), 'Expected:', JSON.stringify(DEMO_PASSWORD))
  if (password.value === DEMO_PASSWORD) {
    enterDemoMode()
    router.push('/editor')
  } else {
    error.value = 'Incorrect password'
    isShaking.value = true
    setTimeout(() => {
      isShaking.value = false
    }, 500)
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    handleSubmit()
  }
}
</script>

<template>
  <div class="demo-gate">
    <div
      class="gate-card"
      :class="{ shake: isShaking }"
    >
      <div class="gate-header">
        <h1 class="brand-name">NoteShell</h1>
        <p class="brand-tagline">AI-powered learning workspace</p>
      </div>

      <div class="gate-form">
        <div style="position: relative;">
          <input
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            placeholder="Enter demo password"
            class="gate-input"
            autofocus
            @keydown="handleKeydown"
          />
          <button
            type="button"
            class="show-password-btn"
            @click="showPassword = !showPassword"
          >
            {{ showPassword ? 'Hide' : 'Show' }}
          </button>
        </div>

        <p
          v-if="error"
          class="gate-error"
        >
          {{ error }}
        </p>

        <button
          class="gate-button"
          @click="handleSubmit"
        >
          Enter Demo
        </button>
      </div>

      <p class="gate-hint">
        Contact us for access credentials
      </p>
    </div>
  </div>
</template>

<style scoped>
.demo-gate {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: var(--app-bg, #010409);
  padding: 20px;
}

.gate-card {
  width: 100%;
  max-width: 380px;
  padding: 48px 40px;
  background: var(--glass-bg, rgba(22, 27, 34, 0.7));
  backdrop-filter: blur(16px) saturate(180%);
  -webkit-backdrop-filter: blur(16px) saturate(180%);
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
  border-radius: 20px;
  box-shadow: 0 8px 32px var(--glass-shadow, rgba(0, 0, 0, 0.3));
  text-align: center;
}

.gate-header {
  margin-bottom: 36px;
}

.brand-name {
  margin: 0;
  font-size: 32px;
  font-weight: 700;
  background: linear-gradient(135deg, #58a6ff 0%, #a78bfa 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  letter-spacing: -0.5px;
}

.brand-tagline {
  margin: 8px 0 0;
  font-size: 14px;
  color: var(--text-color-secondary, #8b949e);
}

.gate-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.gate-input {
  width: 100%;
  padding: 12px 16px;
  background: var(--editor-color-04, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--editor-color-10, rgba(255, 255, 255, 0.1));
  border-radius: 12px;
  color: var(--text-color, #e2e8f0);
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
  box-sizing: border-box;
}

.gate-input:focus {
  border-color: rgba(88, 166, 255, 0.4);
}

.gate-input::placeholder {
  color: var(--text-color-secondary, rgba(139, 148, 158, 0.5));
}

.gate-error {
  margin: 0;
  font-size: 13px;
  color: #f85149;
}

.gate-button {
  width: 100%;
  padding: 12px;
  background: linear-gradient(135deg, #58a6ff 0%, #a78bfa 100%);
  border: none;
  border-radius: 12px;
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s, transform 0.15s;
}

.gate-button:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

.gate-button:active {
  transform: translateY(0);
}

.gate-hint {
  margin: 24px 0 0;
  font-size: 12px;
  color: var(--text-color-secondary, #484f58);
}

.show-password-btn {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: var(--text-color-secondary, #8b949e);
  cursor: pointer;
  font-size: 12px;
}

/* Shake animation on wrong password */
.shake {
  animation: shake 0.5s ease-in-out;
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  10%, 50%, 90% { transform: translateX(-6px); }
  30%, 70% { transform: translateX(6px); }
}
</style>
