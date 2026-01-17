/**
 * Secretary Agent
 * 
 * Central agent for intent classification and task routing.
 * From Note3: 8 intent types - chat, edit_note, follow_up, open_note, 
 * create_artifact, database_action, read_memory, write_memory
 * 
 * Compatible with:
 * - Vercel AI SDK for streaming
 * - Hono for API routing
 * - Tool execution system (26 tools)
 */

import { z } from 'zod'
import { SupabaseClient } from '@supabase/supabase-js'
import { executeTool, ToolContext, ToolResult } from '../tools'

// ============================================================================
// Types
// ============================================================================

export interface SecretaryAgentConfig {
    supabase: SupabaseClient
    userId: string
    openaiApiKey: string
    model?: string
}

/**
 * Intent types from Note3
 */
export type IntentType =
    | 'chat'              // General conversation, questions
    | 'edit_note'         // Create, update, or modify notes
    | 'follow_up'         // Continue previous conversation
    | 'open_note'         // Navigate to or read a note
    | 'create_artifact'   // Generate HTML/CSS/JS visualizations
    | 'database_action'   // Manipulate embedded databases
    | 'read_memory'       // Read AI preferences/plans/context
    | 'write_memory'      // Update AI memory

export interface IntentClassification {
    intent: IntentType
    confidence: number
    parameters: Record<string, unknown>
    reasoning: string
}

export interface SecretaryAgentState {
    sessionId?: string
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
    lastIntent?: IntentClassification
    context?: {
        currentNoteId?: string
        projectId?: string
        recentNoteIds?: string[]
    }
    toolHistory: Array<{
        tool: string
        input: unknown
        result: ToolResult
        timestamp: Date
    }>
}

export interface SecretaryAgentResponse {
    intent: IntentClassification
    response: string
    toolResults?: ToolResult[]
    suggestedActions?: string[]
}

// ============================================================================
// Input Schema
// ============================================================================

export const SecretaryAgentInputSchema = z.object({
    message: z.string().min(1).max(10000),
    context: z.object({
        currentNoteId: z.string().uuid().optional(),
        projectId: z.string().uuid().optional(),
        noteIds: z.array(z.string().uuid()).optional(),
    }).optional(),
    sessionId: z.string().uuid().optional(),
})

export type SecretaryAgentInput = z.infer<typeof SecretaryAgentInputSchema>

// ============================================================================
// Intent Classification
// ============================================================================

const INTENT_CLASSIFICATION_PROMPT = `You are an intent classification system. Analyze the user's message and classify it into exactly one of these intents:

1. **chat** - General questions, discussions, requests for information or help
2. **edit_note** - Creating new notes, updating existing notes, organizing content
3. **follow_up** - Continuing a previous conversation, asking for clarification
4. **open_note** - Navigating to a specific note, reading note content
5. **create_artifact** - Generating visualizations, HTML/CSS/JS components, charts
6. **database_action** - Working with embedded tables/databases, CRUD operations
7. **read_memory** - Reading AI preferences, plans, or context
8. **write_memory** - Updating AI preferences, plans, or context

Respond with a JSON object:
{
  "intent": "one of the 8 types above",
  "confidence": 0.0-1.0,
  "parameters": { extracted parameters like noteId, action type, etc },
  "reasoning": "brief explanation of why this intent"
}

Only output valid JSON, no markdown.`

// ============================================================================
// Secretary Agent Class
// ============================================================================

export class SecretaryAgent {
    private supabase: SupabaseClient
    private userId: string
    private openaiApiKey: string
    private model: string
    private state: SecretaryAgentState

    constructor(config: SecretaryAgentConfig) {
        this.supabase = config.supabase
        this.userId = config.userId
        this.openaiApiKey = config.openaiApiKey
        this.model = config.model ?? 'gpt-5.2'
        this.state = {
            messages: [],
            toolHistory: [],
        }
    }

