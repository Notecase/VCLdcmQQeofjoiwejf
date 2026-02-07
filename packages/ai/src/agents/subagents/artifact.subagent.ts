/**
 * Artifact Subagent
 *
 * Specialized subagent for creating interactive HTML/CSS/JS artifacts.
 * Used by the DeepAgent orchestrator for create_artifact tasks.
 */

// ============================================================================
// Types
// ============================================================================

export interface ArtifactSubagentConfig {
  openaiApiKey: string
  model?: string
}

export interface ArtifactData {
  title: string
  html: string
  css: string
  javascript: string
}

export interface ArtifactSubagentResult {
  success: boolean
  artifact?: ArtifactData
  error?: string
}

// ============================================================================
// System Prompt
// ============================================================================

export const ARTIFACT_SUBAGENT_PROMPT = `You are an interactive component developer. Create HTML/CSS/JS artifacts like timers, calculators, charts, games, and visualizations.

Rules:
- HTML should be inner HTML only (no <html>, <head>, <body> tags)
- Make components visually appealing with modern CSS (dark theme, gradients, shadows)
- Include interactivity with vanilla JavaScript
- Do NOT use localStorage or sessionStorage (sandboxed iframe)
- Keep all state in memory variables
- Use Tailwind CSS classes when helpful (available via CDN)

CRITICAL OUTPUT FORMAT:
Your response MUST be ONLY a single JSON object with NO other text before or after.
Start your response with { and end with }

Example format:
{
  "title": "Study Timer",
  "html": "<div class='timer-container'>...</div>",
  "css": ".timer-container { ... }",
  "javascript": "let seconds = 0; function startTimer() { ... }"
}

Do NOT include:
- Any text before the opening {
- Any text after the closing }
- Markdown code fences
- Explanations or comments outside the JSON`

// ============================================================================
// Artifact Subagent
// ============================================================================

export class ArtifactSubagent {
  private openaiApiKey: string
  private model: string

  constructor(config: ArtifactSubagentConfig) {
    this.openaiApiKey = config.openaiApiKey
    this.model = config.model ?? 'gpt-5.2'
  }

