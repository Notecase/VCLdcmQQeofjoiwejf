<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores'
import { supabase } from '@/services/supabase'
import { Loading } from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

type PageState =
  | 'loading'
  | 'code-entry'
  | 'approval'
  | 'submitting'
  | 'success'
  | 'denied'
  | 'error'

const state = ref<PageState>('loading')
const userCode = ref('')
const codeInput = ref('')
const errorMessage = ref('')

const SESSION_KEY = 'noteshell_cli_pending_code'

onMounted(async () => {
  const codeFromUrl = route.query.code as string | undefined
  const codeFromStorage = sessionStorage.getItem(SESSION_KEY)
  const code = codeFromUrl || codeFromStorage

  if (codeFromUrl) {
    // Persist so OAuth callback can restore it
    sessionStorage.setItem(SESSION_KEY, codeFromUrl)
  }

  if (!authStore.isAuthenticated) {
    const redirectTo = `/cli${code ? `?code=${encodeURIComponent(code)}` : ''}`
    router.push(`/auth?redirect=${encodeURIComponent(redirectTo)}`)
    return
  }

  if (!code) {
    state.value = 'code-entry'
    return
  }

  userCode.value = code.toUpperCase()
  state.value = 'approval'
})

function handleCodeSubmit() {
  const code = codeInput.value.trim().toUpperCase()
  if (!code) return
  userCode.value = code
  state.value = 'approval'
}

async function getSession() {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session
}

async function handleApprove() {
  state.value = 'submitting'
  try {
    const session = await getSession()
    if (!session) {
      errorMessage.value = 'Session expired. Please refresh and try again.'
      state.value = 'error'
      return
    }

    const res = await fetch('/api/cli/auth/approve', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        user_code: userCode.value,
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        token_expires_at: new Date(session.expires_at! * 1000).toISOString(),
      }),
    })

    if (!res.ok) {
      const data = await res.json()
      errorMessage.value = data.error || 'Failed to authorize. The code may have expired.'
      state.value = 'error'
      return
    }

    sessionStorage.removeItem(SESSION_KEY)
    state.value = 'success'
  } catch {
    errorMessage.value = 'Something went wrong. Please try again.'
    state.value = 'error'
  }
}

async function handleDeny() {
  state.value = 'submitting'
  try {
    const session = await getSession()
    await fetch('/api/cli/auth/deny', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token || ''}`,
      },
      body: JSON.stringify({ user_code: userCode.value }),
    })
    sessionStorage.removeItem(SESSION_KEY)
    state.value = 'denied'
  } catch {
    state.value = 'denied'
  }
}
</script>

<template>
  <div class="auth-view">
    <div class="auth-card">
      <!-- Loading -->
      <div
        v-if="state === 'loading'"
        class="cli-state"
      >
        <el-icon
          class="cli-icon spin"
          :size="40"
          ><Loading
        /></el-icon>
      </div>

      <!-- Code entry (user navigated manually without ?code=) -->
      <div
        v-else-if="state === 'code-entry'"
        class="cli-state"
      >
        <div class="cli-icon-wrap">
          <span class="cli-terminal-icon">&gt;_</span>
        </div>
        <h2>Connect Noteshell CLI</h2>
        <p class="cli-sub">Enter the code shown in your terminal</p>
        <div class="cli-code-form">
          <el-input
            v-model="codeInput"
            placeholder="ABCD-1234"
            size="large"
            @keyup.enter="handleCodeSubmit"
          />
          <el-button
            type="primary"
            size="large"
            style="width: 100%; margin-top: 12px"
            @click="handleCodeSubmit"
          >
            Continue
          </el-button>
        </div>
      </div>

      <!-- Approval screen -->
      <div
        v-else-if="state === 'approval'"
        class="cli-state"
      >
        <div class="cli-icon-wrap">
          <span class="cli-terminal-icon">&gt;_</span>
        </div>
        <h2>Authorize Noteshell CLI</h2>
        <p class="cli-sub"><strong>Noteshell MCP</strong> wants to connect to your account</p>
        <div class="cli-code-display">{{ userCode }}</div>
        <p class="cli-hint">Confirm this code matches what's in your terminal</p>
        <div class="cli-actions">
          <el-button
            type="primary"
            size="large"
            style="width: 100%"
            @click="handleApprove"
          >
            Authorize
          </el-button>
          <el-button
            type="text"
            size="large"
            style="width: 100%; margin-top: 4px"
            @click="handleDeny"
          >
            Deny
          </el-button>
        </div>
      </div>

      <!-- Submitting -->
      <div
        v-else-if="state === 'submitting'"
        class="cli-state"
      >
        <el-icon
          class="cli-icon spin"
          :size="40"
          ><Loading
        /></el-icon>
        <p class="cli-sub">Processing...</p>
      </div>

      <!-- Success -->
      <div
        v-else-if="state === 'success'"
        class="cli-state"
      >
        <div class="cli-result-icon success">✓</div>
        <h2>Authorized</h2>
        <p class="cli-sub">You can close this tab. Your CLI is now connected.</p>
      </div>

      <!-- Denied -->
      <div
        v-else-if="state === 'denied'"
        class="cli-state"
      >
        <div class="cli-result-icon denied">✕</div>
        <h2>Request Denied</h2>
        <p class="cli-sub">You can close this tab.</p>
      </div>

      <!-- Error -->
      <div
        v-else-if="state === 'error'"
        class="cli-state"
      >
        <el-alert
          :title="errorMessage"
          type="error"
          :closable="false"
          style="margin-bottom: 16px"
        />
        <el-button @click="state = 'approval'">Try again</el-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.auth-view {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: var(--bg-color);
  padding: 20px;
}

.auth-card {
  width: 100%;
  max-width: 400px;
  padding: 40px;
  background: var(--editor-bg);
  border-radius: 12px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
}

.cli-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 8px;
}

.cli-icon-wrap {
  margin-bottom: 8px;
}

.cli-terminal-icon {
  display: inline-block;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 32px;
  font-weight: 700;
  color: var(--primary-color);
  background: var(--bg-color);
  border-radius: 10px;
  padding: 10px 16px;
  letter-spacing: -2px;
}

.cli-state h2 {
  margin: 8px 0 0;
  font-size: 22px;
  color: var(--text-color);
}

.cli-sub {
  margin: 4px 0 12px;
  color: var(--text-color-secondary);
  font-size: 14px;
  line-height: 1.5;
}

.cli-code-display {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 30px;
  font-weight: 700;
  letter-spacing: 6px;
  color: var(--primary-color);
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 14px 24px;
  margin: 8px 0;
}

.cli-hint {
  font-size: 12px;
  color: var(--text-color-secondary);
  margin: 0 0 16px;
}

.cli-actions {
  width: 100%;
  display: flex;
  flex-direction: column;
}

.cli-code-form {
  width: 100%;
}

.cli-result-icon {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  font-weight: 700;
  margin-bottom: 8px;
}

.cli-result-icon.success {
  background: rgba(34, 197, 94, 0.15);
  color: var(--diff-add-border);
}

.cli-result-icon.denied {
  background: rgba(239, 68, 68, 0.12);
  color: var(--diff-remove-border);
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
