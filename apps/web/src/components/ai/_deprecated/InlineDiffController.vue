<script setup lang="ts">
/**
 * InlineDiffController - True inline diff visualization via Muya integration
 *
 * This component:
 * 1. Watches for activeEdit in the AI store
 * 2. Computes word-level diff highlights
 * 3. Sets editor to merged content
 * 4. Passes highlights to Muya's block update method
 * 5. Injects action buttons via DOM after render
 * 6. Handles accept/reject state management
 * 7. Emits apply event with resolved content
 */
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useAIStore } from '@/stores/ai'
import {
  mergeDiffContent,
  getFinalContent,
  toMuyaHighlights,
  type DiffHighlight,
  type MuyaDiffHighlight,
} from '@/utils/diffMerger'
import { CheckCheck, XCircle, Trash2 } from 'lucide-vue-next'

const props = defineProps<{
  getMuya: () => any
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
const muyaHighlights = ref<MuyaDiffHighlight[]>([])
const acceptedHunks = ref<Set<string>>(new Set())
const rejectedHunks = ref<Set<string>>(new Set())

// Track injected buttons for cleanup
const injectedButtons = ref<HTMLElement[]>([])

// Computed
const activeEdit = computed(() => aiStore.activeEdit)
const pendingCount = computed(() => {
  return highlights.value.filter(
    (h) => !acceptedHunks.value.has(h.hunkId) && !rejectedHunks.value.has(h.hunkId)
  ).length
})
const totalCount = computed(() => highlights.value.length)
const canApply = computed(() => pendingCount.value === 0 && acceptedHunks.value.size > 0)

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

/**
 * Activate diff mode - compute diff highlights and update Muya
 */
async function activateDiffMode(edit: typeof activeEdit.value) {
  if (!edit) return

  const muya = props.getMuya()
  if (!muya) {
    console.warn('[InlineDiffController] Muya instance not available')
    return
  }

  console.log('[InlineDiffController] Activating diff mode', {
    originalLength: edit.originalContent.length,
    proposedLength: edit.proposedContent.length,
  })

  // Store original content
  originalMarkdown.value = edit.originalContent

  // Compute merged diff
  const merged = mergeDiffContent(edit.originalContent, edit.proposedContent)
  mergedContent.value = merged.content
  highlights.value = merged.highlights
  muyaHighlights.value = toMuyaHighlights(merged.highlights)

  console.log('[InlineDiffController] Merged diff:', {
    contentLength: merged.content.length,
    highlightsCount: merged.highlights.length,
  })

  // Reset accept/reject state
  acceptedHunks.value = new Set()
  rejectedHunks.value = new Set()

  isActive.value = true

  // Set Muya content to merged content
  muya.setMarkdown(mergedContent.value)

  // Wait for Muya to render (multiple ticks to ensure DOM is ready)
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 100))

  // Apply highlights
  await applyMuyaHighlights()

  // Wait again for highlight rendering
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 50))

  // Inject action buttons
  await injectActionButtons()
}

/**
 * Apply highlights to Muya blocks using native Muya highlight system
 * This follows the same pattern as Muya's search module
 */
async function applyMuyaHighlights() {
  const muya = props.getMuya()
  if (!muya) return

  // Get the scroll page (root block) - correct access via muya.editor
  const scrollPage = muya.editor?.scrollPage
  if (!scrollPage) {
    console.warn('[InlineDiffController] Could not find Muya editor.scrollPage')
    // Fallback to DOM-based approach
    await nextTick()
    applyHighlightsViaDOM()
    return
  }

  console.log('[InlineDiffController] Found scrollPage, applying highlights to blocks')

  // Build a map of block -> highlights (like Muya's search module does)
  const highlightsMap = new Map<any, any[]>()

  // Track global position as we traverse blocks
  let globalOffset = 0

  // Use depthFirstTraverse like Muya's search module
  scrollPage.depthFirstTraverse((block: any) => {
    if (block.isContent && block.isContent()) {
      const blockText = block.text || ''
      const blockStart = globalOffset
      const blockEnd = globalOffset + blockText.length

      // Find highlights that overlap with this block
      const blockHighlights = muyaHighlights.value
        .filter((h) => {
          // Check if highlight overlaps with this block's text range
          return h.end > blockStart && h.start < blockEnd
        })
        .map((h) => ({
          // Adjust positions to be relative to this block
          start: Math.max(0, h.start - blockStart),
          end: Math.min(blockText.length, h.end - blockStart),
          active: h.active,
          diffType: h.diffType,
          hunkId: h.hunkId,
        }))

      if (blockHighlights.length > 0) {
        highlightsMap.set(block, blockHighlights)
      }

      // Account for newline between blocks (paragraphs are separated by newlines)
      globalOffset = blockEnd + 1
    }
  })

  console.log('[InlineDiffController] Found blocks with highlights:', highlightsMap.size)

  // Apply highlights to each block (like Muya's search._updateMatches)
  for (const [block, blockHighlights] of highlightsMap.entries()) {
    console.log('[InlineDiffController] Updating block with', blockHighlights.length, 'highlights')
    block.update(undefined, blockHighlights)
  }

  await nextTick()
}

