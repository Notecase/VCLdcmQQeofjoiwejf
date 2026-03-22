/**
 * Gemini Provider
 *
 * Provider for Google's Gemini models via native SDK.
 * Used for slides generation (image gen), deep research, and course curriculum.
 * Models: gemini-3.1-pro-preview (slides/images), deep-research-pro-preview-12-2025
 */

import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai'
import { stripJsonFences } from '../utils/stripJsonFences'
import { GoogleGenAI } from '@google/genai'
import { buildSlidePrompt } from '../slides/prompts'
import { getTheme, SlideType } from '../slides/themes'
import { trackGeminiResponse } from './token-tracker'

// ============================================================================
// Configuration
// ============================================================================

export interface GeminiProviderConfig {
  apiKey: string
  model?: string // Default: gemini-3.1-pro-preview
  slidesModel?: string // Default: gemini-3.1-pro-preview
  researchModel?: string // Default: deep-research-pro-preview-12-2025
}

// Model constants (referenced by model-registry.ts)
export const DEFAULT_MODEL = 'gemini-3.1-pro-preview'
export const SLIDES_MODEL = 'gemini-3.1-pro-preview'
export const RESEARCH_MODEL = 'deep-research-pro-preview-12-2025'
export const IMAGE_MODEL = 'gemini-3.1-pro-preview'

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

export class GeminiProvider {
  private client: GoogleGenerativeAI
  private imageClient: GoogleGenAI | null = null
  private slidesModel: GenerativeModel
  private slidesModelName: string

  constructor(config: GeminiProviderConfig) {
    this.client = new GoogleGenerativeAI(config.apiKey)
    this.slidesModelName = config.slidesModel ?? SLIDES_MODEL

    this.slidesModel = this.client.getGenerativeModel({ model: this.slidesModelName })

    // Initialize image generation client (uses @google/genai SDK)
    this.imageClient = new GoogleGenAI({ apiKey: config.apiKey })
  }

  // =========================================================================
  // Specialized Methods (Slides)
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
      const startTime = Date.now()

      const result = await this.slidesModel.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 4000,
          responseMimeType: 'application/json',
        },
      })

      trackGeminiResponse(result, { model: this.slidesModelName, taskType: 'slides', startTime })

      const responseText = result.response.text()
      console.log('[GeminiProvider] Slide outline response length:', responseText.length)

      // Handle potential markdown code blocks
      const jsonStr = stripJsonFences(responseText)
      const outlines = JSON.parse(jsonStr) as SlideOutline[]

      console.log('[GeminiProvider] Parsed', outlines.length, 'slide outlines')
      return outlines
    } catch (error) {
      console.error('[GeminiProvider] generateSlideOutline failed:', error)
      throw new Error(`Failed to generate slide outline: ${error}`)
    }
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
