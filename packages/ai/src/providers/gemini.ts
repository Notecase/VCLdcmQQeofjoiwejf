/**
 * Gemini Provider
 * 
 * Provider for Google's Gemini models.
 * Used for slides generation, deep research, and course generation.
 * 
 * From Note3:
 * - Slides: Gemini 3 Pro (gemini-3-pro-preview)
 * - Deep Research: deep-research-pro-preview-12-2025
 */

import { GoogleGenerativeAI, GenerativeModel, Content } from '@google/generative-ai'
import { AIProvider, AIContext, AICompletionOptions, ChatMessage, AIUsage } from './interface'

// ============================================================================
// Configuration
// ============================================================================

export interface GeminiProviderConfig {
    apiKey: string
    model?: string                    // Default: gemini-2.0-flash-exp
    slidesModel?: string              // Default: gemini-3-pro-preview
    researchModel?: string            // Default: deep-research-pro-preview-12-2025
}

// Models from Note3 analysis
export const DEFAULT_MODEL = 'gemini-2.0-flash-exp'
export const SLIDES_MODEL = 'gemini-3-pro-preview'
export const RESEARCH_MODEL = 'deep-research-pro-preview-12-2025'
export const IMAGE_MODEL = 'gemini-3-pro-image-preview'

// ============================================================================
// Slide Types from Note3
// ============================================================================

export interface SlideOutline {
    index: number
    title: string
    content: string
    visualStyle: 'architecture' | 'concept' | 'process' | 'graph' | 'comparison' | 'overview'
    notes?: string
}

export interface GeneratedSlide {
    index: number
    title: string
    imageData: string  // Base64 encoded image
    caption: string
}

// ============================================================================
// Gemini Provider Implementation
// ============================================================================

export class GeminiProvider implements AIProvider {
    private client: GoogleGenerativeAI
    private model: GenerativeModel
    private slidesModel: GenerativeModel
    private researchModel: GenerativeModel
    private lastUsage: AIUsage | null = null
    private modelName: string
    private slidesModelName: string
    private researchModelName: string

    constructor(config: GeminiProviderConfig) {
        this.client = new GoogleGenerativeAI(config.apiKey)
        this.modelName = config.model ?? DEFAULT_MODEL
        this.slidesModelName = config.slidesModel ?? SLIDES_MODEL
        this.researchModelName = config.researchModel ?? RESEARCH_MODEL

        this.model = this.client.getGenerativeModel({ model: this.modelName })
        this.slidesModel = this.client.getGenerativeModel({ model: this.slidesModelName })
        this.researchModel = this.client.getGenerativeModel({ model: this.researchModelName })
    }

    /**
     * Stream completion
     */
    async *complete(
        context: AIContext,
        options?: AICompletionOptions
    ): AsyncGenerator<string, void, unknown> {
        const prompt = this.buildCompletionPrompt(context)

        const result = await this.model.generateContentStream({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: options?.temperature ?? 0.7,
                maxOutputTokens: options?.maxTokens ?? 1000,
                stopSequences: options?.stopSequences,
            },
        })

        for await (const chunk of result.stream) {
            const text = chunk.text()
            if (text) {
                yield text
            }
        }

