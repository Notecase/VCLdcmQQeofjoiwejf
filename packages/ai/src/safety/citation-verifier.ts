/**
 * Citation Verifier — Post-Processing
 *
 * Validates citation references in LLM output against the actual number
 * of available sources. Strips out-of-bounds citations to prevent
 * hallucinated references (e.g., LLM cites [5] when only 3 sources exist).
 */

export interface CitationVerificationResult {
  text: string
  strippedCitations: number[]
  totalCitations: number
}

/**
 * Verify and clean citation references in LLM output text.
 *
 * @param text - The LLM response text containing [N] citations
 * @param maxCitations - The maximum valid citation number (number of sources provided)
 * @returns Cleaned text with out-of-bounds citations removed
 */
export function verifyCitations(text: string, maxCitations: number): CitationVerificationResult {
  if (!text || maxCitations < 0) {
    return { text: text ?? '', strippedCitations: [], totalCitations: 0 }
  }

  const strippedCitations: number[] = []
  let totalCitations = 0

  // Match [N] citation patterns — only standalone number references
  const result = text.replace(/\[(\d+)\]/g, (match, numStr) => {
    const num = parseInt(numStr, 10)
    totalCitations++

    if (num <= 0 || num > maxCitations) {
      strippedCitations.push(num)
      return '' // Remove invalid citation
    }

    return match // Keep valid citation
  })

  // Clean up any double spaces left by removed citations
  const cleaned = result.replace(/ {2,}/g, ' ').trim()

  return {
    text: cleaned,
    strippedCitations,
    totalCitations,
  }
}
