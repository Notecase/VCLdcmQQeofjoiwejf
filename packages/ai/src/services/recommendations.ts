/**
 * Recommendation Service
 *
 * Core service for generating AI-powered recommendations from note content.
 * Includes 6 generators: mindmap, flashcards, concepts, exercises, resources, slides.
 *
 * Ported from Note3's recommendationService.ts
 */

import { generateText } from 'ai'
import { resolveModel } from '../providers/ai-sdk-factory'
import { trackAISDKUsage } from '../providers/ai-sdk-usage'
import { createGeminiProvider } from '../providers/gemini'
import type {
  MindmapData,
  FlashcardData,
  ConceptData,
  ExerciseData,
  ResourceData,
  SlideData,
  RecommendationData,
  RecommendationCache,
  RecommendationType,
  SlideGenerationProgress,
} from './recommendations.types'

// ============================================================================
// Constants
// ============================================================================

// Cache TTL: 5 minutes
const CACHE_TTL = 5 * 60 * 1000

// In-memory cache
const recommendationCache = new Map<string, RecommendationCache>()

// ============================================================================
// Cache Helpers
// ============================================================================

/**
 * Get cached recommendation or null if expired/missing
 */
function getCachedRecommendation(noteId: string): RecommendationData | null {
  const cached = recommendationCache.get(noteId)
  if (!cached) return null

  const age = Date.now() - cached.timestamp
  if (age > CACHE_TTL) {
    recommendationCache.delete(noteId)
    return null
  }

  return cached.data
}

/**
 * Cache a recommendation
 */
function cacheRecommendation(noteId: string, data: RecommendationData): void {
  recommendationCache.set(noteId, {
    noteId,
    data,
    timestamp: Date.now(),
  })
}

/**
 * Clear cache for a specific note
 */
export function clearRecommendationCache(noteId: string): void {
  recommendationCache.delete(noteId)
}

/**
 * Clear all recommendation cache
 */
export function clearAllRecommendationCache(): void {
  recommendationCache.clear()
}

// ============================================================================
// LaTeX Normalization
// ============================================================================

/**
 * Convert block math ($$...$$) to inline math ($...$) for consistency
 */
function normalizeLatexToInline(content: string): string {
  if (!content || typeof content !== 'string') return content

  let normalized = content
  normalized = normalized.replace(/\$\$([\s\S]*?)\$\$/g, (_match, formula) => {
    const cleaned = formula.trim().replace(/\s+/g, ' ')
    return `$${cleaned}$`
  })

  return normalized
}

/**
 * Attempt to repair truncated or malformed JSON
 */
function repairJSON(jsonString: string): string {
  let repaired = jsonString.trim()

  // Remove trailing incomplete strings (unterminated quotes)
  // Match pattern: string that ends mid-value like "label": "some text without closing
  const unterminatedStringMatch = repaired.match(/(.*"[^"]*":\s*"[^"]*)[^"}\]]*$/)
  if (
    unterminatedStringMatch &&
    !repaired.endsWith('"') &&
    !repaired.endsWith('}') &&
    !repaired.endsWith(']')
  ) {
    repaired = unterminatedStringMatch[1] + '"'
  }

  // Count brackets to find missing closers
  let openBraces = 0
  let openBrackets = 0
  let inString = false
  let escaped = false

  for (const char of repaired) {
    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\') {
      escaped = true
      continue
    }
    if (char === '"') {
      inString = !inString
      continue
    }
    if (!inString) {
      if (char === '{') openBraces++
      else if (char === '}') openBraces--
      else if (char === '[') openBrackets++
      else if (char === ']') openBrackets--
    }
  }

  // Remove trailing comma if present before closing
  repaired = repaired.replace(/,\s*$/, '')

  // Close any unclosed arrays/objects
  while (openBrackets > 0) {
    repaired += ']'
    openBrackets--
  }
  while (openBraces > 0) {
    repaired += '}'
    openBraces--
  }

  return repaired
}

/**
 * Parse JSON response from AI, with LaTeX normalization and JSON repair
 */
