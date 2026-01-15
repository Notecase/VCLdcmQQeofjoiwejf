// AI Provider Types

export interface AIContext {
  // Document context
  documentContent: string
  documentTitle?: string

  // Selection/cursor context
  cursorPosition?: number
  selectedText?: string
  textBeforeCursor?: string
  textAfterCursor?: string

  // Additional context
  previousMessages?: ChatMessage[]
  systemPrompt?: string
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp?: string
}

export interface AICompletionOptions {
  temperature?: number
  maxTokens?: number
  stopSequences?: string[]
}

export interface AIActionType {
  type: 'complete' | 'rewrite' | 'summarize' | 'chat' | 'expand' | 'simplify' | 'custom'
  instruction?: string
}

// Usage tracking
export interface AIUsage {
  inputTokens: number
  outputTokens: number
  model: string
  actionType: string
  costCents?: number
}

// Provider interface
export interface AIProvider {
  // Streaming completion
  complete(
    context: AIContext,
    options?: AICompletionOptions
  ): AsyncGenerator<string, void, unknown>

  // Rewrite selected text
  rewrite(
    text: string,
    instruction: string,
    context?: AIContext
  ): AsyncGenerator<string, void, unknown>

  // Chat with document context
  chat(
    messages: ChatMessage[],
    context?: AIContext
  ): AsyncGenerator<string, void, unknown>

  // Summarize text
  summarize(text: string): AsyncGenerator<string, void, unknown>

  // Get current usage
  getUsage?(): AIUsage | null
}
