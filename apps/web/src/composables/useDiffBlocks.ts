/**
 * useDiffBlocks - True inline diff system via DOM injection
 *
 * Injects REAL blocks directly into Muya's DOM structure with proper rendering:
 * 1. Parses markdown to create correct block types (headings, tables, code, etc.)
 * 2. Original blocks -> styled with coral/pink background
 * 3. NEW blocks inserted below -> styled with mint green background
 * 4. Sign buttons (+/-) placed as CHILDREN inside each block (styled to appear outside via CSS)
 *
 * Accept/Reject removes the unwanted blocks and clears styling.
 */

import { ref, watch, type Ref, nextTick } from 'vue'
import { useAIStore, type PendingEdit } from '@/stores/ai'
import { useEditorStore } from '@/stores'
import { parseMarkdownToStates } from '@/utils/muyaMarkdownParser'
import { mapLineToBlockIndex } from '@/utils/markdownBlockMap'
import type { TState } from '@inkdown/muya'

// Muya stores block references on DOM nodes using this property
const BLOCK_DOM_PROPERTY = '__MUYA_BLOCK__'

// CSS classes for diff visualization
const DIFF_CLASSES = {
  BLOCK: 'mu-diff-block',
  DELETION: 'mu-diff-deletion',
  ADDITION: 'mu-diff-addition',
  ACTION_BTN: 'mu-diff-action',
  ACTION_REJECT: 'mu-diff-action-reject',
  ACTION_ACCEPT: 'mu-diff-action-accept',
}

// Data attribute for tracking diff pairs (legacy)
const DIFF_PAIR_ATTR = 'data-diff-pair-id'

// Data attribute for tracking individual blocks (new per-block system)
const DIFF_BLOCK_ATTR = 'data-diff-block-id'

interface MuyaBlock {
  blockName: string
  domNode: HTMLElement
  text?: string
  parent?: {
    insertAfter: (newNode: MuyaBlock, refNode: MuyaBlock | null, source?: string) => MuyaBlock
    insertBefore: (newNode: MuyaBlock, refNode: MuyaBlock | null, source?: string) => MuyaBlock
  }
  remove: (source?: string) => void
  getState: () => { name: string; text: string }
}

interface ScrollPage {
  children: { head: MuyaBlock | null; tail: MuyaBlock | null }
  find: (index: number) => MuyaBlock | null
  insertAfter: (newNode: MuyaBlock, refNode: MuyaBlock | null, source?: string) => MuyaBlock
  insertBefore: (newNode: MuyaBlock, refNode: MuyaBlock | null, source?: string) => MuyaBlock
}

// Static methods on ScrollPage class
interface ScrollPageClass {
  loadBlock: (blockName: string) =>
    | {
        create: (muya: MuyaInstance, state: TState) => MuyaBlock
      }
    | undefined
}

interface MuyaInstance {
  domNode: HTMLElement
  editor: {
    scrollPage: ScrollPage
  }
  options: {
    math?: boolean
    isGitlabCompatibilityEnabled?: boolean
    frontMatter?: boolean
    footnote?: boolean
    trimUnnecessaryCodeBlockEmptyLines?: boolean
  }
  getMarkdown: () => string
  setMarkdown: (markdown: string, cursor?: unknown) => void
}

/**
 * Composable for managing true inline diff blocks
 */
