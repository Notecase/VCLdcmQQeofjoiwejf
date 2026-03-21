/**
 * Artifact Subagent
 *
 * Specialized subagent for creating interactive HTML/CSS/JS artifacts.
 * Used by the DeepAgent orchestrator for create_artifact tasks.
 */

import { streamText, generateText, Output } from 'ai'
import { z } from 'zod'
import { stripJsonFences } from '../../utils/stripJsonFences'
import { selectModel } from '../../providers/model-registry'
import { resolveModel } from '../../providers/ai-sdk-factory'
import { trackAISDKUsage, recordAISDKUsage } from '../../providers/ai-sdk-usage'

// ============================================================================
// Types
// ============================================================================

export interface ArtifactSubagentConfig {
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
// Schema
// ============================================================================

const ArtifactSchema = z.object({
  title: z.string(),
  html: z.string(),
  css: z.string().default(''),
  javascript: z.string().default(''),
})

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
  private model: string

  constructor(config: ArtifactSubagentConfig) {
    this.model = config.model ?? selectModel('artifact').id
  }

  /**
   * Execute an artifact creation task with streaming
   */
  async *execute(taskDescription: string): AsyncGenerator<{
    type: 'thinking' | 'progress' | 'code-preview' | 'artifact' | 'complete'
    data: unknown
  }> {
    yield { type: 'thinking', data: 'Creating interactive artifact...' }

    const { model: artModel, entry: artEntry } = resolveModel('artifact', this.model)
    const result = streamText({
      model: artModel,
      system: ARTIFACT_SUBAGENT_PROMPT,
      messages: [{ role: 'user' as const, content: taskDescription }],
      temperature: 0.4,
      maxOutputTokens: 8000,
      output: Output.object({ schema: ArtifactSchema }),
      onFinish: trackAISDKUsage({ model: artEntry.id, taskType: 'artifact' }),
    })

    // Stream text for progress tracking
    let fullContent = ''
    let lastProgressUpdate = 0
    const progressInterval = 500

    for await (const chunk of result.textStream) {
      fullContent += chunk

      const now = Date.now()
      if (now - lastProgressUpdate > progressInterval) {
        lastProgressUpdate = now

        const phase = this.detectPhase(fullContent)
        const preview = this.extractPreview(fullContent)

        yield {
          type: 'code-preview',
          data: { phase, preview, totalChars: fullContent.length },
        }

        yield {
          type: 'progress',
          data: {
            progress: Math.min(90, fullContent.length / 50),
            message: 'Generating artifact code...',
          },
        }
      }
    }

    // Try structured output first, then fallback to manual parse
    let artifact: ArtifactData | null = null

    const structuredOutput = await result.output
    if (structuredOutput && (structuredOutput.html || structuredOutput.css || structuredOutput.javascript)) {
      artifact = {
        title: structuredOutput.title || this.extractTitle(taskDescription),
        html: structuredOutput.html || '',
        css: structuredOutput.css || '',
        javascript: structuredOutput.javascript || '',
      }
    } else {
      // Fallback: manual JSON parse (for models that don't support Output.object well)
      artifact = this.parseArtifactContent(fullContent, taskDescription)
    }

    // If still no content, retry with explicit instructions
    if (!artifact || (!artifact.html && !artifact.css && !artifact.javascript)) {
      console.warn('[ArtifactSubagent] First attempt returned empty content. Retrying...')

      try {
        const retryStart = Date.now()
        const { model: retryModel, entry: retryEntry } = resolveModel('artifact', this.model)
        const retryResult = await generateText({
          model: retryModel,
          system: ARTIFACT_SUBAGENT_PROMPT,
          messages: [
            { role: 'user' as const, content: taskDescription },
            { role: 'assistant' as const, content: fullContent },
            {
              role: 'user' as const,
              content:
                'That response was not valid JSON with code content. Please output ONLY a JSON object with title, html, css, and javascript fields. The html field MUST contain the component markup. Start with { and end with }',
            },
          ],
          temperature: 0.2,
          maxOutputTokens: 8000,
          output: Output.object({ schema: ArtifactSchema }),
        })
        recordAISDKUsage(retryResult.usage, { model: retryEntry.id, taskType: 'artifact' }, retryStart)

        if (retryResult.output) {
          artifact = {
            title: retryResult.output.title || this.extractTitle(taskDescription),
            html: retryResult.output.html || '',
            css: retryResult.output.css || '',
            javascript: retryResult.output.javascript || '',
          }
        } else {
          artifact = this.parseArtifactContent(retryResult.text, taskDescription)
        }
      } catch (retryError) {
        console.error('[ArtifactSubagent] Retry failed:', retryError)
      }
    }

    // Validate the artifact has actual content
    const hasContent = artifact && Boolean(artifact.html || artifact.css || artifact.javascript)

    if (!hasContent) {
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

    yield { type: 'artifact', data: artifact }
    yield { type: 'complete', data: { success: true, artifact } }
  }

  /**
   * Parse artifact content from LLM response (fallback for models without structured output)
   */
  private parseArtifactContent(content: string, description: string): ArtifactData {
    const defaultResult: ArtifactData = {
      title: this.extractTitle(description),
      html: '',
      css: '',
      javascript: '',
    }

    try {
      const cleaned = stripJsonFences(content)
      const parsed = JSON.parse(cleaned)
      return {
        title: parsed.title || defaultResult.title,
        html: parsed.html || '',
        css: parsed.css || '',
        javascript: parsed.javascript || '',
      }
    } catch {
      // Fallback: extract from markdown code blocks
      const htmlMatch = content.match(/```html\s*([\s\S]*?)```/i)
      const cssMatch = content.match(/```css\s*([\s\S]*?)```/i)
      const jsMatch = content.match(/```(?:javascript|js)\s*([\s\S]*?)```/i)

      return {
        title: defaultResult.title,
        html: htmlMatch?.[1]?.trim() || '',
        css: cssMatch?.[1]?.trim() || '',
        javascript: jsMatch?.[1]?.trim() || '',
      }
    }
  }

  /**
   * Detect the current phase of generation based on content markers
   */
  private detectPhase(content: string): 'html' | 'css' | 'javascript' {
    const hasJs =
      content.includes('"javascript"') ||
      content.includes('```javascript') ||
      content.includes('```js')
    const hasCss = content.includes('"css"') || content.includes('```css')

    if (hasJs) return 'javascript'
    if (hasCss) return 'css'
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
    const match = description.match(
      /(?:create|make|build)\s+(?:an?\s+)?(?:interactive\s+)?(.+?)(?:\s+for|\s+that|\s+with|$)/i
    )
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
