<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const isLogin = ref(true)
const email = ref('')
const password = ref('')
const isLoading = ref(false)
const error = ref('')

async function handleSubmit() {
  isLoading.value = true
  error.value = ''

  try {
    if (isLogin.value) {
      await authStore.signIn(email.value, password.value)
    } else {
      await authStore.signUp(email.value, password.value)
    }
    const redirectTo = (route.query.redirect as string) || '/'
    router.push(redirectTo)
  } catch (e: any) {
    error.value = e.message
  } finally {
    isLoading.value = false
  }
}

async function handleOAuth(provider: 'github' | 'google') {
  try {
    await authStore.signInWithOAuth(provider)
  } catch (e: any) {
    error.value = e.message
  }
}

function skipAuth() {
  const redirectTo = (route.query.redirect as string) || '/'
  router.push(redirectTo)
}
</script>

<template>
  <div class="auth-view">
    <div class="auth-card">
      <div class="auth-header">
        <h1>NoteShell</h1>
        <p>AI-powered learning workspace</p>
      </div>

      <div class="auth-tabs">
        <button
          :class="{ active: isLogin }"
          @click="isLogin = true"
        >
          Sign In
        </button>
        <button
          :class="{ active: !isLogin }"
          @click="isLogin = false"
        >
          Sign Up
        </button>
      </div>

      <form
        class="auth-form"
        @submit.prevent="handleSubmit"
      >
        <el-input
          v-model="email"
          placeholder="Email"
          type="email"
          size="large"
          required
        />
        <el-input
          v-model="password"
          placeholder="Password"
          type="password"
          size="large"
          show-password
          required
        />

        <el-alert
          v-if="error"
          :title="error"
          type="error"
          :closable="false"
        />

        <el-button
          type="primary"
          native-type="submit"
          size="large"
          :loading="isLoading"
          style="width: 100%"
        >
          {{ isLogin ? 'Sign In' : 'Sign Up' }}
        </el-button>
      </form>

      <div class="auth-divider">
        <span>or continue with</span>
      </div>

      <div class="oauth-buttons">
        <el-button
          size="large"
          @click="handleOAuth('github')"
        >
          GitHub
        </el-button>
        <el-button
          size="large"
          @click="handleOAuth('google')"
        >
          Google
        </el-button>
      </div>

      <div class="skip-auth">
        <el-button
          type="text"
          @click="skipAuth"
        >
          Continue without account →
        </el-button>
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

.auth-header {
  text-align: center;
  margin-bottom: 32px;
}

.auth-header h1 {
  margin: 0;
  font-size: 28px;
  color: var(--text-color);
}

.auth-header p {
  margin: 8px 0 0;
  color: var(--text-color-secondary);
}

.auth-tabs {
  display: flex;
  margin-bottom: 24px;
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg-color);
}

.auth-tabs button {
  flex: 1;
  padding: 12px;
  border: none;
  background: transparent;
  color: var(--text-color-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.auth-tabs button.active {
  background: var(--primary-color);
  color: white;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.auth-divider {
  display: flex;
  align-items: center;
  margin: 24px 0;
  color: var(--text-color-secondary);
}

.auth-divider::before,
.auth-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border-color);
}

.auth-divider span {
  padding: 0 16px;
  font-size: 14px;
}

.oauth-buttons {
  display: flex;
  gap: 12px;
}

.oauth-buttons .el-button {
  flex: 1;
}

.skip-auth {
  margin-top: 24px;
  text-align: center;
}
</style>
