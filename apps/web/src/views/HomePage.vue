<script setup lang="ts">
/**
 * HomePage - Starting page with AI chat, sidebar, and note preview panel
 *
 * Layout: SideBar + NavigationDock (left) | Chat panel (center) | NotePreviewPanel (right)
 * The center panel shows a hero state initially, then a message thread + composer.
 * The right panel slides in when AI creates/edits a note.
 * Deep agent features: task progress, interrupts, sub-agents, tool calls, virtual files.
 */
import { ref, computed, nextTick, onMounted, watch } from 'vue'
import { useAIStore } from '@/stores/ai'
import { useDeepAgentStore } from '@/stores/deepAgent'
import { useEditorStore, useLayoutStore } from '@/stores'
import { useAIChat } from '@/services/ai.service'
import { isDemoMode } from '@/utils/demo'
import type { VirtualFile } from '@inkdown/shared/types'
import ChatComposer from '@/components/ai/ChatComposer.vue'
import ChatHero from '@/components/ai/ChatHero.vue'
import ClarificationDialog from '@/components/ai/ClarificationDialog.vue'
import NotePreviewPanel from '@/components/ai/NotePreviewPanel.vue'
import SideBar from '@/components/layout/SideBar.vue'
import NavigationDock from '@/components/ui/NavigationDock.vue'
import TaskProgressBar from '@/components/deepagent/TaskProgressBar.vue'
import InterruptBanner from '@/components/deepagent/InterruptBanner.vue'
import OutputClarificationCard from '@/components/deepagent/OutputClarificationCard.vue'
import SubagentCard from '@/components/deepagent/SubagentCard.vue'
import ToolCallBox from '@/components/deepagent/ToolCallBox.vue'
import MarkdownContent from '@/components/deepagent/MarkdownContent.vue'
import InlineTasksFiles from '@/components/deepagent/InlineTasksFiles.vue'
import FileViewerModal from '@/components/deepagent/FileViewerModal.vue'
import NoteDraftResponseCard from '@/components/deepagent/NoteDraftResponseCard.vue'
import { Loader2, FlaskConical, MessageSquare } from 'lucide-vue-next'

const aiStore = useAIStore()
const deepAgent = useDeepAgentStore()
const editorStore = useEditorStore()
const layoutStore = useLayoutStore()
const { clearChat, error, clearError } = useAIChat()

const messagesEndRef = ref<HTMLDivElement | null>(null)
const selectedFile = ref<VirtualFile | null>(null)
const showFileViewer = ref(false)

const hasMessages = computed(() => deepAgent.chatMessages.length > 0)
const showInlinePanel = computed(
  () =>
    deepAgent.activeMode === 'research' &&
    !deepAgent.hasActiveNoteDraft &&
    (deepAgent.files.length > 0 || deepAgent.todos.length > 0)
)
const showComposerTop = computed(() =>
  Boolean(
    deepAgent.pendingInterrupt || deepAgent.pendingOutputClarification || showInlinePanel.value
  )
)
// CSS variable for sidebar width (matches EditorView)
const sidebarWidthStyle = computed(() => ({
  '--sidebar-width': `${layoutStore.sidebarWidth}px`,
}))

function scrollToBottom() {
  nextTick(() => {
    messagesEndRef.value?.scrollIntoView({ behavior: 'smooth' })
  })
}

async function handleSubmit(value: string) {
  if (!value.trim() || deepAgent.isChatStreaming || isDemoMode()) return
  const autoOutputDestination = deepAgent.getAutoOutputDestination(value)
  if (deepAgent.requestOutputClarification(value)) return
  scrollToBottom()
  await deepAgent.sendChatMessage(value, { outputDestination: autoOutputDestination })
  scrollToBottom()
}

function handleNewSession() {
  deepAgent.createNewThread()
  clearChat()
}

function handleRecommendation(rec: { action: string; title: string }) {
  handleSubmit(`${rec.action}: ${rec.title}`)
}

function handleSelectFile(file: VirtualFile) {
  selectedFile.value = file
  showFileViewer.value = true
}

function handleFileSave(filename: string, content: string) {
  deepAgent.editFile(filename, content)
  showFileViewer.value = false
}

function handleSaveAsNote(file: VirtualFile) {
  deepAgent.saveFileAsNote(file.name)
}

function handleNoteDraftUpdate(payload: { title?: string; content: string }) {
  deepAgent.updateNoteDraftContent(payload)
}

async function handleNoteDraftSave(payload: { title?: string; content?: string }) {
  await deepAgent.saveNoteDraft(payload)
}