    /**
     * Run the secretary agent (non-streaming)
     */
    async run(input: SecretaryAgentInput): Promise<SecretaryAgentResponse> {
        // Update context
        if (input.context) {
            this.state.context = {
                ...this.state.context,
                ...input.context,
            }
        }

        // Step 1: Classify intent
        const intent = await this.classifyIntent(input.message)
        this.state.lastIntent = intent

        // Log intent to database
        await this.logIntent(intent, input.message)

        // Step 2: Execute based on intent
        const response = await this.executeIntent(intent, input.message)

        // Add to messages
        this.state.messages.push(
            { role: 'user', content: input.message },
            { role: 'assistant', content: response.response }
        )

        return response
    }

    /**
     * Stream the secretary agent response
     */
    async *stream(input: SecretaryAgentInput): AsyncGenerator<{
        type: 'intent' | 'thinking' | 'tool-call' | 'tool-result' | 'text-delta' | 'finish'
        data: unknown
    }> {
        // Update context
        if (input.context) {
            this.state.context = {
                ...this.state.context,
                ...input.context,
            }
        }

        yield { type: 'thinking', data: 'Analyzing your request...' }

        // Step 1: Classify intent
        const intent = await this.classifyIntent(input.message)
        this.state.lastIntent = intent

        yield { type: 'intent', data: intent }

        // Log intent
        await this.logIntent(intent, input.message)

        yield { type: 'thinking', data: `Intent: ${intent.intent} (${Math.round(intent.confidence * 100)}% confidence)` }

        // Step 2: Execute based on intent
        yield* this.streamExecution(intent, input.message)

        yield { type: 'finish', data: { intent: intent.intent } }
    }

    /**
     * Get current state
     */
    getState(): SecretaryAgentState {
        return { ...this.state }
    }

    /**
     * Load session
     */
    async loadSession(sessionId: string): Promise<boolean> {
        const { data, error } = await this.supabase
            .from('agent_sessions')
            .select('state')
            .eq('id', sessionId)
            .eq('user_id', this.userId)
            .eq('agent_type', 'secretary')
            .single()

        if (error || !data) return false

        this.state = data.state as SecretaryAgentState
        this.state.sessionId = sessionId
        return true
    }

    /**
     * Save session
     */
    async saveSession(): Promise<string> {
        const sessionId = this.state.sessionId || crypto.randomUUID()

        await this.supabase
            .from('agent_sessions')
            .upsert({
                id: sessionId,
                user_id: this.userId,
                agent_type: 'secretary',
                state: this.state,
                is_active: true,
            })

        this.state.sessionId = sessionId
        return sessionId
    }

    // =========================================================================
    // Private Methods
    // =========================================================================

    private async classifyIntent(message: string): Promise<IntentClassification> {
        const OpenAI = (await import('openai')).default
        const client = new OpenAI({ apiKey: this.openaiApiKey })

        let contextInfo = ''
        if (this.state.context?.currentNoteId) {
            contextInfo += `\nCurrent note ID: ${this.state.context.currentNoteId}`
        }
        if (this.state.messages.length > 0) {
            contextInfo += `\nPrevious messages in conversation: ${this.state.messages.length}`
        }

        const response = await client.chat.completions.create({
            model: this.model,
            messages: [
                { role: 'system', content: INTENT_CLASSIFICATION_PROMPT },
                { role: 'user', content: `${contextInfo}\n\nUser message: "${message}"` },
            ],
            temperature: 0.3,
            max_tokens: 500,
        })

        const content = response.choices[0]?.message?.content || '{}'

        try {
            const parsed = JSON.parse(content.replace(/```json\n?|\n?```/g, '').trim())
            return {
                intent: parsed.intent || 'chat',
                confidence: parsed.confidence || 0.5,
                parameters: parsed.parameters || {},
                reasoning: parsed.reasoning || '',
            }
        } catch {
            // Default to chat if parsing fails
            return {
                intent: 'chat',
                confidence: 0.5,
                parameters: {},
                reasoning: 'Failed to parse intent, defaulting to chat',
            }
        }
    }

