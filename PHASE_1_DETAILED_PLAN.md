# Phase 1: AI Provider Foundation - Detailed Implementation Plan

> **Status**: Ready to implement
> **Duration**: 1-2 weeks
> **Priority**: Critical - Foundation for all AI features
> **Dependencies**: Phase 0 (Infrastructure) completed

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Implementation Order](#implementation-order)
4. [Step-by-Step Instructions](#step-by-step-instructions)
5. [Testing Strategy](#testing-strategy)
6. [Cost Considerations](#cost-considerations)
7. [Common Issues & Solutions](#common-issues--solutions)

---

## Overview

### Goals

Phase 1 establishes the AI provider foundation for Inkdown:

1. **OpenAI Provider** (Primary - General purpose)
   - Chat completions for general conversation
   - Embeddings for semantic search and RAG
   - Function calling for agent tool use
   - Streaming for real-time responses

2. **Gemini Provider** (Specialized tasks)
   - Slides generation (structured content)
   - Deep research (1M token context)
   - Course generation (curriculum creation)
   - Long-form content generation

3. **Provider Factory** (Intelligent routing)
   - Task-based provider selection
   - Model optimization
   - Fallback handling
   - Cost tracking

### Provider Strategy

| Use Case | Provider | Model | Why |
|----------|----------|-------|-----|
| **General Chat** | OpenAI | GPT-4o | Fast, reliable, excellent tool use |
| **Note Operations** | OpenAI | GPT-4o | Precise function calling |
| **Planning** | OpenAI | GPT-4o | Structured thinking |
| **Embeddings** | OpenAI | text-embedding-3-large | Industry standard, 1536 dims |
| **Slides Generation** | Gemini | Pro/Flash | Structured output, creative |
| **Deep Research** | Gemini | Pro | 1M token context window |
| **Course Generation** | Gemini | Pro | Long-form educational content |

---

## Prerequisites

### 1. API Keys Required

Get these API keys before starting:

```bash
# OpenAI (REQUIRED)
# Get from: https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-...

# Google AI (REQUIRED)
# Get from: https://aistudio.google.com/app/apikey
GOOGLE_AI_API_KEY=...

# Anthropic (OPTIONAL - for fallback)
# Get from: https://console.anthropic.com/
ANTHROPIC_API_KEY=sk-ant-...
```

### 2. Environment Setup

Verify Phase 0 infrastructure is complete:

```bash
# Check API backend exists
ls apps/api/src/

# Check packages installed
cd apps/api && npm list ai @ai-sdk/openai @ai-sdk/google

# Check database migration
# Migration 005_ai_features.sql should be applied
supabase migration list
```

### 3. Cost Planning

**OpenAI Costs** (per 1M tokens):
- GPT-4o: $2.50 input / $10 output
- text-embedding-3-large: $0.13

**Gemini Costs** (per 1M tokens):
- Gemini 2.0 Flash: $0.075 input / $0.30 output
- Gemini Pro: $1.25 input / $5 output

**MVP Budget** (~1000 users, 10 requests/day):
- OpenAI: ~$100-200/month
- Gemini: ~$50-100/month
- **Total: ~$150-300/month**

---

## Implementation Order

### Week 1: OpenAI Foundation

**Day 1-2**: OpenAI Provider Basic Implementation
- ✅ Chat completions with streaming
- ✅ Basic error handling
- ✅ Test with simple prompts

**Day 3-4**: Embeddings Service
- ✅ Embedding generation
- ✅ Batch processing
- ✅ Database integration

**Day 5**: API Routes
- ✅ POST /api/chat endpoint
- ✅ POST /api/embed endpoint
- ✅ Authentication middleware

### Week 2: Gemini + Factory

**Day 6-7**: Gemini Provider
- ✅ Basic chat with Gemini Pro
- ✅ Structured output (JSON mode)
- ✅ Long context handling

**Day 8-9**: Provider Factory
- ✅ Task-based routing
- ✅ Model selection logic
- ✅ Fallback handling

**Day 10**: Testing & Refinement
- ✅ Integration tests
- ✅ Cost tracking verification
- ✅ Performance optimization

---

## Step-by-Step Instructions

## Step 1.1: OpenAI Provider Implementation

### 1.1.1: Create OpenAI Provider Class

**File**: `packages/ai/src/providers/openai.ts`

```typescript
import { OpenAI } from 'openai'
import { openai } from '@ai-sdk/openai'
import { streamText, generateText } from 'ai'
import type {
  AIProvider,
  AIContext,
  ChatMessage,
  AICompletionOptions,
  AIUsage,
} from './interface'

export interface OpenAIProviderConfig {
  apiKey: string
  model?: string
  embeddingModel?: string
  organization?: string
  baseURL?: string
}

export class OpenAIProvider implements AIProvider {
  private client: OpenAI
  private model: string
  private embeddingModel: string
  private lastUsage: AIUsage | null = null

  constructor(config: OpenAIProviderConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      organization: config.organization,
      baseURL: config.baseURL,
    })

    this.model = config.model || 'gpt-4o'
    this.embeddingModel = config.embeddingModel || 'text-embedding-3-large'
  }

  // =================================================================
  // Chat with Streaming
  // =================================================================

  async *chat(
    messages: ChatMessage[],
    context?: AIContext,
    options?: AICompletionOptions
  ): AsyncGenerator<string, void, unknown> {
    try {
      // Build system message with context
      const systemMessage = this.buildSystemMessage(context)

      // Convert to OpenAI format
      const openaiMessages = [
        ...(systemMessage ? [{ role: 'system' as const, content: systemMessage }] : []),
        ...messages.map(m => ({
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content,
        })),
      ]

      // Use Vercel AI SDK for streaming
      const result = await streamText({
        model: openai(this.model),
        messages: openaiMessages,
        temperature: options?.temperature ?? 0.7,
        maxTokens: options?.maxTokens ?? 4000,
      })

      // Stream tokens
      for await (const chunk of result.textStream) {
        yield chunk
      }

      // Track usage
      const usage = await result.usage
      this.lastUsage = {
        inputTokens: usage.promptTokens,
        outputTokens: usage.completionTokens,
        model: this.model,
        actionType: 'chat',
        costCents: this.calculateCost(usage.promptTokens, usage.completionTokens),
      }
    } catch (error) {
      console.error('OpenAI chat error:', error)
      throw new Error(`OpenAI chat failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // =================================================================
  // Text Completion (for inline suggestions)
  // =================================================================

  async *complete(
    context: AIContext,
    options?: AICompletionOptions
  ): AsyncGenerator<string, void, unknown> {
    try {
      const prompt = this.buildCompletionPrompt(context)

      const result = await streamText({
        model: openai(this.model),
        prompt,
        temperature: options?.temperature ?? 0.7,
        maxTokens: options?.maxTokens ?? 500,
      })

      for await (const chunk of result.textStream) {
        yield chunk
      }

      const usage = await result.usage
      this.lastUsage = {
        inputTokens: usage.promptTokens,
        outputTokens: usage.completionTokens,
        model: this.model,
        actionType: 'complete',
        costCents: this.calculateCost(usage.promptTokens, usage.completionTokens),
      }
    } catch (error) {
      console.error('OpenAI completion error:', error)
      throw new Error(`OpenAI completion failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // =================================================================
  // Rewrite Text
  // =================================================================

  async *rewrite(
    text: string,
    instruction: string,
    context?: AIContext
  ): AsyncGenerator<string, void, unknown> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: 'You are a helpful writing assistant. Rewrite the given text according to the instruction.',
      },
      {
        role: 'user',
        content: `Instruction: ${instruction}\n\nOriginal text:\n${text}\n\nRewritten text:`,
      },
    ]

    yield* this.chat(messages, context)
  }

  // =================================================================
  // Summarize
  // =================================================================

  async *summarize(text: string): AsyncGenerator<string, void, unknown> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: 'You are a helpful assistant that creates concise summaries.',
      },
      {
        role: 'user',
        content: `Summarize the following text:\n\n${text}`,
      },
    ]

    yield* this.chat(messages)
  }

  // =================================================================
  // Embeddings
  // =================================================================

  /**
   * Generate embeddings for one or more texts
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      const response = await this.client.embeddings.create({
        model: this.embeddingModel,
        input: texts,
        encoding_format: 'float',
      })

      // Track usage
      this.lastUsage = {
        inputTokens: response.usage.total_tokens,
        outputTokens: 0,
        model: this.embeddingModel,
        actionType: 'embed',
        costCents: (response.usage.total_tokens / 1000000) * 13, // $0.13 per 1M tokens
      }

      return response.data.map(d => d.embedding)
    } catch (error) {
      console.error('OpenAI embedding error:', error)
      throw new Error(`OpenAI embedding failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Generate single embedding
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const [embedding] = await this.generateEmbeddings([text])
    return embedding
  }

  // =================================================================
  // Usage Tracking
  // =================================================================

  getUsage(): AIUsage | null {
    return this.lastUsage
  }

  // =================================================================
  // Helper Methods
  // =================================================================

  private buildSystemMessage(context?: AIContext): string | null {
    if (!context) return null

    const parts: string[] = []

    if (context.systemPrompt) {
      parts.push(context.systemPrompt)
    }

    if (context.documentContent) {
      parts.push('Current document:')
      parts.push(context.documentContent)
    }

    if (context.selectedText) {
      parts.push(`\nSelected text: "${context.selectedText}"`)
    }

    return parts.length > 0 ? parts.join('\n\n') : null
  }

  private buildCompletionPrompt(context: AIContext): string {
    const parts: string[] = []

    if (context.textBeforeCursor) {
      parts.push('Text before cursor:')
      parts.push(context.textBeforeCursor)
    }

    if (context.textAfterCursor) {
      parts.push('\nText after cursor:')
      parts.push(context.textAfterCursor)
    }

    parts.push('\nContinue writing:')

    return parts.join('\n')
  }

  private calculateCost(inputTokens: number, outputTokens: number): number {
    // GPT-4o pricing: $2.50 per 1M input, $10 per 1M output
    const inputCost = (inputTokens / 1000000) * 2.50
    const outputCost = (outputTokens / 1000000) * 10.00
    return (inputCost + outputCost) * 100 // Convert to cents
  }
}
```

### 1.1.2: Export OpenAI Provider

**File**: `packages/ai/src/providers/index.ts`

```typescript
/**
 * AI Provider exports
 */

// Types
export type {
  AIContext,
  ChatMessage,
  AICompletionOptions,
  AIActionType,
  AIUsage,
  AIProvider,
} from './interface'

// Providers
export { OpenAIProvider } from './openai'
export type { OpenAIProviderConfig } from './openai'

// To be implemented:
// export { GeminiProvider } from './gemini'
// export { createProvider } from './factory'
```

### 1.1.3: Add OpenAI Chat Route

**File**: `apps/api/src/routes/chat.ts`

```typescript
import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { streamText } from 'ai'
import { openai } from '@ai-sdk/openai'
import { config } from '../config'
import { requireAuth } from '../middleware/auth'
import { createClient } from '../lib/supabase'

const chat = new Hono()

// Request schema
const ChatRequestSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant', 'system']),
      content: z.string(),
    })
  ),
  sessionId: z.string().optional(),
  noteIds: z.array(z.string()).optional(),
  projectId: z.string().optional(),
  model: z.string().optional(),
})

// =============================================================================
// POST /api/chat - Stream chat responses
// =============================================================================

chat.post(
  '/',
  requireAuth,
  zValidator('json', ChatRequestSchema),
  async (c) => {
    const userId = c.get('userId')
    const body = c.req.valid('json')

    try {
      const supabase = createClient(c.env?.SUPABASE_URL, c.env?.SUPABASE_SERVICE_KEY)

      // Get context from notes if provided
      let context = ''
      if (body.noteIds && body.noteIds.length > 0) {
        const { data: notes } = await supabase
          .from('notes')
          .select('title, content')
          .in('id', body.noteIds)
          .eq('user_id', userId)

        if (notes && notes.length > 0) {
          context = notes
            .map(n => `# ${n.title}\n\n${n.content}`)
            .join('\n\n---\n\n')
        }
      }

      // Add context to system message
      const messages = [...body.messages]
      if (context && messages[0]?.role !== 'system') {
        messages.unshift({
          role: 'system',
          content: `You are a helpful AI assistant for Inkdown, a note-taking app. Here is the user's note context:\n\n${context}`,
        })
      }

      // Create streaming response using Vercel AI SDK
      const result = await streamText({
        model: openai(body.model || config.ai.defaultChatModel),
        messages,
        temperature: 0.7,
        maxTokens: 4000,
      })

      // Track usage in background (don't await)
      result.usage.then(async (usage) => {
        await supabase.from('ai_usage').insert({
          user_id: userId,
          provider: 'openai',
          model: body.model || config.ai.defaultChatModel,
          action_type: 'chat',
          input_tokens: usage.promptTokens,
          output_tokens: usage.completionTokens,
          cost_cents: ((usage.promptTokens / 1000000) * 2.5 + (usage.completionTokens / 1000000) * 10) * 100,
          session_id: body.sessionId,
          project_id: body.projectId,
          success: true,
        })
      }).catch(err => console.error('Failed to track usage:', err))

      // Return streaming response
      return result.toTextStreamResponse()
    } catch (error) {
      console.error('Chat error:', error)

      // Track error
      const supabase = createClient(c.env?.SUPABASE_URL, c.env?.SUPABASE_SERVICE_KEY)
      await supabase.from('ai_usage').insert({
        user_id: userId,
        provider: 'openai',
        model: body.model || config.ai.defaultChatModel,
        action_type: 'chat',
        input_tokens: 0,
        output_tokens: 0,
        success: false,
        error_code: 'internal_error',
        error_message: error instanceof Error ? error.message : 'Unknown error',
      }).catch(err => console.error('Failed to track error:', err))

      return c.json(
        {
          error: 'Chat request failed',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        500
      )
    }
  }
)

export default chat
```

---

## Step 1.2: Gemini Provider Implementation

### 1.2.1: Create Gemini Provider Class

**File**: `packages/ai/src/providers/gemini.ts`

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai'
import { google } from '@ai-sdk/google'
import { streamText, generateText } from 'ai'
import type {
  AIProvider,
  AIContext,
  ChatMessage,
  AICompletionOptions,
  AIUsage,
} from './interface'

export interface GeminiProviderConfig {
  apiKey: string
  model?: string
  baseURL?: string
}

export interface SpecializedTaskOptions {
  format?: 'markdown' | 'json'
  maxLength?: number
  temperature?: number
}

export class GeminiProvider implements AIProvider {
  private client: GoogleGenerativeAI
  private model: string
  private lastUsage: AIUsage | null = null

  constructor(config: GeminiProviderConfig) {
    this.client = new GoogleGenerativeAI(config.apiKey)
    this.model = config.model || 'gemini-2.0-flash-exp'
  }

  // =================================================================
  // Basic Chat (implements AIProvider interface)
  // =================================================================

  async *chat(
    messages: ChatMessage[],
    context?: AIContext,
    options?: AICompletionOptions
  ): AsyncGenerator<string, void, unknown> {
    try {
      const systemMessage = this.buildSystemMessage(context)

      const geminiMessages = [
        ...(systemMessage ? [{ role: 'user' as const, content: systemMessage }] : []),
        ...messages.map(m => ({
          role: m.role === 'assistant' ? 'model' as const : 'user' as const,
          content: m.content,
        })),
      ]

      const result = await streamText({
        model: google(this.model),
        messages: geminiMessages,
        temperature: options?.temperature ?? 0.7,
        maxTokens: options?.maxTokens ?? 8000,
      })

      for await (const chunk of result.textStream) {
        yield chunk
      }

      const usage = await result.usage
      this.lastUsage = {
        inputTokens: usage.promptTokens,
        outputTokens: usage.completionTokens,
        model: this.model,
        actionType: 'chat',
        costCents: this.calculateCost(usage.promptTokens, usage.completionTokens),
      }
    } catch (error) {
      console.error('Gemini chat error:', error)
      throw new Error(`Gemini chat failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  async *complete(
    context: AIContext,
    options?: AICompletionOptions
  ): AsyncGenerator<string, void, unknown> {
    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: this.buildCompletionPrompt(context),
      },
    ]
    yield* this.chat(messages, undefined, options)
  }

  async *rewrite(
    text: string,
    instruction: string,
    context?: AIContext
  ): AsyncGenerator<string, void, unknown> {
    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: `Rewrite this text: ${instruction}\n\nOriginal:\n${text}`,
      },
    ]
    yield* this.chat(messages, context)
  }

  async *summarize(text: string): AsyncGenerator<string, void, unknown> {
    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: `Summarize this text concisely:\n\n${text}`,
      },
    ]
    yield* this.chat(messages)
  }

  // =================================================================
  // Specialized Tasks (Gemini-specific)
  // =================================================================

  /**
   * Generate presentation slides from notes
   */
  async generateSlides(
    topic: string,
    notes: string[],
    options?: SpecializedTaskOptions
  ): Promise<string> {
    const notesContext = notes.join('\n\n---\n\n')

    const prompt = `You are an expert presentation designer. Create a professional slide deck about "${topic}" based on these notes:

${notesContext}

Requirements:
- Create 8-12 slides
- Include title slide, content slides, and conclusion
- Each slide should have:
  - Clear title
  - 3-5 bullet points or key concepts
  - Speaker notes
- Format: ${options?.format === 'json' ? 'JSON' : 'Markdown'}

${options?.format === 'json' ? `
Return as JSON:
{
  "title": "Presentation Title",
  "slides": [
    {
      "slideNumber": 1,
      "title": "Slide Title",
      "content": ["Bullet point 1", "Bullet point 2"],
      "speakerNotes": "Notes for this slide"
    }
  ]
}
` : ''}

Generate the slides now:`

    const model = this.client.getGenerativeModel({
      model: this.model,
      generationConfig: {
        temperature: options?.temperature ?? 0.8,
        maxOutputTokens: options?.maxLength ?? 8000,
      },
    })

    const result = await model.generateContent(prompt)
    const text = result.response.text()

    // Track usage
    this.lastUsage = {
      inputTokens: 0, // Gemini doesn't provide token counts easily
      outputTokens: 0,
      model: this.model,
      actionType: 'slides',
    }

    return text
  }

  /**
   * Perform deep research with large context
   */
  async deepResearch(
    query: string,
    sources: string[],
    options?: SpecializedTaskOptions
  ): Promise<string> {
    const sourcesContext = sources
      .map((s, i) => `## Source ${i + 1}\n\n${s}`)
      .join('\n\n---\n\n')

    const prompt = `You are a research assistant. Conduct comprehensive research on: "${query}"

Available sources:

${sourcesContext}

Requirements:
- Synthesize information from all sources
- Identify key themes and insights
- Provide citations (Source 1, Source 2, etc.)
- Include contradictions or gaps if any
- Structure as: Executive Summary, Key Findings, Detailed Analysis, Conclusions

Generate the research report now:`

    const model = this.client.getGenerativeModel({
      model: this.model,
      generationConfig: {
        temperature: options?.temperature ?? 0.5,
        maxOutputTokens: options?.maxLength ?? 16000,
      },
    })

    const result = await model.generateContent(prompt)
    const text = result.response.text()

    this.lastUsage = {
      inputTokens: 0,
      outputTokens: 0,
      model: this.model,
      actionType: 'research',
    }

    return text
  }

  /**
   * Generate a structured course curriculum
   */
  async generateCourse(
    topic: string,
    notes: string[],
    options?: SpecializedTaskOptions
  ): Promise<string> {
    const notesContext = notes.join('\n\n---\n\n')

    const prompt = `You are an expert curriculum designer. Create a comprehensive course on "${topic}" based on these notes:

${notesContext}

Requirements:
- 6-10 modules
- Each module should have:
  - Module title and description
  - 3-5 lessons
  - Learning objectives
  - Key concepts
  - Practical exercises
- Progressive difficulty
- Include prerequisites and outcomes

${options?.format === 'json' ? `
Return as JSON:
{
  "courseTitle": "Course Title",
  "description": "Course description",
  "modules": [
    {
      "moduleNumber": 1,
      "title": "Module Title",
      "description": "Module description",
      "lessons": [
        {
          "lessonNumber": 1,
          "title": "Lesson Title",
          "learningObjectives": ["Objective 1"],
          "keyConcepts": ["Concept 1"],
          "exercises": ["Exercise 1"]
        }
      ]
    }
  ]
}
` : ''}

Generate the course curriculum now:`

    const model = this.client.getGenerativeModel({
      model: this.model,
      generationConfig: {
        temperature: options?.temperature ?? 0.7,
        maxOutputTokens: options?.maxLength ?? 12000,
      },
    })

    const result = await model.generateContent(prompt)
    const text = result.response.text()

    this.lastUsage = {
      inputTokens: 0,
      outputTokens: 0,
      model: this.model,
      actionType: 'course',
    }

    return text
  }

  // =================================================================
  // Helpers
  // =================================================================

  getUsage(): AIUsage | null {
    return this.lastUsage
  }

  private buildSystemMessage(context?: AIContext): string | null {
    if (!context) return null

    const parts: string[] = []

    if (context.systemPrompt) {
      parts.push(context.systemPrompt)
    }

    if (context.documentContent) {
      parts.push('Context document:')
      parts.push(context.documentContent)
    }

    return parts.length > 0 ? parts.join('\n\n') : null
  }

  private buildCompletionPrompt(context: AIContext): string {
    return `Continue this text naturally:\n\n${context.textBeforeCursor || ''}`
  }

  private calculateCost(inputTokens: number, outputTokens: number): number {
    // Gemini 2.0 Flash pricing: $0.075 per 1M input, $0.30 per 1M output
    const inputCost = (inputTokens / 1000000) * 0.075
    const outputCost = (outputTokens / 1000000) * 0.30
    return (inputCost + outputCost) * 100 // Convert to cents
  }
}
```

---

## Step 1.3: Provider Factory

### 1.3.1: Create Factory with Routing Logic

**File**: `packages/ai/src/providers/factory.ts`

```typescript
import { OpenAIProvider, OpenAIProviderConfig } from './openai'
import { GeminiProvider, GeminiProviderConfig } from './gemini'
import type { AIProvider } from './interface'