function handleNoteDraftHide() {
  deepAgent.hideNoteDraft()
}

function handleNoteDraftReopen() {
  deepAgent.reopenNoteDraft()
}

async function handleOutputClarificationSelect(destination: 'chat' | 'md_file' | 'note') {
  const resolved = deepAgent.resolveOutputClarification(destination)
  if (!resolved) return
  scrollToBottom()
  await deepAgent.sendChatMessage(resolved.message, {
    outputDestination: resolved.outputDestination,
  })
  scrollToBottom()
}

function handleOutputClarificationCancel() {
  deepAgent.cancelOutputClarification()
}

// Clarification handlers
async function handleClarificationSelect(blockIds: string[]) {
  const instruction = aiStore.pendingClarification?.instruction || ''
  aiStore.resolveClarification(blockIds)
  await deepAgent.sendChatMessage(instruction)
}

function handleClarificationCancel() {
  aiStore.cancelClarification()
}

watch(
  () => deepAgent.chatMessages.length,
  () => scrollToBottom()
)

onMounted(async () => {
  // HomePage defaults to research mode
  deepAgent.setActiveMode('research')
  await editorStore.loadDocuments()
  await deepAgent.loadThreads()
})
</script>

<template>
  <div class="home-page">
    <!-- Left Area: Header + Sidebar + Chat -->
    <div class="left-area">
      <!-- Header with dock + actions -->
      <header
        class="home-header"
        :style="sidebarWidthStyle"
      >
        <div class="dock-area">
          <NavigationDock :pill-mode="!layoutStore.sidebarVisible" />
        </div>

        <div class="header-actions">
          <div
            class="status-chip"
            :class="{
              live: deepAgent.isChatStreaming,
              interrupted: deepAgent.hasActiveInterrupt,
              error: deepAgent.threadStatus === 'error',
            }"
          >
            <span class="status-dot"></span>
            {{
              deepAgent.hasActiveInterrupt
                ? 'Awaiting Input'
                : deepAgent.isChatStreaming
                  ? deepAgent.activeMode === 'research'
                    ? 'Researching'
                    : 'Thinking'
                  : deepAgent.threadStatus === 'error'
                    ? 'Error'
                    : 'Ready'
            }}
          </div>
          <button
            class="mode-toggle"
            :class="{ active: deepAgent.activeMode === 'research' }"
            :title="
              deepAgent.activeMode === 'research'
                ? 'Switch to Chat mode'
                : 'Switch to Research mode'
            "
            @click="
              deepAgent.setActiveMode(deepAgent.activeMode === 'research' ? 'default' : 'research')
            "
          >
            <FlaskConical
              v-if="deepAgent.activeMode === 'research'"
              :size="14"
            />
            <MessageSquare
              v-else
              :size="14"
            />
            {{ deepAgent.activeMode === 'research' ? 'Research' : 'Chat' }}
          </button>
          <button
            class="ghost-action"
            @click="handleNewSession"
          >
            New session
          </button>
        </div>
      </header>

      <!-- Body: Sidebar + Chat Main -->
      <div class="home-body">
        <SideBar v-if="layoutStore.sidebarVisible" />

        <div class="chat-main">
          <!-- Task Progress Bar (collapsible, shows when todos exist) -->
          <Transition name="slide-down">
            <TaskProgressBar
              v-if="deepAgent.todos.length > 0 && !deepAgent.hasActiveNoteDraft"
              :todos="deepAgent.todos"
            />
          </Transition>

          <!-- Scrollable chat area -->
          <div class="chat-scroll">
            <div class="chat-content">
              <ChatHero
                v-if="!hasMessages && !deepAgent.isChatStreaming"
                @select="handleRecommendation"
              />

              <div
                class="chat-thread"
                :class="{ empty: !hasMessages }"
              >
                <!-- Render messages -->
                <template
                  v-for="msg in deepAgent.chatMessages"
                  :key="msg.id"
                >
                  <!-- User message: right-aligned bubble -->
                  <div
                    v-if="msg.role === 'user'"
                    class="message-row user"
                  >
                    <div class="user-bubble">
                      {{ msg.content }}
                    </div>
                  </div>

                  <!-- Assistant message: left-aligned, full width -->
                  <div
                    v-else
                    class="message-row assistant"
                  >
                    <div class="assistant-content">
                      <MarkdownContent
                        v-if="msg.content"
                        :content="msg.content"
                        :is-streaming="false"
                      />

                      <NoteDraftResponseCard
                        v-if="msg.noteDraft"
                        :note-draft="msg.noteDraft"
                        :thread-id="deepAgent.activeThreadId || undefined"
                        @update="handleNoteDraftUpdate"
                        @save="handleNoteDraftSave"
                        @hide="handleNoteDraftHide"
                        @reopen="handleNoteDraftReopen"
                      />

                      <!-- Tool calls inline -->
                      <template v-if="msg.toolCalls?.length">
                        <ToolCallBox
                          v-for="tc in msg.toolCalls"
                          :key="tc.id"
                          :tool-call="tc"
                        />
                      </template>

                      <!-- Sub-agent cards -->
                      <template v-if="msg.subagents?.length">
                        <SubagentCard
                          v-for="sa in msg.subagents"
                          :key="sa.id"
                          :subagent="sa"
                        />
                      </template>
                    </div>
                  </div>
                </template>

                <!-- Streaming content -->
                <div
                  v-if="deepAgent.isChatStreaming && deepAgent.streamingContent"
                  class="message-row assistant"
                >
                  <div class="assistant-content">
                    <MarkdownContent
                      :content="deepAgent.streamingContent"
                      :is-streaming="true"
                    />

                    <NoteDraftResponseCard
                      v-if="deepAgent.streamingNoteDraft"
                      :note-draft="deepAgent.streamingNoteDraft"
                      :thread-id="deepAgent.activeThreadId || undefined"
                      :is-streaming="true"
                      @update="handleNoteDraftUpdate"
                      @save="handleNoteDraftSave"
                      @hide="handleNoteDraftHide"
                      @reopen="handleNoteDraftReopen"
                    />

                    <!-- Active tool calls during streaming -->
                    <ToolCallBox
                      v-for="tc in deepAgent.streamingToolCalls"
                      :key="tc.id"
                      :tool-call="tc"
                    />

                    <!-- Active sub-agents during streaming -->
                    <SubagentCard
                      v-for="sa in deepAgent.streamingSubagents"
                      :key="sa.id"
                      :subagent="sa"
                    />
                  </div>
                </div>

                <div
                  v-else-if="deepAgent.isChatStreaming && deepAgent.streamingNoteDraft"
                  class="message-row assistant"
                >
                  <div class="assistant-content">
                    <NoteDraftResponseCard
                      :note-draft="deepAgent.streamingNoteDraft"
                      :thread-id="deepAgent.activeThreadId || undefined"
                      :is-streaming="true"
                      @update="handleNoteDraftUpdate"
                      @save="handleNoteDraftSave"
                      @hide="handleNoteDraftHide"
                      @reopen="handleNoteDraftReopen"
                    />
                  </div>
                </div>

                <div
                  v-if="deepAgent.isChatStreaming"
                  class="stream-indicator"
                >
                  <Loader2
                    :size="14"
                    class="spin"
                  />
                  <span>{{
                    deepAgent.activeMode === 'research' ? 'Researching...' : 'Thinking...'
                  }}</span>
                </div>

                <div ref="messagesEndRef" />
              </div>
            </div>
          </div>

          <!-- Composer at bottom -->
          <ChatComposer
            :is-processing="deepAgent.isChatStreaming"
            :demo-mode="isDemoMode()"
            @submit="handleSubmit"
          >
            <template
              v-if="showComposerTop"
              #top
            >
              <OutputClarificationCard
                v-if="deepAgent.pendingOutputClarification"
                :request="deepAgent.pendingOutputClarification"
                @select="handleOutputClarificationSelect"
                @cancel="handleOutputClarificationCancel"
              />

              <InterruptBanner
                v-if="deepAgent.pendingInterrupt"
                :interrupt="deepAgent.pendingInterrupt"
                compact
                @respond="deepAgent.respondToInterrupt($event)"
                @dismiss="
                  deepAgent.respondToInterrupt({ decision: 'reject', message: 'Dismissed' })
                "
              />

              <InlineTasksFiles
                v-if="showInlinePanel"
                :todos="deepAgent.todos"
                :files="deepAgent.files"
                @select-file="handleSelectFile"
              />
            </template>
          </ChatComposer>
        </div>
      </div>
    </div>

    <!-- Right: Note Preview Panel (slides in when AI creates/edits a note) -->
    <Transition name="slide-right">
      <NotePreviewPanel v-if="aiStore.previewPanelVisible" />
    </Transition>

    <!-- Error banner -->
    <Transition name="slide-up">
      <div
        v-if="error"
        class="error-banner"
      >
        <span>{{ error }}</span>
        <button @click="clearError">x</button>
      </div>
    </Transition>

    <!-- Clarification Dialog -->
    <ClarificationDialog
      v-if="aiStore.hasPendingClarification"
      :options="aiStore.pendingClarification?.options || []"
      :reason="aiStore.pendingClarification?.reason || ''"
      :is-visible="aiStore.hasPendingClarification"
      @select="handleClarificationSelect"
      @cancel="handleClarificationCancel"
    />

    <!-- File Viewer Modal -->
    <FileViewerModal
      :file="selectedFile"
      :visible="showFileViewer"
      @close="showFileViewer = false"
      @save="handleFileSave"
      @save-as-note="handleSaveAsNote"
    />
  </div>
