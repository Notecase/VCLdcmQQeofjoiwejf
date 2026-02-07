/**
 * Ollama Cloud Provider
 *
 * Provider for kimi-k2.5:cloud via Ollama Cloud.
 * Used for artifact generation (HTML/CSS/JS) and code generation.
 */

import { AIProvider, AIContext, AICompletionOptions, ChatMessage, AIUsage } from './interface'

// ============================================================================
// Configuration
// ============================================================================

export interface OllamaCloudConfig {
  baseURL: string // Ollama Cloud API URL
  model?: string // Default: kimi-k2.5:cloud
  apiKey?: string // Optional API key for cloud
  maxRetries?: number
}

// Default model for artifact and code generation
export const DEFAULT_MODEL = 'kimi-k2.5' // Ollama Cloud model for artifacts
export const OLLAMA_CLOUD_URL = 'https://ollama.com' // Official Ollama Cloud API

// ============================================================================
// Types
// ============================================================================

interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface OllamaChatRequest {
  model: string
  messages: OllamaChatMessage[]
  stream?: boolean
  options?: {
    temperature?: number
    num_predict?: number
    stop?: string[]
  }
}

// OllamaChatResponse is the non-streaming response type (currently using streaming only)
interface _OllamaChatResponse {
  model: string
  message: {
    role: 'assistant'
    content: string
  }
  done: boolean
  done_reason?: string
  total_duration?: number
  prompt_eval_count?: number
  eval_count?: number
}

interface OllamaChatStreamChunk {
  model: string
  message: {
    role: 'assistant'
    content: string
    thinking?: string  // kimi-k2.5 streams thinking tokens first
  }
  done: boolean
}

// ============================================================================
// Ollama Cloud Provider Implementation
// ============================================================================

export class OllamaCloudProvider implements AIProvider {
  private baseURL: string
  private model: string
  private apiKey?: string
  private maxRetries: number
  private lastUsage: AIUsage | null = null

  constructor(config: OllamaCloudConfig) {
    this.baseURL = config.baseURL || OLLAMA_CLOUD_URL
    this.model = config.model ?? DEFAULT_MODEL
    this.apiKey = config.apiKey
    this.maxRetries = config.maxRetries ?? 3
  }

  /**
   * Stream completion for inline code editing
   */
  async *complete(
    context: AIContext,
    options?: AICompletionOptions
  ): AsyncGenerator<string, void, unknown> {
    const messages = this.buildCompletionMessages(context)

    yield* this.streamChat(messages, {
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
      stop: options?.stopSequences,
    })

    this.lastUsage = {
      inputTokens: 0,
      outputTokens: 0,
      model: this.model,
      actionType: 'complete',
    }
  }

  /**
   * Stream rewrite of code
   */
  async *rewrite(
    text: string,
    instruction: string,
    _context?: AIContext
  ): AsyncGenerator<string, void, unknown> {
    const messages: OllamaChatMessage[] = [
      {
        role: 'system',
        content: `You are a code refactoring assistant. Rewrite the following code according to the user's instruction.
Only output the rewritten code, nothing else. Maintain proper formatting and syntax.`,
      },
      {
        role: 'user',
        content: `Instruction: ${instruction}\n\nCode to rewrite:\n\`\`\`\n${text}\n\`\`\``,
      },
    ]

    yield* this.streamChat(messages, { temperature: 0.3 })

    this.lastUsage = {
      inputTokens: 0,
      outputTokens: 0,
      model: this.model,
      actionType: 'rewrite',
    }
  }

  /**
   * Stream chat for code-related conversations
   */
  async *chat(messages: ChatMessage[], context?: AIContext): AsyncGenerator<string, void, unknown> {
    const ollamaMessages = this.buildChatMessages(messages, context)

    yield* this.streamChat(ollamaMessages, { temperature: 0.7 })

    this.lastUsage = {
      inputTokens: 0,
      outputTokens: 0,
      model: this.model,
      actionType: 'chat',
    }
  }

  /**
   * Stream summarization
   */
  async *summarize(text: string): AsyncGenerator<string, void, unknown> {
    const messages: OllamaChatMessage[] = [
      {
        role: 'system',
        content:
          'You are a code analysis assistant. Provide a clear, concise summary of the given code, explaining its purpose and key functionality.',
      },
      {
        role: 'user',
        content: `Please summarize the following code:\n\n${text}`,
      },
    ]

    yield* this.streamChat(messages, { temperature: 0.5 })

    this.lastUsage = {
      inputTokens: 0,
      outputTokens: 0,
      model: this.model,
      actionType: 'summarize',
    }
  }

  /**
   * Generate artifact (HTML/CSS/JS)
   * Returns a JSON object with title, html, css, javascript fields
   */
  async *generateArtifact(
    prompt: string,
    artifactType: 'html' | 'css' | 'js' | 'full'
  ): AsyncGenerator<string, void, unknown> {
    const baseSystemPrompt = `You are an interactive artifact generator. Create engaging, self-contained web components.

IMPORTANT: Your response MUST be valid JSON with this exact structure:
{
  "title": "Short descriptive title for the artifact",
  "html": "HTML content (without doctype, html, head, body tags - just the inner content)",
  "css": "CSS styles (will be placed in a style tag)",
  "javascript": "JavaScript code (React and ReactDOM are available, use JSX syntax)"
}

Guidelines:
- Use Tailwind CSS classes for styling (available via CDN)
- React 18 and ReactDOM are available globally
- Use Babel for JSX transformation (available)
- Keep code clean, well-organized, and self-contained
- The artifact should be interactive and visually appealing
- Handle errors gracefully in JavaScript`

    const typeSpecificPrompts: Record<string, string> = {
      html: `${baseSystemPrompt}\n\nFocus on semantic HTML structure. The css and javascript fields can be minimal.`,
      css: `${baseSystemPrompt}\n\nFocus on beautiful CSS styling with Tailwind and custom CSS. The html field should be minimal, and javascript can be empty.`,
      js: `${baseSystemPrompt}\n\nFocus on interactive JavaScript/React components. Use the html field for the React root container.`,
      full: `${baseSystemPrompt}\n\nCreate a complete, polished component with rich HTML structure, beautiful CSS styling, and interactive JavaScript.`,
    }

    const messages: OllamaChatMessage[] = [
      { role: 'system', content: typeSpecificPrompts[artifactType] },
      { role: 'user', content: prompt },
    ]

    yield* this.streamChat(messages, { temperature: 0.3, maxTokens: 20000 })

    this.lastUsage = {
      inputTokens: 0,
      outputTokens: 0,
      model: this.model,
      actionType: 'artifact',
    }
  }

