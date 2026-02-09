/**
 * useTextSelection
 *
 * Composable that tracks text selection within a specific container element.
 * Returns the selected text with surrounding context, and a method to clear it.
 */

import { ref, onMounted, onUnmounted, type Ref } from 'vue'

export interface TextSelection {
  text: string
  surroundingContext?: string
  sectionHeading?: string
}

const BLOCK_TAGS = new Set([
  'P',
  'DIV',
  'LI',
  'BLOCKQUOTE',
  'SECTION',
  'TD',
  'TH',
  'DD',
  'DT',
  'FIGCAPTION',
])
const HEADING_TAGS = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6'])

function findNearestBlock(node: Node): HTMLElement | null {
  let current: Node | null = node
  while (current && current !== document.body) {
    if (
      current.nodeType === Node.ELEMENT_NODE &&
      BLOCK_TAGS.has((current as HTMLElement).tagName)
    ) {
      return current as HTMLElement
    }
    current = current.parentNode
  }
  return null
}

function findNearestHeading(element: HTMLElement, container: HTMLElement): string | undefined {
  // Walk backwards through previous siblings and ancestors to find nearest heading
  let current: Node | null = element
  while (current && container.contains(current)) {
    // Check previous siblings
    let sibling: Node | null = current.previousSibling
    while (sibling) {
      if (sibling.nodeType === Node.ELEMENT_NODE) {
        const el = sibling as HTMLElement
        if (HEADING_TAGS.has(el.tagName)) {
          return el.textContent?.trim() || undefined
        }
        // Check inside the sibling for headings (last one wins)
        const headings = el.querySelectorAll('h1,h2,h3,h4,h5,h6')
        if (headings.length > 0) {
          return headings[headings.length - 1].textContent?.trim() || undefined
        }
      }
      sibling = sibling.previousSibling
    }
    current = current.parentNode
  }
  return undefined
}

export function useTextSelection(containerRef: Ref<HTMLElement | undefined>) {
  const selection = ref<TextSelection | null>(null)

  function handleMouseUp() {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed) return

    const text = sel.toString().trim()
    if (!text) return

    // Ensure the selection is within the container
    const container = containerRef.value
    if (!container) return

    const range = sel.getRangeAt(0)
    if (!container.contains(range.commonAncestorContainer)) return

    // Extract surrounding context
    const block = findNearestBlock(range.commonAncestorContainer)
    let surroundingContext: string | undefined
    if (block) {
      const blockText = block.textContent?.trim()
      if (blockText && blockText !== text) {
        surroundingContext = blockText.length > 500 ? `${blockText.slice(0, 500)}...` : blockText
      }
    }

    // Find nearest heading
    const startEl =
      block ||
      (range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
        ? (range.commonAncestorContainer as HTMLElement)
        : range.commonAncestorContainer.parentElement)
    const sectionHeading = startEl ? findNearestHeading(startEl, container) : undefined

    selection.value = { text, surroundingContext, sectionHeading }
  }

  function clearSelection() {
    selection.value = null
    window.getSelection()?.removeAllRanges()
  }

  onMounted(() => {
    document.addEventListener('mouseup', handleMouseUp)
  })

  onUnmounted(() => {
    document.removeEventListener('mouseup', handleMouseUp)
  })

  return { selection, clearSelection }
}