    private async logIntent(intent: IntentClassification, message: string): Promise<void> {
        try {
            await this.supabase.from('secretary_intents').insert({
                user_id: this.userId,
                session_id: this.state.sessionId,
                intent_type: intent.intent,
                confidence: intent.confidence,
                parameters: intent.parameters,
                user_message: message.slice(0, 1000),
            })
        } catch {
            // Ignore logging errors
        }
    }

    private async executeIntent(
        intent: IntentClassification,
        message: string
    ): Promise<SecretaryAgentResponse> {
        const toolResults: ToolResult[] = []
        const toolContext: ToolContext = {
            userId: this.userId,
            supabase: this.supabase,
        }

        switch (intent.intent) {
            case 'chat':
                return await this.handleChat(message)

            case 'edit_note':
                return await this.handleEditNote(intent, message)

            case 'follow_up':
                return await this.handleFollowUp(message)

            case 'open_note':
                if (intent.parameters.noteId) {
                    const result = await executeTool('read_note', {
                        noteId: intent.parameters.noteId,
                        includeMetadata: true,
                    }, toolContext)
                    toolResults.push(result)
                }
                return {
                    intent,
                    response: toolResults[0]?.success
                        ? `Here's the note content:\n\n${JSON.stringify(toolResults[0].data, null, 2)}`
                        : 'Could not load the note.',
                    toolResults,
                }

            case 'create_artifact':
                return await this.handleCreateArtifact(intent, message)

            case 'database_action':
                return await this.handleDatabaseAction(intent, message, toolContext)

            case 'read_memory':
                const memoryType = (intent.parameters.memoryType as string) || 'preferences'
                const readResult = await executeTool('read_memory_file', {
                    memoryType,
                }, toolContext)
                toolResults.push(readResult)
                return {
                    intent,
                    response: readResult.success
                        ? `Here's your ${memoryType} memory:\n\n${(readResult.data as { content: string }).content || '(empty)'}`
                        : 'Could not read memory.',
                    toolResults,
                }

            case 'write_memory':
                return await this.handleWriteMemory(intent, message, toolContext)

            default:
                return await this.handleChat(message)
        }
    }

    private async *streamExecution(
        intent: IntentClassification,
        message: string
    ): AsyncGenerator<{
        type: 'tool-call' | 'tool-result' | 'text-delta' | 'thinking'
        data: unknown
    }> {
        const toolContext: ToolContext = {
            userId: this.userId,
            supabase: this.supabase,
        }

        switch (intent.intent) {
            case 'chat':
            case 'follow_up':
                yield* this.streamChat(message)
                break

            case 'edit_note':
                yield { type: 'thinking', data: 'Processing note edit...' }
                yield { type: 'tool-call', data: { tool: 'edit_note', parameters: intent.parameters } }
                // Stream the actual edit
                yield* this.streamNoteEdit(intent, message)
                break

            case 'open_note':
                if (intent.parameters.noteId) {
                    yield { type: 'tool-call', data: { tool: 'read_note', noteId: intent.parameters.noteId } }
                    const result = await executeTool('read_note', {
                        noteId: intent.parameters.noteId,
                        includeMetadata: true,
                    }, toolContext)
                    yield { type: 'tool-result', data: result }
                    if (result.success) {
                        const noteData = result.data as { title: string; content: string }
                        yield { type: 'text-delta', data: `## ${noteData.title}\n\n${noteData.content}` }
                    }
                }
                break

            case 'create_artifact':
                yield* this.streamArtifactCreation(intent, message)
                break

            case 'database_action':
                yield { type: 'thinking', data: 'Processing database operation...' }
                const dbResult = await this.handleDatabaseAction(intent, message, toolContext)
                yield { type: 'tool-result', data: dbResult.toolResults }
                yield { type: 'text-delta', data: dbResult.response }
                break

            case 'read_memory':
            case 'write_memory':
                yield { type: 'thinking', data: `${intent.intent === 'read_memory' ? 'Reading' : 'Writing'} memory...` }
                const memResult = await this.executeIntent(intent, message)
                if (memResult.toolResults) {
                    yield { type: 'tool-result', data: memResult.toolResults }
                }
                yield { type: 'text-delta', data: memResult.response }
                break

            default:
                yield* this.streamChat(message)
        }
    }