  /**
   * Generate code with specific language
   */
  async *generateCode(
    prompt: string,
    language: string,
    context?: string
  ): AsyncGenerator<string, void, unknown> {
    const messages: OllamaChatMessage[] = [
      {
        role: 'system',
        content: `You are a ${language} code generator. Generate clean, well-documented ${language} code based on the user's requirements.
Output only valid ${language} code without any explanation. Include helpful comments.`,
      },
    ]

    if (context) {
      messages.push({
        role: 'user',
        content: `Context:\n${context}\n\n`,
      })
    }

    messages.push({
      role: 'user',
      content: prompt,
    })

    yield* this.streamChat(messages, { temperature: 0.3, maxTokens: 4000 })

    this.lastUsage = {
      inputTokens: 0,
      outputTokens: 0,
      model: this.model,
      actionType: 'code',
    }
  }

  /**
   * Get last operation's usage
   */
  getUsage(): AIUsage | null {
    return this.lastUsage
  }

  // =========================================================================
  // Private Methods
  // =========================================================================

  private async *streamChat(
    messages: OllamaChatMessage[],
    options?: {
      temperature?: number
      maxTokens?: number
      stop?: string[]
    }
  ): AsyncGenerator<string, void, unknown> {
    const request: OllamaChatRequest = {
      model: this.model,
      messages,
      stream: true,
      options: {
        temperature: options?.temperature ?? 0.7,
        num_predict: options?.maxTokens ?? 2000,
        stop: options?.stop,
      },
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`
    }

    let lastError: Error | null = null

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const response = await fetch(`${this.baseURL}/api/chat`, {
          method: 'POST',
          headers,
          body: JSON.stringify(request),
        })

        if (!response.ok) {
          throw new Error(`Ollama API error: ${response.status} ${response.statusText}`)
        }

        const reader = response.body?.getReader()
        if (!reader) {
          throw new Error('No response body')
        }

        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (!line.trim()) continue

            try {
              const chunk: OllamaChatStreamChunk = JSON.parse(line)
              if (chunk.message?.content) {
                yield chunk.message.content
              }
              if (chunk.done) {
                return
              }
            } catch {
              // Skip invalid JSON lines
            }
          }
        }

        return // Success, exit retry loop
      } catch (error) {
        lastError = error as Error
        if (attempt < this.maxRetries - 1) {
          // Exponential backoff
          await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000))
        }
      }
    }

    throw lastError || new Error('Failed to connect to Ollama Cloud')
  }

  private buildCompletionMessages(context: AIContext): OllamaChatMessage[] {
    const messages: OllamaChatMessage[] = []

    messages.push({
      role: 'system',
      content:
        context.systemPrompt ||
        'You are a code completion assistant. Continue the code naturally and correctly.',
    })

    let userContent = ''

    if (context.textBeforeCursor) {
      userContent += `Code before cursor:\n\`\`\`\n${context.textBeforeCursor}\n\`\`\`\n\n`
    }

    if (context.selectedText) {
      userContent += `Selected code:\n\`\`\`\n${context.selectedText}\n\`\`\`\n\n`
      userContent += 'Please complete or continue this code.'
    } else {
      userContent += 'Please continue the code from this point.'
    }

    messages.push({ role: 'user', content: userContent })

    return messages
  }

  private buildChatMessages(messages: ChatMessage[], context?: AIContext): OllamaChatMessage[] {
    const ollamaMessages: OllamaChatMessage[] = []

    let systemContent =
      context?.systemPrompt ||
      'You are a helpful coding assistant. Provide clear, well-documented code solutions.'

    if (context?.documentContent) {
      systemContent += `\n\nContext from the current code:\n\`\`\`\n${context.documentContent.slice(0, 4000)}\n\`\`\``
    }

    ollamaMessages.push({ role: 'system', content: systemContent })

    for (const msg of messages) {
      // Skip messages with null or empty content to avoid API errors
      if (msg.content == null || msg.content === '') continue
      ollamaMessages.push({
        role: msg.role,
        content: msg.content,
      })
    }

    // Validate that we have messages to send (at least system message)
    if (ollamaMessages.length === 0) {
      throw new Error('No valid messages to send to API')
    }

    return ollamaMessages
  }
}

// ============================================================================
// Factory Function
// ============================================================================

let defaultProvider: OllamaCloudProvider | null = null

export function createOllamaCloudProvider(config: OllamaCloudConfig): OllamaCloudProvider {
  return new OllamaCloudProvider(config)
}

export function getDefaultOllamaCloudProvider(): OllamaCloudProvider {
  if (!defaultProvider) {
    const baseURL = process.env.OLLAMA_CLOUD_URL || OLLAMA_CLOUD_URL
    const apiKey = process.env.OLLAMA_API_KEY
    defaultProvider = new OllamaCloudProvider({ baseURL, apiKey })
  }
  return defaultProvider
}
