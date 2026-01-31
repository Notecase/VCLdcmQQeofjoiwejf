<script setup lang="ts">
/**
 * InlineDiffRenderer - True inline diff visualization
 *
 * Renders diff markers directly in the editor content:
 * - Deleted text: Red with strikethrough, "-" button to confirm removal
 * - Added text: Green highlight, "+" button to confirm insertion
 *
 * This component:
 * 1. Watches for activeEdit in the AI store
 * 2. When edit is active, creates a diff overlay on the editor
 * 3. Handles accept/reject actions via injected buttons
 * 4. Restores original content on discard
 */
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useAIStore } from '@/stores/ai'
import { mergeDiffContent, getFinalContent, type DiffHighlight } from '@/utils/diffMerger'
import { CheckCheck, XCircle, Trash2, Check, X } from 'lucide-vue-next'

const props = defineProps<{
  editorElement: HTMLElement | null
}>()

const emit = defineEmits<{
  apply: [content: string]
  discard: []
}>()

const aiStore = useAIStore()

// Local state
const isActive = ref(false)
const originalMarkdown = ref('')
const mergedContent = ref('')
const highlights = ref<DiffHighlight[]>([])
const acceptedHunks = ref<Set<string>>(new Set())
const rejectedHunks = ref<Set<string>>(new Set())

// Overlay position state (calculated from editor element bounds)
const overlayStyle = ref<Record<string, string>>({})

// Computed
const activeEdit = computed(() => aiStore.activeEdit)
const pendingCount = computed(() => {
  return highlights.value.filter(
    (h) => !acceptedHunks.value.has(h.hunkId) && !rejectedHunks.value.has(h.hunkId)
  ).length
})
const totalCount = computed(() => highlights.value.length)
const canApply = computed(() => pendingCount.value === 0 && acceptedHunks.value.size > 0)

// Check if overlay should be visible
const showOverlay = computed(() => {
  return isActive.value && Object.keys(overlayStyle.value).length > 0
})

/**
 * Update overlay position based on editor element bounds
 */
function updateOverlayPosition() {
  // Try multiple ways to get the editor element
  let el: HTMLElement | null = null

  // Method 1: Use the prop if it's a valid HTMLElement
  if (props.editorElement instanceof HTMLElement) {
    el = props.editorElement
  }
  // Method 2: Check if prop is a Vue ref with .value
  else if (props.editorElement && 'value' in props.editorElement) {
    const refValue = (props.editorElement as any).value
    if (refValue instanceof HTMLElement) {
      el = refValue
    }
  }
  // Method 3: Fallback to DOM query
  if (!el) {
    el = document.querySelector('.muya-editor') as HTMLElement | null
  }

  if (!el) {
    console.log('[InlineDiffRenderer] No editor element found')
    overlayStyle.value = {}
    return
  }

  const rect = el.getBoundingClientRect()

  console.log('[InlineDiffRenderer] Editor bounds:', {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    elementClass: el.className,
  })

  // Only set position if we have valid dimensions
  if (rect.width === 0 || rect.height === 0) {
    console.log('[InlineDiffRenderer] Editor has no dimensions, retrying...')
    setTimeout(updateOverlayPosition, 100)
    return
  }

  overlayStyle.value = {
    position: 'fixed',
    top: `${rect.top}px`,
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    zIndex: '1000',
  }
}

// Watch for active edit changes
watch(
  activeEdit,
  (edit) => {
    if (edit && !isActive.value) {
      activateDiffMode(edit)
    } else if (!edit && isActive.value) {
      deactivateDiffMode()
    }
  },
  { immediate: true }
)

// Watch for editor element changes to update position
watch(
  () => props.editorElement,
  (el) => {
    if (el && isActive.value) {
      updateOverlayPosition()
    }
  },
  { immediate: true }
)

/**
 * Activate diff mode - compute diff highlights
 */
function activateDiffMode(edit: typeof activeEdit.value) {
  if (!edit) return

  console.log('[InlineDiffRenderer] Activating diff mode', {
    originalLength: edit.originalContent.length,
    proposedLength: edit.proposedContent.length,
    hasEditorElement: !!props.editorElement,
  })

  // Store original content
  originalMarkdown.value = edit.originalContent

  // Compute merged diff
  const merged = mergeDiffContent(edit.originalContent, edit.proposedContent)
  mergedContent.value = merged.content
  highlights.value = merged.highlights

  console.log('[InlineDiffRenderer] Merged diff:', {
    contentLength: merged.content.length,
    highlightsCount: merged.highlights.length,
  })

  // Reset accept/reject state
  acceptedHunks.value = new Set()
  rejectedHunks.value = new Set()

  isActive.value = true

  // Calculate overlay position
  updateOverlayPosition()
}

/**
 * Deactivate diff mode
 */
