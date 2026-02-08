/**
 * useTextSelection
 *
 * Composable that tracks text selection within a specific container element.
 * Returns the selected text as a reactive ref, and a method to clear it.
 */

import { ref, onMounted, onUnmounted, type Ref } from 'vue'

export function useTextSelection(containerRef: Ref<HTMLElement | undefined>) {
  const selectedText = ref<string | null>(null)

  function handleMouseUp() {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed) return

    const text = selection.toString().trim()
    if (!text) return

    // Ensure the selection is within the container
    const container = containerRef.value
    if (!container) return

    const range = selection.getRangeAt(0)
    if (container.contains(range.commonAncestorContainer)) {
      selectedText.value = text
    }
  }

  function clearSelection() {
    selectedText.value = null
    window.getSelection()?.removeAllRanges()
  }

  onMounted(() => {
    document.addEventListener('mouseup', handleMouseUp)
  })

  onUnmounted(() => {
    document.removeEventListener('mouseup', handleMouseUp)
  })

  return { selectedText, clearSelection }
}