function parseAIResponse<T>(response: string, fallback: T): T {
  try {
    console.log('[RecommendationService] parseAIResponse - input length:', response.length)
    let jsonString = response

    // Extract JSON from markdown code blocks
    const jsonMatch = response.match(/```(?:json)?\s*(\{[\s\S]*\}|\[[\s\S]*\])\s*```/)
    if (jsonMatch) {
      jsonString = jsonMatch[1]
      console.log('[RecommendationService] parseAIResponse - extracted from code block')
    } else {
      // Try to find JSON without code blocks
      // IMPORTANT: Check for arrays FIRST since most recommendation responses are arrays
      const arrayMatch = response.match(/\[[\s\S]*\]/)
      const objectMatch = response.match(/^\s*\{[\s\S]*\}\s*$/) // Only match if ENTIRE response is an object
      if (arrayMatch) {
        jsonString = arrayMatch[0]
        console.log(
          '[RecommendationService] parseAIResponse - found array match, length:',
          jsonString.length
        )
      } else if (objectMatch) {
        jsonString = objectMatch[0]
        console.log('[RecommendationService] parseAIResponse - found object match')
      } else {
        console.log('[RecommendationService] parseAIResponse - no JSON structure found!')
      }
    }

    // First attempt: parse as-is
    let parsed: T
    try {
      parsed = JSON.parse(jsonString) as T
    } catch (_firstError) {
      // Second attempt: try to repair truncated JSON
      console.log('[RecommendationService] Attempting JSON repair...')
      const repaired = repairJSON(jsonString)
      try {
        parsed = JSON.parse(repaired) as T
        console.log('[RecommendationService] JSON repair successful')
      } catch (repairError) {
        console.warn('[RecommendationService] JSON repair failed:', repairError)
        console.warn(
          '[RecommendationService] Original response (first 500 chars):',
          response.substring(0, 500)
        )
        return fallback
      }
    }

    console.log(
      '[RecommendationService] parseAIResponse - parsed successfully, type:',
      typeof parsed,
      'isArray:',
      Array.isArray(parsed)
    )
    if (Array.isArray(parsed)) {
      console.log('[RecommendationService] parseAIResponse - array length:', parsed.length)
    }

    // Post-process to normalize LaTeX
    if (Array.isArray(parsed)) {
      return parsed.map((item: unknown) => {
        if (typeof item === 'object' && item !== null) {
          const normalized: Record<string, unknown> = { ...(item as Record<string, unknown>) }
          for (const key in normalized) {
            if (typeof normalized[key] === 'string') {
              normalized[key] = normalizeLatexToInline(normalized[key] as string)
            }
          }
          return normalized
        }
        return item
      }) as T
    } else if (typeof parsed === 'object' && parsed !== null) {
      const normalized: Record<string, unknown> = { ...(parsed as Record<string, unknown>) }
      for (const key in normalized) {
        if (typeof normalized[key] === 'string') {
          normalized[key] = normalizeLatexToInline(normalized[key] as string)
        }
      }
      return normalized as T
    }

    return parsed
  } catch (error) {
    console.warn('[RecommendationService] Failed to parse AI response:', error)
    return fallback
  }
}

// ============================================================================
// Chat Helper
// ============================================================================

async function chatWithAI(prompt: string, _apiKey?: string): Promise<string> {
  try {
    console.log('[RecommendationService] chatWithAI - prompt length:', prompt.length)
    const { model, entry } = resolveModel('chat')

    const { text } = await generateText({
      model,
      prompt,
      temperature: 0.7,
      maxOutputTokens: 4000,
      onFinish: trackAISDKUsage({ model: entry.id, taskType: 'chat' }),
    })

    console.log('[RecommendationService] chatWithAI - response length:', text.length)
    console.log('[RecommendationService] chatWithAI - response preview:', text.substring(0, 300))

    if (!text || text.trim().length === 0) {
      throw new Error('Empty response from AI')
    }

    return text
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[RecommendationService] chatWithAI failed:', message)
    throw new Error(`AI chat failed: ${message}`)
  }
}

