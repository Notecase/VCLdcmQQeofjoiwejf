/**
 * OpenAI Provider
 *
 * Provider for embeddings (text-embedding-3-large).
 * Also used as a base class for Gemini-via-OpenAI-compat endpoint.
 */

import OpenAI from 'openai'
import { AIProvider, AIContext, AICompletionOptions, ChatMessage, AIUsage } from './interface'
import { trackOpenAIStream, trackOpenAIResponse } from './token-tracker'

// ============================================================================
// Configuration
// ============================================================================

export interface OpenAIProviderConfig {
  apiKey: string
  model?: string // Default: gemini-3.1-pro-preview (via compat endpoint)
  embeddingModel?: string // Default: text-embedding-3-large
  baseURL?: string
  organization?: string
  maxRetries?: number
}

// Default models - migrated to Gemini 3.1 Pro Preview
export const DEFAULT_CHAT_MODEL = 'gemini-3.1-pro-preview'
export const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-large'
export const EMBEDDING_DIMENSIONS = 1536 // Reduced from 3072 for Supabase pgvector

// ============================================================================
// OpenAI Provider Implementation
// ============================================================================

export class OpenAIProvider implements AIProvider {
  private client: OpenAI
  private model: string
  private embeddingModel: string
  private lastUsage: AIUsage | null = null