        this.lastUsage = {
            inputTokens: 0,
            outputTokens: 0,
            model: this.modelName,
            actionType: 'complete',
        }
    }

    /**
     * Stream rewrite
     */
    async *rewrite(
        text: string,
        instruction: string,
        _context?: AIContext
    ): AsyncGenerator<string, void, unknown> {
        const prompt = `Rewrite the following text according to the instruction.
Only output the rewritten text, nothing else.

Instruction: ${instruction}

Text to rewrite:
${text}`

        const result = await this.model.generateContentStream({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.7 },
        })

        for await (const chunk of result.stream) {
            const chunkText = chunk.text()
            if (chunkText) {
                yield chunkText
            }
        }

        this.lastUsage = {
            inputTokens: 0,
            outputTokens: 0,
            model: this.modelName,
            actionType: 'rewrite',
        }
    }

    /**
     * Stream chat
     */
    async *chat(
        messages: ChatMessage[],
        context?: AIContext
    ): AsyncGenerator<string, void, unknown> {
        const contents = this.buildChatContents(messages, context)

        const result = await this.model.generateContentStream({
            contents,
            generationConfig: { temperature: 0.7, maxOutputTokens: 4000 },
        })

        for await (const chunk of result.stream) {
            const text = chunk.text()
            if (text) {
                yield text
            }
        }

        this.lastUsage = {
            inputTokens: 0,
            outputTokens: 0,
            model: this.modelName,
            actionType: 'chat',
        }
    }

    /**
     * Stream summarize
     */
    async *summarize(text: string): AsyncGenerator<string, void, unknown> {
        const prompt = `Please summarize the following text clearly and concisely:\n\n${text}`

        const result = await this.model.generateContentStream({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.5, maxOutputTokens: 1000 },
        })

        for await (const chunk of result.stream) {
            const chunkText = chunk.text()
            if (chunkText) {
                yield chunkText
            }
        }

        this.lastUsage = {
            inputTokens: 0,
            outputTokens: 0,
            model: this.modelName,
            actionType: 'summarize',
        }
    }

    // =========================================================================
    // Specialized Methods (from Note3)
    // =========================================================================

    /**
     * Generate slide outlines from note content
     * Stage 1 of Note3's two-stage slide generation
     */
    async generateSlideOutline(
        noteContent: string,
        options?: {
            maxSlides?: number
            topic?: string
        }
    ): Promise<SlideOutline[]> {
        const maxSlides = options?.maxSlides ?? 14

        const prompt = `Analyze the following content and create a slide presentation outline.

Content:
${noteContent}

Requirements:
- Maximum ${maxSlides} slides
- Each slide should have a clear focus
- Determine the best visual style for each slide
- Include speaker notes for each slide

Return a JSON array with this structure:
[
  {
    "index": 1,
    "title": "Slide title",
    "content": "Key points for this slide",
    "visualStyle": "architecture|concept|process|graph|comparison|overview",
    "notes": "Speaker notes"
  }
]

Only output valid JSON, no markdown code blocks or explanation.`

        const result = await this.slidesModel.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 4000,
                responseMimeType: 'application/json',
            },
        })

        const responseText = result.response.text()

        try {
            // Handle potential markdown code blocks
            const jsonStr = responseText.replace(/```json\n?|\n?```/g, '').trim()
            return JSON.parse(jsonStr) as SlideOutline[]
        } catch {
            throw new Error('Failed to parse slide outline response')
        }
    }

    /**
     * Deep research on a topic
     * Uses Gemini's large context window and research capabilities
     */
    async *deepResearch(
        query: string,
        context?: {
            existingNotes?: string
            focusAreas?: string[]
            maxDepth?: 'quick' | 'standard' | 'comprehensive'
        }
    ): AsyncGenerator<{
        type: 'progress' | 'source' | 'content'
        data: string | { title: string; url?: string }
    }, void, unknown> {
        let prompt = `Conduct comprehensive research on the following topic:

Topic: ${query}

`

        if (context?.existingNotes) {
            prompt += `Existing knowledge to build upon:
${context.existingNotes.slice(0, 10000)}

`
        }

        if (context?.focusAreas?.length) {
            prompt += `Focus areas: ${context.focusAreas.join(', ')}\n\n`
        }

        prompt += `Research depth: ${context?.maxDepth ?? 'standard'}

Provide:
1. Comprehensive overview
2. Key concepts and definitions
3. Current developments and trends
4. Practical applications
5. Recommended resources

Format as clear, well-organized markdown.`

        yield { type: 'progress', data: 'Starting research...' }

        const result = await this.researchModel.generateContentStream({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 8000,
            },
        })

        yield { type: 'progress', data: 'Analyzing sources...' }

        for await (const chunk of result.stream) {
            const text = chunk.text()
            if (text) {
                yield { type: 'content', data: text }
            }
        }

        this.lastUsage = {
            inputTokens: 0,
            outputTokens: 0,
            model: this.researchModelName,
            actionType: 'research',
        }
    }

    /**
     * Generate course curriculum from notes
     */
    async generateCourseCurriculum(
        notes: { title: string; content: string }[],
        options?: {
            moduleCount?: number
            difficulty?: 'beginner' | 'intermediate' | 'advanced'
            format?: 'lessons' | 'modules' | 'chapters'
        }
    ): Promise<{
        title: string
        description: string
        modules: {
            index: number
            title: string
            description: string
            lessons: { title: string; type: 'lecture' | 'video' | 'practice' | 'quiz' }[]
        }[]
    }> {
        const moduleCount = options?.moduleCount ?? 5
        const difficulty = options?.difficulty ?? 'intermediate'
        const format = options?.format ?? 'modules'

        const noteSummary = notes.map(n => `- ${n.title}: ${n.content.slice(0, 500)}`).join('\n')

        const prompt = `Create a ${difficulty} level course curriculum based on these notes:

${noteSummary}

Requirements:
- ${moduleCount} ${format}
- Each ${format.slice(0, -1)} should have 3-5 lessons
- Include variety: lectures, videos, practice, quizzes
- Logical progression from basics to advanced

Return a JSON object with this structure:
{
  "title": "Course title",
  "description": "Course description",
  "modules": [
    {
      "index": 1,
      "title": "Module title",
      "description": "Module description",
      "lessons": [
        { "title": "Lesson title", "type": "lecture|video|practice|quiz" }
      ]
    }
  ]
}

Only output valid JSON.`

        const result = await this.slidesModel.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 4000,
                responseMimeType: 'application/json',
            },
        })

        const responseText = result.response.text()
        const jsonStr = responseText.replace(/```json\n?|\n?```/g, '').trim()
        return JSON.parse(jsonStr)
    }

    /**
     * Get usage
     */
    getUsage(): AIUsage | null {
        return this.lastUsage
    }

    // =========================================================================
    // Private Methods
    // =========================================================================

    private buildCompletionPrompt(context: AIContext): string {
        let prompt = context.systemPrompt || 'Continue the following text naturally:'
        prompt += '\n\n'

        if (context.textBeforeCursor) {
            prompt += context.textBeforeCursor
        }

        if (context.selectedText) {
            prompt += `\n[Selected: ${context.selectedText}]\n`
        }

        return prompt
    }

    private buildChatContents(
        messages: ChatMessage[],
        context?: AIContext
    ): Content[] {
        const contents: Content[] = []

        // Add system context as first user message (Gemini doesn't have system role)
        let systemContext = context?.systemPrompt ||
            'You are a helpful AI assistant for note-taking and learning.'

        if (context?.documentContent) {
            systemContext += `\n\nContext:\n${context.documentContent.slice(0, 8000)}`
        }

        // Convert messages to Gemini format
        for (const msg of messages) {
            const role = msg.role === 'assistant' ? 'model' : 'user'

            // Prepend system context to first user message
            let content = msg.content
            if (contents.length === 0 && role === 'user') {
                content = `${systemContext}\n\nUser: ${content}`
            }

            contents.push({
                role,
                parts: [{ text: content }],
            })
        }

        return contents
    }
}

// ============================================================================
// Factory Function
// ============================================================================

let defaultProvider: GeminiProvider | null = null

export function createGeminiProvider(config: GeminiProviderConfig): GeminiProvider {
    return new GeminiProvider(config)
}

export function getDefaultGeminiProvider(): GeminiProvider {
    if (!defaultProvider) {
        const apiKey = process.env.GOOGLE_AI_API_KEY
        if (!apiKey) {
            throw new Error('GOOGLE_AI_API_KEY environment variable is required')
        }
        defaultProvider = new GeminiProvider({ apiKey })
    }
    return defaultProvider
}
