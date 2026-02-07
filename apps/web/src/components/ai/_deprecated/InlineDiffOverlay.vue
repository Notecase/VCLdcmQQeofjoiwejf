<script setup lang="ts">
/**
 * InlineDiffOverlay - Overlay for positioning diff hunks
 *
 * Uses absolute positioning to place InlineDiffHunk components
 * below their target blocks in the Muya editor.
 * This approach avoids fragile DOM injection into Muya's structure.
 */
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useAIStore } from '@/stores/ai'
import { useEditorStore } from '@/stores'
import InlineDiffHunk from './InlineDiffHunk.vue'
import type { DiffHunkData } from './InlineDiffHunk.vue'
import {
  getMuyaBlocks,
  findBlockByIndex,
  waitForMuyaRender,
} from '@/utils/muyaBlockMapper'

const props = defineProps<{
  muContainer: HTMLElement | null // .mu-container - for querying blocks
  scrollContainer: HTMLElement | null // .muya-editor - for scroll tracking
}>()

const emit = defineEmits<{
  apply: [editId: string, content: string]
}>()

const aiStore = useAIStore()
const editorStore = useEditorStore()

// Track positioned hunks with their calculated positions
interface PositionedHunk {
  hunkId: string
  editId: string
  data: DiffHunkData
  top: number
  left: number
  width: number
}

const positionedHunks = ref<PositionedHunk[]>([])
const isCalculating = ref(false)

// Get pending hunks for current note
const pendingHunks = computed(() => {
  const currentNoteId = editorStore.currentDocument?.id
  if (!currentNoteId) return []

  const hunks: Array<{
    editId: string
    hunk: {
      id: string
      oldStart: number
      oldContent: string
      newContent: string
      status: 'pending' | 'accepted' | 'rejected'
    }
  }> = []

  for (const edit of aiStore.pendingEdits) {
    if (edit.noteId !== currentNoteId || edit.status !== 'pending') continue

    for (const hunk of edit.diffHunks) {
      if (hunk.status === 'pending') {
        hunks.push({
          editId: edit.id,
          hunk: {
            id: hunk.id,
            oldStart: hunk.oldStart,
            oldContent: hunk.oldContent,
            newContent: hunk.newContent,
            status: hunk.status,
          },
        })
      }
    }
  }

  return hunks
})

// Calculate positions for all hunks
async function calculatePositions() {
  // Guard: prevent concurrent calculations (breaks feedback loop)
  if (isCalculating.value) return

  if (!props.muContainer || !props.scrollContainer || pendingHunks.value.length === 0) {
    positionedHunks.value = []
    return
  }

  isCalculating.value = true

  try {
    // Wait for Muya to finish rendering
    await waitForMuyaRender(props.muContainer)
    await nextTick()

    // Get all blocks from muContainer
    const blocks = getMuyaBlocks(props.muContainer)
    if (blocks.length === 0) {
      console.warn('[InlineDiffOverlay] No Muya blocks found')
      positionedHunks.value = []
      return
    }

    // KEY FIX: Use scroll container as coordinate reference
    const scrollRect = props.scrollContainer.getBoundingClientRect()
    const scrollTop = props.scrollContainer.scrollTop
    const scrollLeft = props.scrollContainer.scrollLeft

    const positioned: PositionedHunk[] = []

    for (const { editId, hunk } of pendingHunks.value) {
      // Find target block - oldStart is 1-indexed line number
      // For now, treat it as a block index (0-indexed internally)
      const blockIndex = Math.max(0, hunk.oldStart - 1)
      const targetBlock = findBlockByIndex(blocks, blockIndex)

      if (!targetBlock) {
        console.warn(`[InlineDiffOverlay] No block found for hunk ${hunk.id} at line ${hunk.oldStart}`)
        continue
      }

      // Calculate position relative to scroll container
      const blockRect = targetBlock.rect
      const top = blockRect.bottom - scrollRect.top + scrollTop
      const left = blockRect.left - scrollRect.left + scrollLeft
      const width = blockRect.width

      positioned.push({
        hunkId: hunk.id,
        editId,
        data: {
          id: hunk.id,
          oldContent: hunk.oldContent,
          newContent: hunk.newContent,
          status: hunk.status,
        },
        top,
        left,
        width,
      })

      console.debug(`[InlineDiffOverlay] Positioned hunk ${hunk.id} at top=${top}, block=${blockIndex}`)
    }

    // Guard: skip update if positions haven't changed (breaks feedback loop)
    const positionsUnchanged
      = positioned.length === positionedHunks.value.length
        && positioned.every((p, i) => {
          const old = positionedHunks.value[i]
          return (
            old
            && p.hunkId === old.hunkId
            && p.top === old.top
            && p.left === old.left
            && p.width === old.width
          )
        })

    if (positionsUnchanged) {
      console.debug('[InlineDiffOverlay] Positions unchanged, skipping update')
      return
    }

    positionedHunks.value = positioned
  } catch (error) {
    console.error('[InlineDiffOverlay] Error calculating positions:', error)
    positionedHunks.value = []
  } finally {
    isCalculating.value = false
  }
}