export type TaskType =
  | 'chat'              // General conversation
  | 'complete'          // Text completion
  | 'rewrite'           // Text rewriting
  | 'summarize'         // Summarization
  | 'embed'             // Embedding generation
  | 'note-agent'        // Note CRUD operations
  | 'planner'           // Task planning
  | 'slides'            // Slides generation
  | 'research'          // Deep research
  | 'course'            // Course generation

export interface ProviderFactoryConfig {
  openai?: OpenAIProviderConfig
  gemini?: GeminiProviderConfig
}

export class ProviderFactory {
  private openaiProvider?: OpenAIProvider
  private geminiProvider?: GeminiProvider

  constructor(config: ProviderFactoryConfig) {
    if (config.openai) {
      this.openaiProvider = new OpenAIProvider(config.openai)
    }

    if (config.gemini) {
      this.geminiProvider = new GeminiProvider(config.gemini)
    }
  }

  /**
   * Get provider for specific task type
   */
  getProvider(taskType: TaskType): AIProvider {
    switch (taskType) {
      // OpenAI for general purpose
      case 'chat':
      case 'complete':
      case 'rewrite':
      case 'summarize':
      case 'embed':
      case 'note-agent':
      case 'planner':
        if (!this.openaiProvider) {
          throw new Error('OpenAI provider not configured')
        }
        return this.openaiProvider

      // Gemini for specialized tasks
      case 'slides':
      case 'research':
      case 'course':
        if (!this.geminiProvider) {
          throw new Error('Gemini provider not configured')
        }
        return this.geminiProvider

      default:
        // Fallback to OpenAI
        if (!this.openaiProvider) {
          throw new Error('No provider available')
        }
        return this.openaiProvider
    }
  }

