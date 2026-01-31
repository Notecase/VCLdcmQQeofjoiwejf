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
import { GoogleGenAI } from '@google/genai'
import { AIProvider, AIContext, AICompletionOptions, ChatMessage, AIUsage } from './interface'
import { buildSlidePrompt } from '../slides/prompts'
import { getTheme, SlideType } from '../slides/themes'

// ============================================================================
// Configuration
// ============================================================================

export interface GeminiProviderConfig {
  apiKey: string
  model?: string // Default: gemini-2.0-flash-exp
  slidesModel?: string // Default: gemini-3-pro-preview
  researchModel?: string // Default: deep-research-pro-preview-12-2025
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
  keyPoints?: string[]
  visualElements?: string[]
  imagePrompt?: string
  notes?: string
  visualStyleConfig?: {
    theme: string
    primaryColor: string
    accentColor: string
    backgroundTexture: string
  }
}

export interface GeneratedSlide {
  index: number
  title: string
  type: string
  imageData: string // Base64 encoded image
  caption: string
}

export interface SlideGenerationProgress {
  currentSlide: number
  totalSlides: number
  status: 'planning' | 'generating' | 'complete' | 'error'
  message: string
}

// ============================================================================
// Gemini Provider Implementation
// ============================================================================

export class GeminiProvider implements AIProvider {
  private client: GoogleGenerativeAI
  private imageClient: GoogleGenAI | null = null
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

