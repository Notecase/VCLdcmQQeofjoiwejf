/**
 * Link Fetcher
 *
 * Fetches and extracts content from URLs.
 * Handles various content types and cleans HTML to readable text.
 */

import type { LinkProcessingResult, ProcessingOptions, SourceChunk } from './types'

// Default processing options
const DEFAULT_OPTIONS: ProcessingOptions = {
  chunkSize: 1000,
  chunkOverlap: 200,
  generateEmbeddings: false,
}

// User agent for fetching
const USER_AGENT = 'Mozilla/5.0 (compatible; InkdownBot/1.0; +https://inkdown.app)'

// Timeout for fetch requests (10 seconds)
const FETCH_TIMEOUT = 10000

/**
 * Fetch and extract content from a URL
 */
export async function fetchLinkContent(
  url: string,
  options: ProcessingOptions = {}
): Promise<LinkProcessingResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options }

  try {
    // Validate URL
    const parsedUrl = new URL(url)

    // Fetch with timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      return {
        success: false,
        url,
        error: `HTTP error: ${response.status} ${response.statusText}`,
      }
    }

    const contentType = response.headers.get('content-type') || ''

    // Handle different content types
    if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
      return await processHTMLContent(await response.text(), url, parsedUrl, opts)
    } else if (contentType.includes('text/plain')) {
      return await processPlainText(await response.text(), url, parsedUrl, opts)
    } else if (contentType.includes('application/json')) {
      return await processJSON(await response.text(), url, parsedUrl, opts)
    } else {
      return {
        success: false,
        url,
        error: `Unsupported content type: ${contentType}`,
      }
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        success: false,
        url,
        error: 'Request timed out',
      }
    }

    return {
      success: false,
      url,
      error: error instanceof Error ? error.message : 'Failed to fetch URL',
    }
  }
}

/**
 * Process HTML content
 */
async function processHTMLContent(
  html: string,
  url: string,
  parsedUrl: URL,
  options: ProcessingOptions
): Promise<LinkProcessingResult> {
  // Extract main content and metadata
  const { content, title, description, author, publishedAt, canonicalUrl } = extractFromHTML(
    html,
    parsedUrl
  )

  if (!content || content.trim().length === 0) {
    return {
      success: false,
      url,
      error: 'No content found on page',
    }
  }

  const wordCount = countWords(content)

  // Generate chunks
  const chunks = chunkContent(content, options.chunkSize!, options.chunkOverlap!)

  return {
    success: true,
    url,
    canonicalUrl,
    content,
    chunks,
    description,
    author,
    publishedAt,
    metadata: {
      title: title || parsedUrl.hostname,
      wordCount,
    },
  }
}

/**
 * Extract content and metadata from HTML
 */