// ============================================================================
// Individual Generators
// ============================================================================

/**
 * Generate mindmap structure from note content
 */
export async function generateMindmap(
  noteId: string,
  noteContent: string,
  apiKey: string
): Promise<MindmapData> {
  try {
    const cached = getCachedRecommendation(noteId)
    if (cached?.mindmap) {
      return cached.mindmap
    }

    if (!noteContent || noteContent.trim().length < 10) {
      throw new Error('Note content is too short to generate a mindmap.')
    }

    const prompt = `Analyze this note and create a COMPACT mindmap. Return ONLY valid JSON.

NOTE:
${noteContent.substring(0, 16000)}

RULES:
- Maximum 5 top-level branches
- Maximum 3 children per branch
- Keep labels SHORT (under 30 chars)
- Use simple IDs like "n1", "n2"

JSON format:
{"center":"Topic","nodes":[{"id":"n1","label":"Branch","children":[{"id":"n1a","label":"Sub","children":[]}]}]}`

    const response = await chatWithAI(prompt, apiKey)
    const mindmap = parseAIResponse<MindmapData>(response, {
      center: 'Main Topic',
      nodes: [],
    })

    // Update cache
    const currentData: RecommendationData = getCachedRecommendation(noteId) || {}
    currentData.mindmap = mindmap
    cacheRecommendation(noteId, currentData)

    return mindmap
  } catch (error) {
    console.error('[RecommendationService] generateMindmap failed:', error)
    throw error
  }
}

/**
 * Generate flashcards from note content
 */
export async function generateFlashcards(
  noteId: string,
  noteContent: string,
  apiKey: string
): Promise<FlashcardData[]> {
  try {
    // Check cache - only use if non-empty
    const cached = getCachedRecommendation(noteId)
    if (cached?.flashcards && cached.flashcards.length > 0) {
      console.log(
        '[RecommendationService] generateFlashcards - returning cached:',
        cached.flashcards.length,
        'items'
      )
      return cached.flashcards
    }

    // Truncate content to fit context window (24000 chars ≈ 6000 tokens for GPT-5.2)
    const truncatedContent = noteContent.substring(0, 24000)
    console.log(
      '[RecommendationService] generateFlashcards - content length:',
      truncatedContent.length
    )

    const prompt = `Analyze this note and create 8-12 flashcards for studying the key concepts.

NOTE CONTENT:
${truncatedContent}

IMPORTANT RULES:
1. Use inline LaTeX math only: $formula$ (not $$...$$)
2. Create specific, testable questions
3. Answers should be comprehensive but concise

Return ONLY a valid JSON array with this exact format:
[
  {
    "question": "What is the purpose of X?",
    "answer": "X is used for Y because Z"
  }
]

Generate exactly 8-12 flashcards now:`

    const response = await chatWithAI(prompt, apiKey)
    console.log('[RecommendationService] generateFlashcards - AI response length:', response.length)

    const flashcards = parseAIResponse<FlashcardData[]>(response, [])
    console.log(
      '[RecommendationService] generateFlashcards - parsed:',
      flashcards.length,
      'flashcards'
    )

    // Only cache if we got results
    if (flashcards.length > 0) {
      const currentData: RecommendationData = getCachedRecommendation(noteId) || {}
      currentData.flashcards = flashcards
      cacheRecommendation(noteId, currentData)
    }

    return flashcards
  } catch (error) {
    console.error('[RecommendationService] generateFlashcards failed:', error)
    throw error
  }
}

/**
 * Generate advanced concepts from note content
 */
