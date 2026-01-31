<script setup lang="ts">
/**
 * InlineDiffContainer - Overlay-based diff suggestions
 *
 * Uses absolutely positioned Vue components to display suggestions
 * visually inline with editor content WITHOUT modifying Muya's DOM.
 * Positions are calculated from block element bounds and updated on scroll/resize.
 */
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useAIStore, type DiffHunk } from '@/stores/ai'
import SuggestionCard from './SuggestionCard.vue'
import FloatingDiffActionBar from './FloatingDiffActionBar.vue'

interface PositionedHunk {
  hunk: DiffHunk
  position: { top: number; left: number; width: number }
}

const props = defineProps<{
  editorElement: HTMLElement | null
}>()

const emit = defineEmits<{
  apply: [content: string]
  discard: []
}>()

const store = useAIStore()

// Computed prop for template
const editorElement = computed(() => props.editorElement)

// Computed from store
const activeEdit = computed(() => store.activeEdit)
const hunks = computed(() => activeEdit.value?.diffHunks || [])
const focusedHunkIndex = computed(() => store.focusedHunkIndex)
const focusedHunk = computed(() => store.focusedHunk)

const pendingCount = computed(() => hunks.value.filter((h) => h.status === 'pending').length)
const acceptedCount = computed(() => hunks.value.filter((h) => h.status === 'accepted').length)
const rejectedCount = computed(() => hunks.value.filter((h) => h.status === 'rejected').length)
const totalCount = computed(() => hunks.value.length)

// ============================================================================
// Position Calculation
// ============================================================================

const positionedHunks = ref<PositionedHunk[]>([])
let resizeObserver: ResizeObserver | null = null
let scrollContainer: HTMLElement | null = null

function calculatePositions() {
  if (!props.editorElement) {
    positionedHunks.value = []
    return
  }

  // The editorElement IS the scroll container (.muya-editor has overflow-y: auto)
  scrollContainer = props.editorElement

  const container = props.editorElement.querySelector('.mu-container')
  if (!container) {
    positionedHunks.value = []
    return
  }

  // Get position reference from the editor element
  const editorRect = props.editorElement.getBoundingClientRect()
  const scrollTop = props.editorElement.scrollTop

  // Get all top-level Muya blocks
  const blocks = Array.from(
    container.querySelectorAll(':scope > [class*="mu-"]')
  ) as HTMLElement[]

  if (blocks.length === 0) {
    positionedHunks.value = []
    return
  }

  // Calculate positioned hunks
  const positioned: PositionedHunk[] = []

  for (const hunk of hunks.value) {
    // Map hunk line to block index (approximate: use oldStart as block index)
    const blockIndex = Math.max(0, Math.min(hunk.oldStart - 1, blocks.length - 1))
    const block = blocks[blockIndex]

    if (!block) continue

    const blockRect = block.getBoundingClientRect()

    // Since overlay is teleported inside editorElement (scroll container),
    // we need to use scroll-adjusted positions
    // blockRect is viewport-relative, we convert to scroll-container-relative
    positioned.push({
      hunk,
      position: {
        top: blockRect.bottom - editorRect.top + scrollTop + 8, // 8px gap below block
        left: blockRect.left - editorRect.left,
        width: Math.min(blockRect.width, editorRect.width - 80) // Max width with padding
      }
    })
  }

  positionedHunks.value = positioned
}

function updatePositions() {
  requestAnimationFrame(calculatePositions)
}

// ============================================================================
// Keyboard Navigation
// ============================================================================

function handleKeydown(e: KeyboardEvent) {
  if (!activeEdit.value) return

  const isMac = navigator.platform.includes('Mac')
  const cmdKey = isMac ? e.metaKey : e.ctrlKey

  // Tab - Next hunk
  if (e.key === 'Tab' && !e.shiftKey && !cmdKey) {
    e.preventDefault()
    store.focusNextHunk()
    return
  }

  // Shift+Tab - Previous hunk
  if (e.key === 'Tab' && e.shiftKey && !cmdKey) {
    e.preventDefault()
    store.focusPreviousHunk()
    return
  }

  // Cmd/Ctrl + Enter - Accept focused hunk
  if (cmdKey && e.key === 'Enter') {
    e.preventDefault()
    if (focusedHunk.value && focusedHunk.value.status === 'pending') {
      store.acceptHunk(activeEdit.value.id, focusedHunk.value.id)
    }
    return
  }

  // Cmd/Ctrl + Backspace - Reject focused hunk
  if (cmdKey && e.key === 'Backspace') {
    e.preventDefault()
    if (focusedHunk.value && focusedHunk.value.status === 'pending') {
      store.rejectHunk(activeEdit.value.id, focusedHunk.value.id)
    }
    return
  }

  // Escape - Close overlay
  if (e.key === 'Escape') {
    e.preventDefault()
    handleDiscard()
    return
  }
}