function deactivateDiffMode() {
  isActive.value = false
  highlights.value = []
  acceptedHunks.value = new Set()
  rejectedHunks.value = new Set()
  overlayStyle.value = {}
}

/**
 * Get text segment with highlight info for rendering
 */
function getTextSegments() {
  const segments: Array<{
    text: string
    highlight: DiffHighlight | null
    status: 'pending' | 'accepted' | 'rejected' | 'normal'
  }> = []

  const content = mergedContent.value
  const sortedHighlights = [...highlights.value].sort((a, b) => a.start - b.start)

  let lastEnd = 0

  for (const h of sortedHighlights) {
    // Add normal text before this highlight
    if (h.start > lastEnd) {
      segments.push({
        text: content.slice(lastEnd, h.start),
        highlight: null,
        status: 'normal',
      })
    }

    // Add highlighted segment
    const status = acceptedHunks.value.has(h.hunkId)
      ? 'accepted'
      : rejectedHunks.value.has(h.hunkId)
        ? 'rejected'
        : 'pending'

    segments.push({
      text: content.slice(h.start, h.end),
      highlight: h,
      status,
    })

    lastEnd = h.end
  }

  // Add remaining text
  if (lastEnd < content.length) {
    segments.push({
      text: content.slice(lastEnd),
      highlight: null,
      status: 'normal',
    })
  }

  return segments
}

/**
 * Accept a hunk
 */
function acceptHunk(hunkId: string) {
  acceptedHunks.value = new Set([...acceptedHunks.value, hunkId])
  rejectedHunks.value.delete(hunkId)
}

/**
 * Reject a hunk
 */
function rejectHunk(hunkId: string) {
  rejectedHunks.value = new Set([...rejectedHunks.value, hunkId])
  acceptedHunks.value.delete(hunkId)
}

/**
 * Accept all pending hunks
 */
function handleAcceptAll() {
  const newAccepted = new Set(acceptedHunks.value)
  highlights.value.forEach((h) => {
    if (!acceptedHunks.value.has(h.hunkId) && !rejectedHunks.value.has(h.hunkId)) {
      newAccepted.add(h.hunkId)
    }
  })
  acceptedHunks.value = newAccepted
}

/**
 * Reject all pending hunks
 */
function handleRejectAll() {
  const newRejected = new Set(rejectedHunks.value)
  highlights.value.forEach((h) => {
    if (!acceptedHunks.value.has(h.hunkId) && !rejectedHunks.value.has(h.hunkId)) {
      newRejected.add(h.hunkId)
    }
  })
  rejectedHunks.value = newRejected
}

/**
 * Apply the accepted changes
 */
function handleApply() {
  if (!activeEdit.value) return

  // Get final content based on accepted/rejected hunks
  const finalContent = getFinalContent(
    mergedContent.value,
    highlights.value,
    acceptedHunks.value,
    rejectedHunks.value
  )

  console.log('[InlineDiffRenderer] Applying changes:', {
    originalLength: originalMarkdown.value.length,
    finalLength: finalContent.length,
    accepted: acceptedHunks.value.size,
    rejected: rejectedHunks.value.size,
  })

  // Emit apply event with final content
  emit('apply', finalContent)

  // Clear the active edit
  aiStore.setActiveEdit(null)
}

/**
 * Discard all changes
 */
function handleDiscard() {
  if (activeEdit.value) {
    aiStore.discardEdit(activeEdit.value.id)
  }
  emit('discard')
}

