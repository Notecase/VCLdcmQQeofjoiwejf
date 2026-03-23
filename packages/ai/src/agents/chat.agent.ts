/**
 * Chat Agent
 *
 * Conversational AI agent with RAG (Retrieval-Augmented Generation).
 * Uses AI SDK v6 with document context and citations.
 */

import { z } from 'zod'
import { SupabaseClient } from '@supabase/supabase-js'
import { streamText, generateText, embed } from 'ai'
import { selectModel } from '../providers/model-registry'
import {
  resolveModelsForTask,
  isTransientError,
  getEmbeddingModel,
} from '../providers/ai-sdk-factory'
import { trackAISDKUsage, recordAISDKUsage } from '../providers/ai-sdk-usage'

// ============================================================================
// Types
// ============================================================================

import type { SharedContextService } from '../services/shared-context.service'

export interface ChatAgentConfig {
  supabase: SupabaseClient
  userId: string
  model?: string
  sharedContextService?: SharedContextService
}

export interface ChatAgentMessage {
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
  messages: ChatAgentMessage[]
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
  private model: string
  private state: ChatAgentState
  private sharedContextService?: SharedContextService

  constructor(config: ChatAgentConfig) {
    this.supabase = config.supabase
    this.userId = config.userId
    this.model = config.model ?? selectModel('chat').id
    this.sharedContextService = config.sharedContextService
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

      yield {
        type: 'thinking',
        data:
          this.state.citations.length > 0
            ? `Found ${this.state.citations.length} relevant source${this.state.citations.length > 1 ? 's' : ''} from your notes`
            : 'No matching notes found — answering from general knowledge',
      }
    }

    // 3. Add user message
    this.state.messages.push({
      role: 'user',
      content: input.message,
      createdAt: new Date(),
    })

    yield { type: 'thinking', data: 'Composing response...' }

    // 4. Stream response
    let systemPrompt = this.buildSystemPrompt()
    if (this.sharedContextService) {
      const sharedCtx = await this.sharedContextService.read({
        relevantTypes: ['active_plan', 'soul_updated', 'research_done'],
      })
      if (sharedCtx) systemPrompt += '\n\n' + sharedCtx
    }

    const { primary, fallback } = resolveModelsForTask('chat', this.model)
    const chatMessages = this.buildChatMessages()

    let fullContent = ''
    for (const modelOption of [primary, fallback]) {
      if (!modelOption) continue

      try {
        const result = streamText({
          model: modelOption.model,
          system: systemPrompt,
          messages: chatMessages,
          temperature: 0.7,
          maxOutputTokens: 4000,
          onFinish: trackAISDKUsage({ model: modelOption.entry.id, taskType: 'chat' }),
        })

        for await (const chunk of result.textStream) {
          fullContent += chunk
          yield { type: 'text-delta', data: chunk }
        }

        // 5. Add assistant message to state
        this.state.messages.push({
          role: 'assistant',
          content: fullContent,
          createdAt: new Date(),
        })

        yield { type: 'finish', data: { reason: 'stop' } }
        return
      } catch (err) {
        if (isTransientError(err) && modelOption === primary && fallback) {
          console.warn(
            `[ChatAgent] ${modelOption.entry.id} unavailable, falling back to ${fallback.entry.id}`
          )
          continue
        }
        throw err
      }
    }
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
    // Generate embedding for query using AI SDK
    const { embedding: queryEmbedding } = await embed({
      model: getEmbeddingModel(),
      value: query,
    })

    // Search for similar chunks
    const searchQuery = this.supabase.rpc('search_embeddings', {
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

  private buildChatMessages(): Array<{ role: 'user' | 'assistant'; content: string }> {
    return this.state.messages
      .filter((m) => m.role !== 'system' && m.content != null && m.content !== '')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))
  }

  private async generateResponse(): Promise<ChatAgentResponse> {
    let systemPrompt = this.buildSystemPrompt()
    if (this.sharedContextService) {
      const sharedCtx = await this.sharedContextService.read({
        relevantTypes: ['active_plan', 'soul_updated', 'research_done'],
      })
      if (sharedCtx) systemPrompt += '\n\n' + sharedCtx
    }

    const { primary, fallback } = resolveModelsForTask('chat', this.model)

    for (const modelOption of [primary, fallback]) {
      if (!modelOption) continue

      try {
        const startTime = Date.now()
        const result = await generateText({
          model: modelOption.model,
          system: systemPrompt,
          messages: this.buildChatMessages(),
          temperature: 0.7,
          maxOutputTokens: 4000,
        })
        recordAISDKUsage(result.usage, { model: modelOption.entry.id, taskType: 'chat' }, startTime)

        return {
          content: result.text,
          citations: this.state.citations,
          usage: result.usage
            ? {
                inputTokens: result.usage.inputTokens ?? 0,
                outputTokens: result.usage.outputTokens ?? 0,
              }
            : undefined,
        }
      } catch (err) {
        if (isTransientError(err) && modelOption === primary && fallback) {
          console.warn(
            `[ChatAgent] ${modelOption.entry.id} unavailable, falling back to ${fallback.entry.id}`
          )
          continue
        }
        throw err
      }
    }

    // Should not reach here, but satisfy TypeScript
    throw new Error('[ChatAgent] All models unavailable')
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createChatAgent(config: ChatAgentConfig): ChatAgent {
  return new ChatAgent(config)
}