    // Initialize image generation client (uses @google/genai SDK)
    this.imageClient = new GoogleGenAI({ apiKey: config.apiKey })
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
  async *chat(messages: ChatMessage[], context?: AIContext): AsyncGenerator<string, void, unknown> {
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

    try {
      console.log('[GeminiProvider] Generating slide outline with model:', this.slidesModelName)

      const result = await this.slidesModel.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 4000,
          responseMimeType: 'application/json',
        },
      })

      const responseText = result.response.text()
      console.log('[GeminiProvider] Slide outline response length:', responseText.length)

      // Handle potential markdown code blocks
      const jsonStr = responseText.replace(/```json\n?|\n?```/g, '').trim()
      const outlines = JSON.parse(jsonStr) as SlideOutline[]

      console.log('[GeminiProvider] Parsed', outlines.length, 'slide outlines')
      return outlines
    } catch (error) {
      console.error('[GeminiProvider] generateSlideOutline failed:', error)
      throw new Error(`Failed to generate slide outline: ${error}`)
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
  ): AsyncGenerator<
    {
      type: 'progress' | 'source' | 'content'
      data: string | { title: string; url?: string }
    },
    void,
    unknown
  > {
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

    const noteSummary = notes.map((n) => `- ${n.title}: ${n.content.slice(0, 500)}`).join('\n')

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
   * Generate slide images using Gemini Image model
   * Full implementation of Note3's two-stage slide generation
   */
  async generateSlideImages(
    noteContent: string,
    options?: {
      maxSlides?: number
      theme?: 'Technical/Engineering' | 'Organic/Biological' | 'History/Paper' | 'Modern/Abstract'
    },
    onProgress?: (progress: SlideGenerationProgress) => void | Promise<void>
  ): Promise<GeneratedSlide[]> {
    const maxSlides = options?.maxSlides ?? 8
    const slides: GeneratedSlide[] = []

    // Stage 1: Generate outline
    await onProgress?.({
      currentSlide: 0,
      totalSlides: maxSlides,
      status: 'planning',
      message: 'Analyzing content and planning slides...',
    })

    const outlines = await this.generateSlideOutline(noteContent, { maxSlides })

    // Apply theme override to all outlines if specified
    if (options?.theme) {
      const themeConfig = getTheme(options.theme)
      outlines.forEach((outline) => {
        outline.visualStyleConfig = {
          theme: options.theme!,
          primaryColor: themeConfig.primaryColor,
          accentColor: themeConfig.accentColor,
          backgroundTexture: themeConfig.backgroundTexture,
        }
      })
    }

    // Stage 2: Generate images with rate limiting (2 seconds between slides)
    for (let i = 0; i < outlines.length; i++) {
      const outline = outlines[i]

      await onProgress?.({
        currentSlide: i + 1,
        totalSlides: outlines.length,
        status: 'generating',
        message: `Generating slide ${i + 1}/${outlines.length}: ${outline.title}...`,
      })

      // Rate limit: wait 2 seconds between slides (avoid API limits)
      if (i > 0) {
        await new Promise((r) => setTimeout(r, 2000))
      }

      const slide = await this.generateSlideImageWithRetry(outline, noteContent)
      slides.push(slide)
    }

    const successCount = slides.filter((s) => s.imageData).length
    await onProgress?.({
      currentSlide: outlines.length,
      totalSlides: outlines.length,
      status: 'complete',
      message: `Generated ${successCount}/${slides.length} slides!`,
    })

    return slides
  }

  /**
   * Generate a single slide image with retry logic
   * Implements exponential backoff for resilience
   */
  private async generateSlideImageWithRetry(
    outline: SlideOutline,
    noteContext: string,
    maxRetries = 3
  ): Promise<GeneratedSlide> {
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.generateSingleSlideImage(outline, noteContext)

        // Validate we got image data
        if (result.imageData && result.imageData.length > 1000) {
          return result
        }
        throw new Error('Empty or too small image data')
      } catch (error) {
        lastError = error as Error
        console.warn(
          `[GeminiProvider] Attempt ${attempt}/${maxRetries} failed for slide "${outline.title}":`,
          error
        )

        // Exponential backoff
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)))
        }
      }
    }

    // Return placeholder on failure
    console.error(`[GeminiProvider] All retries failed for slide "${outline.title}":`, lastError)
    return {
      index: outline.index,
      title: outline.title,
      type: outline.visualStyle,
      imageData: '',
      caption: `Failed to generate: ${lastError?.message}`,
    }
  }

  /**
   * Generate a single slide image using Gemini Image API
   * Uses @google/genai SDK with gemini-3-pro-image-preview model
   */
  private async generateSingleSlideImage(
    outline: SlideOutline,
    noteContext: string
  ): Promise<GeneratedSlide> {
    if (!this.imageClient) {
      throw new Error('Image client not initialized')
    }

    // Get theme configuration (Note3 pattern)
    const theme = outline.visualStyleConfig?.theme || 'Technical/Engineering'
    const themeConfig = getTheme(theme)

    // Build prompt using existing template system (Note3 pattern)
    const slideType = outline.visualStyle as SlideType
    const prompt = buildSlidePrompt(slideType, {
      topic: outline.title,
      title: outline.title,
      context: [
        outline.content,
        outline.keyPoints?.join('\n- ') || '',
        outline.visualElements?.join(', ') || '',
        `Context: ${noteContext.substring(0, 500)}`,
      ]
        .filter(Boolean)
        .join('\n\n'),
      theme: themeConfig.name,
      backgroundTexture: themeConfig.backgroundTexture,
      primaryColor: themeConfig.primaryColor,
      accentColor: themeConfig.accentColor,
    })

    console.log('[GeminiProvider] Generating slide image:', outline.title)
    console.log('[GeminiProvider] Prompt length:', prompt.length)

    // Call Gemini image generation (EXACT NOTE3 CONFIG)
    const response = await this.imageClient.models.generateContent({
      model: IMAGE_MODEL, // 'gemini-3-pro-image-preview'
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }], // Note3 uses Google Search
        imageConfig: {
          aspectRatio: '16:9', // Presentation standard
          imageSize: '2K', // High quality for detailed diagrams
        },
      },
    })

    // Extract image data from response (EXACT NOTE3 PATTERN)
    let imageData = ''
    let caption = outline.content || `Figure ${outline.index}: ${outline.title}`

    if (response.candidates && response.candidates[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.text) {
          caption = part.text.substring(0, 200) || caption
        } else if (part.inlineData) {
          imageData = part.inlineData.data || '' // Base64 PNG
          console.log('[GeminiProvider] Got image data, length:', imageData.length)
        }
      }
    }

    if (!imageData) {
      throw new Error('No image data in response')
    }

    return {
      index: outline.index,
      title: outline.title,
      type: outline.visualStyle,
      imageData,
      caption,
    }
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

  private buildChatContents(messages: ChatMessage[], context?: AIContext): Content[] {
    const contents: Content[] = []

    // Add system context as first user message (Gemini doesn't have system role)
    let systemContext =
      context?.systemPrompt || 'You are a helpful AI assistant for note-taking and learning.'

    if (context?.documentContent) {
      systemContext += `\n\nContext:\n${context.documentContent.slice(0, 8000)}`
    }

    // Convert messages to Gemini format
    for (const msg of messages) {
      // Skip messages with null or empty content to avoid API errors
      if (msg.content == null || msg.content === '') continue

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

    // Validate that we have messages to send
    if (contents.length === 0) {
      throw new Error('No valid messages to send to API')
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
