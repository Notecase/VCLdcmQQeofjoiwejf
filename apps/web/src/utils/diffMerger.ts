/**
 * Diff Merger Utility
 *
 * Merges original and proposed content into a single string with inline diff markers.
 * Returns the merged content along with highlight ranges for styling.
 */
import * as Diff from 'diff'

export interface DiffHighlight {
  start: number
  end: number
  type: 'deletion' | 'addition'
  hunkId: string
  content: string
}

/**
 * Muya-compatible highlight interface for inline diff visualization.
 * This can be passed directly to Muya's block.update() method.
 */
export interface MuyaDiffHighlight {
  start: number
  end: number
  active: boolean
  diffType: 'addition' | 'deletion'
  hunkId: string
}

export interface MergedDiff {
  content: string
  highlights: DiffHighlight[]
}

/**
 * Merge original and proposed content with inline diff markers.
 * Returns merged content where both deletions and additions are present,
 * along with highlight ranges for each change.
 *
 * Uses sentence-level diffing for better readability with AI edits.
 * Falls back to line-level for code or content without clear sentence boundaries.
 */
export function mergeDiffContent(original: string, proposed: string): MergedDiff {
  const highlights: DiffHighlight[] = []
  let mergedContent = ''
  let position = 0
  let hunkIndex = 0

  // Use sentence-level diff for prose, which provides better readability
  // for AI-generated edits that typically modify sentences or paragraphs
  const changes = Diff.diffSentences(original, proposed)

  for (const change of changes) {
    const text = change.value

    if (change.removed) {
      // Deletion - keep in merged content, mark as deletion
      highlights.push({
        start: position,
        end: position + text.length,
        type: 'deletion',
        hunkId: `hunk-${hunkIndex++}`,
        content: text,
      })
      mergedContent += text
      position += text.length
    } else if (change.added) {
      // Addition - add to merged content, mark as addition
      highlights.push({
        start: position,
        end: position + text.length,
        type: 'addition',
        hunkId: `hunk-${hunkIndex++}`,
        content: text,
      })
      mergedContent += text
      position += text.length
    } else {
      // Unchanged - keep as is
      mergedContent += text
      position += text.length
    }
  }

  return { content: mergedContent, highlights }
}

/**
 * Apply a single highlight action (accept or reject).
 * Returns the new content after the action is applied.
 *
 * @param content - The merged content with diff markers
 * @param highlights - All highlights
 * @param hunkId - The hunk to accept/reject
 * @param action - 'accept' or 'reject'
 */
export function applyHighlightAction(
  content: string,
  highlights: DiffHighlight[],
  hunkId: string,
  action: 'accept' | 'reject'
): { content: string; highlights: DiffHighlight[] } {
  const highlight = highlights.find((h) => h.hunkId === hunkId)
  if (!highlight) {
    return { content, highlights }
  }

  let newContent = content
  let offset = 0

  // Find the paired highlight (deletion paired with adjacent addition)
  const highlightIndex = highlights.indexOf(highlight)
  const pairedHighlight = findPairedHighlight(highlights, highlightIndex)

  if (highlight.type === 'deletion') {
    if (action === 'accept') {
      // Accept deletion = remove the deleted text
      newContent = content.slice(0, highlight.start) + content.slice(highlight.end)
      offset = -(highlight.end - highlight.start)
    }
    // Reject deletion = keep the text, just remove the marker (no content change)
  } else if (highlight.type === 'addition') {
    if (action === 'reject') {
      // Reject addition = remove the added text
      newContent = content.slice(0, highlight.start) + content.slice(highlight.end)
      offset = -(highlight.end - highlight.start)
    }
    // Accept addition = keep the text, just remove the marker (no content change)
  }

  // Update remaining highlights with offset
  const newHighlights = highlights
    .filter((h) => h.hunkId !== hunkId)
    .map((h) => {
      if (h.start > highlight.start) {
        return {
          ...h,
          start: h.start + offset,
          end: h.end + offset,
        }
      }
      return h
    })

  // If there's a paired highlight that should also be removed
  if (pairedHighlight && shouldRemovePaired(highlight, pairedHighlight, action)) {
    return applyHighlightAction(newContent, newHighlights, pairedHighlight.hunkId, action)
  }

  return { content: newContent, highlights: newHighlights }
}

/**
 * Find a paired highlight (deletion followed by addition or vice versa).
 * Pairs are changes that are adjacent and represent a modification.
 */
function findPairedHighlight(highlights: DiffHighlight[], index: number): DiffHighlight | null {
  const current = highlights[index]
  if (!current) return null

  // Check next highlight
  const next = highlights[index + 1]
  if (next && next.start === current.end) {
    if (
      (current.type === 'deletion' && next.type === 'addition') ||
      (current.type === 'addition' && next.type === 'deletion')
    ) {
      return next
    }
  }

  // Check previous highlight
  const prev = highlights[index - 1]
  if (prev && prev.end === current.start) {
    if (
      (current.type === 'deletion' && prev.type === 'addition') ||
      (current.type === 'addition' && prev.type === 'deletion')
    ) {
      return prev
    }
  }

  return null
}

