/**
 * Ollama Cloud Provider
 * 
 * Provider for GLM-4.6 via Ollama Cloud.
 * Used for artifact generation (HTML/CSS/JS) and code generation.
 * 
 * From Note3: "Code Generation: GLM-4.6 (Ollama Cloud)"
 */

import { AIProvider, AIContext, AICompletionOptions, ChatMessage, AIUsage } from './interface'

// ============================================================================
// Configuration
// ============================================================================

export interface OllamaCloudConfig {
    baseURL: string           // Ollama Cloud API URL
    model?: string            // Default: glm-4.6
    apiKey?: string           // Optional API key for cloud
    maxRetries?: number
}

// Default model from Note3 analysis
export const DEFAULT_MODEL = 'glm-4.6'
export const OLLAMA_CLOUD_URL = 'https://api.ollama.ai/v1'  // Example, adjust as needed

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

interface OllamaChatResponse {
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
    async *chat(
        messages: ChatMessage[],
        context?: AIContext
    ): AsyncGenerator<string, void, unknown> {
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
                content: 'You are a code analysis assistant. Provide a clear, concise summary of the given code, explaining its purpose and key functionality.',
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
     * Specialized method for Note3's artifact generation
     */
    async *generateArtifact(
        prompt: string,
        artifactType: 'html' | 'css' | 'js' | 'full'
    ): AsyncGenerator<string, void, unknown> {
        const systemPrompts: Record<string, string> = {
            html: `You are an HTML generator. Generate clean, semantic HTML based on the user's description.
Output only valid HTML code without any explanation. Use modern HTML5 elements.`,
            css: `You are a CSS generator. Generate clean, modern CSS based on the user's description.
Output only valid CSS code without any explanation. Use CSS variables and modern properties.`,
            js: `You are a JavaScript generator. Generate clean, modern JavaScript based on the user's description.
Output only valid JavaScript code without any explanation. Use ES6+ syntax.`,
            full: `You are a web component generator. Generate a complete HTML/CSS/JS component based on the user's description.
Output the code in this format:
<!-- HTML -->
[html code]
<!-- CSS -->
[css code]
<!-- JS -->
[js code]

Use modern web standards and clean code practices.`,
        }

        const messages: OllamaChatMessage[] = [
            { role: 'system', content: systemPrompts[artifactType] },
            { role: 'user', content: prompt },
        ]

        yield* this.streamChat(messages, { temperature: 0.3, maxTokens: 4000 })

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
                const response = await fetch(`${this.baseURL}/chat`, {
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
                    await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000))
                }
            }
        }

        throw lastError || new Error('Failed to connect to Ollama Cloud')
    }

    private buildCompletionMessages(context: AIContext): OllamaChatMessage[] {
        const messages: OllamaChatMessage[] = []

        messages.push({
            role: 'system',
            content: context.systemPrompt ||
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

    private buildChatMessages(
        messages: ChatMessage[],
        context?: AIContext
    ): OllamaChatMessage[] {
        const ollamaMessages: OllamaChatMessage[] = []

        let systemContent = context?.systemPrompt ||
            'You are a helpful coding assistant. Provide clear, well-documented code solutions.'

        if (context?.documentContent) {
            systemContent += `\n\nContext from the current code:\n\`\`\`\n${context.documentContent.slice(0, 4000)}\n\`\`\``
        }

        ollamaMessages.push({ role: 'system', content: systemContent })

        for (const msg of messages) {
            ollamaMessages.push({
                role: msg.role,
                content: msg.content,
            })
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
        const apiKey = process.env.OLLAMA_CLOUD_API_KEY
        defaultProvider = new OllamaCloudProvider({ baseURL, apiKey })
    }
    return defaultProvider
}
