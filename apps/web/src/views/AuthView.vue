<script setup lang="ts">
import { ref, watch } from 'vue'
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
const showPassword = ref(false)
const signUpState = ref<'form' | 'success'>('form')
const signUpEmail = ref('')

async function handleSubmit() {
  isLoading.value = true
  error.value = ''

  try {
    if (isLogin.value) {
      await authStore.signIn(email.value, password.value)
      router.push((route.query.redirect as string) || '/')
    } else {
      const result = await authStore.signUp(email.value, password.value)
      if (result.confirmationRequired) {
        signUpEmail.value = email.value
        signUpState.value = 'success'
      } else {
        router.push((route.query.redirect as string) || '/')
      }
    }
  } catch (e: any) {
    error.value = e.message
  } finally {
    isLoading.value = false
  }
}

async function handleGoogleOAuth() {
  try {
    await authStore.signInWithOAuth('google')
  } catch (e: any) {
    error.value = e.message
  }
}

function skipAuth() {
  router.push((route.query.redirect as string) || '/')
}

function resetToForm() {
  signUpState.value = 'form'
  signUpEmail.value = ''
  error.value = ''
}

watch(
  () => authStore.isAuthenticated,
  (isAuth) => {
    if (isAuth) {
      router.push((route.query.redirect as string) || '/')
    }
  }
)
</script>

<template>
  <div class="auth-view">
    <!-- Left: Brand Panel -->
    <div class="brand-panel">
      <div class="brand-orb brand-orb--purple" />
      <div class="brand-orb brand-orb--amber" />

      <div class="brand-top">
        <div class="brand-logo">
          <div class="brand-icon">N</div>
          <span class="brand-name">NoteShell</span>
        </div>
        <p class="brand-subtitle">AI-powered learning workspace</p>
      </div>

      <div class="brand-screenshot">
        <div class="screenshot-window">
          <div class="screenshot-titlebar">
            <span class="dot dot--red" />
            <span class="dot dot--yellow" />
            <span class="dot dot--green" />
          </div>
          <div class="screenshot-content">
            <div class="screenshot-sidebar">
              <div class="skel skel--heading" />
              <div class="skel skel--item" />
              <div class="skel skel--item skel--active" />
              <div class="skel skel--item" />
              <div class="skel skel--item" />
              <div class="skel skel--item skel--short" />
            </div>
            <div class="screenshot-main">
              <div class="skel skel--title" />
              <div class="skel skel--line" />
              <div class="skel skel--line skel--90" />
              <div class="skel skel--line skel--95" />
              <div class="ai-block">
                <div class="ai-block-header">
                  <div class="ai-dot" />
                  <div class="skel skel--label" />
                </div>
                <div class="skel skel--line skel--85" />
                <div class="skel skel--line skel--70" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="brand-bottom">
        <h2 class="brand-tagline">Write. Think. Learn.</h2>
        <p class="brand-desc">AI that helps you understand, not just answer</p>
      </div>
    </div>

    <!-- Right: Auth Form -->
    <div class="auth-panel">
      <div class="auth-inner">
        <!-- Success state after signup -->
        <div
          v-if="signUpState === 'success'"
          class="success-state"
        >
          <div class="success-icon">
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#22c55e"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2 class="success-title">Check your email</h2>
          <p class="success-text">
            We sent a confirmation link to
            <br />
            <strong>{{ signUpEmail }}</strong>
          </p>
          <p class="success-hint">Didn't receive it? Check your spam folder.</p>
          <button
            class="btn-secondary"
            @click="resetToForm"
          >
            Back to sign in
          </button>
        </div>

        <!-- Auth form -->
        <template v-else>
          <div class="auth-header">
            <h2>{{ isLogin ? 'Welcome back' : 'Create account' }}</h2>
            <p>{{ isLogin ? 'Sign in to continue to NoteShell' : 'Get started with NoteShell' }}</p>
          </div>

          <div class="auth-tabs">
            <button
              :class="{ active: isLogin }"
              @click="
                isLogin = true
                error = ''
              "
            >
              Sign In
            </button>
            <button
              :class="{ active: !isLogin }"
              @click="
                isLogin = false
                error = ''
              "
            >
              Sign Up
            </button>
          </div>

          <button
            class="google-btn"
            @click="handleGoogleOAuth"
          >
            <svg
              class="google-icon"
              viewBox="0 0 24 24"
              width="18"
              height="18"
            >
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Continue with Google
          </button>

          <div class="auth-divider">
            <span>or</span>
          </div>

          <form
            class="auth-form"
            @submit.prevent="handleSubmit"
          >
            <div class="form-group">
              <label for="auth-email">Email</label>
              <input
                id="auth-email"
                v-model="email"
                type="email"
                placeholder="you@example.com"
                required
                autocomplete="email"
              />
            </div>

            <div class="form-group">
              <div class="label-row">
                <label for="auth-password">Password</label>
              </div>
              <div class="input-wrapper">
                <input
                  id="auth-password"
                  v-model="password"
                  :type="showPassword ? 'text' : 'password'"
                  placeholder="Enter your password"
                  required
                  autocomplete="current-password"
                />
                <button
                  type="button"
                  class="toggle-password"
                  @click="showPassword = !showPassword"
                >
                  {{ showPassword ? 'Hide' : 'Show' }}
                </button>
              </div>
            </div>

            <div
              v-if="error"
              class="error-msg"
            >
              {{ error }}
            </div>

            <button
              type="submit"
              class="btn-primary"
              :disabled="isLoading"
            >
              <span
                v-if="isLoading"
                class="spinner"
              />
              {{ isLogin ? 'Sign In' : 'Sign Up' }}
            </button>
          </form>

          <div class="skip-auth">
            <button @click="skipAuth">
              Continue without account
              <span class="arrow">&#8594;</span>
            </button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ── Layout ── */