  /**
   * Get OpenAI provider specifically (for embeddings)
   */
  getOpenAI(): OpenAIProvider {
    if (!this.openaiProvider) {
      throw new Error('OpenAI provider not configured')
    }
    return this.openaiProvider
  }

  /**
   * Get Gemini provider specifically (for specialized tasks)
   */
  getGemini(): GeminiProvider {
    if (!this.geminiProvider) {
      throw new Error('Gemini provider not configured')
    }
    return this.geminiProvider
  }

  /**
   * Check which providers are available
   */
  getAvailableProviders(): string[] {
    const available: string[] = []
    if (this.openaiProvider) available.push('openai')
    if (this.geminiProvider) available.push('gemini')
    return available
  }
}

/**
 * Singleton factory instance
 */
let factoryInstance: ProviderFactory | null = null

/**
 * Initialize the provider factory (call once at app startup)
 */
export function initProviderFactory(config: ProviderFactoryConfig): ProviderFactory {
  factoryInstance = new ProviderFactory(config)
  return factoryInstance
}

/**
 * Get the provider factory instance
 */
export function getProviderFactory(): ProviderFactory {
  if (!factoryInstance) {
    throw new Error('Provider factory not initialized. Call initProviderFactory() first.')
  }
  return factoryInstance
}

/**
 * Helper: Create provider for specific task
 */
