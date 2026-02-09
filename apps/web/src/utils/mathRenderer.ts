/**
 * Math Content Renderer
 *
 * Renders content with LaTeX math expressions and basic markdown.
 * Uses KaTeX for math rendering.
 */
import katex from 'katex'
import 'katex/dist/contrib/mhchem.min.js'
import 'katex/dist/katex.min.css'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

// Cache for rendered math expressions
const mathCache = new Map<string, string>()

/**
 * Render a LaTeX math expression to HTML
 */
function renderMath(math: string, displayMode: boolean): string {
  const cacheKey = `${math}_${displayMode}`

  if (mathCache.has(cacheKey)) {
    return mathCache.get(cacheKey)!
  }

  try {
    const html = katex.renderToString(math, {
      displayMode,
      throwOnError: false,
      errorColor: '#f85149',
      strict: false,
      trust: true,
    })
    mathCache.set(cacheKey, html)
    return html
  } catch (err) {
    const errorHtml = `<span class="math-error" style="color: #f85149;">Invalid math: ${escapeHtml(math)}</span>`
    mathCache.set(cacheKey, errorHtml)
    return errorHtml
  }
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Render content with LaTeX math and basic markdown
 *
 * Supports:
 * - Display math: $$...$$
 * - Inline math: $...$
 * - Bold: **text**
 * - Italic: *text* or _text_
 * - Inline code: `code`
 * - Code blocks: ```code```
 * - Line breaks
 */
export function renderMathContent(content: string): string {
  if (!content) return ''

  // Use placeholder system to protect special content during processing
  const placeholders: string[] = []
  let placeholderIndex = 0

  function addPlaceholder(html: string): string {
    const placeholder = `\x00PLACEHOLDER_${placeholderIndex++}\x00`
    placeholders.push(html)
    return placeholder
  }

  let html = content

  // Step 1: Extract and protect code blocks first
  // Allow whitespace before/after language name to handle variations like ``` javascript
  html = html.replace(/```\s*(\w+)?\s*[\r\n]*([\s\S]*?)```/g, (_, lang, code) => {
    const escapedCode = escapeHtml(code.trim())
    return addPlaceholder(
      `<pre class="math-code-block" data-lang="${lang || ''}"><code>${escapedCode}</code></pre>`
    )
  })

  // Step 2: Extract and protect inline code
  html = html.replace(/`([^`]+)`/g, (_, code) => {
    return addPlaceholder(`<code class="math-inline-code">${escapeHtml(code)}</code>`)
  })

  // Step 3: Extract and process display math ($$...$$) - must handle multiline
  html = html.replace(/\$\$([\s\S]+?)\$\$/g, (_, math) => {
    return addPlaceholder(`<div class="math-display">${renderMath(math.trim(), true)}</div>`)
  })

  // Step 4: Extract and process inline math ($...$)
  // Match $ followed by non-$ non-newline content, followed by $
  // This avoids matching $$ and handles most common cases
  html = html.replace(/\$([^$\n]+?)\$/g, (match, math) => {
    // Skip if this looks like it might be currency (e.g., "$100")
    if (/^\d+\.?\d*$/.test(math.trim())) {
      return match
    }
    return addPlaceholder(`<span class="math-inline">${renderMath(math.trim(), false)}</span>`)
  })

  // Step 5: Escape remaining HTML in non-placeholder text
  html = escapeHtml(html)

  // Step 6: Restore placeholders
  placeholders.forEach((replacement, i) => {
    html = html.replace(`\x00PLACEHOLDER_${i}\x00`, replacement)
  })

  // Step 7: Apply markdown formatting (on already-escaped text)
  // Bold: **text** (escaped as **text**)
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')

  // Italic: *text* (but not **)
  html = html.replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, '<em>$1</em>')

  // Line breaks
  html = html.replace(/\n/g, '<br>')

  return html
}

/**
 * Simple text-only version without math rendering
 * For places where only basic markdown is needed
 */
export function renderBasicMarkdown(content: string): string {
  if (!content) return ''

  let html = escapeHtml(content)

  // Code blocks (need to unescape the content since we escaped everything)
  // Allow whitespace before/after language name to handle variations like ``` javascript
  html = html.replace(/```\s*(\w+)?\s*[\r\n]*([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre class="math-code-block" data-lang="${lang || ''}"><code>${code.trim()}</code></pre>`
  })

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="math-inline-code">$1</code>')

  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')

  // Italic (but not **)
  html = html.replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, '<em>$1</em>')

  // Line breaks
  html = html.replace(/\n/g, '<br>')

  return html
}

