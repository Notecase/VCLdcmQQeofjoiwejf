<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { authFetch } from '@/utils/api'
import {
  Key,
  Plus,
  Trash2,
  Copy,
  Check,
  Calendar,
  RefreshCw,
  BookOpen,
  ArrowLeft,
  AlertCircle,
} from 'lucide-vue-next'
import UsageSection from '@/components/settings/UsageSection.vue'
import SettingsNav from '@/components/settings/SettingsNav.vue'
import { useRouter, useRoute } from 'vue-router'

const router = useRouter()
const route = useRoute()
const apiBase = import.meta.env.VITE_API_URL || ''

// ── Active section ────────────────────────────────────────────────────────────
const activeSection = ref('usage')

// ── OAuth callback status ──────────────────────────────────────────────────
const gcalConnectStatus = ref<'success' | 'error' | null>(null)
const gcalConnectError = ref('')

// ── Capture Tokens ──────────────────────────────────────────────────────────

interface CaptureToken {
  id: string
  hint: string
  label: string
  isActive: boolean
  lastUsedAt: string | null
  createdAt: string
}

const tokens = ref<CaptureToken[]>([])
const tokensLoading = ref(false)
const newTokenLabel = ref('')
const generatedToken = ref<string | null>(null)
const copiedToken = ref(false)
const tokenError = ref('')

async function loadTokens() {
  tokensLoading.value = true
  try {
    const res = await authFetch(`${apiBase}/api/inbox/tokens`)
    if (res.ok) {
      const data = await res.json()
      tokens.value = data.tokens.filter((t: CaptureToken) => t.isActive)
    }
  } catch {
    // silently fail
  } finally {
    tokensLoading.value = false
  }
}

async function generateToken() {
  tokenError.value = ''
  generatedToken.value = null
  try {
    const res = await authFetch(`${apiBase}/api/inbox/tokens`, {
      method: 'POST',
      body: JSON.stringify({ label: newTokenLabel.value || undefined }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'Failed' }))
      throw new Error(body.error)
    }
    const data = await res.json()
    generatedToken.value = data.token
    newTokenLabel.value = ''
    await loadTokens()
  } catch (err) {
    tokenError.value = err instanceof Error ? err.message : 'Failed to generate token'
  }
}

async function revokeToken(id: string) {
  try {
    await authFetch(`${apiBase}/api/inbox/tokens/${id}`, { method: 'DELETE' })
    tokens.value = tokens.value.filter((t) => t.id !== id)
  } catch {
    // silently fail
  }
}

function copyToken() {
  if (!generatedToken.value) return
  navigator.clipboard.writeText(generatedToken.value)
  copiedToken.value = true
  setTimeout(() => {
    copiedToken.value = false
  }, 2000)
}

// ── Integrations ────────────────────────────────────────────────────────────

interface Integration {
  id: string
  provider: string
  status: string
  externalId: string | null
  lastSyncAt: string | null
  syncError: string | null
  createdAt: string
}

const integrations = ref<Integration[]>([])
const integrationsLoading = ref(false)
const gcalSyncing = ref(false)
const notionToken = ref('')
const notionDbId = ref('')
const notionError = ref('')

// ── Consent modal ───────────────────────────────────────────────────────────
const showConsentModal = ref(false)
const consentRedirecting = ref(false)

function getIntegration(provider: string): Integration | undefined {
  return integrations.value.find(
    (i) => i.provider === provider && i.status !== 'revoked' && i.status !== 'pending'
  )
}

async function loadIntegrations() {
  integrationsLoading.value = true
  try {
    const res = await authFetch(`${apiBase}/api/integrations`)
    if (res.ok) {
      const data = await res.json()
      integrations.value = data.integrations
    }
  } catch {
    // silently fail
  } finally {
    integrationsLoading.value = false
  }
}

function openConsentModal() {
  showConsentModal.value = true
  consentRedirecting.value = false
}

async function confirmConnectGcal() {
  consentRedirecting.value = true
  try {
    const res = await authFetch(`${apiBase}/api/integrations/gcal/connect`, { method: 'POST' })
    if (res.ok) {
      const data = await res.json()
      window.location.href = data.url
    } else {
      consentRedirecting.value = false
    }
  } catch {
    consentRedirecting.value = false
  }
}