export function createProvider(taskType: TaskType): AIProvider {
  return getProviderFactory().getProvider(taskType)
}
```

### 1.3.2: Update API Config to Initialize Factory

**File**: `apps/api/src/config.ts`

Add provider factory initialization:

```typescript
import { initProviderFactory } from '@inkdown/ai/providers'

// ... existing config code ...

// Initialize provider factory on startup
if (config.ai.openaiKey || config.ai.googleKey) {
  initProviderFactory({
    openai: config.ai.openaiKey ? {
      apiKey: config.ai.openaiKey,
      model: config.ai.defaultChatModel,
      embeddingModel: config.ai.defaultEmbeddingModel,
    } : undefined,
    gemini: config.ai.googleKey ? {
      apiKey: config.ai.googleKey,
      model: config.ai.defaultSpecializedModel,
    } : undefined,
  })
}
```

---

## Testing Strategy

### Unit Tests

Create test files for each provider:

**File**: `packages/ai/src/providers/__tests__/openai.test.ts`

```typescript
import { describe, it, expect, beforeAll } from 'vitest'
import { OpenAIProvider } from '../openai'

describe('OpenAIProvider', () => {
  let provider: OpenAIProvider

  beforeAll(() => {
    provider = new OpenAIProvider({
      apiKey: process.env.OPENAI_API_KEY!,
    })
  })

  it('should generate chat response', async () => {
    const messages = [
      { role: 'user' as const, content: 'Say "test successful" and nothing else' },
    ]

    let response = ''
    for await (const chunk of provider.chat(messages)) {
      response += chunk
    }

    expect(response).toContain('test successful')
  })

  it('should generate embeddings', async () => {
    const embeddings = await provider.generateEmbeddings(['test text'])

    expect(embeddings).toHaveLength(1)
    expect(embeddings[0]).toHaveLength(1536) // text-embedding-3-large dimension
  })

  it('should track usage', async () => {
    const messages = [
      { role: 'user' as const, content: 'Hi' },
    ]

    for await (const _ of provider.chat(messages)) {
      // Consume stream
    }

    const usage = provider.getUsage()
    expect(usage).not.toBeNull()
    expect(usage?.inputTokens).toBeGreaterThan(0)
    expect(usage?.outputTokens).toBeGreaterThan(0)
  })
})
```

### Integration Tests

Test the full API flow:

**File**: `apps/api/src/routes/__tests__/chat.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import app from '../../index'