    private async handleChat(message: string): Promise<SecretaryAgentResponse> {
        const OpenAI = (await import('openai')).default
        const client = new OpenAI({ apiKey: this.openaiApiKey })

        const response = await client.chat.completions.create({
            model: this.model,
            messages: [
                { role: 'system', content: 'You are a helpful AI assistant for note-taking and learning.' },
                ...this.state.messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
                { role: 'user', content: message },
            ],
            temperature: 0.7,
            max_tokens: 2000,
        })

        return {
            intent: this.state.lastIntent!,
            response: response.choices[0]?.message?.content || 'I apologize, I could not generate a response.',
        }
    }

    private async *streamChat(message: string): AsyncGenerator<{
        type: 'text-delta'
        data: string
    }> {
        const OpenAI = (await import('openai')).default
        const client = new OpenAI({ apiKey: this.openaiApiKey })

        const stream = await client.chat.completions.create({
            model: this.model,
            messages: [
                { role: 'system', content: 'You are a helpful AI assistant for note-taking and learning.' },
                ...this.state.messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
                { role: 'user', content: message },
            ],
            temperature: 0.7,
            max_tokens: 2000,
            stream: true,
        })

        for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content
            if (delta) {
                yield { type: 'text-delta', data: delta }
            }
        }
    }

    private async handleEditNote(
        intent: IntentClassification,
        message: string
    ): Promise<SecretaryAgentResponse> {
        // Delegate to Note Agent logic
        const { NoteAgent } = await import('./note.agent')
        const noteAgent = new NoteAgent({
            supabase: this.supabase,
            userId: this.userId,
            openaiApiKey: this.openaiApiKey,
            model: this.model,
        })

        const action = (intent.parameters.action as string) || 'create'
        const result = await noteAgent.run({
            action: action as 'create' | 'update' | 'organize' | 'summarize' | 'expand',
            input: message,
            noteId: intent.parameters.noteId as string | undefined,
            projectId: this.state.context?.projectId,
        })

        return {
            intent,
            response: result.success
                ? `Successfully ${action}d the note. ${result.noteId ? `Note ID: ${result.noteId}` : ''}`
                : `Failed to ${action} note: ${result.error}`,
        }
    }

    private async *streamNoteEdit(
        intent: IntentClassification,
        message: string
    ): AsyncGenerator<{
        type: 'text-delta' | 'thinking'
        data: string
    }> {
        const { NoteAgent } = await import('./note.agent')
        const noteAgent = new NoteAgent({
            supabase: this.supabase,
            userId: this.userId,
            openaiApiKey: this.openaiApiKey,
            model: this.model,
        })

        const action = (intent.parameters.action as string) || 'create'
        const stream = noteAgent.stream({
            action: action as 'create' | 'update' | 'organize' | 'summarize' | 'expand',
            input: message,
            noteId: intent.parameters.noteId as string | undefined,
            projectId: this.state.context?.projectId,
        })

        for await (const chunk of stream) {
            if (chunk.type === 'text-delta') {
                yield { type: 'text-delta', data: chunk.data as string }
            } else if (chunk.type === 'thinking') {
                yield { type: 'thinking', data: chunk.data as string }
            }
        }
    }

    private async handleFollowUp(message: string): Promise<SecretaryAgentResponse> {
        // Use conversation history for context
        return await this.handleChat(message)
    }

    private async handleCreateArtifact(
        intent: IntentClassification,
        message: string
    ): Promise<SecretaryAgentResponse> {
        const toolContext: ToolContext = {
            userId: this.userId,
            supabase: this.supabase,
        }

        // Generate artifact content
        const OpenAI = (await import('openai')).default
        const client = new OpenAI({ apiKey: this.openaiApiKey })

        const response = await client.chat.completions.create({
            model: this.model,
            messages: [
                {
                    role: 'system',
                    content: `You are an HTML/CSS/JS developer. Generate clean, modern web components.
Output format:
\`\`\`html
[your HTML here]
\`\`\`
\`\`\`css
[your CSS here]
\`\`\`
\`\`\`javascript
[your JavaScript here]
\`\`\``
                },
                { role: 'user', content: message },
            ],
            temperature: 0.7,
            max_tokens: 4000,
        })

        const content = response.choices[0]?.message?.content || ''

        const result = await executeTool('create_artifact', {
            type: 'full',
            name: `Artifact ${new Date().toISOString().split('T')[0]}`,
            content,
            noteId: this.state.context?.currentNoteId,
        }, toolContext)

        return {
            intent,
            response: result.success
                ? `Created artifact!\n\n${content}`
                : `Failed to create artifact: ${result.error}`,
            toolResults: [result],
        }
    }

    private async *streamArtifactCreation(
        _intent: IntentClassification,
        message: string
    ): AsyncGenerator<{
        type: 'text-delta' | 'thinking'
        data: string
    }> {
        yield { type: 'thinking', data: 'Generating artifact code...' }

        const OpenAI = (await import('openai')).default
        const client = new OpenAI({ apiKey: this.openaiApiKey })

        const stream = await client.chat.completions.create({
            model: this.model,
            messages: [
                {
                    role: 'system',
                    content: `You are an HTML/CSS/JS developer. Generate clean, modern web components.
Output format:
\`\`\`html
[your HTML here]
\`\`\`
\`\`\`css
[your CSS here]
\`\`\`
\`\`\`javascript
[your JavaScript here]
\`\`\``
                },
                { role: 'user', content: message },
            ],
            temperature: 0.7,
            max_tokens: 4000,
            stream: true,
        })

        for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content
            if (delta) {
                yield { type: 'text-delta', data: delta }
            }
        }
    }

    private async handleDatabaseAction(
        intent: IntentClassification,
        _message: string,
        toolContext: ToolContext
    ): Promise<SecretaryAgentResponse> {
        const action = (intent.parameters.action as string) || 'query'
        const noteId = (intent.parameters.noteId as string) || this.state.context?.currentNoteId
        const databaseId = intent.parameters.databaseId as string

        if (!noteId || !databaseId) {
            return {
                intent,
                response: 'Please specify which note and database to work with.',
            }
        }

        const toolName = `db_${action}_rows`
        const result = await executeTool(toolName, {
            noteId,
            databaseId,
            ...intent.parameters,
        }, toolContext)

        return {
            intent,
            response: result.success
                ? `Database operation successful:\n${JSON.stringify(result.data, null, 2)}`
                : `Database operation failed: ${result.error}`,
            toolResults: [result],
        }
    }

    private async handleWriteMemory(
        intent: IntentClassification,
        message: string,
        toolContext: ToolContext
    ): Promise<SecretaryAgentResponse> {
        const memoryType = (intent.parameters.memoryType as string) || 'preferences'
        const content = (intent.parameters.content as string) || message

        const result = await executeTool('write_memory_file', {
            memoryType,
            content,
        }, toolContext)

        return {
            intent,
            response: result.success
                ? `Successfully updated ${memoryType} memory.`
                : `Failed to update memory: ${result.error}`,
            toolResults: [result],
        }
    }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createSecretaryAgent(config: SecretaryAgentConfig): SecretaryAgent {
    return new SecretaryAgent(config)
}