  /**
   * Execute an artifact creation task with streaming
   */
  async *execute(taskDescription: string): AsyncGenerator<{
    type: 'thinking' | 'progress' | 'code-preview' | 'artifact' | 'complete'
    data: unknown
  }> {
    yield { type: 'thinking', data: 'Creating interactive artifact...' }

    const OpenAI = (await import('openai')).default
    const client = new OpenAI({ apiKey: this.openaiApiKey })

    const stream = await client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: ARTIFACT_SUBAGENT_PROMPT },
        { role: 'user', content: taskDescription },
      ],
      temperature: 0.4,
      max_completion_tokens: 8000,
      response_format: { type: 'json_object' },
      stream: true,
    })

    let fullContent = ''
    let lastProgressUpdate = 0
    const progressInterval = 500

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content
      if (delta) {
        fullContent += delta

        const now = Date.now()
        if (now - lastProgressUpdate > progressInterval) {
          lastProgressUpdate = now

          // Detect current phase
          const phase = this.detectPhase(fullContent)
          const preview = this.extractPreview(fullContent)

          yield {
            type: 'code-preview',
            data: { phase, preview, totalChars: fullContent.length },
          }

          yield {
            type: 'progress',
            data: { progress: Math.min(90, fullContent.length / 50), message: 'Generating artifact code...' },
          }
        }
      }
    }

    // Parse the artifact
    let artifact = this.parseArtifactContent(fullContent, taskDescription)

    // If parsing failed (all fields empty), retry with more explicit instructions
    if (!artifact.html && !artifact.css && !artifact.javascript) {
      console.warn('[ArtifactSubagent] First attempt returned empty content. Retrying with explicit JSON request...')

      try {
        const retryResponse = await client.chat.completions.create({
          model: this.model,
          messages: [
            { role: 'system', content: ARTIFACT_SUBAGENT_PROMPT },
            { role: 'user', content: taskDescription },
            { role: 'assistant', content: fullContent },
            { role: 'user', content: 'That response was not valid JSON with code content. Please output ONLY a JSON object with title, html, css, and javascript fields. The html field MUST contain the component markup. Start with { and end with }' },
          ],
          temperature: 0.2, // Lower temperature for retry
          max_completion_tokens: 8000,
          response_format: { type: 'json_object' },
        })

        const retryContent = retryResponse.choices[0]?.message?.content || ''
        console.log('[ArtifactSubagent] Retry response (first 500 chars):', retryContent.slice(0, 500))
        artifact = this.parseArtifactContent(retryContent, taskDescription)
      } catch (retryError) {
        console.error('[ArtifactSubagent] Retry failed:', retryError)
      }
    }

    // Validate the artifact has actual content after potential retry
    const hasContent = Boolean(artifact.html || artifact.css || artifact.javascript)

    if (!hasContent) {
      console.error('[ArtifactSubagent] Artifact has no code content after parsing and retry. Task:', taskDescription)
      yield {
        type: 'complete',
        data: {
          success: false,
          artifact,
          error: 'Failed to generate artifact code. The AI response could not be parsed into HTML/CSS/JavaScript.',
        },
      }
      return
    }

    yield {
      type: 'artifact',
      data: artifact,
    }

    yield {
      type: 'complete',
      data: {
        success: true,
        artifact,
      },
    }
  }

  /**
   * Parse artifact content from LLM response
   */
  private parseArtifactContent(content: string, description: string): ArtifactData {
    const defaultResult: ArtifactData = {
      title: this.extractTitle(description),
      html: '',
      css: '',
      javascript: '',
    }

    // Debug: Log raw LLM response (truncated)
    console.log('[ArtifactSubagent] LLM response (first 500 chars):', content.slice(0, 500))

    try {
      // Try JSON parsing first
      const cleaned = content.replace(/```json\n?|\n?```/g, '').trim()
      const parsed = JSON.parse(cleaned)

      const result = {
        title: parsed.title || defaultResult.title,
        html: parsed.html || '',
        css: parsed.css || '',
        javascript: parsed.javascript || '',
      }

      console.log('[ArtifactSubagent] Parsed artifact JSON:', {
        title: result.title,
        hasHtml: !!result.html,
        htmlLength: result.html.length,
        hasCss: !!result.css,
        cssLength: result.css.length,
        hasJs: !!result.javascript,
        jsLength: result.javascript.length,
      })

      return result
    } catch (error) {
      console.warn('[ArtifactSubagent] JSON parse failed, trying regex fallback. Error:', error)
      console.log('[ArtifactSubagent] Raw content for regex (first 300 chars):', content.slice(0, 300))

      // Fallback: extract from markdown code blocks
      const htmlMatch = content.match(/```html\s*([\s\S]*?)```/i)
      const cssMatch = content.match(/```css\s*([\s\S]*?)```/i)
      const jsMatch = content.match(/```(?:javascript|js)\s*([\s\S]*?)```/i)

      const result = {
        title: defaultResult.title,
        html: htmlMatch?.[1]?.trim() || '',
        css: cssMatch?.[1]?.trim() || '',
        javascript: jsMatch?.[1]?.trim() || '',
      }

      console.log('[ArtifactSubagent] Regex fallback result:', {
        hasHtml: !!result.html,
        hasCss: !!result.css,
        hasJs: !!result.javascript,
      })

      if (!result.html && !result.css && !result.javascript) {
        console.error('[ArtifactSubagent] PARSING FAILED - all code fields empty. Full content:', content)
      }

      return result
    }
  }

  /**
   * Detect the current phase of generation based on content markers
   */
  private detectPhase(content: string): 'html' | 'css' | 'javascript' {
    const hasJs = content.includes('"javascript"') || content.includes('```javascript') || content.includes('```js')
    const hasCss = content.includes('"css"') || content.includes('```css')

    if (hasJs) {
      // Check if still writing JS
      const jsStart = Math.max(
        content.lastIndexOf('"javascript"'),
        content.lastIndexOf('```javascript'),
        content.lastIndexOf('```js')
      )
      if (jsStart >= 0) {
        const afterJs = content.slice(jsStart + 12)
        if (!afterJs.includes('```') && !afterJs.match(/",?\s*}/)) {
          return 'javascript'
        }
      }
    }

    if (hasCss) {
      const cssStart = Math.max(
        content.lastIndexOf('"css"'),
        content.lastIndexOf('```css')
      )
      if (cssStart >= 0) {
        const afterCss = content.slice(cssStart + 5)
        if (!afterCss.includes('```') && !afterCss.match(/",?\s*}/)) {
          return 'css'
        }
      }
    }

    return 'html'
  }

  /**
   * Extract preview snippet from current content
   */
  private extractPreview(content: string): string {
    const lines = content.split('\n')
    return lines.slice(-4).join('\n').slice(-150)
  }

  /**
   * Extract title from task description
   */
  private extractTitle(description: string): string {
    const match = description.match(/(?:create|make|build)\s+(?:an?\s+)?(?:interactive\s+)?(.+?)(?:\s+for|\s+that|\s+with|$)/i)
    if (match) {
      return match[1].trim().slice(0, 50)
    }
    return `Artifact ${new Date().toISOString().split('T')[0]}`
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createArtifactSubagent(config: ArtifactSubagentConfig): ArtifactSubagent {
  return new ArtifactSubagent(config)
}