describe('POST /api/chat', () => {
  it('should stream chat response', async () => {
    const response = await app.request('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token', // Mock auth
      },
      body: JSON.stringify({
        messages: [
          { role: 'user', content: 'Say hi' },
        ],
      }),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/plain')
  })
})
```

### Manual Testing Script

**File**: `apps/api/scripts/test-providers.ts`

```typescript
#!/usr/bin/env tsx

import { OpenAIProvider } from '@inkdown/ai/providers'
import { config } from '../src/config'

async function testOpenAI() {
  console.log('Testing OpenAI Provider...\n')

  const provider = new OpenAIProvider({
    apiKey: config.ai.openaiKey!,
  })

  // Test chat
  console.log('1. Testing chat:')
  const messages = [{ role: 'user' as const, content: 'Say "OpenAI works!" and nothing else' }]

  for await (const chunk of provider.chat(messages)) {
    process.stdout.write(chunk)
  }

  console.log('\n✅ Chat works\n')

  // Test embeddings
  console.log('2. Testing embeddings:')
  const embeddings = await provider.generateEmbeddings(['hello world'])
  console.log(`✅ Embedding generated: ${embeddings[0].length} dimensions\n`)

  // Check usage
  const usage = provider.getUsage()
  console.log('3. Usage tracking:')
  console.log(`   Input tokens: ${usage?.inputTokens}`)
  console.log(`   Output tokens: ${usage?.outputTokens}`)
  console.log(`   Cost: $${((usage?.costCents || 0) / 100).toFixed(4)}`)
  console.log('   ✅ Usage tracking works\n')
}