/**
 * Get the Muya editor container element
 */
function getMuyaContainer(): HTMLElement | null {
  const muya = props.getMuya()
  if (!muya) return null

  // Try different access patterns for the container
  return (
    muya.editor?.scrollPage?.domNode ||
    muya.domNode ||
    muya.container ||
    document.querySelector('.muya-editor')
  )
}

/**
 * Apply highlights by manipulating the DOM directly after Muya renders
 * This is a fallback approach when native Muya highlight system isn't available
 */
function applyHighlightsViaDOM() {
  const container = getMuyaContainer()
  if (!container) {
    console.warn('[InlineDiffController] Could not find editor container for DOM manipulation')
    return
  }

  console.log('[InlineDiffController] Applying highlights via DOM manipulation')

  // Get all paragraph content spans
  const contentSpans = container.querySelectorAll(
    '.mu-paragraph-content, .mu-content, [class*="content"]'
  )

  if (contentSpans.length === 0) {
    console.warn('[InlineDiffController] No content spans found in editor')
    return
  }

  // Track global position across all content spans
  let globalOffset = 0

  contentSpans.forEach((span) => {
    const textContent = span.textContent || ''
    const spanStart = globalOffset
    const spanEnd = globalOffset + textContent.length

    // Find highlights that overlap with this span
    highlights.value
      .filter((h) => h.end > spanStart && h.start < spanEnd)
      .forEach((highlight) => {
        // Find the text node and wrap the highlighted portion
        const localStart = Math.max(0, highlight.start - spanStart)
        const localEnd = Math.min(textContent.length, highlight.end - spanStart)

        // Use Range API to wrap the text
        wrapTextWithHighlight(span as HTMLElement, localStart, localEnd, highlight)
      })

    globalOffset = spanEnd + 1 // +1 for newline
  })
}

/**
 * Wrap text within an element with a highlight span using Range API
 */
function wrapTextWithHighlight(
  element: HTMLElement,
  start: number,
  end: number,
  highlight: DiffHighlight
) {
  try {
    // Get text nodes within the element
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null)
    let currentOffset = 0
    let node: Text | null

    while ((node = walker.nextNode() as Text | null)) {
      const nodeLength = node.textContent?.length || 0
      const nodeStart = currentOffset
      const nodeEnd = currentOffset + nodeLength

      // Check if this node contains part of our highlight
      if (nodeEnd > start && nodeStart < end) {
        const localStart = Math.max(0, start - nodeStart)
        const localEnd = Math.min(nodeLength, end - nodeStart)

        // Create a range for the text to highlight
        const range = document.createRange()
        range.setStart(node, localStart)
        range.setEnd(node, localEnd)

        // Create the highlight span
        const span = document.createElement('span')
        span.className =
          highlight.type === 'deletion' ? 'mu-diff-deletion pending' : 'mu-diff-addition pending'
        span.setAttribute('data-hunk-id', highlight.hunkId)

        // Wrap the text
        range.surroundContents(span)

        return // Only wrap once per highlight
      }

      currentOffset += nodeLength
    }
  } catch (err) {
    console.warn('[InlineDiffController] Failed to wrap text with highlight:', err)
  }
}

/**
 * Inject action buttons next to highlight spans
 */