// Setup resize and scroll listeners
onMounted(() => {
  window.addEventListener('resize', updateOverlayPosition)
  window.addEventListener('scroll', updateOverlayPosition, true)

  // Initial position calculation if already active
  if (isActive.value && props.editorElement) {
    updateOverlayPosition()
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', updateOverlayPosition)
  window.removeEventListener('scroll', updateOverlayPosition, true)
  deactivateDiffMode()
})
</script>

<template>
  <!-- Diff overlay panel - Teleported to body with fixed positioning -->
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="showOverlay"
        class="inline-diff-overlay"
        :style="overlayStyle"
      >
        <div class="diff-content-wrapper">
          <template v-for="(segment, idx) in getTextSegments()" :key="idx">
            <!-- Normal text -->
            <span v-if="!segment.highlight" class="diff-text-normal">{{ segment.text }}</span>

            <!-- Deletion highlight -->
            <span
              v-else-if="segment.highlight.type === 'deletion'"
              class="diff-marker deletion"
              :class="{
                accepted: segment.status === 'accepted',
                rejected: segment.status === 'rejected',
                pending: segment.status === 'pending',
              }"
            >
              <span class="diff-text">{{ segment.text }}</span>
              <button
                v-if="segment.status === 'pending'"
                class="diff-btn reject"
                title="Remove this text"
                @click="acceptHunk(segment.highlight.hunkId)"
              >
                <X :size="12" />
              </button>
              <button
                v-if="segment.status === 'pending'"
                class="diff-btn keep"
                title="Keep this text"
                @click="rejectHunk(segment.highlight.hunkId)"
              >
                <Check :size="12" />
              </button>
            </span>

            <!-- Addition highlight -->
            <span
              v-else-if="segment.highlight.type === 'addition'"
              class="diff-marker addition"
              :class="{
                accepted: segment.status === 'accepted',
                rejected: segment.status === 'rejected',
                pending: segment.status === 'pending',
              }"
            >
              <span class="diff-text">{{ segment.text }}</span>
              <button
                v-if="segment.status === 'pending'"
                class="diff-btn accept"
                title="Add this text"
                @click="acceptHunk(segment.highlight.hunkId)"
              >
                <Check :size="12" />
              </button>
              <button
                v-if="segment.status === 'pending'"
                class="diff-btn reject"
                title="Don't add this text"
                @click="rejectHunk(segment.highlight.hunkId)"
              >
                <X :size="12" />
              </button>
            </span>
          </template>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- Floating action bar at bottom -->
  <Teleport to="body">
    <Transition name="slide-up">
      <div v-if="isActive && totalCount > 0" class="diff-floating-bar">
        <span class="progress-info">
          {{ totalCount - pendingCount }} / {{ totalCount }} reviewed
        </span>

        <button
          class="bar-btn accept-all"
          :disabled="pendingCount === 0"
          @click="handleAcceptAll"
        >
          <CheckCheck :size="14" />
          Accept All
        </button>

        <button
          class="bar-btn reject-all"
          :disabled="pendingCount === 0"
          @click="handleRejectAll"
        >
          <XCircle :size="14" />
          Reject All
        </button>

        <button
          class="bar-btn apply"
          :disabled="!canApply"
          @click="handleApply"
        >
          Apply Changes
        </button>

        <button
          class="bar-btn discard"
          @click="handleDiscard"
        >
          <Trash2 :size="14" />
          Discard
        </button>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Diff overlay that covers the editor - uses fixed positioning from style binding */
.inline-diff-overlay {
  background: var(--surface-1, #0d1117);
  overflow-y: auto;
  padding: 20px;
  border: 2px solid var(--diff-add-border, #16a34a);
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.diff-content-wrapper {
  max-width: 100%;
  font-family: inherit;
  font-size: var(--editor-font-size, 16px);
  line-height: var(--editor-line-height, 1.6);
  white-space: pre-wrap;
  word-wrap: break-word;
}

/* Normal text */
.diff-text-normal {
  color: var(--text-primary, #e6edf3);
}

/* Diff markers */
.diff-marker {
  display: inline;
  border-radius: 3px;
  padding: 2px 4px;
  margin: 0 1px;
  position: relative;
}

.diff-marker .diff-text {
  display: inline;
}

/* Deletion marker */
.diff-marker.deletion {
  background: var(--diff-remove-bg, rgba(248, 81, 73, 0.15));
  color: var(--diff-remove-text, #f85149);
}

.diff-marker.deletion.pending .diff-text {
  text-decoration: line-through;
  text-decoration-color: var(--diff-remove-border, #f85149);
  text-decoration-thickness: 2px;
}

.diff-marker.deletion.accepted {
  opacity: 0.4;
  text-decoration: line-through;
}

.diff-marker.deletion.rejected {
  background: transparent;
  color: inherit;
}

/* Addition marker */
.diff-marker.addition {
  background: var(--diff-add-bg, rgba(46, 160, 67, 0.15));
  color: var(--diff-add-text, #3fb950);
}

.diff-marker.addition.accepted {
  background: transparent;
  color: inherit;
}

.diff-marker.addition.rejected {
  opacity: 0.4;
  text-decoration: line-through;
}

/* Inline action buttons */
.diff-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  margin-left: 4px;
  padding: 0;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
  vertical-align: middle;
}

.diff-btn.accept,
.diff-btn.keep {
  background: var(--diff-add-border, #3fb950);
  color: white;
}

.diff-btn.accept:hover,
.diff-btn.keep:hover {
  background: #15803d;
  transform: scale(1.1);
}

.diff-btn.reject {
  background: var(--diff-remove-border, #f85149);
  color: white;
}

.diff-btn.reject:hover {
  background: #b91c1c;
  transform: scale(1.1);
}

/* Fade animation for overlay */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Slide-up animation for action bar */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(20px);
}

/* Apply button specific style */
.bar-btn.apply {
  background: var(--diff-add-border, #3fb950);
  color: white;
  padding: 8px 16px;
}

.bar-btn.apply:hover:not(:disabled) {
  filter: brightness(1.1);
}

.bar-btn.apply:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
