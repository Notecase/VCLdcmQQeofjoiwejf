/**
 * Chat Agent
 *
 * Conversational AI agent with RAG (Retrieval-Augmented Generation).
 * Uses GPT-5.2 via OpenAI provider with document context and citations.
 *
 * Compatible with:
 * - Vercel AI SDK for streaming
 * - Hono for API routing
 * - LangGraph for state management
 */

import { z } from 'zod'
import { SupabaseClient } from '@supabase/supabase-js'

// ============================================================================
// Types
// ============================================================================

export interface ChatAgentConfig {
  supabase: SupabaseClient
  userId: string
  openaiApiKey: string
  model?: string
}

export interface ChatMessage {
  id?: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt?: Date
}

export interface RetrievedChunk {
  noteId: string
  noteTitle: string
  chunkText: string
  similarity: number
}

export interface Citation {
  number: number
  noteId: string
  title: string
  snippet: string
}

export interface ChatAgentState {
  messages: ChatMessage[]
  context?: {
    documentContent?: string
    documentTitle?: string
    noteIds?: string[]
  }
  retrievedChunks: RetrievedChunk[]
  citations: Citation[]
  sessionId?: string
}

export interface ChatAgentResponse {
  content: string
  citations: Citation[]
  usage?: {
    inputTokens: number
    outputTokens: number
  }
}

// ============================================================================
// Input Schema
// ============================================================================

export const ChatAgentInputSchema = z.object({
  message: z.string().min(1).max(10000),
  context: z
    .object({
      noteIds: z.array(z.string().uuid()).optional(),
      projectId: z.string().uuid().optional(),
      currentNoteId: z.string().uuid().optional(),
    })
    .optional(),
  sessionId: z.string().uuid().optional(),
  includeRag: z.boolean().optional().default(true),
  maxChunks: z.number().int().min(1).max(10).optional().default(5),
})

export type ChatAgentInput = z.infer<typeof ChatAgentInputSchema>

// ============================================================================
// Chat Agent Class
// ============================================================================

export class ChatAgent {
  private supabase: SupabaseClient
  private userId: string
  private openaiApiKey: string
  private model: string
  private state: ChatAgentState

  constructor(config: ChatAgentConfig) {
    this.supabase = config.supabase
    this.userId = config.userId
    this.openaiApiKey = config.openaiApiKey
    this.model = config.model ?? 'gpt-5.2'
    this.state = {
      messages: [],
      retrievedChunks: [],
      citations: [],
    }
  }

  /**
   * Run the chat agent (non-streaming)
   */
  async run(input: ChatAgentInput): Promise<ChatAgentResponse> {
    // 1. Perform RAG if enabled
    if (input.includeRag) {
      await this.retrieveContext(input.message, input.context?.noteIds, input.maxChunks)
    }

    // 2. Add user message
    this.state.messages.push({
      role: 'user',
      content: input.message,
      createdAt: new Date(),
    })

    // 3. Generate response
    const response = await this.generateResponse()

    // 4. Add assistant message
    this.state.messages.push({
      role: 'assistant',
      content: response.content,
      createdAt: new Date(),
    })

    return response
  }

  /**
   * Stream the chat agent response
   * Returns an async generator for compatibility with Vercel AI SDK
   */
  async *stream(input: ChatAgentInput): AsyncGenerator<{
    type: 'text-delta' | 'citation' | 'thinking' | 'finish'
    data: string | Citation | { reason: string }
  }> {
    // 1. Emit thinking step
    yield { type: 'thinking', data: 'Searching relevant notes...' }

    // 2. Perform RAG if enabled
    if (input.includeRag) {
      await this.retrieveContext(input.message, input.context?.noteIds, input.maxChunks)

      // Emit citations found
      for (const citation of this.state.citations) {
        yield { type: 'citation', data: citation }
      }
    }

    // 3. Add user message
    this.state.messages.push({
      role: 'user',
      content: input.message,
      createdAt: new Date(),
    })

    yield { type: 'thinking', data: 'Generating response...' }

    // 4. Stream response
    const OpenAI = (await import('openai')).default
    const client = new OpenAI({ apiKey: this.openaiApiKey })

    const systemPrompt = this.buildSystemPrompt()
    const messages = this.buildOpenAIMessages(systemPrompt)

    const stream = await client.chat.completions.create({
      model: this.model,
      messages,
      temperature: 0.7,
      max_tokens: 4000,
      stream: true,
    })

    let fullContent = ''

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content
      if (delta) {
        fullContent += delta
        yield { type: 'text-delta', data: delta }
      }
    }