async function injectActionButtons() {
  // Clean up previously injected buttons
  cleanupInjectedButtons()

  await nextTick()

  const container = getMuyaContainer()
  if (!container) {
    console.warn('[InlineDiffController] Could not find container for button injection')
    return
  }

  // Find all diff highlight spans
  const additionSpans = container.querySelectorAll('.mu-diff-addition')
  const deletionSpans = container.querySelectorAll('.mu-diff-deletion')

  console.log('[InlineDiffController] Found highlight spans:', {
    additions: additionSpans.length,
    deletions: deletionSpans.length,
  })

  // Inject buttons for additions
  additionSpans.forEach((span: Element) => {
    const hunkId = span.getAttribute('data-hunk-id')
    if (!hunkId) return
    if (acceptedHunks.value.has(hunkId) || rejectedHunks.value.has(hunkId)) return

    const buttonGroup = createButtonGroup(hunkId, 'addition')
    span.appendChild(buttonGroup)
    injectedButtons.value.push(buttonGroup)
  })

  // Inject buttons for deletions
  deletionSpans.forEach((span: Element) => {
    const hunkId = span.getAttribute('data-hunk-id')
    if (!hunkId) return
    if (acceptedHunks.value.has(hunkId) || rejectedHunks.value.has(hunkId)) return

    const buttonGroup = createButtonGroup(hunkId, 'deletion')
    span.appendChild(buttonGroup)
    injectedButtons.value.push(buttonGroup)
  })
}

/**
 * Create accept/reject button group using safe DOM methods
 */
function createButtonGroup(hunkId: string, type: 'addition' | 'deletion'): HTMLElement {
  const group = document.createElement('span')
  group.className = 'mu-diff-action-group'
  group.setAttribute('data-hunk-id', hunkId)

  if (type === 'addition') {
    // Accept button (keep the addition)
    const acceptBtn = document.createElement('button')
    acceptBtn.className = 'mu-diff-action accept'
    acceptBtn.title = 'Add this text'
    acceptBtn.textContent = '✓'
    acceptBtn.onclick = (e) => {
      e.preventDefault()
      e.stopPropagation()
      acceptHunk(hunkId)
    }
    group.appendChild(acceptBtn)

    // Reject button (remove the addition)
    const rejectBtn = document.createElement('button')
    rejectBtn.className = 'mu-diff-action reject'
    rejectBtn.title = "Don't add this text"
    rejectBtn.textContent = '✗'
    rejectBtn.onclick = (e) => {
      e.preventDefault()
      e.stopPropagation()
      rejectHunk(hunkId)
    }
    group.appendChild(rejectBtn)
  } else {
    // Accept deletion button (remove the text)
    const acceptBtn = document.createElement('button')
    acceptBtn.className = 'mu-diff-action reject'
    acceptBtn.title = 'Remove this text'
    acceptBtn.textContent = '✗'
    acceptBtn.onclick = (e) => {
      e.preventDefault()
      e.stopPropagation()
      acceptHunk(hunkId)
    }
    group.appendChild(acceptBtn)

    // Reject deletion button (keep the text)
    const rejectBtn = document.createElement('button')
    rejectBtn.className = 'mu-diff-action accept'
    rejectBtn.title = 'Keep this text'
    rejectBtn.textContent = '✓'
    rejectBtn.onclick = (e) => {
      e.preventDefault()
      e.stopPropagation()
      rejectHunk(hunkId)
    }
    group.appendChild(rejectBtn)
  }

  return group
}

/**
 * Clean up injected buttons
 */
function cleanupInjectedButtons() {
  injectedButtons.value.forEach((btn) => {
    btn.remove()
  })
  injectedButtons.value = []
}

/**
 * Update visual state of highlight spans
 */
function updateHighlightVisuals() {
  const container = getMuyaContainer()
  if (!container) return

  highlights.value.forEach((highlight) => {
    const spans = container.querySelectorAll(`[data-hunk-id="${highlight.hunkId}"]`)
    const isAccepted = acceptedHunks.value.has(highlight.hunkId)
    const isRejected = rejectedHunks.value.has(highlight.hunkId)

    spans.forEach((span: Element) => {
      span.classList.remove('pending', 'accepted', 'rejected')

      if (isAccepted) {
        span.classList.add('accepted')
      } else if (isRejected) {
        span.classList.add('rejected')
      } else {
        span.classList.add('pending')
      }

      // Remove action buttons if already decided
      if (isAccepted || isRejected) {
        const actionGroup = span.querySelector('.mu-diff-action-group')
        if (actionGroup) {
          actionGroup.remove()
        }
      }
    })
  })
}