export async function generateConcepts(
  noteId: string,
  noteContent: string,
  apiKey: string
): Promise<ConceptData[]> {
  try {
    // Check cache - only use if non-empty
    const cached = getCachedRecommendation(noteId)
    if (cached?.concepts && cached.concepts.length > 0) {
      console.log(
        '[RecommendationService] generateConcepts - returning cached:',
        cached.concepts.length,
        'items'
      )
      return cached.concepts
    }

    // Truncate content to fit context window (24000 chars ≈ 6000 tokens for GPT-5.2)
    const truncatedContent = noteContent.substring(0, 24000)
    console.log(
      '[RecommendationService] generateConcepts - content length:',
      truncatedContent.length
    )

    const prompt = `Analyze this note and identify 5-8 advanced related concepts that a student should explore to deepen their understanding.

NOTE CONTENT:
${truncatedContent}

IMPORTANT RULES:
1. Use inline LaTeX math only: $formula$ (not $$...$$)
2. Focus on concepts that extend beyond what's in the note
3. Each description should be 2-3 sentences

Return ONLY a valid JSON array with this exact format:
[
  {
    "title": "Concept Name",
    "description": "A 2-3 sentence explanation of the concept and why it's relevant."
  }
]

Generate exactly 5-8 concepts now:`

    const response = await chatWithAI(prompt, apiKey)
    console.log('[RecommendationService] generateConcepts - AI response length:', response.length)

    const concepts = parseAIResponse<ConceptData[]>(response, [])
    console.log('[RecommendationService] generateConcepts - parsed:', concepts.length, 'concepts')

    // Only cache if we got results
    if (concepts.length > 0) {
      const currentData: RecommendationData = getCachedRecommendation(noteId) || {}
      currentData.concepts = concepts
      cacheRecommendation(noteId, currentData)
    }

    return concepts
  } catch (error) {
    console.error('[RecommendationService] generateConcepts failed:', error)
    throw error
  }
}

/**
 * Generate practice exercises from note content
 */
export async function generateExercises(
  noteId: string,
  noteContent: string,
  apiKey: string
): Promise<ExerciseData[]> {
  try {
    // Check cache - only use if non-empty
    const cached = getCachedRecommendation(noteId)
    if (cached?.exercises && cached.exercises.length > 0) {
      console.log(
        '[RecommendationService] generateExercises - returning cached:',
        cached.exercises.length,
        'items'
      )
      return cached.exercises
    }

    // Truncate content to fit context window (24000 chars ≈ 6000 tokens for GPT-5.2)
    const truncatedContent = noteContent.substring(0, 24000)
    console.log(
      '[RecommendationService] generateExercises - content length:',
      truncatedContent.length
    )

    const prompt = `Analyze this note and create 5-8 practice exercises to help students master the material.

NOTE CONTENT:
${truncatedContent}

IMPORTANT RULES:
1. Use inline LaTeX math only: $formula$ (not $$...$$)
2. Include a mix of difficulty levels
3. Each exercise should be clearly described

Return ONLY a valid JSON array with this exact format:
[
  {
    "title": "Exercise Title",
    "description": "Clear description of what to do",
    "difficulty": "beginner"
  }
]

The difficulty must be one of: "beginner", "intermediate", or "advanced"

Generate exactly 5-8 exercises now:`

    const response = await chatWithAI(prompt, apiKey)
    console.log('[RecommendationService] generateExercises - AI response length:', response.length)

    const exercises = parseAIResponse<ExerciseData[]>(response, [])
    console.log(
      '[RecommendationService] generateExercises - parsed:',
      exercises.length,
      'exercises'
    )

    // Only cache if we got results
    if (exercises.length > 0) {
      const currentData: RecommendationData = getCachedRecommendation(noteId) || {}
      currentData.exercises = exercises
      cacheRecommendation(noteId, currentData)
    }

    return exercises
  } catch (error) {
    console.error('[RecommendationService] generateExercises failed:', error)
    throw error
  }
}

/**
 * Generate learning resources from note content
 */
