/**
 * PDF Processor
 *
 * Extracts text content from PDF files using pdf-parse.
 * Handles page-by-page extraction and chunking for semantic search.
 */

import type {
  PDFProcessingResult,
  PDFPage,
  ProcessingOptions,
  SourceChunk,
} from './types'

// Default processing options
const DEFAULT_OPTIONS: ProcessingOptions = {
  chunkSize: 1000,
  chunkOverlap: 200,
  generateEmbeddings: false,
}

/**
 * Extract text content from a PDF buffer
 */
export async function extractPDFContent(
  buffer: Buffer,
  options: ProcessingOptions = {}
): Promise<PDFProcessingResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options }

  try {
    // Dynamic import of pdf-parse to avoid bundling issues
    const pdfParse = await import('pdf-parse')
    const pdf = pdfParse.default || pdfParse

    const data = await pdf(buffer, {
      // Return page-by-page content
      pagerender: async (pageData: { getTextContent: () => Promise<{ items: Array<{ str: string }> }> }) => {
        const textContent = await pageData.getTextContent()
        return textContent.items.map((item) => item.str).join(' ')
      },
    })

    // Parse pages if available, otherwise use full text
    const pages = parsePages(data.text, data.numpages)
    const fullContent = pages.map((p) => p.content).join('\n\n')
    const wordCount = countWords(fullContent)

    // Generate chunks
    const chunks = chunkContent(fullContent, pages, opts.chunkSize!, opts.chunkOverlap!)

    return {
      success: true,
      content: fullContent,
      chunks,
      pages,
      metadata: {
        title: extractTitle(data.info?.Title, buffer),
        wordCount,
        pageCount: data.numpages,
      },
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to parse PDF',
    }
  }
}

/**
 * Parse text into pages based on page markers or content length
 */
function parsePages(text: string, numPages: number): PDFPage[] {
  // If we have page markers, use them
  const pageMarker = /\f/g  // Form feed character often separates pages
  const pageTexts = text.split(pageMarker)

  if (pageTexts.length === numPages) {
    return pageTexts.map((content, index) => ({
      pageNumber: index + 1,
      content: content.trim(),
      wordCount: countWords(content),
    }))
  }

  // Otherwise, estimate page boundaries based on character count
  const avgCharsPerPage = text.length / numPages
  const pages: PDFPage[] = []

  for (let i = 0; i < numPages; i++) {
    const start = Math.floor(i * avgCharsPerPage)
    const end = Math.floor((i + 1) * avgCharsPerPage)
    const content = text.slice(start, end).trim()

    pages.push({
      pageNumber: i + 1,
      content,
      wordCount: countWords(content),
    })
  }

  return pages
}

/**
 * Chunk content into smaller pieces for semantic search
 * Respects page boundaries when possible
 */
function chunkContent(
  _fullContent: string,
  pages: PDFPage[],
  chunkSize: number,
  chunkOverlap: number
): SourceChunk[] {
  const chunks: SourceChunk[] = []
  let position = 0

  // Process each page
  for (const page of pages) {
    const pageContent = page.content
    let pageOffset = 0

    while (pageOffset < pageContent.length) {
      // Find a good break point (end of sentence or paragraph)
      let endIndex = Math.min(pageOffset + chunkSize, pageContent.length)

      // Try to break at a sentence boundary
      if (endIndex < pageContent.length) {
        const searchStart = Math.max(pageOffset + chunkSize - 200, pageOffset)
        const searchText = pageContent.slice(searchStart, endIndex + 100)
        const sentenceEnd = findSentenceEnd(searchText)

        if (sentenceEnd !== -1) {
          endIndex = searchStart + sentenceEnd + 1
        }
      }

      const chunkContent = pageContent.slice(pageOffset, endIndex).trim()

      if (chunkContent.length > 0) {
        chunks.push({
          id: `chunk_${position}`,
          sourceId: '',  // Will be set when saving
          content: chunkContent,
          pageNumber: page.pageNumber,
          position,
        })
        position++
      }

      // Move forward with overlap
      pageOffset = endIndex - chunkOverlap
      if (pageOffset <= 0 || endIndex >= pageContent.length) {
        break
      }
    }
  }

  return chunks
}

/**
 * Find the end of a sentence in the given text
 */
function findSentenceEnd(text: string): number {
  // Look for sentence-ending punctuation followed by space or end
  const sentenceEndings = ['. ', '.\n', '! ', '!\n', '? ', '?\n']

  let lastEnd = -1
  for (const ending of sentenceEndings) {
    const index = text.lastIndexOf(ending)
    if (index > lastEnd) {
      lastEnd = index
    }
  }

  return lastEnd
}

/**
 * Extract a title from PDF metadata or content
 */
function extractTitle(metadataTitle: string | undefined, _buffer: Buffer): string {
  if (metadataTitle && metadataTitle.trim()) {
    return metadataTitle.trim()
  }

  // Try to extract from first line of content
  // This is a fallback - ideally the metadata has a title
  return 'Untitled PDF'
}

/**
 * Count words in text
 */
function countWords(text: string): number {
  return text.split(/\s+/).filter((word) => word.length > 0).length
}

/**
 * Validate that a buffer is a valid PDF
 */
export function isPDFBuffer(buffer: Buffer): boolean {
  // PDF files start with %PDF-
  const header = buffer.slice(0, 5).toString('ascii')
  return header === '%PDF-'
}

/**
 * Get basic PDF info without full extraction
 */
export async function getPDFInfo(buffer: Buffer): Promise<{
  pageCount: number
  title?: string
  author?: string
} | null> {
  try {
    const pdfParse = await import('pdf-parse')
    const pdf = pdfParse.default || pdfParse

    const data = await pdf(buffer)

    return {
      pageCount: data.numpages,
      title: data.info?.Title,
      author: data.info?.Author,
    }
  } catch {
    return null
  }
}