/**
 * Deactivate diff mode
 */
function deactivateDiffMode() {
  cleanupInjectedButtons()
  isActive.value = false
  highlights.value = []
  muyaHighlights.value = []
  acceptedHunks.value = new Set()
  rejectedHunks.value = new Set()

  // Restore original content
  const muya = props.getMuya()
  if (muya && originalMarkdown.value) {
    muya.setMarkdown(originalMarkdown.value)
  }
}

/**
 * Accept a hunk
 */
function acceptHunk(hunkId: string) {
  acceptedHunks.value = new Set([...acceptedHunks.value, hunkId])
  rejectedHunks.value.delete(hunkId)
  updateHighlightVisuals()
}

/**
 * Reject a hunk
 */
function rejectHunk(hunkId: string) {
  rejectedHunks.value = new Set([...rejectedHunks.value, hunkId])
  acceptedHunks.value.delete(hunkId)
  updateHighlightVisuals()
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
  updateHighlightVisuals()
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
  updateHighlightVisuals()
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

  console.log('[InlineDiffController] Applying changes:', {
    originalLength: originalMarkdown.value.length,
    finalLength: finalContent.length,
    accepted: acceptedHunks.value.size,
    rejected: rejectedHunks.value.size,
  })

  // Clean up before emitting
  cleanupInjectedButtons()

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

  // Restore original content
  const muya = props.getMuya()
  if (muya && originalMarkdown.value) {
    muya.setMarkdown(originalMarkdown.value)
  }

  cleanupInjectedButtons()
  emit('discard')
}

onMounted(() => {
  // Initial activation if edit is already active
  if (activeEdit.value && !isActive.value) {
    activateDiffMode(activeEdit.value)
  }
})

onUnmounted(() => {
  cleanupInjectedButtons()
  if (isActive.value) {
    deactivateDiffMode()
  }
})
</script>

<template>
  <!-- Floating action bar at bottom -->
  <Teleport to="body">
    <Transition name="slide-up">
      <div
        v-if="isActive && totalCount > 0"
        class="diff-floating-bar"
      >
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
/* Floating action bar */
.diff-floating-bar {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  background: var(--float-btn-bg, rgba(22, 27, 34, 0.95));
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--border-color, rgba(48, 54, 61, 0.8));
  border-radius: 12px;
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.4),
    0 4px 12px rgba(0, 0, 0, 0.2);
  z-index: 1000;
}

.progress-info {
  color: var(--text-color-secondary, #8b949e);
  font-size: 13px;
  font-weight: 500;
  padding-right: 8px;
  border-right: 1px solid var(--border-color, rgba(48, 54, 61, 0.5));
}

.bar-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  background: var(--surface-2, rgba(48, 54, 61, 0.6));
  color: var(--text-color, #e6edf3);
}

.bar-btn:hover:not(:disabled) {
  background: var(--surface-3, rgba(48, 54, 61, 0.8));
}

.bar-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.bar-btn.accept-all {
  background: rgba(46, 160, 67, 0.15);
  color: #3fb950;
}

.bar-btn.accept-all:hover:not(:disabled) {
  background: rgba(46, 160, 67, 0.25);
}

.bar-btn.reject-all {
  background: rgba(248, 81, 73, 0.15);
  color: #f85149;
}

.bar-btn.reject-all:hover:not(:disabled) {
  background: rgba(248, 81, 73, 0.25);
}

.bar-btn.apply {
  background: var(--diff-add-border, #3fb950);
  color: white;
  padding: 8px 16px;
}

.bar-btn.apply:hover:not(:disabled) {
  filter: brightness(1.1);
}

.bar-btn.discard {
  background: transparent;
  color: var(--text-color-secondary, #8b949e);
}

.bar-btn.discard:hover:not(:disabled) {
  color: #f85149;
  background: rgba(248, 81, 73, 0.1);
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
</style>