    // 5. Add assistant message to state
    this.state.messages.push({
      role: 'assistant',
      content: fullContent,
      createdAt: new Date(),
    })

    yield { type: 'finish', data: { reason: 'stop' } }
  }

  /**
   * Get current state
   */
  getState(): ChatAgentState {
    return { ...this.state }
  }

  /**
   * Load state from session
   */
  async loadSession(sessionId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('agent_sessions')
      .select('state')
      .eq('id', sessionId)
      .eq('user_id', this.userId)
      .eq('agent_type', 'chat')
      .single()

    if (error || !data) return false

    this.state = data.state as ChatAgentState
    this.state.sessionId = sessionId
    return true
  }

  /**
   * Save state to session
   */
  async saveSession(): Promise<string> {
    const sessionId = this.state.sessionId || crypto.randomUUID()

    await this.supabase.from('agent_sessions').upsert({
      id: sessionId,
      user_id: this.userId,
      agent_type: 'chat',
      state: this.state,
      is_active: true,
    })

    this.state.sessionId = sessionId
    return sessionId
  }

  // =========================================================================
  // Private Methods
  // =========================================================================

  private async retrieveContext(query: string, noteIds?: string[], maxChunks = 5): Promise<void> {
    // Generate embedding for query
    const OpenAI = (await import('openai')).default
    const client = new OpenAI({ apiKey: this.openaiApiKey })

    const embeddingResponse = await client.embeddings.create({
      model: 'text-embedding-3-large',
      input: query,
      dimensions: 1536,
    })

    const queryEmbedding = embeddingResponse.data[0].embedding

    // Search for similar chunks
    let searchQuery = this.supabase.rpc('search_embeddings', {
      query_embedding: queryEmbedding,
      match_threshold: 0.7,
      match_count: maxChunks,
      p_user_id: this.userId,
    })

    // Filter by specific notes if provided
    if (noteIds && noteIds.length > 0) {
      // Note: This filtering would need to be done post-query or with a modified RPC
      // For now, we'll filter after
    }

    const { data: chunks, error } = await searchQuery

    if (error || !chunks) {
      this.state.retrievedChunks = []
      this.state.citations = []
      return
    }

    // Map to our types
    this.state.retrievedChunks = (
      chunks as Array<{
        note_id: string
        note_title: string
        chunk_text: string
        similarity: number
      }>
    ).map((chunk) => ({
      noteId: chunk.note_id,
      noteTitle: chunk.note_title,
      chunkText: chunk.chunk_text,
      similarity: chunk.similarity,
    }))

    // Create citations
    this.state.citations = this.state.retrievedChunks.map((chunk, i) => ({
      number: i + 1,
      noteId: chunk.noteId,
      title: chunk.noteTitle,
      snippet: chunk.chunkText.slice(0, 150) + '...',
    }))
  }

  private buildSystemPrompt(): string {
    let prompt = `You are an AI assistant helping users with their notes and documents.
Be helpful, accurate, and concise. When you use information from the provided context,
cite it using [1], [2], etc. to reference the source.`

    if (this.state.retrievedChunks.length > 0) {
      prompt += "\n\n## Relevant Context from User's Notes:\n\n"

      for (let i = 0; i < this.state.retrievedChunks.length; i++) {
        const chunk = this.state.retrievedChunks[i]
        prompt += `[${i + 1}] From "${chunk.noteTitle}":\n${chunk.chunkText}\n\n`
      }
    }

    return prompt
  }

  private buildOpenAIMessages(systemPrompt: string): Array<{
    role: 'system' | 'user' | 'assistant'
    content: string
  }> {
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
    ]

    for (const msg of this.state.messages) {
      messages.push({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })
    }

    return messages
  }

  private async generateResponse(): Promise<ChatAgentResponse> {
    const OpenAI = (await import('openai')).default
    const client = new OpenAI({ apiKey: this.openaiApiKey })

    const systemPrompt = this.buildSystemPrompt()
    const messages = this.buildOpenAIMessages(systemPrompt)

    const response = await client.chat.completions.create({
      model: this.model,
      messages,
      temperature: 0.7,
      max_tokens: 4000,
    })

    return {
      content: response.choices[0]?.message?.content || '',
      citations: this.state.citations,
      usage: response.usage
        ? {
            inputTokens: response.usage.prompt_tokens,
            outputTokens: response.usage.completion_tokens,
          }
        : undefined,
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createChatAgent(config: ChatAgentConfig): ChatAgent {
  return new ChatAgent(config)
}
