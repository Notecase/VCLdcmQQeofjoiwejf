<script setup lang="ts">
import { computed, markRaw, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { DeepAgentNoteDraft } from '@/stores/deepAgent'
import { useAIStore } from '@/stores/ai'
import { usePreferencesStore } from '@/stores'
import { getNoteDraftDiffScopeId } from '@/stores/deepAgent.note-draft'
import { useDiffBlocks } from '@/composables/useDiffBlocks'
import { computeDiffHunks } from '@/services/ai.service'
import { registerMuyaPlugins } from '@/utils/muyaPlugins'
import { Muya } from '@inkdown/muya'
import { Check, Eye, EyeOff, Loader2, Save } from 'lucide-vue-next'

import '@inkdown/muya/assets/styles/index.css'
import '@/assets/themes/editor/default.css'
import 'katex/dist/katex.min.css'
import 'prismjs/themes/prism.css'

const props = defineProps<{
  noteDraft: DeepAgentNoteDraft
  threadId?: string
  isStreaming?: boolean
}>()

const emit = defineEmits<{
  update: [payload: { title?: string; content: string }]
  save: [payload: { title?: string; content?: string }]
  hide: []
  reopen: []
}>()

const aiStore = useAIStore()
const preferencesStore = usePreferencesStore()

const editorRef = ref<HTMLElement>()
const muyaInstance = ref<InstanceType<typeof Muya> | null>(null)
const localTitle = ref(props.noteDraft.title)
const localContent = ref(props.noteDraft.proposedContent || props.noteDraft.currentContent || '')
const isApplyingExternalUpdate = ref(false)
const isHydratingFromProps = ref(false)
const pendingStreamingMarkdown = ref<string | null>(null)
const streamingApplyTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const STREAMING_APPLY_INTERVAL_MS = 80

const syntheticNoteId = computed(() => {
  return getNoteDraftDiffScopeId(props.noteDraft.draftId, props.threadId)
})

const saveDisabled = computed(() =>
  Boolean(
    props.isStreaming ||
    props.noteDraft.isSaving ||
    !localTitle.value.trim() ||
    !localContent.value.trim()
  )
)

const pendingDiffCount = computed(() => aiStore.getDiffBlocksForNote(syntheticNoteId.value).length)

const wordCount = computed(() => {
  const words = localContent.value.split(/\s+/).filter(Boolean).length
  return `${words} words`
})

const statusLabel = computed(() => {
  if (props.noteDraft.isSaving) return 'Saving'
  if (props.noteDraft.isSaved) return 'Saved'
  return 'Draft'
})

const statusClass = computed(() => {
  if (props.noteDraft.isSaving) return 'saving'
  if (props.noteDraft.isSaved) return 'saved'
  return 'draft'
})

// Guard: true while onSync is propagating an update back to the parent.
// Prevents the content watcher from seeing the resulting prop change as "external"
// and re-triggering diff application (which was the root cause of Bug 3).
const isSyncingContent = ref(false)

const { clearAllDiffs, acceptAllDiffs, rejectAllDiffs, isDiffInjecting } = useDiffBlocks(
  muyaInstance as unknown as Parameters<typeof useDiffBlocks>[0],
  syntheticNoteId as unknown as Parameters<typeof useDiffBlocks>[1],
  {
    onSync: (markdown: string) => {
      if (
        markdown === props.noteDraft.currentContent &&
        localTitle.value === props.noteDraft.title
      ) {
        return
      }
      isSyncingContent.value = true
      localContent.value = markdown
      emit('update', { title: localTitle.value, content: markdown })
      // Clear after the watcher cycle completes (double nextTick ensures Vue reactivity settles)
      nextTick(() =>
        nextTick(() => {
          isSyncingContent.value = false
        })
      )
    },
  }
)

function applyPendingDiff() {
  const noteId = syntheticNoteId.value
  clearAllDiffs()
  aiStore.clearPendingEdits(noteId)

  const original = props.noteDraft.originalContent || ''
  const proposed = props.noteDraft.proposedContent || props.noteDraft.currentContent || ''
  if (!original.trim() && !proposed.trim()) return
  if (original === proposed) return

  const diffHunks = computeDiffHunks(original, proposed)
  if (!diffHunks.length) return

  aiStore.addPendingEdit({
    blockId: '',
    noteId,
    originalContent: original,
    proposedContent: proposed,
    diffHunks,
  })
}

function clearStreamingApplyTimer() {
  if (streamingApplyTimer.value) {
    clearTimeout(streamingApplyTimer.value)
    streamingApplyTimer.value = null
  }
}

function applyStreamingMarkdown(markdown: string) {
  if (!muyaInstance.value) return
  isApplyingExternalUpdate.value = true
  muyaInstance.value.setMarkdown(markdown)
  nextTick(() => {
    isApplyingExternalUpdate.value = false
  })
}

function queueStreamingMarkdown(markdown: string) {
  pendingStreamingMarkdown.value = markdown
  if (streamingApplyTimer.value) return

  streamingApplyTimer.value = setTimeout(() => {
    streamingApplyTimer.value = null
    const queued = pendingStreamingMarkdown.value
    pendingStreamingMarkdown.value = null
    if (!queued) return
    applyStreamingMarkdown(queued)
  }, STREAMING_APPLY_INTERVAL_MS)
}

function flushStreamingMarkdownQueue(options: { rebuildDiff?: boolean } = {}) {
  clearStreamingApplyTimer()
  const queued = pendingStreamingMarkdown.value
  pendingStreamingMarkdown.value = null
  if (queued) {
    applyStreamingMarkdown(queued)
  }
  if (options.rebuildDiff) {
    nextTick(() => applyPendingDiff())
  }
}

function initializeMuya() {
  if (!editorRef.value || muyaInstance.value) return
  registerMuyaPlugins({ frontControls: false })

  muyaInstance.value = markRaw(
    new Muya(editorRef.value, {
      markdown: localContent.value,
      focusMode: false,
      preferLooseListItem: preferencesStore.preferLooseListItem,
      autoPairBracket: preferencesStore.autoPairBracket,
      autoPairMarkdownSyntax: preferencesStore.autoPairMarkdownSyntax,
      autoPairQuote: preferencesStore.autoPairQuote,
      bulletListMarker: preferencesStore.bulletListMarker,
      orderListDelimiter: preferencesStore.orderListDelimiter,
      tabSize: preferencesStore.tabSize,
      fontSize: Math.max(preferencesStore.fontSize - 1, 14),
      lineHeight: preferencesStore.lineHeight,
      codeBlockLineNumbers: preferencesStore.codeBlockLineNumbers,
      listIndentation: preferencesStore.listIndentation,
      hideQuickInsertHint: preferencesStore.hideQuickInsertHint,
      hideLinkPopup: preferencesStore.hideLinkPopup,
      spellcheckEnabled: false,
      trimUnnecessaryCodeBlockEmptyLines: preferencesStore.trimUnnecessaryCodeBlockEmptyLines,
      mermaidTheme: preferencesStore.theme.includes('dark') ? 'dark' : 'default',
      vegaTheme: preferencesStore.theme.includes('dark') ? 'dark' : 'latimes',
      superSubScript: true,
      footnote: true,
      isGitlabCompatibilityEnabled: true,
      disableHtml: false,
    })
  )

  muyaInstance.value.on('json-change', () => {
    if (isApplyingExternalUpdate.value || isHydratingFromProps.value || isDiffInjecting.value)
      return
    const markdown = muyaInstance.value?.getMarkdown() || ''
    if (markdown === props.noteDraft.currentContent && localTitle.value === props.noteDraft.title) {
      return
    }
    localContent.value = markdown
    emit('update', { title: localTitle.value, content: markdown })
  })

  nextTick(() => applyPendingDiff())
}

function handleSave() {
  emit('save', { title: localTitle.value, content: localContent.value })
}

watch(
  () => ({
    draftId: props.noteDraft.draftId,
    title: props.noteDraft.title,
    originalContent: props.noteDraft.originalContent || '',
    proposedContent: props.noteDraft.proposedContent || props.noteDraft.currentContent || '',
  }),
  (draft) => {
    // Skip if this update was triggered by our own onSync callback
    if (isSyncingContent.value) return

    const nextContent = draft.proposedContent
    const currentMarkdown = muyaInstance.value?.getMarkdown() || localContent.value
    const titleChanged = draft.title !== localTitle.value
    const contentChangedExternally = nextContent !== currentMarkdown

    if (!titleChanged && !contentChangedExternally) return

    isHydratingFromProps.value = true
    if (titleChanged) {
      localTitle.value = draft.title
    }
    if (!contentChangedExternally) {
      isHydratingFromProps.value = false
      return
    }

    localContent.value = nextContent

    if (muyaInstance.value) {
      if (props.isStreaming) {
        queueStreamingMarkdown(nextContent)
        isHydratingFromProps.value = false
        return
      }

      flushStreamingMarkdownQueue()
      isApplyingExternalUpdate.value = true
      clearAllDiffs()
      aiStore.clearPendingEdits(syntheticNoteId.value)
      muyaInstance.value.setMarkdown(nextContent)
      nextTick(() => {
        isApplyingExternalUpdate.value = false
        isHydratingFromProps.value = false
        applyPendingDiff()
      })
      return
    }

    isHydratingFromProps.value = false
  }
)

watch(
  () => props.isStreaming,
  (streaming, wasStreaming) => {
    if (streaming) {
      clearAllDiffs()
      aiStore.clearPendingEdits(syntheticNoteId.value)
      return
    }

    if (wasStreaming) {
      flushStreamingMarkdownQueue({ rebuildDiff: true })
    }
  }
)

watch(localTitle, (title) => {
  if (isHydratingFromProps.value || isApplyingExternalUpdate.value) return
  if (title === props.noteDraft.title) return
  emit('update', { title, content: localContent.value })
})

watch(
  () => props.noteDraft.hidden,
  (hidden) => {
    if (hidden) {
      clearStreamingApplyTimer()
      pendingStreamingMarkdown.value = null
      clearAllDiffs()
      aiStore.clearPendingEdits(syntheticNoteId.value)
      if (muyaInstance.value) {
        try {
          muyaInstance.value.destroy()
        } catch {
          /* ignore */
        }
        muyaInstance.value = null
      }
    } else {
      nextTick(() => initializeMuya())
    }
  }
)

onMounted(() => {
  if (!props.noteDraft.hidden) {
    initializeMuya()
  }
})

onUnmounted(() => {
  clearStreamingApplyTimer()
  pendingStreamingMarkdown.value = null
  clearAllDiffs()
  aiStore.clearPendingEdits(syntheticNoteId.value)
  if (muyaInstance.value) {
    try {
      muyaInstance.value.destroy()
    } catch {
      /* ignore */
    }
    muyaInstance.value = null
  }
})
</script>

<template>
  <div
    v-if="noteDraft.hidden"
    class="draft-collapsed"
  >
    <div class="collapsed-meta">
      <span class="collapsed-title">{{ noteDraft.title }}</span>
      <span class="collapsed-status">Unsaved draft hidden</span>
    </div>
    <button
      class="action-button reopen"
      type="button"
      @click="emit('reopen')"
    >
      <Eye :size="14" />
      Open draft
    </button>
  </div>

  <div
    v-else
    class="note-draft-card"
  >
    <div class="card-header">
      <input
        v-model="localTitle"
        class="title-input"
        placeholder="Draft title"
        :disabled="noteDraft.isSaving"
      />

      <div class="header-actions">
        <span
          class="status-badge"
          :class="statusClass"
        >
          <Loader2
            v-if="noteDraft.isSaving"
            :size="12"
            class="spin"
          />
          <Check
            v-else-if="noteDraft.isSaved"
            :size="12"
          />
          {{ statusLabel }}
        </span>
        <span class="word-count">{{ wordCount }}</span>
        <button
          class="icon-button"
          type="button"
          title="Hide draft"
          @click="emit('hide')"
        >
          <EyeOff :size="14" />
        </button>
      </div>
    </div>

    <div class="card-body">
      <div
        ref="editorRef"
        class="draft-editor muya-editor muya-editor--contained-diff"
        :class="{ streaming: isStreaming }"
      />
    </div>

    <div class="card-footer">
      <div
        v-if="pendingDiffCount > 0"
        class="diff-actions"
      >
        <button
          class="action-button accept"
          type="button"
          @click="acceptAllDiffs"
        >
          Accept All
        </button>
        <button
          class="action-button reject"
          type="button"
          @click="rejectAllDiffs"
        >
          Reject All
        </button>
      </div>

      <button
        class="action-button save"
        type="button"
        :disabled="saveDisabled"
        @click="handleSave"
      >
        <Save :size="14" />
        Save
      </button>
    </div>
  </div>
</template>

<style scoped>
.note-draft-card {
  width: 100%;
  border: 1px solid var(--border-color, #30363d);
  border-radius: 16px;
  background:
    radial-gradient(circle at top right, rgba(124, 158, 248, 0.12), transparent 50%),
    var(--editorBgColor, #0d1117);
  overflow: hidden;
  position: relative;
  isolation: isolate;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-color, #30363d);
  background: rgba(255, 255, 255, 0.03);
  position: relative;
  z-index: 11010;
}

.title-input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  color: var(--text-color, #e6edf3);
  font-size: 14px;
  font-weight: 600;
  outline: none;
}

.header-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border-radius: 999px;
  padding: 3px 9px;
  font-size: 11px;
  font-weight: 600;
}

.status-badge.draft {
  background: rgba(148, 163, 184, 0.15);
  color: #94a3b8;
}

.status-badge.saving {
  background: rgba(250, 204, 21, 0.15);
  color: #facc15;
}

.status-badge.saved {
  background: var(--sec-primary-bg, rgba(16, 185, 129, 0.18));
  color: var(--sec-primary-light, #34d399);
}

.word-count {
  font-size: 11px;
  color: rgba(148, 163, 184, 0.9);
}

.icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--border-color, #30363d);
  border-radius: 8px;
  background: transparent;
  color: var(--text-color-secondary, #8b949e);
  cursor: pointer;
}

.icon-button:hover {
  background: rgba(255, 255, 255, 0.06);
}

.card-body {
  min-height: 180px;
  max-height: 560px;
  overflow-y: auto;
  overflow-x: hidden;
  position: relative;
  z-index: 1;
}

.draft-editor {
  min-height: 180px;
  padding: 20px 24px;
}

.draft-editor.streaming {
  pointer-events: none;
  opacity: 0.92;
}

.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 14px;
  border-top: 1px solid var(--border-color, #30363d);
  background: rgba(255, 255, 255, 0.02);
}

.diff-actions {
  display: inline-flex;
  gap: 8px;
}

.action-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 9px;
  border: 1px solid var(--border-color, #30363d);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-color, #e6edf3);
  font-size: 12px;
  font-weight: 600;
  padding: 7px 11px;
  cursor: pointer;
}

.action-button:hover {
  background: rgba(255, 255, 255, 0.08);
}

.action-button.accept {
  border-color: var(--sec-primary-border, rgba(52, 211, 153, 0.45));
  color: var(--sec-primary-light, #34d399);
}

.action-button.reject {
  border-color: rgba(248, 113, 113, 0.45);
  color: #f87171;
}

.action-button.save {
  border-color: rgba(124, 158, 248, 0.6);
  color: #dbe7ff;
}

.action-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.draft-collapsed {
  width: 100%;
  border: 1px dashed var(--border-color, #30363d);
  border-radius: 12px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.03);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.collapsed-meta {
  min-width: 0;
}

.collapsed-title {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color, #e6edf3);
}

.collapsed-status {
  display: block;
  font-size: 11px;
  color: var(--text-color-secondary, #8b949e);
}

.action-button.reopen {
  white-space: nowrap;
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