async function syncGcal() {
  gcalSyncing.value = true
  try {
    await authFetch(`${apiBase}/api/integrations/gcal/sync`, { method: 'POST' })
    await loadIntegrations()
  } catch {
    // silently fail
  } finally {
    gcalSyncing.value = false
  }
}

async function disconnectIntegration(provider: string) {
  try {
    await authFetch(`${apiBase}/api/integrations/${provider}`, { method: 'DELETE' })
    await loadIntegrations()
  } catch {
    // silently fail
  }
}

async function connectNotion() {
  notionError.value = ''
  if (!notionToken.value.trim() || !notionDbId.value.trim()) {
    notionError.value = 'Both token and database ID are required'
    return
  }
  try {
    const res = await authFetch(`${apiBase}/api/integrations/notion/connect`, {
      method: 'POST',
      body: JSON.stringify({
        token: notionToken.value.trim(),
        database_id: notionDbId.value.trim(),
      }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'Failed' }))
      throw new Error(body.error)
    }
    notionToken.value = ''
    notionDbId.value = ''
    await loadIntegrations()
  } catch (err) {
    notionError.value = err instanceof Error ? err.message : 'Failed to connect'
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return 'Never'
  return new Date(iso).toLocaleString()
}

onMounted(async () => {
  await Promise.all([loadTokens(), loadIntegrations()])

  // Handle OAuth callback query params
  if (route.query.integration === 'gcal') {
    if (route.query.status === 'connected') {
      gcalConnectStatus.value = 'success'
    } else if (route.query.status === 'error') {
      gcalConnectStatus.value = 'error'
      gcalConnectError.value = (route.query.reason as string) || 'Unknown error'
    }
    router.replace({ path: '/settings' })
  }
})
</script>