export async function generateResources(
  noteId: string,
  noteContent: string,
  apiKey: string
): Promise<ResourceData[]> {
  try {
    // Check cache - only use if non-empty
    const cached = getCachedRecommendation(noteId)
    if (cached?.resources && cached.resources.length > 0) {
      console.log(
        '[RecommendationService] generateResources - returning cached:',
        cached.resources.length,
        'items'
      )
      return cached.resources
    }

    // Truncate content to fit context window (24000 chars ≈ 6000 tokens for GPT-5.2)
    const truncatedContent = noteContent.substring(0, 24000)
    console.log(
      '[RecommendationService] generateResources - content length:',
      truncatedContent.length
    )

    const prompt = `Analyze this note and suggest 6-10 high-quality learning resources that would help someone learn more about these topics.

NOTE CONTENT:
${truncatedContent}

IMPORTANT RULES:
1. Include a variety of resource types (books, courses, videos, papers, etc.)
2. Each resource should be clearly relevant to the note content
3. Explain why each resource is valuable

Return ONLY a valid JSON array with this exact format:
[
  {
    "type": "Book",
    "title": "Resource Title",
    "description": "Why this resource is valuable for learning this topic",
    "link": "optional URL"
  }
]

The type must be one of: "Book", "Course", "Video", "Paper", "Tutorial", or "Article"

Generate exactly 6-10 resources now:`

    const response = await chatWithAI(prompt, apiKey)
    console.log('[RecommendationService] generateResources - AI response length:', response.length)

    const resources = parseAIResponse<ResourceData[]>(response, [])
    console.log(
      '[RecommendationService] generateResources - parsed:',
      resources.length,
      'resources'
    )

    // Only cache if we got results
    if (resources.length > 0) {
      const currentData: RecommendationData = getCachedRecommendation(noteId) || {}
      currentData.resources = resources
      cacheRecommendation(noteId, currentData)
    }

    return resources
  } catch (error) {
    console.error('[RecommendationService] generateResources failed:', error)
    throw error
  }
}

// ============================================================================
// Slide Generation (Uses Gemini)
// ============================================================================

/**
 * Generate educational slides from note content using Gemini
 * Uses two-stage generation: outline + images via Gemini native SDK
 */
export async function generateSlides(
  noteId: string,
  noteContent: string,
  geminiApiKey: string,
  numSlides: number = 8,
  onProgress?: (progress: SlideGenerationProgress) => void | Promise<void>
): Promise<SlideData[]> {
  try {
    const cached = getCachedRecommendation(noteId)
    if (cached?.slides && cached.slides.length > 0) {
      return cached.slides
    }

    if (!noteContent || noteContent.length === 0) {
      throw new Error('No note content found')
    }

    const geminiProvider = createGeminiProvider({ apiKey: geminiApiKey })

    // Call the FULL generateSlideImages() which does:
    // 1. Generate outline (Stage 1)
    // 2. Generate actual images via Gemini Image API (Stage 2 - gemini-3-pro-image-preview)
    const generatedSlides = await geminiProvider.generateSlideImages(
      noteContent,
      { maxSlides: Math.min(numSlides, 14) },
      onProgress
    )

    // Convert GeneratedSlide[] to SlideData[]
    const slides: SlideData[] = generatedSlides.map((slide) => ({
      slideNumber: slide.index,
      title: slide.title,
      type: slide.type as SlideData['type'],
      imageData: slide.imageData, // Now contains actual base64 PNG data
      caption: slide.caption,
    }))

    // Update cache
    const currentData: RecommendationData = getCachedRecommendation(noteId) || {}
    currentData.slides = slides
    cacheRecommendation(noteId, currentData)

    return slides
  } catch (error) {
    console.error('[RecommendationService] generateSlides failed:', error)
    throw error
  }
}

// ============================================================================
// Main Entry Points
// ============================================================================

/**
 * Analyze note and generate all recommendations in parallel
 */