</template>

<style scoped>
.home-page {
  display: flex;
  flex-direction: row;
  height: 100vh;
  width: 100vw;
  background: var(--app-bg, #0d1117);
  font-family:
    'Inter',
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    sans-serif;
  overflow: hidden;
  color: var(--text-color, #e6edf3);
}

.left-area {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  height: 100vh;
}

.home-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  flex-shrink: 0;
  padding: 8px 16px 8px 0;
  background: var(--app-bg, #0d1117);
}

.dock-area {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--sidebar-width, 260px);
  flex-shrink: 0;
  transition: width 0.25s ease;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: auto;
}

.status-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  background: var(--editor-color-04, rgba(255, 255, 255, 0.04));
  font-size: 12px;
  font-weight: 500;
  color: var(--text-color-secondary, #8b949e);
}

.status-chip.live {
  color: #3fb950;
  background: rgba(63, 185, 80, 0.1);
}

.status-chip.interrupted {
  color: #d29922;
  background: rgba(210, 153, 34, 0.1);
}

.status-chip.error {
  color: #f85149;
  background: rgba(248, 81, 73, 0.1);
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
}

.ghost-action {
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid var(--border-color, #30363d);
  background: transparent;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-color, #e6edf3);
  cursor: pointer;
  transition: all 0.15s;
}

.ghost-action:hover {
  background: var(--hover-bg, rgba(255, 255, 255, 0.06));
}

.mode-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--border-color, #30363d);
  background: transparent;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary, #8b949e);
  cursor: pointer;
  transition: all 0.15s;
}

.mode-toggle:hover {
  background: var(--hover-bg, rgba(255, 255, 255, 0.06));
  color: var(--text-color, #e6edf3);
}

.mode-toggle.active {
  border-color: rgba(251, 191, 36, 0.3);
  color: #fbbf24;
}

.mode-toggle.active:hover {
  background: rgba(251, 191, 36, 0.08);
}

.home-body {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.chat-scroll {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.chat-content {
  max-width: 768px;
  margin: 0 auto;
  padding: 0 24px;
}

.chat-thread {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-bottom: 16px;
}

.chat-thread.empty {
  padding-top: 0;
}

/* Message rows */
.message-row {
  padding: 8px 0;
}

.message-row.user {
  display: flex;
  justify-content: flex-end;
}

.user-bubble {
  max-width: 70%;
  padding: 10px 16px;
  border-radius: 18px 18px 4px 18px;
  background: var(--hover-bg, rgba(255, 255, 255, 0.05));
  color: var(--text-color, #e6edf3);
  font-size: 14px;
  line-height: 1.6;
  word-break: break-word;
}

.message-row.assistant {
  display: flex;
  justify-content: flex-start;
}

.assistant-content {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stream-indicator {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: rgba(139, 148, 158, 0.6);
  padding: 8px 0;
}

.error-banner {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: rgba(248, 81, 73, 0.12);
  border: 1px solid rgba(248, 81, 73, 0.3);
  border-radius: 10px;
  color: #f85149;
  font-size: 13px;
  z-index: 10;
}

.error-banner button {
  background: none;
  border: none;
  color: inherit;
  font-size: 16px;
  cursor: pointer;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Slide down transition (task progress, interrupt banner) */
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.25s ease;
}

.slide-down-enter-from,
.slide-down-leave-to {
  opacity: 0;
  transform: translateY(-12px);
}

/* Slide right transition (NotePreviewPanel) */
.slide-right-enter-active,
.slide-right-leave-active {
  transition:
    transform 0.3s cubic-bezier(0.4, 0, 0.2, 1),
    opacity 0.3s ease;
}

.slide-right-enter-from,
.slide-right-leave-to {
  transform: translateX(100%);
  opacity: 0;
}

/* Slide up transition (error banner) */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translate(-50%, 12px);
}

/* Scrollbar */
.chat-scroll::-webkit-scrollbar {
  width: 6px;
}

.chat-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.chat-scroll::-webkit-scrollbar-thumb {
  background: var(--border-color, #30363d);
  border-radius: 3px;
}
</style>