  constructor(config: OpenAIProviderConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      organization: config.organization,
      maxRetries: config.maxRetries ?? 3,
    })
    this.model = config.model ?? DEFAULT_CHAT_MODEL
    this.embeddingModel = config.embeddingModel ?? DEFAULT_EMBEDDING_MODEL
  }

  /**
   * Get the underlying OpenAI client for advanced use cases
   */
  getClient(): OpenAI {
    return this.client
  }

  /**
   * Stream completion for inline editing
   */
  async *complete(
    context: AIContext,
    options?: AICompletionOptions
  ): AsyncGenerator<string, void, unknown> {
    const messages = this.buildCompletionMessages(context)

    const rawStream = await this.client.chat.completions.create({
      model: this.model,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_completion_tokens: options?.maxTokens ?? 1000,
      stop: options?.stopSequences,
      stream: true,
      stream_options: { include_usage: true },
    })

    let inputTokens = 0
    let outputTokens = 0

    for await (const chunk of trackOpenAIStream(rawStream, {
      model: this.model,
      taskType: 'completion',
    })) {
      const content = chunk.choices[0]?.delta?.content
      if (content) {
        yield content
      }

      // Track usage from final chunk (don't manually count - chunks ≠ tokens)
      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens
        outputTokens = chunk.usage.completion_tokens
      }
    }

    this.lastUsage = {
      inputTokens,
      outputTokens,
      model: this.model,
      actionType: 'complete',
    }
  }

  /**
   * Stream rewrite of selected text
   */
  async *rewrite(
    text: string,
    instruction: string,
    _context?: AIContext
  ): AsyncGenerator<string, void, unknown> {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `You are a writing assistant. Rewrite the following text according to the user's instruction.
Only output the rewritten text, nothing else. Maintain the original format and style unless instructed otherwise.`,
      },
      {
        role: 'user',
        content: `Instruction: ${instruction}\n\nText to rewrite:\n${text}`,
      },
    ]

    const rawStream = await this.client.chat.completions.create({
      model: this.model,
      messages,
      temperature: 0.7,
      max_completion_tokens: 2000,
      stream: true,
      stream_options: { include_usage: true },
    })

    for await (const chunk of trackOpenAIStream(rawStream, {
      model: this.model,
      taskType: 'rewrite',
    })) {
      const content = chunk.choices[0]?.delta?.content
      if (content) {
        yield content
      }
    }

    this.lastUsage = {
      inputTokens: 0,
      outputTokens: 0,
      model: this.model,
      actionType: 'rewrite',
    }
  }

  /**
   * Stream chat with optional document context
   */
  async *chat(messages: ChatMessage[], context?: AIContext): AsyncGenerator<string, void, unknown> {
    const openAIMessages = this.buildChatMessages(messages, context)

    const rawStream = await this.client.chat.completions.create({
      model: this.model,
      messages: openAIMessages,
      temperature: 0.7,
      max_completion_tokens: 16000, // Increased for longer recommendation outputs
      stream: true,
      stream_options: { include_usage: true },
    })

    let inputTokens = 0
    let outputTokens = 0

    for await (const chunk of trackOpenAIStream(rawStream, {
      model: this.model,
      taskType: 'chat',
    })) {
      const content = chunk.choices[0]?.delta?.content
      if (content) {
        yield content
      }

      // Track usage from final chunk (don't manually count - chunks ≠ tokens)
      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens
        outputTokens = chunk.usage.completion_tokens
      }
    }

    this.lastUsage = {
      inputTokens,
      outputTokens,
      model: this.model,
      actionType: 'chat',
    }
  }

  /**
   * Stream summarization
   */
  async *summarize(text: string): AsyncGenerator<string, void, unknown> {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content:
          'You are a summarization assistant. Provide a clear, concise summary of the given text. Focus on key points and main ideas.',
      },
      {
        role: 'user',
        content: `Please summarize the following text:\n\n${text}`,
      },
    ]

    const rawStream = await this.client.chat.completions.create({
      model: this.model,
      messages,
      temperature: 0.5,
      max_completion_tokens: 1000,
      stream: true,
      stream_options: { include_usage: true },
    })

    for await (const chunk of trackOpenAIStream(rawStream, {
      model: this.model,
      taskType: 'summarize',
    })) {
      const content = chunk.choices[0]?.delta?.content
      if (content) {
        yield content
      }
    }

    this.lastUsage = {
      inputTokens: 0,
      outputTokens: 0,
      model: this.model,
      actionType: 'summarize',
    }
  }

  /**
   * Chat with tool calling support (for agents)
   */
  async chatWithTools(
    messages: OpenAI.ChatCompletionMessageParam[],
    tools: OpenAI.ChatCompletionTool[],
    options?: {
      temperature?: number
      maxTokens?: number
      toolChoice?: OpenAI.ChatCompletionToolChoiceOption
    }
  ): Promise<OpenAI.ChatCompletion> {
    const startTime = Date.now()
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      tool_choice: tools.length > 0 ? (options?.toolChoice ?? 'auto') : undefined,
      temperature: options?.temperature ?? 0.7,
      max_completion_tokens: options?.maxTokens ?? 16000,
    })

    trackOpenAIResponse(response, { model: this.model, taskType: 'chat', startTime })

    this.lastUsage = {
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
      model: this.model,
      actionType: 'agent',
    }

    return response
  }

  /**
   * Stream chat with tool calling (for agents with streaming)
   */
  async *streamChatWithTools(
    messages: OpenAI.ChatCompletionMessageParam[],
    tools: OpenAI.ChatCompletionTool[],
    options?: {
      temperature?: number
      maxTokens?: number
    }
  ): AsyncGenerator<OpenAI.ChatCompletionChunk, void, unknown> {
    const rawStream = await this.client.chat.completions.create({
      model: this.model,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      tool_choice: tools.length > 0 ? 'auto' : undefined,
      temperature: options?.temperature ?? 0.7,
      max_completion_tokens: options?.maxTokens ?? 16000,
      stream: true,
      stream_options: { include_usage: true },
    })

    for await (const chunk of trackOpenAIStream(rawStream, {
      model: this.model,
      taskType: 'chat',
    })) {
      yield chunk
    }
  }

  /**
   * Generate embeddings for text
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: this.embeddingModel,
      input: text,
      dimensions: EMBEDDING_DIMENSIONS,
    })

    this.lastUsage = {
      inputTokens: response.usage.prompt_tokens,
      outputTokens: 0,
      model: this.embeddingModel,
      actionType: 'embed',
    }

    return response.data[0].embedding
  }

  /**
   * Generate embeddings for multiple texts (batch)
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    const response = await this.client.embeddings.create({
      model: this.embeddingModel,
      input: texts,
      dimensions: EMBEDDING_DIMENSIONS,
    })

    this.lastUsage = {
      inputTokens: response.usage.prompt_tokens,
      outputTokens: 0,
      model: this.embeddingModel,
      actionType: 'embed',
    }

    return response.data.map((d) => d.embedding)
  }

  /**
   * Get last operation's usage
   */
  getUsage(): AIUsage | null {
    return this.lastUsage
  }

  // =========================================================================
  // Private Helpers
  // =========================================================================

  private buildCompletionMessages(context: AIContext): OpenAI.ChatCompletionMessageParam[] {
    const messages: OpenAI.ChatCompletionMessageParam[] = []

    // System prompt
    const systemPrompt =
      context.systemPrompt ||
      'You are a helpful writing assistant. Continue the text naturally and coherently.'
    messages.push({ role: 'system', content: systemPrompt })

    // Build context message
    let contextContent = ''

    if (context.textBeforeCursor) {
      contextContent += `Text before cursor:\n${context.textBeforeCursor}\n\n`
    }

    if (context.selectedText) {
      contextContent += `Selected text:\n${context.selectedText}\n\n`
      contextContent += 'Please continue from or complete this selection.'
    } else {
      contextContent += 'Please continue writing from this point.'
    }

    messages.push({ role: 'user', content: contextContent })

    return messages
  }

  private buildChatMessages(
    messages: ChatMessage[],
    context?: AIContext
  ): OpenAI.ChatCompletionMessageParam[] {
    const openAIMessages: OpenAI.ChatCompletionMessageParam[] = []

    // System prompt with optional document context
    let systemContent =
      context?.systemPrompt || 'You are a helpful AI assistant for note-taking and writing.'

    if (context?.documentContent) {
      systemContent += `\n\nContext from the current document:\n"""
${context.documentTitle ? `Title: ${context.documentTitle}\n` : ''}
${context.documentContent.slice(0, 8000)}
"""`
    }

    openAIMessages.push({ role: 'system', content: systemContent })

    // Add conversation messages, filtering out null/empty content
    for (const msg of messages) {
      // Skip messages with null or empty content to avoid API errors
      if (msg.content == null || msg.content === '') continue
      openAIMessages.push({
        role: msg.role,
        content: msg.content,
      })
    }

    // Validate that we have messages to send (at least system message)
    if (openAIMessages.length === 0) {
      throw new Error('No valid messages to send to API')
    }

    return openAIMessages
  }
}

// ============================================================================
// Factory Function
// ============================================================================

let defaultProvider: OpenAIProvider | null = null

export function createOpenAIProvider(config: OpenAIProviderConfig): OpenAIProvider {
  return new OpenAIProvider(config)
}

export function getDefaultOpenAIProvider(): OpenAIProvider {
  if (!defaultProvider) {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required')
    }
    defaultProvider = new OpenAIProvider({ apiKey })
  }
  return defaultProvider
}