/**
 * Render content with full markdown (via marked) + all LaTeX math delimiters (via KaTeX).
 *
 * Supports: $...$, $$...$$, \(...\), \[...\] math delimiters,
 * plus full markdown (headings, lists, blockquotes, tables, links, etc.)
 */
export function renderMathMarkdown(content: string): string {
  if (!content) return ''

  const placeholders: string[] = []
  let placeholderIndex = 0

  function addPlaceholder(html: string): string {
    const placeholder = `MATHPLACEHOLDER${placeholderIndex++}END`
    placeholders.push(html)
    return placeholder
  }

  let text = content

  // Step 1: Protect code blocks from math parsing
  text = text.replace(/```[\s\S]*?```/g, (match) => addPlaceholder(match))
  text = text.replace(/`[^`]+`/g, (match) => addPlaceholder(match))

  // Step 2: Extract and render all math delimiters (order matters: display before inline)

  // \[...\] → display math
  text = text.replace(/\\\[([\s\S]+?)\\\]/g, (_, math) => {
    return addPlaceholder(`<div class="math-display">${renderMath(math.trim(), true)}</div>`)
  })

  // $$...$$ → display math
  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_, math) => {
    return addPlaceholder(`<div class="math-display">${renderMath(math.trim(), true)}</div>`)
  })

  // \(...\) → inline math
  text = text.replace(/\\\(([\s\S]+?)\\\)/g, (_, math) => {
    return addPlaceholder(`<span class="math-inline">${renderMath(math.trim(), false)}</span>`)
  })

  // $...$ → inline math (skip currency-like patterns)
  text = text.replace(/\$([^$\n]+?)\$/g, (match, math) => {
    if (/^\d+\.?\d*$/.test(math.trim())) return match
    return addPlaceholder(`<span class="math-inline">${renderMath(math.trim(), false)}</span>`)
  })

  // Step 3: Restore code block placeholders before marked parses them
  // (code blocks were protected so math inside code stays literal)
  for (let i = 0; i < placeholderIndex; i++) {
    const placeholder = `MATHPLACEHOLDER${i}END`
    if (
      text.includes(placeholder) &&
      (placeholders[i].startsWith('```') || placeholders[i].startsWith('`'))
    ) {
      text = text.replace(placeholder, placeholders[i])
      // Mark as restored so we don't double-restore later
      placeholders[i] = ''
    }
  }

  // Step 4: Run marked for full markdown rendering
  const html = marked.parse(text, { async: false }) as string

  // Step 5: Sanitize with DOMPurify (allow KaTeX classes/styles)
  let sanitized = DOMPurify.sanitize(html, {
    ADD_ATTR: ['class', 'style', 'aria-hidden', 'data-lang'],
    ADD_TAGS: [
      'span',
      'math',
      'semantics',
      'mrow',
      'mi',
      'mo',
      'mn',
      'msup',
      'msub',
      'mfrac',
      'mover',
      'munder',
      'munderover',
      'msqrt',
      'mroot',
      'mtable',
      'mtr',
      'mtd',
      'annotation',
    ],
  })

  // Step 6: Restore remaining math placeholders
  for (let i = 0; i < placeholderIndex; i++) {
    if (placeholders[i]) {
      sanitized = sanitized.replace(`MATHPLACEHOLDER${i}END`, placeholders[i])
    }
  }

  return sanitized
}

/**
 * Clear the math render cache
 */
export function clearMathCache(): void {
  mathCache.clear()
}