function scrollToFocusedHunk() {
  nextTick(() => {
    if (!focusedHunk.value) return
    const el = document.querySelector(`[data-hunk-id="${focusedHunk.value.id}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  })
}

// ============================================================================
// Action Handlers
// ============================================================================

function handleAccept(hunkId: string) {
  if (activeEdit.value) {
    store.acceptHunk(activeEdit.value.id, hunkId)
  }
}

function handleReject(hunkId: string) {
  if (activeEdit.value) {
    store.rejectHunk(activeEdit.value.id, hunkId)
  }
}

function handleAcceptAll() {
  if (activeEdit.value) {
    store.acceptAllHunks(activeEdit.value.id)
  }
}

function handleRejectAll() {
  if (activeEdit.value) {
    store.rejectAllHunks(activeEdit.value.id)
  }
}

function handleApply() {
  if (!activeEdit.value) return
  const finalContent = store.applyAcceptedHunks(activeEdit.value.id)
  if (finalContent !== null) {
    emit('apply', finalContent)
  }
  store.setActiveEdit(null)
}

function handleDiscard() {
  if (activeEdit.value) {
    store.discardEdit(activeEdit.value.id)
  }
  emit('discard')
}

// ============================================================================
// Lifecycle & Watchers
// ============================================================================

// Recalculate positions when hunks change
watch(
  hunks,
  () => {
    nextTick(calculatePositions)
  },
  { deep: true }
)

// Scroll to focused hunk
watch(focusedHunkIndex, () => {
  scrollToFocusedHunk()
})

// Setup when editor element is available
watch(
  () => props.editorElement,
  (el) => {
    if (el) {
      nextTick(() => {
        calculatePositions()
        setupScrollListener()
        setupResizeObserver()
      })
    }
  },
  { immediate: true }
)

function setupScrollListener() {
  // The editorElement IS the scroll container (.muya-editor has overflow-y: auto)
  scrollContainer = props.editorElement || null

  scrollContainer?.addEventListener('scroll', updatePositions, { passive: true })
  window.addEventListener('resize', updatePositions, { passive: true })
}

function setupResizeObserver() {
  if (!props.editorElement) return

  const container = props.editorElement.querySelector('.mu-container')
  if (!container) return

  resizeObserver = new ResizeObserver(updatePositions)
  resizeObserver.observe(container)
}

function cleanup() {
  scrollContainer?.removeEventListener('scroll', updatePositions)
  window.removeEventListener('resize', updatePositions)
  resizeObserver?.disconnect()
  resizeObserver = null
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  nextTick(() => {
    calculatePositions()
    setupScrollListener()
    setupResizeObserver()
  })
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  cleanup()
})
</script>

<template>
  <!-- Teleport overlay layer inside the editor element for proper scroll behavior -->
  <Teleport v-if="activeEdit && editorElement" :to="editorElement">
    <div class="diff-overlay-layer">
      <SuggestionCard
        v-for="(item, index) in positionedHunks"
        :key="item.hunk.id"
        :hunk="item.hunk"
        :position="item.position"
        :is-focused="index === focusedHunkIndex"
        @accept="handleAccept"
        @reject="handleReject"
      />
    </div>
  </Teleport>

  <!-- Floating action bar at bottom -->
  <FloatingDiffActionBar
    v-if="activeEdit"
    :pending-count="pendingCount"
    :total-count="totalCount"
    :accepted-count="acceptedCount"
    :rejected-count="rejectedCount"
    @accept-all="handleAcceptAll"
    @reject-all="handleRejectAll"
    @apply="handleApply"
    @discard="handleDiscard"
  />
</template>

<style scoped>
.diff-overlay-layer {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none; /* Let clicks pass through to editor */
  overflow: visible;
  z-index: 50;
}

/* Re-enable pointer events on children (cards) */
.diff-overlay-layer :deep(.suggestion-card) {
  pointer-events: auto;
}
</style>