testOpenAI().catch(console.error)
```

Run with:
```bash
cd apps/api
tsx scripts/test-providers.ts
```

---

## Cost Considerations

### Token Estimation

**Average use case tokens**:
- Simple chat message: 50-200 input, 100-500 output
- Document-aware chat: 1000-5000 input, 200-1000 output
- Embedding (per note): 500-2000 tokens
- Course generation: 10000-50000 output
- Research: 20000-100000 input, 5000-20000 output

### Cost per Operation

| Operation | Provider | Cost Range |
|-----------|----------|------------|
| Simple chat | OpenAI GPT-4o | $0.001 - $0.01 |
| Document chat | OpenAI GPT-4o | $0.01 - $0.05 |
| Embedding (1 note) | OpenAI | $0.0001 - $0.0003 |
| Course generation | Gemini Pro | $0.05 - $0.25 |
| Deep research | Gemini Pro | $0.10 - $0.50 |
| Slides generation | Gemini Flash | $0.01 - $0.05 |

### Budget Monitoring

Implement cost tracking:

```typescript
// Track costs in database after each request
await supabase.from('ai_usage').insert({
  user_id: userId,
  provider: 'openai',
  model: 'gpt-4o',
  action_type: 'chat',
  input_tokens: usage.promptTokens,
  output_tokens: usage.completionTokens,
  cost_cents: calculateCost(usage),
})