/**
 * Determine if a paired highlight should also be removed.
 */
function shouldRemovePaired(
  _highlight: DiffHighlight,
  _paired: DiffHighlight,
  _action: 'accept' | 'reject'
): boolean {
  // When accepting a deletion that's paired with an addition,
  // we typically want to also accept the addition (keep it)
  // When rejecting an addition that's paired with a deletion,
  // we typically want to also reject the deletion (keep original)

  // For now, we handle them independently - user can accept/reject each separately
  return false
}

/**
 * Get the final content after all highlights are resolved.
 * Deletions that weren't explicitly accepted are kept (rejected by default).
 * Additions that weren't explicitly rejected are kept (accepted by default).
 */
export function getFinalContent(
  content: string,
  highlights: DiffHighlight[],
  acceptedHunks: Set<string>,
  rejectedHunks: Set<string>
): string {
  // Sort highlights by position (descending) so we can remove from end to start
  const sortedHighlights = [...highlights].sort((a, b) => b.start - a.start)

  let result = content

  for (const highlight of sortedHighlights) {
    const isAccepted = acceptedHunks.has(highlight.hunkId)
    const isRejected = rejectedHunks.has(highlight.hunkId)

    if (highlight.type === 'deletion') {
      if (isAccepted) {
        // Remove the deleted text
        result = result.slice(0, highlight.start) + result.slice(highlight.end)
      }
      // If rejected or unresolved, keep the text (do nothing)
    } else if (highlight.type === 'addition') {
      if (isRejected) {
        // Remove the added text
        result = result.slice(0, highlight.start) + result.slice(highlight.end)
      }
      // If accepted or unresolved, keep the text (do nothing)
    }
  }

  return result
}

/**
 * Create HTML with inline diff markers for display.
 * This is used when we need to render diffs as HTML (e.g., in a preview).
 */
export function createDiffHtml(merged: MergedDiff): string {
  const { content, highlights } = merged

  if (highlights.length === 0) {
    return escapeHtml(content)
  }

  // Sort highlights by start position
  const sortedHighlights = [...highlights].sort((a, b) => a.start - b.start)

  let html = ''
  let lastEnd = 0

  for (const highlight of sortedHighlights) {
    // Add text before this highlight
    if (highlight.start > lastEnd) {
      html += escapeHtml(content.slice(lastEnd, highlight.start))
    }

    // Add highlighted text
    const className = highlight.type === 'deletion' ? 'mu-diff-deletion' : 'mu-diff-addition'
    const buttonClass = highlight.type === 'deletion' ? 'reject' : 'accept'
    const buttonLabel = highlight.type === 'deletion' ? '−' : '+'

    html += `<span class="${className}" data-hunk-id="${highlight.hunkId}">`
    html += escapeHtml(content.slice(highlight.start, highlight.end))
    html += `<button class="diff-action-btn ${buttonClass}" data-action="${buttonClass}" data-hunk-id="${highlight.hunkId}">${buttonLabel}</button>`
    html += '</span>'

    lastEnd = highlight.end
  }

  // Add remaining text
  if (lastEnd < content.length) {
    html += escapeHtml(content.slice(lastEnd))
  }

  return html
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Convert DiffHighlight array to Muya-compatible highlights.
 * This allows passing diff highlights directly to Muya's block.update() method.
 */
export function toMuyaHighlights(highlights: DiffHighlight[]): MuyaDiffHighlight[] {
  return highlights.map((h) => ({
    start: h.start,
    end: h.end,
    active: true,
    diffType: h.type,
    hunkId: h.hunkId,
  }))
}

/**
 * Apply line-level diff highlights for multi-line content.
 * Returns highlights mapped to their respective line positions.
 */
export interface LineDiffResult {
  lineIndex: number
  content: string
  highlights: MuyaDiffHighlight[]
}

export function computeLineLevelDiffs(original: string, proposed: string): LineDiffResult[] {
  const originalLines = original.split('\n')
  const proposedLines = proposed.split('\n')
  const results: LineDiffResult[] = []

  // Use line-level diff
  const changes = Diff.diffArrays(originalLines, proposedLines)

  let lineIndex = 0

  for (const change of changes) {
    if (change.removed) {
      // Lines were removed - show with deletion highlighting
      for (const line of change.value) {
        results.push({
          lineIndex: lineIndex,
          content: line,
          highlights: [
            {
              start: 0,
              end: line.length,
              active: true,
              diffType: 'deletion',
              hunkId: `line-${lineIndex}-del`,
            },
          ],
        })
        lineIndex++
      }
    } else if (change.added) {
      // Lines were added - show with addition highlighting
      for (const line of change.value) {
        results.push({
          lineIndex: lineIndex,
          content: line,
          highlights: [
            {
              start: 0,
              end: line.length,
              active: true,
              diffType: 'addition',
              hunkId: `line-${lineIndex}-add`,
            },
          ],
        })
        lineIndex++
      }
    } else {
      // Unchanged lines
      for (const line of change.value) {
        results.push({
          lineIndex: lineIndex,
          content: line,
          highlights: [],
        })
        lineIndex++
      }
    }
  }

  return results
}