<template>
  <div class="settings-page">
    <div class="settings-container">
      <!-- Header -->
      <header class="settings-header">
        <button
          class="back-btn"
          @click="router.back()"
        >
          <ArrowLeft :size="18" />
        </button>
        <div>
          <h1>Settings</h1>
        </div>
      </header>

      <!-- OAuth Status Banner -->
      <div
        v-if="gcalConnectStatus === 'success'"
        class="status-banner success"
      >
        <Check :size="16" />
        <span>Google Calendar connected successfully</span>
        <button
          class="banner-dismiss"
          @click="gcalConnectStatus = null"
        >
          &times;
        </button>
      </div>
      <div
        v-if="gcalConnectStatus === 'error'"
        class="status-banner error"
      >
        <AlertCircle :size="16" />
        <span>Google Calendar connection failed: {{ gcalConnectError }}</span>
        <button
          class="banner-dismiss"
          @click="gcalConnectStatus = null"
        >
          &times;
        </button>
      </div>

      <!-- Two-column layout -->
      <div class="settings-layout">
        <SettingsNav v-model="activeSection" />

        <div class="settings-content">
          <!-- Usage Section -->
          <div
            v-show="activeSection === 'usage'"
            class="content-section"
          >
            <UsageSection />
          </div>

          <!-- Capture Tokens Section -->
          <div
            v-show="activeSection === 'tokens'"
            class="content-section"
          >
            <div class="section-intro">
              <h2>Capture Tokens</h2>
              <p>Generate tokens to send quick captures from Apple Shortcuts or external tools.</p>
            </div>

            <!-- Generate token -->
            <div class="token-generate">
              <input
                v-model="newTokenLabel"
                type="text"
                class="input-field"
                placeholder="Token label (e.g. iPhone, iPad)"
              />
              <button
                class="btn btn-primary"
                @click="generateToken"
              >
                <Plus :size="14" />
                Generate
              </button>
            </div>

            <!-- Newly generated token (show once) -->
            <div
              v-if="generatedToken"
              class="token-reveal"
            >
              <div class="token-reveal-header">
                <AlertCircle
                  :size="14"
                  class="warning-icon"
                />
                <strong>Save this token — it cannot be shown again</strong>
              </div>
              <div class="token-value-row">
                <code class="token-value">{{ generatedToken }}</code>
                <button
                  class="btn btn-icon"
                  :title="copiedToken ? 'Copied!' : 'Copy'"
                  @click="copyToken"
                >
                  <Check
                    v-if="copiedToken"
                    :size="14"
                  />
                  <Copy
                    v-else
                    :size="14"
                  />
                </button>
              </div>
            </div>

            <p
              v-if="tokenError"
              class="error-text"
            >
              {{ tokenError }}
            </p>

            <!-- Token list -->
            <div
              v-if="tokensLoading"
              class="loading-text"
            >
              Loading tokens...
            </div>
            <template v-else-if="tokens.length > 0">
              <div
                v-for="token in tokens"
                :key="token.id"
                class="row-item"
              >
                <div class="token-info">
                  <span class="token-hint">{{ token.hint }}</span>
                  <span class="token-label">{{ token.label }}</span>
                  <span class="token-meta">
                    Last used: {{ formatDate(token.lastUsedAt) }} &middot; Created:
                    {{ formatDate(token.createdAt) }}
                  </span>
                </div>
                <button
                  class="btn btn-icon"
                  title="Revoke"
                  @click="revokeToken(token.id)"
                >
                  <Trash2 :size="14" />
                </button>
              </div>
            </template>
            <p
              v-else
              class="empty-text"
            >
              No active tokens
            </p>

            <!-- Apple Shortcuts guide -->
            <details class="setup-guide">
              <summary>Apple Shortcuts Setup</summary>
              <ol>
                <li>Open <strong>Shortcuts</strong> on your iPhone/iPad</li>
                <li>
                  Create a new shortcut with a <strong>Get Contents of URL</strong> action:
                  <ul>
                    <li>
                      URL: <code>{{ apiBase || 'https://your-server' }}/api/inbox/capture</code>
                    </li>
                    <li>Method: <code>POST</code></li>
                    <li>Headers: <code>X-Capture-Token: &lt;your token&gt;</code></li>
                    <li>Body (JSON): <code>{"text": "Ask Each Time"}</code></li>
                  </ul>
                </li>
                <li>Add to Home Screen or use as a Share Sheet extension</li>
              </ol>
            </details>
          </div>

          <!-- Connectors Section -->
          <div
            v-show="activeSection === 'connectors'"
            class="content-section"
          >
            <div class="section-intro">
              <h2>Connectors</h2>
              <p>Connect external services to feed data into your Secretary's context.</p>
            </div>

            <div
              v-if="integrationsLoading"
              class="loading-text"
            >
              Loading integrations...
            </div>

            <!-- Google Calendar -->
            <div class="connector-row">
              <div class="connector-icon gcal">
                <Calendar :size="18" />
              </div>
              <div class="connector-info">
                <div class="connector-name">Google Calendar</div>
                <div class="connector-desc">Sync events into Calendar.md for daily planning</div>
              </div>
              <div class="connector-end">
                <template v-if="getIntegration('gcal')">
                  <div class="connector-status">
                    <span
                      class="status-dot"
                      :class="getIntegration('gcal')!.status"
                    ></span>
                    <span class="status-text">{{ getIntegration('gcal')!.status }}</span>
                    <span class="status-meta">
                      Synced {{ formatDate(getIntegration('gcal')!.lastSyncAt) }}
                    </span>
                  </div>
                  <p
                    v-if="getIntegration('gcal')!.syncError"
                    class="error-text small"
                  >
                    {{ getIntegration('gcal')!.syncError }}
                  </p>
                  <div class="connector-actions">
                    <button
                      class="btn btn-ghost"
                      :disabled="gcalSyncing"
                      @click="syncGcal"
                    >
                      <RefreshCw
                        :size="14"
                        :class="{ spinning: gcalSyncing }"
                      />
                      {{ gcalSyncing ? 'Syncing...' : 'Sync' }}
                    </button>
                    <button
                      v-if="getIntegration('gcal')!.status === 'error'"
                      class="btn btn-primary"
                      @click="openConsentModal"
                    >
                      Reconnect
                    </button>
                    <button
                      class="btn btn-ghost danger"
                      @click="disconnectIntegration('gcal')"
                    >
                      Disconnect
                    </button>
                  </div>
                </template>
                <template v-else>
                  <button
                    class="btn btn-primary"
                    @click="openConsentModal"
                  >
                    Connect
                  </button>
                </template>
              </div>
            </div>

            <hr class="row-divider" />

            <!-- Notion -->
            <div class="connector-row">
              <div class="connector-icon notion">
                <BookOpen :size="18" />
              </div>
              <div class="connector-info">
                <div class="connector-name">Notion</div>
                <div class="connector-desc">Connect a Notion database (BYOK integration token)</div>
              </div>
              <div class="connector-end">
                <template v-if="getIntegration('notion')">
                  <div class="connector-status">
                    <span
                      class="status-dot"
                      :class="getIntegration('notion')!.status"
                    ></span>
                    <span class="status-text">{{ getIntegration('notion')!.status }}</span>
                  </div>
                  <div class="connector-actions">
                    <button
                      class="btn btn-ghost danger"
                      @click="disconnectIntegration('notion')"
                    >
                      Disconnect
                    </button>
                  </div>
                </template>
                <template v-else>
                  <div class="notion-form">
                    <input
                      v-model="notionToken"
                      type="password"
                      class="input-field"
                      placeholder="Internal integration token"
                    />
                    <input
                      v-model="notionDbId"
                      type="text"
                      class="input-field"
                      placeholder="Database ID"
                    />
                    <button
                      class="btn btn-primary"
                      @click="connectNotion"
                    >
                      Connect
                    </button>
                    <p
                      v-if="notionError"
                      class="error-text"
                    >
                      {{ notionError }}
                    </p>
                  </div>
                </template>
              </div>
            </div>
          </div>

          <!-- API Keys Section (placeholder) -->
          <div
            v-show="activeSection === 'api-keys'"
            class="content-section"
          >
            <div class="section-intro">
              <h2>API Keys</h2>
              <p>Manage your API keys for AI providers.</p>
            </div>
            <p class="empty-text">API key management coming soon.</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Google Calendar Consent Modal -->
    <Teleport to="body">
      <div
        v-if="showConsentModal"
        class="consent-overlay"
        @click.self="showConsentModal = false"
      >
        <div class="consent-modal">
          <div class="consent-logos">
            <div class="consent-logo inkdown">
              <Key :size="20" />
            </div>
            <div class="consent-connector-line"></div>
            <div class="consent-logo gcal">
              <Calendar :size="20" />
            </div>
          </div>
          <h3 class="consent-title">Connect Google Calendar</h3>
          <p class="consent-desc">
            Inkdown will request <strong>read-only</strong> access to your calendar events. Events
            are synced to your Calendar.md file for daily planning.
          </p>
          <ul class="consent-permissions">
            <li>View events on your calendars</li>
            <li>No write access to your calendar</li>
            <li>You can disconnect at any time</li>
          </ul>
          <div class="consent-actions">
            <button
              class="btn btn-primary consent-continue"
              :disabled="consentRedirecting"
              @click="confirmConnectGcal"
            >
              {{ consentRedirecting ? 'Redirecting...' : 'Continue to Google' }}
            </button>
            <button
              class="btn btn-ghost"
              :disabled="consentRedirecting"
              @click="showConsentModal = false"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.settings-page {
  height: 100vh;
  overflow-y: auto;
  padding: 32px 24px 64px;
  background: var(--app-bg, #010409);
  color: var(--text-color, #e2e8f0);
}

.settings-container {
  max-width: 900px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* ── Header ──────────────────────────────────────────────────────── */

.settings-header {
  display: flex;
  align-items: center;
  gap: 16px;
}

.settings-header h1 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
}

.back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md, 10px);
  border: none;
  background: transparent;
  color: var(--text-color-secondary, #94a3b8);
  cursor: pointer;
  transition: background 150ms ease;
}

.back-btn:hover {
  background: var(--hover-bg, rgba(255, 255, 255, 0.06));
}

/* ── Status Banner ───────────────────────────────────────────────── */

.status-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-radius: var(--radius-md, 10px);
  font-size: 13px;
  font-weight: 500;
}