function extractFromHTML(
  html: string,
  _parsedUrl: URL
): {
  content: string
  title?: string
  description?: string
  author?: string
  publishedAt?: Date
  canonicalUrl?: string
} {
  // Extract title
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  const title = titleMatch ? decodeHTMLEntities(titleMatch[1].trim()) : undefined

  // Extract meta description
  const descMatch =
    html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i)
  const description = descMatch ? decodeHTMLEntities(descMatch[1].trim()) : undefined

  // Extract author
  const authorMatch = html.match(/<meta[^>]*name=["']author["'][^>]*content=["']([^"']+)["']/i)
  const author = authorMatch ? decodeHTMLEntities(authorMatch[1].trim()) : undefined

  // Extract published date
  const dateMatch =
    html.match(/<meta[^>]*property=["']article:published_time["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<time[^>]*datetime=["']([^"']+)["']/i)
  const publishedAt = dateMatch ? new Date(dateMatch[1]) : undefined

  // Extract canonical URL
  const canonicalMatch = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)
  const canonicalUrl = canonicalMatch ? canonicalMatch[1] : undefined

  // Extract main content
  const content = extractMainContent(html)

  return { content, title, description, author, publishedAt, canonicalUrl }
}

/**
 * Extract the main content from HTML, removing navigation, ads, etc.
 */
function extractMainContent(html: string): string {
  // Remove script and style tags
  let cleaned = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
  cleaned = cleaned.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
  cleaned = cleaned.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')

  // Remove common non-content elements
  cleaned = cleaned.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
  cleaned = cleaned.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
  cleaned = cleaned.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
  cleaned = cleaned.replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '')
  cleaned = cleaned.replace(/<form[^>]*>[\s\S]*?<\/form>/gi, '')

  // Try to find main content area
  const mainMatch =
    cleaned.match(/<main[^>]*>([\s\S]*?)<\/main>/i) ||
    cleaned.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
    cleaned.match(
      /<div[^>]*class=["'][^"']*(?:content|article|post|entry)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
    )

  if (mainMatch) {
    cleaned = mainMatch[1]
  }

  // Convert to plain text
  // Replace block elements with newlines
  cleaned = cleaned.replace(/<\/(p|div|h[1-6]|li|br|tr)>/gi, '\n')
  cleaned = cleaned.replace(/<(p|div|h[1-6]|li|br|tr)[^>]*>/gi, '\n')

  // Remove all remaining HTML tags
  cleaned = cleaned.replace(/<[^>]+>/g, ' ')

  // Decode HTML entities
  cleaned = decodeHTMLEntities(cleaned)

  // Clean up whitespace
  cleaned = cleaned.replace(/\n\s*\n/g, '\n\n') // Collapse multiple newlines
  cleaned = cleaned.replace(/[ \t]+/g, ' ') // Collapse spaces
  cleaned = cleaned.trim()

  return cleaned
}

/**
 * Process plain text content
 */
async function processPlainText(
  text: string,
  url: string,
  parsedUrl: URL,
  options: ProcessingOptions
): Promise<LinkProcessingResult> {
  const content = text.trim()

  if (!content) {
    return {
      success: false,
      url,
      error: 'No content found',
    }
  }

  const wordCount = countWords(content)
  const chunks = chunkContent(content, options.chunkSize!, options.chunkOverlap!)

  // Try to extract title from first line
  const firstLine = content.split('\n')[0].trim()
  const title = firstLine.length <= 100 ? firstLine : parsedUrl.hostname

  return {
    success: true,
    url,
    content,
    chunks,
    metadata: {
      title,
      wordCount,
    },
  }
}

/**
 * Process JSON content
 */
async function processJSON(
  text: string,
  url: string,
  parsedUrl: URL,
  options: ProcessingOptions
): Promise<LinkProcessingResult> {
  try {
    const json = JSON.parse(text)
    const content = JSON.stringify(json, null, 2)
    const wordCount = countWords(content)
    const chunks = chunkContent(content, options.chunkSize!, options.chunkOverlap!)

    return {
      success: true,
      url,
      content,
      chunks,
      metadata: {
        title: `JSON from ${parsedUrl.hostname}`,
        wordCount,
      },
    }
  } catch {
    return {
      success: false,
      url,
      error: 'Invalid JSON content',
    }
  }
}

/**
 * Chunk content into smaller pieces
 */
function chunkContent(content: string, chunkSize: number, chunkOverlap: number): SourceChunk[] {
  const chunks: SourceChunk[] = []
  let position = 0
  let offset = 0

  while (offset < content.length) {
    // Find end of chunk
    let endIndex = Math.min(offset + chunkSize, content.length)

    // Try to break at a paragraph or sentence boundary
    if (endIndex < content.length) {
      const searchStart = Math.max(offset + chunkSize - 200, offset)
      const searchText = content.slice(searchStart, endIndex + 100)

      // Try paragraph break first
      const paragraphBreak = searchText.lastIndexOf('\n\n')
      if (paragraphBreak > 50) {
        endIndex = searchStart + paragraphBreak + 2
      } else {
        // Fall back to sentence break
        const sentenceEnd = findSentenceEnd(searchText)
        if (sentenceEnd > 50) {
          endIndex = searchStart + sentenceEnd + 1
        }
      }
    }

    const chunkContent = content.slice(offset, endIndex).trim()

    if (chunkContent.length > 0) {
      chunks.push({
        id: `chunk_${position}`,
        sourceId: '', // Will be set when saving
        content: chunkContent,
        position,
      })
      position++
    }

    // Move forward with overlap
    offset = endIndex - chunkOverlap
    if (offset <= 0 || endIndex >= content.length) {
      offset = endIndex
    }
  }

  return chunks
}

/**
 * Find the end of a sentence in text
 */
function findSentenceEnd(text: string): number {
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
 * Decode HTML entities
 */
function decodeHTMLEntities(text: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
    '&mdash;': '—',
    '&ndash;': '–',
    '&hellip;': '…',
    '&copy;': '©',
    '&reg;': '®',
    '&trade;': '™',
  }

  let result = text
  for (const [entity, char] of Object.entries(entities)) {
    result = result.replace(new RegExp(entity, 'gi'), char)
  }

  // Handle numeric entities
  result = result.replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
  result = result.replace(/&#x([a-f0-9]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))

  return result
}

/**
 * Count words in text
 */
function countWords(text: string): number {
  return text.split(/\s+/).filter((word) => word.length > 0).length
}

/**
 * Validate URL format
 */
export function isValidURL(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

/**
 * Check if URL is a YouTube link
 */
export function isYouTubeURL(url: string): boolean {
  try {
    const parsedUrl = new URL(url)
    return (
      parsedUrl.hostname === 'youtube.com' ||
      parsedUrl.hostname === 'www.youtube.com' ||
      parsedUrl.hostname === 'youtu.be' ||
      parsedUrl.hostname === 'm.youtube.com'
    )
  } catch {
    return false
  }
}

/**
 * Extract YouTube video ID from URL
 */
export function extractYouTubeVideoId(url: string): string | null {
  try {
    const parsedUrl = new URL(url)

    if (parsedUrl.hostname === 'youtu.be') {
      return parsedUrl.pathname.slice(1)
    }

    if (parsedUrl.hostname.includes('youtube.com')) {
      return parsedUrl.searchParams.get('v')
    }

    return null
  } catch {
    return null
  }
}