.auth-view {
  display: flex;
  min-height: 100vh;
  background: #111;
}

/* ── Brand Panel (Left) ── */
.brand-panel {
  flex: 1;
  background: linear-gradient(135deg, #1a0a20 0%, #2d1030 25%, #3d1a20 55%, #2d1a0a 100%);
  padding: 48px 40px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  position: relative;
  overflow: hidden;
}

.brand-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(60px);
  pointer-events: none;
}

.brand-orb--purple {
  top: 5%;
  left: 15%;
  width: 200px;
  height: 200px;
  background: rgba(168, 85, 247, 0.1);
}

.brand-orb--amber {
  bottom: 10%;
  right: 10%;
  width: 180px;
  height: 180px;
  background: rgba(245, 158, 11, 0.08);
}

.brand-top {
  position: relative;
  z-index: 1;
}

.brand-logo {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.brand-icon {
  width: 36px;
  height: 36px;
  background: linear-gradient(135deg, #a855f7, #f59e0b);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 800;
  color: #fff;
}

.brand-name {
  font-size: 24px;
  font-weight: 700;
  color: #fff;
  letter-spacing: -0.5px;
}

.brand-subtitle {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
  margin: 0 0 0 46px;
}

/* ── Product Screenshot ── */
.brand-screenshot {
  position: relative;
  z-index: 1;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 0;
}

.screenshot-window {
  width: 92%;
  background: rgba(30, 30, 30, 0.6);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
}

.screenshot-titlebar {
  height: 28px;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  padding: 0 12px;
  gap: 6px;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.dot--red {
  background: #ff5f57;
}
.dot--yellow {
  background: #febc2e;
}
.dot--green {
  background: #28c840;
}

.screenshot-content {
  padding: 16px;
  display: flex;
  gap: 16px;
}

.screenshot-sidebar {
  width: 120px;
}

.screenshot-main {
  flex: 1;
}

.skel {
  border-radius: 4px;
  margin-bottom: 6px;
}

.skel--heading {
  height: 8px;
  width: 60%;
  background: rgba(255, 255, 255, 0.15);
  margin-bottom: 12px;
}

.skel--item {
  height: 6px;
  width: 80%;
  background: rgba(255, 255, 255, 0.08);
}

.skel--active {
  width: 90%;
  background: rgba(168, 85, 247, 0.2);
  border-left: 2px solid #a855f7;
}

.skel--short {
  width: 65%;
}

.skel--title {
  height: 10px;
  width: 50%;
  background: rgba(255, 255, 255, 0.2);
  margin-bottom: 12px;
}

.skel--line {
  height: 5px;
  width: 100%;
  background: rgba(255, 255, 255, 0.06);
  margin-bottom: 5px;
}

.skel--90 {
  width: 90%;
}
.skel--95 {
  width: 95%;
}
.skel--85 {
  width: 85%;
}
.skel--70 {
  width: 70%;
}

.skel--label {
  height: 5px;
  width: 40px;
  background: rgba(168, 85, 247, 0.3);
}

.ai-block {
  padding: 10px;
  background: rgba(168, 85, 247, 0.06);
  border: 1px solid rgba(168, 85, 247, 0.15);
  border-radius: 6px;
  margin-top: 12px;
}

.ai-block-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.ai-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: linear-gradient(135deg, #a855f7, #f59e0b);
}

/* ── Brand Bottom ── */
.brand-bottom {
  position: relative;
  z-index: 1;
}

.brand-tagline {
  font-size: 16px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.8);
  margin: 0 0 6px;
}

.brand-desc {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  margin: 0;
}

/* ── Auth Panel (Right) ── */
.auth-panel {
  width: 480px;
  min-width: 480px;
  background: #141414;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px;
}

.auth-inner {
  width: 100%;
  max-width: 360px;
}

/* ── Auth Header ── */
.auth-header {
  margin-bottom: 28px;
}

.auth-header h2 {
  font-size: 22px;
  font-weight: 600;
  color: #e8e8e8;
  margin: 0 0 4px;
}

.auth-header p {
  font-size: 13px;
  color: #888;
  margin: 0;
}

/* ── Tabs ── */
.auth-tabs {
  display: flex;
  margin-bottom: 24px;
  background: #0a0a0a;
  border-radius: 8px;
  padding: 3px;
}

.auth-tabs button {
  flex: 1;
  padding: 10px;
  text-align: center;
  font-size: 13px;
  font-weight: 500;
  color: #666;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.auth-tabs button.active {
  color: #fff;
  background: rgba(168, 85, 247, 0.15);
  border-color: rgba(168, 85, 247, 0.2);
}

/* ── Google Button ── */
.google-btn {
  width: 100%;
  height: 44px;
  background: #1e1e1e;
  border-radius: 8px;
  border: 1px solid #2a2a2a;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  font-size: 13px;
  color: #ccc;
  cursor: pointer;
  transition:
    border-color 0.2s,
    background 0.2s;
}

.google-btn:hover {
  background: #252525;
  border-color: #3a3a3a;
}

.google-icon {
  flex-shrink: 0;
}

/* ── Divider ── */
.auth-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 20px 0;
}

.auth-divider::before,
.auth-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: #2a2a2a;
}

