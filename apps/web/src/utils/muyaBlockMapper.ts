/**
 * Muya Block Mapper Utility
 *
 * Maps line numbers to Muya DOM blocks for positioning inline diff overlays.
 * Uses Muya's internal BLOCK_DOM_PROPERTY to access block data.
 */

// Muya stores block references on DOM nodes using this property
const BLOCK_DOM_PROPERTY = '__MUYA_BLOCK__'

export interface MuyaBlockInfo {
  element: HTMLElement
  rect: DOMRect
  lineStart: number
  lineEnd: number
  blockName: string
}

/**
 * Get all content blocks from the Muya container
 * Returns blocks with their bounding rects and line ranges
 */
export function getMuyaBlocks(container: HTMLElement): MuyaBlockInfo[] {
  // Find the .mu-container wrapper inside the editor
  const muyaContainer = container.querySelector('.mu-container')
  if (!muyaContainer) {
    console.warn('[MuyaBlockMapper] No .mu-container found')
    return []
  }

  // Query all direct child blocks that represent content
  // Muya uses p, h1-h6, pre, ul, ol, figure, blockquote, etc.
  const blockSelectors = [
    ':scope > p',
    ':scope > h1',
    ':scope > h2',
    ':scope > h3',
    ':scope > h4',
    ':scope > h5',
    ':scope > h6',
    ':scope > pre',
    ':scope > ul',
    ':scope > ol',
    ':scope > figure',
    ':scope > blockquote',
    ':scope > hr',
    ':scope > div.mu-html-container',
    ':scope > div.mu-math-container',
    ':scope > div.mu-diagram-container',
  ]

  const blockElements = muyaContainer.querySelectorAll(blockSelectors.join(', '))
  const blocks: MuyaBlockInfo[] = []
  let currentLine = 1

  blockElements.forEach((el) => {
    const element = el as HTMLElement
    const rect = element.getBoundingClientRect()

    // Try to get block info from Muya's internal property
    const muyaBlock = (element as unknown as Record<string, { blockName?: string }>)[BLOCK_DOM_PROPERTY]
    const blockName = muyaBlock?.blockName || element.tagName.toLowerCase()

    // Estimate line count based on content
    const textContent = element.textContent || ''
    const lineCount = Math.max(1, textContent.split('\n').length)

    blocks.push({
      element,
      rect,
      lineStart: currentLine,
      lineEnd: currentLine + lineCount - 1,
      blockName,
    })

    currentLine += lineCount
  })

  return blocks
}

/**
 * Find the block that contains a specific line number
 */
export function findBlockForLine(
  blocks: MuyaBlockInfo[],
  lineNumber: number
): MuyaBlockInfo | null {
  for (const block of blocks) {
    if (lineNumber >= block.lineStart && lineNumber <= block.lineEnd) {
      return block
    }
  }

  // If no exact match, find the closest block
  if (blocks.length > 0) {
    // If line is before all blocks, return first block
    if (lineNumber < blocks[0].lineStart) {
      return blocks[0]
    }
    // If line is after all blocks, return last block
    const lastBlock = blocks[blocks.length - 1]
    if (lineNumber > lastBlock.lineEnd) {
      return lastBlock
    }
  }

  return null
}

/**
 * Find block by index (0-based)
 * This is useful when the lineNumber represents a block index rather than actual line
 */
export function findBlockByIndex(
  blocks: MuyaBlockInfo[],
  index: number
): MuyaBlockInfo | null {
  if (index >= 0 && index < blocks.length) {
    return blocks[index]
  }
  // Fallback to last block if index is out of range
  if (blocks.length > 0 && index >= blocks.length) {
    return blocks[blocks.length - 1]
  }
  return null
}

/**
 * Wait for Muya to finish rendering content
 * Uses MutationObserver to detect when DOM settles
 */
export function waitForMuyaRender(
  container: HTMLElement,
  timeout: number = 1000
): Promise<void> {
  return new Promise((resolve) => {
    const muyaContainer = container.querySelector('.mu-container')
    if (!muyaContainer) {
      // If no container yet, wait a bit and resolve
      setTimeout(resolve, 100)
      return
    }

    let debounceId: ReturnType<typeof setTimeout> | undefined

    const cleanup = () => {
      observer.disconnect()
      clearTimeout(debounceId)
      clearTimeout(timeoutId)
    }

    const observer = new MutationObserver(() => {
      // Debounce: wait for mutations to stop
      clearTimeout(debounceId)
      debounceId = setTimeout(() => {
        cleanup()
        resolve()
      }, 50)
    })

    observer.observe(muyaContainer, {
      childList: true,
      subtree: true,
      characterData: true,
    })

    // Timeout fallback
    const timeoutId = setTimeout(() => {
      cleanup()
      resolve()
    }, timeout)

    // Also resolve immediately if content appears stable
    debounceId = setTimeout(() => {
      cleanup()
      resolve()
    }, 50)
  })
}

/**
 * Get the scroll container for the editor
 */
export function getEditorScrollContainer(container: HTMLElement): HTMLElement | null {
  // The editor container itself is usually the scroll container
  // Check for overflow-y: auto/scroll
  if (container.scrollHeight > container.clientHeight) {
    return container
  }

  // Or find a parent that scrolls
  let parent = container.parentElement
  while (parent) {
    const style = getComputedStyle(parent)
    if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
      return parent
    }
    parent = parent.parentElement
  }

  return container
}