// Query monthly costs
const { data } = await supabase
  .rpc('get_monthly_ai_usage', { p_user_id: userId })
```

---

## Common Issues & Solutions

### Issue 1: API Key Not Working

**Symptoms**: `401 Unauthorized` errors

**Solution**:
```bash
# Verify keys are set
echo $OPENAI_API_KEY
echo $GOOGLE_AI_API_KEY

# Check key format
# OpenAI: should start with "sk-"
# Google: should be 39 characters

# Test directly
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

### Issue 2: Rate Limiting

**Symptoms**: `429 Too Many Requests`

**Solution**:
```typescript
// Add retry logic with exponential backoff
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (error) {
      if (error.status === 429 && i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)))
        continue
      }
      throw error
    }
  }
  throw new Error('Max retries exceeded')
}
```

### Issue 3: High Latency

**Symptoms**: Responses take > 5 seconds

**Solution**:
1. Reduce context size - only send relevant notes
2. Use streaming to show partial responses
3. Switch to faster models (GPT-4o-mini, Gemini Flash)
4. Cache frequent queries

### Issue 4: Embedding Dimensions Mismatch

**Symptoms**: `pgvector dimension mismatch` error

**Solution**:
```typescript
// Ensure model matches database schema
const EMBEDDING_MODEL = 'text-embedding-3-large'
const EMBEDDING_DIMENSIONS = 1536 // Must match database

// Verify in migration
CREATE TABLE note_embeddings (
  embedding vector(1536)  -- Must match model output
);
```