.auth-divider span {
  font-size: 11px;
  color: #555;
  text-transform: uppercase;
  letter-spacing: 1px;
}

/* ── Form ── */
.auth-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  font-size: 12px;
  color: #888;
}

.label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.input-wrapper {
  position: relative;
}

.form-group input {
  width: 100%;
  height: 44px;
  background: #0a0a0a;
  border: 1px solid #2a2a2a;
  border-radius: 8px;
  padding: 0 14px;
  font-size: 13px;
  color: #e8e8e8;
  outline: none;
  transition: border-color 0.2s;
  box-sizing: border-box;
}

.form-group input::placeholder {
  color: #555;
}

.form-group input:focus {
  border-color: rgba(168, 85, 247, 0.5);
}

.toggle-password {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: #555;
  font-size: 11px;
  cursor: pointer;
  padding: 4px;
}

.toggle-password:hover {
  color: #888;
}

/* ── Error ── */
.error-msg {
  font-size: 13px;
  color: #f87171;
  background: rgba(248, 113, 113, 0.08);
  border: 1px solid rgba(248, 113, 113, 0.15);
  border-radius: 8px;
  padding: 10px 14px;
}

/* ── Buttons ── */
.btn-primary {
  width: 100%;
  height: 44px;
  background: linear-gradient(135deg, #a855f7, #d97706);
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  cursor: pointer;
  transition:
    opacity 0.2s,
    box-shadow 0.2s;
  box-shadow: 0 4px 16px rgba(168, 85, 247, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.btn-primary:hover {
  opacity: 0.9;
  box-shadow: 0 6px 20px rgba(168, 85, 247, 0.3);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-secondary {
  height: 36px;
  background: transparent;
  border: 1px solid #2a2a2a;
  border-radius: 6px;
  padding: 0 20px;
  font-size: 12px;
  color: #888;
  cursor: pointer;
  transition: border-color 0.2s;
}

.btn-secondary:hover {
  border-color: #444;
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* ── Skip Auth ── */
.skip-auth {
  text-align: center;
  margin-top: 24px;
}

.skip-auth button {
  background: none;
  border: none;
  font-size: 12px;
  color: #555;
  cursor: pointer;
  transition: color 0.2s;
}

.skip-auth button:hover {
  color: #888;
}

.skip-auth .arrow {
  margin-left: 4px;
}

/* ── Success State ── */
.success-state {
  text-align: center;
  padding: 32px 0;
}

.success-icon {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: rgba(34, 197, 94, 0.1);
  border: 2px solid rgba(34, 197, 94, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 20px;
}

.success-title {
  font-size: 18px;
  font-weight: 600;
  color: #e8e8e8;
  margin: 0 0 8px;
}

.success-text {
  font-size: 13px;
  color: #888;
  line-height: 1.5;
  margin: 0 0 24px;
}

.success-text strong {
  color: #ccc;
}

.success-hint {
  font-size: 12px;
  color: #555;
  margin: 0 0 16px;
}

/* ── Mobile Responsive ── */
@media (max-width: 768px) {
  .auth-view {
    flex-direction: column;
  }

  .brand-panel {
    padding: 24px 20px;
    flex: none;
  }

  .brand-screenshot {
    display: none;
  }

  .brand-bottom {
    display: none;
  }

  .auth-panel {
    width: 100%;
    min-width: unset;
    flex: 1;
    padding: 32px 20px;
  }

  .auth-inner {
    max-width: 400px;
  }
}
</style>