export async function analyzeNoteForRecommendations(
  noteId: string,
  noteContent: string,
  apiKey: string,
  types?: RecommendationType[]
): Promise<RecommendationData> {
  // Check cache first
  const cached = getCachedRecommendation(noteId)
  if (cached && !types) {
    return cached
  }

  const typesToGenerate = types || ['mindmap', 'flashcards', 'concepts', 'exercises', 'resources']

  const promises: Promise<unknown>[] = []
  const promiseTypes: RecommendationType[] = []

  for (const type of typesToGenerate) {
    if (type === 'slides') continue // Slides need Gemini key

    let promise: Promise<unknown>

    switch (type) {
      case 'mindmap':
        promise = generateMindmap(noteId, noteContent, apiKey)
        break
      case 'flashcards':
        promise = generateFlashcards(noteId, noteContent, apiKey)
        break
      case 'concepts':
        promise = generateConcepts(noteId, noteContent, apiKey)
        break
      case 'exercises':
        promise = generateExercises(noteId, noteContent, apiKey)
        break
      case 'resources':
        promise = generateResources(noteId, noteContent, apiKey)
        break
      default:
        continue
    }

    promises.push(promise)
    promiseTypes.push(type)
  }

  const results = await Promise.allSettled(promises)

  const data: RecommendationData = {}

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      const type = promiseTypes[index]
      switch (type) {
        case 'mindmap':
          data.mindmap = result.value as MindmapData
          break
        case 'flashcards':
          data.flashcards = result.value as FlashcardData[]
          break
        case 'concepts':
          data.concepts = result.value as ConceptData[]
          break
        case 'exercises':
          data.exercises = result.value as ExerciseData[]
          break
        case 'resources':
          data.resources = result.value as ResourceData[]
          break
      }
    }
  })

  // Cache the complete result
  cacheRecommendation(noteId, data)

  return data
}

/**
 * Generate a specific recommendation type on demand
 */
export async function generateRecommendation(
  noteId: string,
  noteContent: string,
  type: RecommendationType,
  apiKey: string,
  geminiApiKey?: string
): Promise<RecommendationData> {
  switch (type) {
    case 'mindmap':
      await generateMindmap(noteId, noteContent, apiKey)
      break
    case 'flashcards':
      await generateFlashcards(noteId, noteContent, apiKey)
      break
    case 'concepts':
      await generateConcepts(noteId, noteContent, apiKey)
      break
    case 'exercises':
      await generateExercises(noteId, noteContent, apiKey)
      break
    case 'resources':
      await generateResources(noteId, noteContent, apiKey)
      break
    case 'slides':
      if (!geminiApiKey) {
        throw new Error('Gemini API key required for slide generation')
      }
      await generateSlides(noteId, noteContent, geminiApiKey)
      break
  }

  return getCachedRecommendation(noteId) || {}
}

// ============================================================================
// Service Class (for dependency injection)
// ============================================================================

export class RecommendationService {
  constructor(
    private openaiApiKey: string,
    private geminiApiKey?: string
  ) {}

  async generateMindmap(noteId: string, noteContent: string) {
    return generateMindmap(noteId, noteContent, this.openaiApiKey)
  }

  async generateFlashcards(noteId: string, noteContent: string) {
    return generateFlashcards(noteId, noteContent, this.openaiApiKey)
  }

  async generateConcepts(noteId: string, noteContent: string) {
    return generateConcepts(noteId, noteContent, this.openaiApiKey)
  }

  async generateExercises(noteId: string, noteContent: string) {
    return generateExercises(noteId, noteContent, this.openaiApiKey)
  }

  async generateResources(noteId: string, noteContent: string) {
    return generateResources(noteId, noteContent, this.openaiApiKey)
  }

  async generateSlides(
    noteId: string,
    noteContent: string,
    numSlides?: number,
    onProgress?: (progress: SlideGenerationProgress) => void | Promise<void>
  ) {
    if (!this.geminiApiKey) {
      throw new Error('Gemini API key required for slide generation')
    }
    return generateSlides(noteId, noteContent, this.geminiApiKey, numSlides, onProgress)
  }

  async analyzeAll(noteId: string, noteContent: string, types?: RecommendationType[]) {
    return analyzeNoteForRecommendations(noteId, noteContent, this.openaiApiKey, types)
  }

  clearCache(noteId: string) {
    clearRecommendationCache(noteId)
  }

  clearAllCache() {
    clearAllRecommendationCache()
  }
}
