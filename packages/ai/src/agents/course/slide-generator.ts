// ============================================================
// SLIDE GENERATOR — packages/ai/src/agents/course/slide-generator.ts
// Gemini-powered slide deck generation
// ============================================================

import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import type { SlideData } from '@inkdown/shared/types'
import { sanitizeJSONString } from './tools'

export async function generateSlidesWithModel(
  lessonTitle: string,
  keyTopics: string[],
  researchContext: string,
  geminiApiKey: string,
  modelName: string = 'gemini-3-flash-preview',
  maxSlides: number = 15
): Promise<SlideData[]> {
  const model = new ChatGoogleGenerativeAI({
    model: modelName,
    apiKey: geminiApiKey,
    temperature: 0.7,
    json: true,
  })

  const prompt = `Create a professional slide deck for the following lesson.

## Lesson Title
${lessonTitle}

## Key Topics
${keyTopics.join(', ')}

## Research Context
${researchContext}

## Requirements
- Create ${Math.min(maxSlides, 20)} slides maximum, at least 6
- First slide: Title slide with lesson title and a descriptive subtitle
- Last slide: Summary of key takeaways
- Each slide should have a clear title and 3-5 concise bullet points
- Include speaker notes for each slide
- Suggest visual elements where helpful (diagram descriptions, chart types)
- Keep bullet points concise (max 10 words each)
- Build concepts progressively

Return ONLY a JSON array of slide objects with this structure:
\`\`\`json
[
  {
    "id": 1,
    "title": "Slide Title",
    "subtitle": "Optional subtitle",
    "bullets": ["Point 1", "Point 2", "Point 3"],
    "notes": "Detailed speaker notes for this slide...",
    "visual": "Description of suggested visual element"
  }
]
\`\`\`

Return ONLY the JSON array, no additional text.`

  const response = await model.invoke(prompt)
  const content =
    typeof response.content === 'string'
      ? response.content
      : response.content.map((c) => ('text' in c ? c.text : '')).join('')

  return parseSlidesJSON(content)
}

export async function generateSlides(
  lessonTitle: string,
  keyTopics: string[],
  researchContext: string,
  geminiApiKey: string,
  maxSlides: number = 15
): Promise<SlideData[]> {
  return generateSlidesWithModel(
    lessonTitle,
    keyTopics,
    researchContext,
    geminiApiKey,
    'gemini-3-flash-preview',
    maxSlides
  )
}

function parseSlidesJSON(text: string): SlideData[] {
  // Try extracting from markdown code blocks first
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/)
  const rawJson = codeBlockMatch ? codeBlockMatch[1] : text.trim()
  const jsonStr = sanitizeJSONString(rawJson)

  const parsed = JSON.parse(jsonStr)
  const rawSlides: unknown[] = Array.isArray(parsed)
    ? parsed
    : (((parsed as Record<string, unknown>).slides as unknown[]) ?? [])

  return rawSlides.map((raw, index) => {
    const slide = raw as Record<string, unknown>
    return {
      id: typeof slide.id === 'number' ? slide.id : index + 1,
      title: String(slide.title ?? ''),
      subtitle: slide.subtitle != null ? String(slide.subtitle) : undefined,
      bullets: Array.isArray(slide.bullets) ? (slide.bullets as unknown[]).map(String) : undefined,
      notes: slide.notes != null ? String(slide.notes) : undefined,
      visual: slide.visual != null ? String(slide.visual) : undefined,
    }
  })
}