.status-banner.success {
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.25);
  color: #4ade80;
}

.status-banner.error {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.25);
  color: #fca5a5;
}

.banner-dismiss {
  margin-left: auto;
  background: none;
  border: none;
  color: inherit;
  font-size: 18px;
  cursor: pointer;
  opacity: 0.6;
  padding: 0 4px;
  line-height: 1;
}

.banner-dismiss:hover {
  opacity: 1;
}

/* ── Two-column layout ───────────────────────────────────────────── */

.settings-layout {
  display: flex;
  border: 1px solid var(--border-subtle, rgba(48, 54, 61, 0.5));
  border-radius: var(--radius-md, 10px);
  background: rgba(255, 255, 255, 0.01);
  min-height: 500px;
}

.settings-content {
  flex: 1;
  min-width: 0;
  padding: 24px 28px;
  max-width: 640px;
  overflow-y: auto;
}

.content-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section-intro h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.section-intro p {
  margin: 4px 0 0;
  color: var(--text-color-secondary, #94a3b8);
  font-size: 13px;
  line-height: 1.5;
}

/* ── Dividers ────────────────────────────────────────────────────── */

.row-divider {
  border: none;
  height: 1px;
  background: var(--border-subtle, rgba(48, 54, 61, 0.5));
  margin: 0;
}

/* ── Tokens ────────────────────────────────────────────────────────── */

.token-generate {
  display: flex;
  gap: 10px;
  align-items: center;
}

.token-reveal {
  padding: 14px;
  border-radius: var(--radius-md, 10px);
  border: 1px solid rgba(245, 158, 11, 0.3);
  background: rgba(245, 158, 11, 0.08);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.token-reveal-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #f7c161;
}

.warning-icon {
  flex-shrink: 0;
}

.token-value-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.token-value {
  flex: 1;
  padding: 8px 10px;
  border-radius: var(--radius-sm, 6px);
  background: rgba(0, 0, 0, 0.3);
  color: var(--text-color, #e2e8f0);
  font-size: 12px;
  word-break: break-all;
  user-select: all;
}

.row-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-subtle, rgba(48, 54, 61, 0.5));
}