---

## Completion Checklist

### Phase 1 Complete When:

- ✅ OpenAI provider implements all AIProvider methods
- ✅ Gemini provider implements all AIProvider methods
- ✅ Provider factory routes tasks correctly
- ✅ API routes handle auth and streaming
- ✅ Cost tracking works for all requests
- ✅ Error handling catches and logs failures
- ✅ Unit tests pass for both providers
- ✅ Manual testing script runs successfully
- ✅ Documentation updated with examples

### Next Phase

Once Phase 1 is complete, proceed to:
- **Phase 2**: RAG Pipeline (chunking, embeddings, retrieval)
- **Phase 3**: LangGraph Agents (chat, note, planner, specialized)

---

## Quick Reference Commands

```bash
# Install dependencies
cd packages/ai && pnpm install
cd apps/api && pnpm install

# Run tests
pnpm test

# Test providers manually
cd apps/api && tsx scripts/test-providers.ts

# Start API server
cd apps/api && pnpm dev

# Check API health
curl http://localhost:3001/health

# Test chat endpoint
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'
```

---

## Support

If you encounter issues:
1. Check environment variables are set correctly
2. Verify API keys have sufficient quota
3. Review error logs in API server
4. Check database connection
5. Consult provider documentation:
   - [OpenAI API Docs](https://platform.openai.com/docs)
   - [Google AI Docs](https://ai.google.dev/docs)
   - [Vercel AI SDK](https://sdk.vercel.ai/docs)