export function useDiffBlocks(
  muyaRef: Ref<MuyaInstance | null>,
  noteIdRef: Ref<string | undefined>,
  options?: {
    /** Custom sync function called after accept/reject resolves all blocks.
     *  Overrides the default editorStore.updateContent + saveDocument behavior.
     *  Useful for NotePreviewPanel which saves via notesService directly. */
    onSync?: (markdown: string) => void
  }
) {
  const aiStore = useAIStore()
  const editorStore = useEditorStore()

  // Track which edits have been applied to avoid re-injection
  const appliedEditIds = ref<Set<string>>(new Set())

  // True while applyDiffToEditor is injecting DOM blocks — used by consumers
  // to suppress content-change watchers that would otherwise see the injection
  // as an "external update" and re-trigger diff application.
  const isDiffInjecting = ref(false)

  // Cleanup functions for button event listeners
  const cleanupFunctions = ref<Map<string, () => void>>(new Map())

  /**
   * Get the ScrollPage class from a Muya block for creating new blocks
   */
  function getScrollPageClass(muya: MuyaInstance): ScrollPageClass | null {
    // Access ScrollPage through the editor's scrollPage instance's constructor
    const scrollPage = muya.editor?.scrollPage
    if (!scrollPage) return null
    return (scrollPage as unknown as { constructor: ScrollPageClass }).constructor
  }

  /**
   * Apply a single diff edit to the editor
   * Creates paired blocks: original (deletion) + proposed (addition)
   *
   * NEW: Uses MarkdownToState to parse markdown into proper block types
   * (tables, headings, code blocks, etc.) for immediate correct rendering.
   */
  function applyDiffToEditor(edit: PendingEdit): boolean {
    const muya = muyaRef.value
    if (!muya || !muya.editor?.scrollPage) {
      console.warn('[useDiffBlocks] Muya instance not ready')
      return false
    }

    isDiffInjecting.value = true
    try {
      return _applyDiffToEditorInner(muya, edit)
    } finally {
      isDiffInjecting.value = false
    }
  }

  function _applyDiffToEditorInner(muya: MuyaInstance, edit: PendingEdit): boolean {
    const noteId = noteIdRef.value
    if (!noteId || edit.noteId !== noteId) {
      return false
    }

    // Skip if already applied
    if (appliedEditIds.value.has(edit.id)) {
      return false
    }

    const scrollPage = muya.editor.scrollPage

    // Guard: ensure scrollPage DOM is still connected (prevents "null is not an object"
    // errors when Muya is destroyed during note switch but a pending diff injection fires)
    if (!(scrollPage as unknown as { domNode: HTMLElement | null }).domNode?.isConnected) {
      console.warn('[useDiffBlocks] ScrollPage DOM not connected — skipping injection')
      return false
    }

    const ScrollPageClass = getScrollPageClass(muya)
    if (!ScrollPageClass) {
      console.warn('[useDiffBlocks] Could not get ScrollPage class')
      return false
    }

    // Check if this is effectively an empty note (content is just whitespace)
    const isEmptyNote = edit.originalContent.trim() === ''

    // If the edit claims original is empty but the editor already has content
    // (e.g., loadDocument() already rendered the note after DeepAgent note-navigate),
    // reset the editor to empty so diff blocks can be injected for review.
    // setMarkdown('') is synchronous and does NOT trigger json-change (no auto-save risk).
    if (isEmptyNote && appliedEditIds.value.size === 0) {
      const editorMarkdown = muya.getMarkdown().trim()
      if (editorMarkdown) {
        muya.setMarkdown('')
      }
    }

    // Safety guard: verify editor content is compatible with the edit's original
    // This prevents block targeting errors when the editor hasn't loaded the right content yet
    // (e.g., DeepAgent created a new note but loadDocument hasn't completed)
    // SKIP for incremental edits: when appliedEditIds.size > 0, the note is loaded but
    // muya.getMarkdown() returns '' because DOM-injected diff blocks don't update Muya's state
    if (!isEmptyNote && appliedEditIds.value.size === 0) {
      const editorMarkdown = muya.getMarkdown().trim()
      if (!editorMarkdown) {
        console.warn(
          '[useDiffBlocks] Content mismatch - editor empty but edit references non-empty original. Deferring.'
        )
        return false
      }
    }

    // Guard: if editor already has the proposed content (e.g., DeepAgent saved note content
    // and loadDocument() loaded it before the edit-proposal arrived), skip diff injection
    if (edit.proposedContent.trim() && appliedEditIds.value.size === 0) {
      const editorMarkdown = muya.getMarkdown().trim()
      if (editorMarkdown === edit.proposedContent.trim()) {
        console.warn('[useDiffBlocks] Editor already matches proposed content — skipping')
        appliedEditIds.value.add(edit.id)
        return false
      }
    }

    // Track the last inserted block to maintain correct insertion order for empty notes
    let lastInsertedBlock: MuyaBlock | null = null

    // Track hunk index for ordering (used for visual alignment)
    let hunkIndex = 0

    // Process each pending hunk in this edit
    for (const hunk of edit.diffHunks) {
      if (hunk.status !== 'pending') continue

      // Skip whitespace-only addition hunks — they produce blank green blocks
      if (!hunk.newContent.trim() && hunk.type === 'add') {
        console.debug('[useDiffBlocks] Skipping whitespace-only addition hunk')
        continue
      }

      // Parse markdown to get proper block states (tables, headings, code, etc.)
      const rawStates = parseMarkdownToStates(muya, hunk.newContent)
      // Filter out empty paragraph states that would render as blank green blocks
      const states = rawStates.filter((s) => {
        if (s.name === 'paragraph' && (!s.text || !s.text.trim())) return false
        return true
      })

      if (states.length === 0) {
        console.warn('[useDiffBlocks] No blocks parsed from hunk content')
        continue
      }

      // Create all blocks for this hunk, each with a UNIQUE blockId
      const createdBlocks: Array<{ block: MuyaBlock; blockId: string; state: TState }> = []

      for (let i = 0; i < states.length; i++) {
        const state = states[i]
        const blockId = crypto.randomUUID() // Unique ID per block

        const BlockClass = ScrollPageClass.loadBlock(state.name)
        if (!BlockClass) {
          console.warn(
            `[useDiffBlocks] Block type '${state.name}' not registered, falling back to paragraph`
          )
          // Fallback to paragraph
          const ParagraphBlock = ScrollPageClass.loadBlock('paragraph')
          if (!ParagraphBlock) continue
          const fallbackState: TState = { name: 'paragraph', text: state.text || '' }
          const block = ParagraphBlock.create(muya, fallbackState)
          createdBlocks.push({ block, blockId, state: fallbackState })
          continue
        }

        try {
          const block = BlockClass.create(muya, state)
          createdBlocks.push({ block, blockId, state })
        } catch (err) {
          console.warn(
            `[useDiffBlocks] Failed to create '${state.name}' block, using paragraph fallback:`,
            err
          )
          const ParagraphBlock = ScrollPageClass.loadBlock('paragraph')
          if (ParagraphBlock) {
            const fallbackText = state.text || state.name
            const fallbackState: TState = { name: 'paragraph', text: fallbackText }
            const block = ParagraphBlock.create(muya, fallbackState)
            createdBlocks.push({ block, blockId, state: fallbackState })
          }
        }
      }

      if (createdBlocks.length === 0) {
        console.warn('[useDiffBlocks] No blocks created for hunk')
        continue
      }

      if (isEmptyNote) {
        // Empty note case: insert all blocks sequentially
        for (let i = 0; i < createdBlocks.length; i++) {
          const { block, blockId, state } = createdBlocks[i]

          if (!lastInsertedBlock) {
            // First block: insert at the very beginning before the empty paragraph
            scrollPage.insertBefore(block, scrollPage.children?.head || null, 'api')
          } else {
            // Subsequent blocks: insert after the last inserted block
            scrollPage.insertAfter(block, lastInsertedBlock, 'api')
          }
          lastInsertedBlock = block

          // Style as addition with UNIQUE blockId
          styleBlockAsAddition(block, blockId)

          // Track each block individually
          aiStore.addDiffBlock({
            id: blockId,
            editId: edit.id,
            hunkId: hunk.id,
            noteId,
            blockIndex: i,
            blockType: state.name,
            content: state.text || '',
            isOriginal: false,
            hunkIndex,
            hunkNewStart: hunk.newStart,
          })
        }

        console.debug(
          `[useDiffBlocks] Applied empty-note diff with ${createdBlocks.length} individual block(s)`
        )
      } else {
        // Non-empty note: determine if this is a pure addition, removal, or modification
        const isPureAddition = hunk.type === 'add' && !hunk.oldContent.trim()

        if (isPureAddition) {
          // ADDITION ONLY: Insert new blocks without styling any original as deletion.
          // Always attempt positional insertion first; fall back to tail only when
          // the target block can't be found (e.g. DOM shifted from prior edits).
          const blockIndex = mapLineToBlockIndex(edit.originalContent, hunk.oldStart)
          let insertAfterBlock: MuyaBlock | null | undefined =
            scrollPage.find(blockIndex) || scrollPage.children?.tail

          if (!insertAfterBlock) {
            console.warn(`[useDiffBlocks] No insertion point found for addition hunk`)
            continue
          }

          for (let i = 0; i < createdBlocks.length; i++) {
            const { block, blockId, state } = createdBlocks[i]

            scrollPage.insertAfter(block, insertAfterBlock, 'api')
            insertAfterBlock = block

            // Style as addition with UNIQUE blockId
            styleBlockAsAddition(block, blockId)

            // Track each block individually
            aiStore.addDiffBlock({
              id: blockId,
              editId: edit.id,
              hunkId: hunk.id,
              noteId,
              blockIndex: i,
              blockType: state.name,
              content: state.text || '',
              isOriginal: false,
              hunkIndex,
              hunkNewStart: hunk.newStart,
            })
          }

          console.debug(
            `[useDiffBlocks] Applied addition-only diff with ${createdBlocks.length} block(s)`
          )
        } else {
          // MODIFICATION or REMOVAL: style original block as deletion + insert new blocks
          const blockIndex = mapLineToBlockIndex(edit.originalContent, hunk.oldStart)
          const originalBlock = scrollPage.find(blockIndex)

          if (!originalBlock) {
            console.warn(`[useDiffBlocks] Block not found at index ${blockIndex}`)
            continue
          }

          // Style original as deletion (with its own unique blockId)
          const originalBlockId = crypto.randomUUID()
          styleBlockAsDeletion(originalBlock, originalBlockId)

          // Track the original block
          aiStore.addDiffBlock({
            id: originalBlockId,
            editId: edit.id,
            hunkId: hunk.id,
            noteId,
            blockIndex: -1, // -1 indicates original block
            blockType: originalBlock.blockName || 'paragraph',
            content: hunk.oldContent,
            isOriginal: true,
            hunkIndex,
            hunkNewStart: hunk.newStart,
          })

          // Insert all created blocks after the original
          let insertAfterBlock = originalBlock
          for (let i = 0; i < createdBlocks.length; i++) {
            const { block, blockId, state } = createdBlocks[i]

            scrollPage.insertAfter(block, insertAfterBlock, 'api')
            insertAfterBlock = block

            // Style as addition with UNIQUE blockId
            styleBlockAsAddition(block, blockId)

            // Track each block individually
            aiStore.addDiffBlock({
              id: blockId,
              editId: edit.id,
              hunkId: hunk.id,
              noteId,
              blockIndex: i,
              blockType: state.name,
              content: state.text || '',
              isOriginal: false,
              hunkIndex,
              hunkNewStart: hunk.newStart,
            })
          }

          console.debug(
            `[useDiffBlocks] Applied diff at block ${blockIndex} with ${createdBlocks.length} new block(s)`
          )
        }
      }

      // Increment hunk index for the next hunk
      hunkIndex++
    }

    // Mark this edit as applied
    appliedEditIds.value.add(edit.id)
    return true
  } // end _applyDiffToEditorInner

  /**
   * Add an action button (+/-) as a CHILD inside the block
   * The button is styled with CSS to appear outside on the right edge
   */
  function addActionButton(block: MuyaBlock, type: 'reject' | 'accept', blockId: string) {
    const domNode = block.domNode
    if (!domNode) return

    // Create the action button
    const actionBtn = document.createElement('button')
    actionBtn.className = `${DIFF_CLASSES.ACTION_BTN} ${
      type === 'reject' ? DIFF_CLASSES.ACTION_REJECT : DIFF_CLASSES.ACTION_ACCEPT
    }`
    actionBtn.type = 'button'
    actionBtn.setAttribute(DIFF_BLOCK_ATTR, blockId)
    actionBtn.textContent = type === 'reject' ? '\u2212' : '+' // Unicode minus or plus
    actionBtn.title = type === 'reject' ? 'Reject this block' : 'Accept this block'

    // Event handler - uses individual block functions.
    // Use pointerdown to avoid editor click/focus handlers swallowing the action.
    const pointerHandler = (e: Event) => {
      e.preventDefault()
      e.stopPropagation()
      if (type === 'reject') {
        rejectBlock(blockId)
      } else {
        acceptBlock(blockId)
      }
    }

    const clickHandler = (e: Event) => {
      e.preventDefault()
      e.stopPropagation()
    }

    actionBtn.addEventListener('pointerdown', pointerHandler)
    actionBtn.addEventListener('click', clickHandler)

    // Store cleanup function
    cleanupFunctions.value.set(`${blockId}-${type}`, () => {
      actionBtn.removeEventListener('pointerdown', pointerHandler)
      actionBtn.removeEventListener('click', clickHandler)
    })

    // Insert the button as the first child of the block
    domNode.insertBefore(actionBtn, domNode.firstChild)
  }

  /**
   * Style a block as a deletion (coral/pink background)
   */
  function styleBlockAsDeletion(block: MuyaBlock, blockId: string) {
    const domNode = block.domNode
    if (!domNode) return

    // Add diff classes
    domNode.classList.add(DIFF_CLASSES.BLOCK, DIFF_CLASSES.DELETION)
    domNode.setAttribute(DIFF_BLOCK_ATTR, blockId)

    // Add the minus sign button as a child (reject = keep original)
    addActionButton(block, 'reject', blockId)
  }

  /**
   * Style a block as an addition (mint green background)
   * Adds BOTH accept (+) and reject (-) buttons for per-block control
   */
  function styleBlockAsAddition(block: MuyaBlock, blockId: string) {
    const domNode = block.domNode
    if (!domNode) return

    // Add diff classes
    domNode.classList.add(DIFF_CLASSES.BLOCK, DIFF_CLASSES.ADDITION)
    domNode.setAttribute(DIFF_BLOCK_ATTR, blockId)

    // Add BOTH buttons: accept (+) first, then reject (-)
    // They will be positioned via CSS (accept on top, reject below)
    addActionButton(block, 'accept', blockId)
    addActionButton(block, 'reject', blockId)
  }

  /**
   * Accept a single block - NEW per-block accept function
   *
   * Accepts THIS specific block only:
   * - Clear styling from THIS block only
   * - Remove buttons
   * - Update status to 'accepted'
   * - Check if all blocks resolved → sync content
   */
  function acceptBlock(blockId: string) {
    const muya = muyaRef.value
    if (!muya) return

    const block = aiStore.getDiffBlock(blockId)
    if (!block) {
      console.warn(`[acceptBlock] Block not found: ${blockId}`)
      return
    }

    // Find THIS specific block's DOM node
    const selector = `[${DIFF_BLOCK_ATTR}="${blockId}"]`
    const domNode = muya.domNode.querySelector(selector)

    if (domNode) {
      // Clear styling from THIS block only
      domNode.classList.remove(DIFF_CLASSES.BLOCK, DIFF_CLASSES.ADDITION, DIFF_CLASSES.DELETION)
      domNode.removeAttribute(DIFF_BLOCK_ATTR)
      // Remove all buttons from this block
      domNode.querySelectorAll(`.${DIFF_CLASSES.ACTION_BTN}`).forEach((btn) => btn.remove())
    }

    // Clear browser selection to prevent cursor positioning bug
    const selection = document.getSelection()
    if (selection) {
      selection.removeAllRanges()
    }

    // Cleanup event listeners for this block's buttons
    const cleanupAccept = cleanupFunctions.value.get(`${blockId}-accept`)
    if (cleanupAccept) {
      cleanupAccept()
      cleanupFunctions.value.delete(`${blockId}-accept`)
    }
    const cleanupReject = cleanupFunctions.value.get(`${blockId}-reject`)
    if (cleanupReject) {
      cleanupReject()
      cleanupFunctions.value.delete(`${blockId}-reject`)
    }

    // Update block status
    aiStore.updateDiffBlock(blockId, 'accepted')

    // Check if all blocks are resolved
    const noteId = noteIdRef.value
    if (noteId && aiStore.areAllBlocksResolved(noteId)) {
      // All blocks resolved - sync content
      clearAllDiffs()

      nextTick(() => {
        syncEditorContent()
      })

      console.debug(`[useDiffBlocks] All blocks resolved`)
    } else {
      console.debug(`[useDiffBlocks] Accepted block ${blockId}, waiting for other blocks`)
    }
  }

  /**
   * Reject a single block - NEW per-block reject function
   *
   * Rejects THIS specific block only:
   * - Remove THIS block from DOM entirely
   * - Update status to 'rejected'
   * - Check if all blocks resolved → sync content
   */
  function rejectBlock(blockId: string) {
    const muya = muyaRef.value
    if (!muya) return

    const block = aiStore.getDiffBlock(blockId)
    if (!block) {
      console.warn(`[rejectBlock] Block not found: ${blockId}`)
      return
    }

    // Find THIS specific block's DOM node
    const selector = `[${DIFF_BLOCK_ATTR}="${blockId}"]`
    const domNode = muya.domNode.querySelector(selector)

    if (domNode) {
      if (block.isOriginal) {
        // For original (deletion) blocks, rejecting means KEEP the original
        // Just clear the styling, don't remove the block
        domNode.classList.remove(DIFF_CLASSES.BLOCK, DIFF_CLASSES.DELETION)
        domNode.removeAttribute(DIFF_BLOCK_ATTR)
        domNode.querySelectorAll(`.${DIFF_CLASSES.ACTION_BTN}`).forEach((btn) => btn.remove())
      } else {
        // For addition blocks, rejecting means REMOVE the block
        const muyaBlock = (domNode as unknown as Record<string, MuyaBlock>)[BLOCK_DOM_PROPERTY]
        if (muyaBlock) {
          muyaBlock.remove('api')
        }
      }
    }

    // Clear browser selection to prevent cursor positioning bug
    const selection = document.getSelection()
    if (selection) {
      selection.removeAllRanges()
    }

    // Cleanup event listeners for this block's buttons
    const cleanupAccept = cleanupFunctions.value.get(`${blockId}-accept`)
    if (cleanupAccept) {
      cleanupAccept()
      cleanupFunctions.value.delete(`${blockId}-accept`)
    }
    const cleanupReject = cleanupFunctions.value.get(`${blockId}-reject`)
    if (cleanupReject) {
      cleanupReject()
      cleanupFunctions.value.delete(`${blockId}-reject`)
    }

    // Update block status
    aiStore.updateDiffBlock(blockId, 'rejected')

    // Check if all blocks are resolved
    const noteId = noteIdRef.value
    if (noteId && aiStore.areAllBlocksResolved(noteId)) {
      // All blocks resolved - sync content
      clearAllDiffs()

      nextTick(() => {
        syncEditorContent()
      })

      console.debug(`[useDiffBlocks] All blocks resolved`)
    } else {
      console.debug(`[useDiffBlocks] Rejected block ${blockId}, waiting for other blocks`)
    }
  }

  /**
   * Accept a diff (LEGACY - kept for backward compatibility with bulk actions)
   * Now delegates to per-block acceptance
   */
  function acceptDiff(pairId: string) {
    // Legacy function - find blocks with this pairId pattern and accept them
    // This is kept for compatibility with the bulk "Accept All" action
    console.warn(`[acceptDiff] Legacy function called with pairId: ${pairId}`)
    // For now, just call acceptBlock if it's a valid blockId
    acceptBlock(pairId)
  }

  /**
   * Reject a diff (LEGACY - kept for backward compatibility with bulk actions)
   * Now delegates to per-block rejection
   */
  function rejectDiff(pairId: string) {
    // Legacy function - find blocks with this pairId pattern and reject them
    // This is kept for compatibility with the bulk "Reject All" action
    console.warn(`[rejectDiff] Legacy function called with pairId: ${pairId}`)
    // For now, just call rejectBlock if it's a valid blockId
    rejectBlock(pairId)
  }

  /**
   * Sync editor content after accept/reject and persist to database
   */
  function syncEditorContent() {
    const muya = muyaRef.value
    if (!muya) return

    const markdown = muya.getMarkdown()

    // Use custom sync handler if provided (e.g., NotePreviewPanel)
    if (options?.onSync) {
      options.onSync(markdown)
      return
    }

    const words = markdown.split(/\s+/).filter((w: string) => w.length > 0).length
    const characters = markdown.length

    editorStore.updateContent(markdown, {
      words,
      characters,
      paragraphs: markdown.split('\n\n').length,
    })

    // Persist to database - saveDocument() checks if already saved
    // This is necessary because block.remove('api') bypasses Muya's json-change event
    editorStore.saveDocument()
  }

  /**
   * Clear all diffs for a note.
   * Defaults to the current note when noteIdOverride is not provided.
   */
  function clearAllDiffs(noteIdOverride?: string) {
    const noteId = noteIdOverride ?? noteIdRef.value
    if (!noteId) return

    const muya = muyaRef.value
    if (muya?.domNode) {
      // Find and clean up all diff blocks (using new DIFF_BLOCK_ATTR)
      const diffBlockElements = muya.domNode.querySelectorAll(`.${DIFF_CLASSES.BLOCK}`)
      diffBlockElements.forEach((domNode) => {
        const blockId = domNode.getAttribute(DIFF_BLOCK_ATTR)

        // Remove action buttons inside the block
        domNode.querySelectorAll(`.${DIFF_CLASSES.ACTION_BTN}`).forEach((btn) => btn.remove())

        // Clear styling
        domNode.classList.remove(DIFF_CLASSES.BLOCK, DIFF_CLASSES.DELETION, DIFF_CLASSES.ADDITION)
        if (blockId) {
          domNode.removeAttribute(DIFF_BLOCK_ATTR)
        }
        // Also clear legacy pairId attribute if present
        if (domNode.hasAttribute(DIFF_PAIR_ATTR)) {
          domNode.removeAttribute(DIFF_PAIR_ATTR)
        }
      })
    }

    // Remove stale per-button listeners even if Muya is unavailable.
    cleanupFunctions.value.forEach((cleanup) => cleanup())
    cleanupFunctions.value.clear()

    // Clear store state (both legacy pairs and new individual blocks)
    aiStore.clearDiffBlockPairs(noteId)
    aiStore.clearDiffBlocks(noteId)

    if (noteId === noteIdRef.value || noteIdOverride) {
      appliedEditIds.value.clear()
    }

    console.debug(`[useDiffBlocks] Cleared all diffs for note ${noteId}`)
  }

  /**
   * Check for new pending edits and apply them
   */
  function checkAndApplyPendingEdits() {
    const noteId = noteIdRef.value
    if (!noteId) return

    const pendingEdits = aiStore.pendingEdits.filter(
      (e) => e.noteId === noteId && e.status === 'pending' && !appliedEditIds.value.has(e.id)
    )

    // No new edits to apply
    if (pendingEdits.length === 0) return

    // Don't clear existing diffs — incremental edits from DeepAgent should
    // coexist. The appliedEditIds guard (line 127/651) prevents duplicate injection.
    // Clearing only happens on note switch or explicit user actions (accept/reject all).

    for (const edit of pendingEdits) {
      applyDiffToEditor(edit)
    }
  }

  /**
   * Accept all pending diffs for the current note
   * Uses setMarkdown with the full proposed content for proper block type rendering
   * Also merges pending artifacts to prevent them from being destroyed
   *
   * Handles multiple edit-proposals (e.g., from DeepAgent compound requests)
   * by merging all pending edits for the note into one combined content.
   */
  function acceptAllDiffs() {
    const muya = muyaRef.value
    const noteId = noteIdRef.value
    if (!muya || !noteId) return

    // Find ALL active edits for this note (not just the first)
    const edits = aiStore.pendingEdits.filter((e) => e.noteId === noteId && e.status === 'pending')
    if (edits.length === 0) return

    // Build final content from ALL edits
    let finalContent: string

    if (edits.length === 1) {
      // Single edit — use as-is (preserves current behavior)
      finalContent = edits[0].proposedContent
    } else {
      // Multiple edits (e.g., DeepAgent note + table):
      // Use the LAST edit's proposedContent as base (most complete state,
      // since context propagation means later edits build on earlier ones).
      // Then check earlier edits for unique additions not already included.
      const lastEdit = edits[edits.length - 1]
      finalContent = lastEdit.proposedContent

      for (let i = 0; i < edits.length - 1; i++) {
        const edit = edits[i]
        if (
          !finalContent.includes(edit.proposedContent) &&
          edit.proposedContent !== edit.originalContent
        ) {
          // Compute the delta: what did this edit add beyond its original?
          const delta = edit.proposedContent.replace(edit.originalContent, '').trim()
          if (delta && !finalContent.includes(delta)) {
            finalContent += '\n\n' + delta
          }
        }
      }
    }

    // Get ALL artifacts for this note (both pending AND inserted) and append them.
    // We need inserted artifacts too because the EditorArea watcher may have already
    // auto-inserted them, but setMarkdown() will overwrite the DOM and destroy them.
    const pendingArtifacts = aiStore.getArtifactsForNote(noteId)

    for (const artifact of pendingArtifacts) {
      // Debug logging to verify artifact data at merge time
      console.log('[useDiffBlocks] Merging artifact:', {
        id: artifact.id,
        title: artifact.data.title,
        hasHtml: Boolean(artifact.data.html),
        hasCss: Boolean(artifact.data.css),
        hasJs: Boolean(artifact.data.javascript),
        htmlLength: artifact.data.html?.length ?? 0,
      })

      // Append artifact block syntax at the end
      // Using fenced code block with 'artifact' language for Muya's artifact block parser
      // IMPORTANT: Use nullish coalescing (??) to ensure keys are never undefined
      // JSON.stringify silently OMITS keys with undefined values, causing content loss
      const artifactBlock = `\n\n\`\`\`artifact
${JSON.stringify(
  {
    title: artifact.data.title || 'Untitled Artifact',
    html: artifact.data.html ?? '',
    css: artifact.data.css ?? '',
    javascript: artifact.data.javascript ?? '',
  },
  null,
  2
)}
\`\`\``

      finalContent += artifactBlock

      // Mark artifact as inserted so it won't be re-added
      aiStore.markArtifactInserted(artifact.id)

      console.debug(`[useDiffBlocks] Merged artifact "${artifact.data.title}" into final content`)
    }

    // Use setMarkdown with the merged content
    muya.setMarkdown(finalContent)

    // Mark ALL edits' hunks as accepted
    for (const edit of edits) {
      edit.diffHunks.forEach((hunk) => {
        if (hunk.status === 'pending') {
          aiStore.acceptHunk(edit.id, hunk.id)
        }
      })

      // Mark edit as accepted so checkAndApplyPendingEdits() won't re-apply it
      aiStore.acceptEdit(edit.id)

      // Update all pending pairs for this edit (legacy)
      aiStore.diffBlockPairs
        .filter((p) => p.editId === edit.id && p.status === 'pending')
        .forEach((pair) => {
          aiStore.updateDiffBlockPair(pair.id, 'accepted')
        })
    }

    // Update all pending individual blocks for this note
    aiStore.diffBlocks
      .filter((b) => b.noteId === noteId && b.status === 'pending')
      .forEach((block) => {
        aiStore.updateDiffBlock(block.id, 'accepted')
      })

    // Clear diff visualization
    clearAllDiffs()

    // Sync and persist
    nextTick(() => {
      syncEditorContent()
      // Don't auto-focus - let user click where they want to type
      // This avoids cursor positioning issues after setMarkdown() rebuilds the DOM
    })

    console.debug(
      `[useDiffBlocks] Accepted all ${edits.length} edit(s) via setMarkdown (with ${pendingArtifacts.length} artifacts)`
    )
  }

  /**
   * Reject all pending diffs for the current note
   * Restores original content via setMarkdown
   *
   * Handles multiple edit-proposals by restoring the FIRST edit's original
   * (which represents the state before any AI changes).
   */
  function rejectAllDiffs() {
    const muya = muyaRef.value
    const noteId = noteIdRef.value
    if (!muya || !noteId) return

    // Find ALL active edits for this note
    const edits = aiStore.pendingEdits.filter((e) => e.noteId === noteId && e.status === 'pending')
    if (edits.length === 0) return

    // Restore first edit's original content (state before any AI changes)
    muya.setMarkdown(edits[0].originalContent)

    // Mark ALL edits' hunks as rejected
    for (const edit of edits) {
      edit.diffHunks.forEach((hunk) => {
        if (hunk.status === 'pending') {
          aiStore.rejectHunk(edit.id, hunk.id)
        }
      })

      // Mark edit as rejected so checkAndApplyPendingEdits() won't re-apply it
      aiStore.rejectEdit(edit.id)

      // Update all pending pairs for this edit (legacy)
      aiStore.diffBlockPairs
        .filter((p) => p.editId === edit.id && p.status === 'pending')
        .forEach((pair) => {
          aiStore.updateDiffBlockPair(pair.id, 'rejected')
        })
    }

    // Update all pending individual blocks for this note
    aiStore.diffBlocks
      .filter((b) => b.noteId === noteId && b.status === 'pending')
      .forEach((block) => {
        aiStore.updateDiffBlock(block.id, 'rejected')
      })

    // Clear diff visualization
    clearAllDiffs()

    // Sync and persist
    nextTick(() => {
      syncEditorContent()
      // Don't auto-focus - let user click where they want to type
      // This avoids cursor positioning issues after setMarkdown() rebuilds the DOM
    })

    console.debug(`[useDiffBlocks] Rejected all ${edits.length} edit(s) via setMarkdown`)
  }

  /**
   * Accept a single edit by ID — used by EditProposalCard tick button.
   * If this is the only pending edit, delegates to acceptAllDiffs().
   * If there are multiple, applies just this one edit's proposed content.
   */
  function acceptSingleEdit(editId: string) {
    const muya = muyaRef.value
    const noteId = noteIdRef.value
    if (!muya || !noteId) return

    const edit = aiStore.pendingEdits.find((e) => e.id === editId && e.status === 'pending')
    if (!edit) return

    const allPending = aiStore.pendingEdits.filter(
      (e) => e.noteId === noteId && e.status === 'pending'
    )

    // If this is the only pending edit (or all edits), use acceptAllDiffs for full logic
    if (allPending.length <= 1 || allPending.every((e) => e.id === editId)) {
      acceptAllDiffs()
      return
    }

    // Apply just this edit's proposed content
    muya.setMarkdown(edit.proposedContent)

    // Mark this edit's hunks as accepted
    edit.diffHunks.forEach((hunk) => {
      if (hunk.status === 'pending') {
        aiStore.acceptHunk(edit.id, hunk.id)
      }
    })
    aiStore.acceptEdit(edit.id)

    // Update diff block pairs/blocks for this edit
    aiStore.diffBlockPairs
      .filter((p) => p.editId === edit.id && p.status === 'pending')
      .forEach((pair) => {
        aiStore.updateDiffBlockPair(pair.id, 'accepted')
      })
    aiStore.diffBlocks
      .filter((b) => b.editId === edit.id && b.status === 'pending')
      .forEach((block) => {
        aiStore.updateDiffBlock(block.id, 'accepted')
      })

    // Clear diff visualization and sync
    clearAllDiffs()
    nextTick(() => {
      syncEditorContent()
      // Re-apply remaining pending edits' diff visualization
      checkAndApplyPendingEdits()
    })

    console.debug(`[useDiffBlocks] Accepted single edit ${editId}`)
  }

  /**
   * Reject a single edit by ID — used by EditProposalCard X button.
   */
  function rejectSingleEdit(editId: string) {
    const muya = muyaRef.value
    const noteId = noteIdRef.value
    if (!muya || !noteId) return

    const edit = aiStore.pendingEdits.find((e) => e.id === editId && e.status === 'pending')
    if (!edit) return

    const allPending = aiStore.pendingEdits.filter(
      (e) => e.noteId === noteId && e.status === 'pending'
    )

    // If this is the only pending edit, use rejectAllDiffs for full logic
    if (allPending.length <= 1) {
      rejectAllDiffs()
      return
    }

    // Restore original content for this edit
    muya.setMarkdown(edit.originalContent)

    // Mark this edit's hunks as rejected
    edit.diffHunks.forEach((hunk) => {
      if (hunk.status === 'pending') {
        aiStore.rejectHunk(edit.id, hunk.id)
      }
    })
    aiStore.rejectEdit(edit.id)

    // Update diff block pairs/blocks for this edit
    aiStore.diffBlockPairs
      .filter((p) => p.editId === edit.id && p.status === 'pending')
      .forEach((pair) => {
        aiStore.updateDiffBlockPair(pair.id, 'rejected')
      })
    aiStore.diffBlocks
      .filter((b) => b.editId === edit.id && b.status === 'pending')
      .forEach((block) => {
        aiStore.updateDiffBlock(block.id, 'rejected')
      })

    // Clear diff visualization and sync
    clearAllDiffs()
    nextTick(() => {
      syncEditorContent()
      // Re-apply remaining pending edits
      checkAndApplyPendingEdits()
    })

    console.debug(`[useDiffBlocks] Rejected single edit ${editId}`)
  }

  // Watch for new pending edits
  watch(
    () => aiStore.pendingEdits,
    () => {
      // Delay to ensure Muya has rendered
      nextTick(() => {
        checkAndApplyPendingEdits()
      })
    },
    { deep: true }
  )

  // Watch for document/note changes - clear diffs when switching notes
  // and check for pending edits targeting the new note (e.g., after DeepAgent note-navigate)
  watch(noteIdRef, (newNoteId, oldNoteId) => {
    if (oldNoteId && newNoteId !== oldNoteId) {
      // Clear stale diff UI/listeners for the previous note id before loading new ones.
      clearAllDiffs(oldNoteId)
    }
    // After loading a new note, check for any pending edits targeting it
    // This handles the case where DeepAgent emits note-navigate + edit-proposal
    // and the edit arrives before the editor finishes loading the note
    if (newNoteId) {
      nextTick(() => {
        setTimeout(() => {
          if (noteIdRef.value === newNoteId) {
            checkAndApplyPendingEdits()
          }
        }, 300)
      })
    }
  })

  return {
    applyDiffToEditor,
    acceptDiff,
    rejectDiff,
    acceptBlock,
    rejectBlock,
    clearAllDiffs,
    checkAndApplyPendingEdits,
    acceptAllDiffs,
    rejectAllDiffs,
    acceptSingleEdit,
    rejectSingleEdit,
    isDiffInjecting,
  }
}