.row-item:last-of-type {
  border-bottom: none;
}

.token-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.token-hint {
  font-family: monospace;
  font-size: 13px;
  color: var(--text-color, #e2e8f0);
}

.token-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color-secondary, #94a3b8);
}

.token-meta {
  font-size: 11px;
  color: var(--text-color-secondary, #94a3b8);
  opacity: 0.7;
}

/* ── Connectors ──────────────────────────────────────────────────── */

.connector-row {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 14px 0;
}

.connector-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border-radius: var(--radius-md, 10px);
}

.connector-icon.gcal {
  background: rgba(66, 133, 244, 0.15);
  color: #4285f4;
}

.connector-icon.notion {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-color, #e2e8f0);
}

.connector-info {
  flex: 1;
  min-width: 0;
}

.connector-name {
  font-size: 14px;
  font-weight: 600;
}

.connector-desc {
  font-size: 12px;
  color: var(--text-color-secondary, #94a3b8);
  margin-top: 2px;
  line-height: 1.4;
}

.connector-end {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  flex-shrink: 0;
}

.connector-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-dot.active {
  background: #22c55e;
}

.status-dot.pending {
  background: #f59e0b;
}

.status-dot.error {
  background: #ef4444;
}

.status-text {
  text-transform: capitalize;
  color: var(--text-color-secondary, #94a3b8);
}

.status-meta {
  font-size: 11px;
  color: var(--text-color-secondary, #94a3b8);
  opacity: 0.7;
}

.connector-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.notion-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-end;
}

.error-text.small {
  font-size: 11px;
}

/* ── Setup guide ───────────────────────────────────────────────────── */

.setup-guide {
  border-top: 1px solid var(--border-subtle, rgba(48, 54, 61, 0.5));
  padding: 0;
}

.setup-guide summary {
  padding: 12px 0;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  color: var(--text-color-secondary, #94a3b8);
  user-select: none;
}

.setup-guide[open] summary {
  padding-bottom: 8px;
}

.setup-guide ol {
  padding: 0 0 0 20px;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-color-secondary, #94a3b8);
}

.setup-guide ul {
  margin: 6px 0 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.setup-guide code {
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.3);
  font-size: 12px;
  color: var(--text-color, #e2e8f0);
}

/* ── Consent Modal ─────────────────────────────────────────────────── */

.consent-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(var(--modal-overlay-blur, 8px));
  -webkit-backdrop-filter: blur(var(--modal-overlay-blur, 8px));
}

.consent-modal {
  width: 100%;
  max-width: 400px;
  margin: 16px;
  padding: 32px;
  background: var(--modal-bg-solid, rgba(22, 27, 34, 0.95));
  border: 1px solid var(--modal-border, rgba(255, 255, 255, 0.08));
  border-radius: var(--modal-radius, 20px);
  box-shadow: var(--modal-shadow);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 16px;
}

.consent-logos {
  display: flex;
  align-items: center;
  gap: 12px;
}

.consent-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
}

.consent-logo.inkdown {
  background: rgba(16, 185, 129, 0.15);
  color: #6ee7b7;
}

.consent-logo.gcal {
  background: rgba(66, 133, 244, 0.15);
  color: #4285f4;
}

.consent-connector-line {
  width: 32px;
  height: 2px;
  background: var(--border-subtle, rgba(48, 54, 61, 0.5));
  border-radius: 1px;
}

.consent-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.consent-desc {
  margin: 0;
  font-size: 13px;
  color: var(--text-color-secondary, #94a3b8);
  line-height: 1.5;
}

.consent-permissions {
  list-style: none;
  padding: 0;
  margin: 0;
  width: 100%;
  text-align: left;
  font-size: 13px;
  color: var(--text-color-secondary, #94a3b8);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.consent-permissions li::before {
  content: '\2713  ';
  color: #22c55e;
  font-weight: 600;
}

.consent-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  margin-top: 8px;
}

.consent-continue {
  width: 100%;
  justify-content: center;
  padding: 10px 16px;
}

/* ── Shared form elements ──────────────────────────────────────────── */

.input-field {
  padding: 8px 12px;
  border-radius: var(--radius-sm, 6px);
  border: 1px solid var(--border-subtle, rgba(48, 54, 61, 0.5));
  background: rgba(0, 0, 0, 0.25);
  color: var(--text-color, #e2e8f0);
  font-size: 13px;
  font-family: inherit;
  outline: none;
  transition: border-color 150ms ease;
  flex: 1;
  min-width: 0;
}

.input-field:focus {
  border-color: rgba(255, 255, 255, 0.2);
}

.input-field::placeholder {
  color: var(--text-color-secondary, #94a3b8);
  opacity: 0.6;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: var(--radius-sm, 6px);
  border: none;
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
  transition:
    background 150ms ease,
    border-color 150ms ease,
    opacity 150ms ease;
}

.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-primary {
  background: rgba(16, 185, 129, 0.15);
  border: 1px solid rgba(16, 185, 129, 0.3);
  color: #6ee7b7;
}

.btn-primary:hover:not(:disabled) {
  background: rgba(16, 185, 129, 0.25);
}

.btn-ghost {
  background: transparent;
  border: 1px solid var(--border-subtle, rgba(48, 54, 61, 0.5));
  color: var(--text-color, #e2e8f0);
}

.btn-ghost:hover:not(:disabled) {
  background: var(--hover-bg, rgba(255, 255, 255, 0.06));
}

.btn-ghost.danger {
  color: #fca5a5;
  border-color: rgba(239, 68, 68, 0.2);
}

.btn-ghost.danger:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.1);
}

.btn-icon {
  padding: 6px;
  background: transparent;
  border: none;
  color: var(--text-color-secondary, #94a3b8);
}

.btn-icon:hover:not(:disabled) {
  color: var(--text-color, #e2e8f0);
  background: var(--hover-bg, rgba(255, 255, 255, 0.06));
}

.error-text {
  margin: 0;
  font-size: 13px;
  color: #ef4444;
}

.loading-text,
.empty-text {
  font-size: 13px;
  color: var(--text-color-secondary, #94a3b8);
  margin: 0;
}

.spinning {
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
