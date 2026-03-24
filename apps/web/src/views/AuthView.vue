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

function switchToSignIn() {
  isLogin.value = true
  error.value = ''
}

function switchToSignUp() {
  isLogin.value = false
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
      <!-- Blue horizon arc — spans full width, bleeds into auth panel -->
      <svg
        class="horizon-arc"
        viewBox="0 0 1400 800"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
      >
        <!-- Main horizon line — bold, sweeping left-to-right with strong curve -->
        <path
          d="M -100 620 C 200 100, 800 100, 1500 500"
          stroke="rgba(60,130,246,0.25)"
          stroke-width="1.5"
          fill="none"
        />
        <!-- Subtle glow echo -->
        <path
          d="M -100 620 C 200 100, 800 100, 1500 500"
          stroke="rgba(60,130,246,0.08)"
          stroke-width="6"
          fill="none"
        />
        <!-- Scatter dots along the arc -->
        <circle
          cx="180"
          cy="430"
          r="2"
          fill="rgba(60,130,246,0.30)"
        />
        <circle
          cx="420"
          cy="340"
          r="1.5"
          fill="rgba(60,130,246,0.20)"
        />
        <circle
          cx="700"
          cy="350"
          r="2.5"
          fill="rgba(60,130,246,0.35)"
        />
        <circle
          cx="950"
          cy="380"
          r="1.5"
          fill="rgba(60,130,246,0.18)"
        />
        <circle
          cx="1150"
          cy="400"
          r="2"
          fill="rgba(60,130,246,0.22)"
        />
        <!-- A few ambient dots off the arc -->
        <circle
          cx="300"
          cy="200"
          r="1"
          fill="rgba(60,130,246,0.10)"
        />
        <circle
          cx="550"
          cy="550"
          r="1"
          fill="rgba(60,130,246,0.08)"
        />
        <circle
          cx="800"
          cy="180"
          r="1.5"
          fill="rgba(60,130,246,0.10)"
        />
        <circle
          cx="350"
          cy="620"
          r="1"
          fill="rgba(60,130,246,0.08)"
        />
        <circle
          cx="650"
          cy="150"
          r="1"
          fill="rgba(60,130,246,0.06)"
        />
      </svg>

      <!-- Brand content -->
      <div class="brand-content">
        <div class="brand-logo-row">
          <img
            src="/logo.svg"
            alt="Noteshell"
            class="brand-logo-img"
          />
          <span class="brand-dot" />
          <span class="brand-name-text">Noteshell</span>
        </div>

        <div class="brand-badge">agent-first learning platform</div>

        <h1 class="brand-tagline-serif">Follow<br />Curiosity.</h1>

        <p class="brand-subtitle-mono">Let Noteshell build your learning path.</p>

        <p class="brand-desc-text">More than notes — an AI workspace that learns how you think.</p>
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
            <p>{{ isLogin ? 'Sign in to continue to Noteshell' : 'Get started with Noteshell' }}</p>
          </div>

          <div class="auth-tabs">
            <button
              :class="{ active: isLogin }"
              @click="switchToSignIn"
            >
              Sign In
            </button>
            <button
              :class="{ active: !isLogin }"
              @click="switchToSignUp"
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
  background: #0d0d0f;
}

/* ── Brand Panel (Left) ── */
.brand-panel {
  flex: 1;
  background: #0d0d0f;
  padding: 48px 40px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  position: relative;
  overflow: hidden;
}

.horizon-arc {
  position: absolute;
  top: 0;
  left: 0;
  width: 150%;
  height: 100%;
  pointer-events: none;
}

.brand-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  padding: 0 24px;
}

.brand-logo-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.brand-logo-img {
  height: 28px;
  width: auto;
}

.brand-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #d97706;
  flex-shrink: 0;
}

.brand-name-text {
  font-size: 22px;
  font-weight: 600;
  color: #fff;
  letter-spacing: -0.3px;
}

.brand-badge {
  display: inline-block;
  width: fit-content;
  margin-top: 24px;
  padding: 6px 14px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 20px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  letter-spacing: 0.3px;
}

.brand-tagline-serif {
  font-family: 'Playfair Display', serif;
  font-size: 48px;
  font-weight: 700;
  line-height: 1.15;
  color: #e8e8e8;
  margin: 32px 0 0;
}

.brand-subtitle-mono {
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.45);
  margin: 16px 0 0;
}

.brand-desc-text {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.3);
  margin: 8px 0 0;
}

/* ── Auth Panel (Right) ── */
.auth-panel {
  width: 480px;
  min-width: 480px;
  background: #111112;
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
  color: #777;
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
  background: rgba(217, 119, 6, 0.15);
  border-color: rgba(217, 119, 6, 0.2);
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
  border-color: rgba(217, 119, 6, 0.4);
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
  background: #d97706;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  cursor: pointer;
  transition:
    background 0.2s,
    box-shadow 0.2s;
  box-shadow: 0 4px 16px rgba(217, 119, 6, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.btn-primary:hover {
  background: #b45309;
  box-shadow: 0 6px 20px rgba(217, 119, 6, 0.3);
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
    justify-content: flex-start;
  }

  .horizon-arc,
  .brand-tagline-serif,
  .brand-subtitle-mono,
  .brand-desc-text {
    display: none;
  }

  .brand-content {
    padding: 0;
  }

  .brand-badge {
    margin-top: 12px;
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