// Handle hunk accept
function handleAccept(hunkId: string) {
  const positioned = positionedHunks.value.find((p) => p.hunkId === hunkId)
  if (!positioned) return

  const edit = aiStore.pendingEdits.find((e) => e.id === positioned.editId)
  if (!edit) return

  // Accept this hunk
  aiStore.acceptHunk(edit.id, hunkId)

  // Check if all hunks are decided
  const allDecided = edit.diffHunks.every((h) => h.status !== 'pending')
  if (allDecided) {
    // Apply the accepted changes
    const finalContent = aiStore.applyAcceptedHunks(edit.id)
    if (finalContent !== null) {
      emit('apply', edit.id, finalContent)
    }
  }

  // Recalculate positions after state change
  nextTick(() => schedulePositionUpdate())
}

// Handle hunk reject
function handleReject(hunkId: string) {
  const positioned = positionedHunks.value.find((p) => p.hunkId === hunkId)
  if (!positioned) return

  const edit = aiStore.pendingEdits.find((e) => e.id === positioned.editId)
  if (!edit) return

  // Reject this hunk
  aiStore.rejectHunk(edit.id, hunkId)

  // Check if all hunks are decided
  const allDecided = edit.diffHunks.every((h) => h.status !== 'pending')
  if (allDecided) {
    // Apply the accepted changes (rejected hunks will keep original content)
    const finalContent = aiStore.applyAcceptedHunks(edit.id)
    if (finalContent !== null) {
      emit('apply', edit.id, finalContent)
    }
  }

  // Recalculate positions after state change
  nextTick(() => schedulePositionUpdate())
}

// Watch for changes in pending edits
watch(
  pendingHunks,
  () => {
    schedulePositionUpdate()
  },
  { deep: true }
)

// Watch for container changes
watch(
  [() => props.muContainer, () => props.scrollContainer],
  () => {
    if (props.muContainer && props.scrollContainer) {
      schedulePositionUpdate()
    }
  }
)

// Recalculate on scroll and resize
let resizeObserver: ResizeObserver | null = null

// Single unified debounce timer for ALL position calculations.
// This prevents multiple triggers (watch, scroll, resize, accept/reject)
// from firing calculatePositions() multiple times within the same frame.
let positionDebounceId: ReturnType<typeof setTimeout> | undefined

/**
 * Schedule a position update with debouncing.
 * All triggers should use this instead of calling calculatePositions() directly.
 * @param immediate - If true, run immediately (for initial mount)
 */
function schedulePositionUpdate(immediate = false) {
  // Don't schedule if already calculating - the calculation will pick up latest state
  if (isCalculating.value) return

  clearTimeout(positionDebounceId)

  if (immediate) {
    // For initial mount or critical updates that need immediate response
    calculatePositions()
  } else {
    positionDebounceId = setTimeout(() => {
      calculatePositions()
    }, 50) // 50ms debounce - responsive but prevents rapid-fire recalculations
  }
}

function handleScroll() {
  schedulePositionUpdate()
}

function handleResize() {
  schedulePositionUpdate()
}

onMounted(() => {
  if (props.scrollContainer && props.muContainer) {
    // Attach scroll listener to the SCROLL container (.muya-editor)
    props.scrollContainer.addEventListener('scroll', handleScroll, { passive: true })

    // Observe resize on muContainer for content changes
    resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(props.muContainer)

    // Initial calculation - immediate for first render
    schedulePositionUpdate(true)
  }
})

onUnmounted(() => {
  // Clear debounce timer to prevent stale callbacks
  clearTimeout(positionDebounceId)

  if (props.scrollContainer) {
    props.scrollContainer.removeEventListener('scroll', handleScroll)
  }
  if (resizeObserver) {
    resizeObserver.disconnect()
  }
})
</script>

<template>
  <div
    v-if="positionedHunks.length > 0"
    class="inline-diff-overlay"
  >
    <TransitionGroup name="hunk">
      <div
        v-for="hunk in positionedHunks"
        :key="hunk.hunkId"
        class="positioned-hunk"
        :style="{
          top: `${hunk.top}px`,
          left: `${hunk.left}px`,
          width: `${hunk.width}px`,
        }"
      >
        <InlineDiffHunk
          :hunk="hunk.data"
          @accept="handleAccept"
          @reject="handleReject"
        />
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.inline-diff-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
  z-index: 100;
  overflow: visible;
}

.positioned-hunk {
  position: absolute;
  pointer-events: auto;
  z-index: 101;
}

/* Transition animations */
/* Use specific properties instead of 'all' to prevent layout thrashing.
   'transition: all' causes recalculations on every property during animation,
   which can trigger ResizeObserver in a feedback loop. */
.hunk-enter-active,
.hunk-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.hunk-enter-from {
  opacity: 0;
  transform: translateY(-8px);
}

.hunk-leave-to {
  opacity: 0;
  transform: translateX(-16px);
}
</style>
