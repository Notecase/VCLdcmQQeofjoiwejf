// ============================================================
// SLIDE GENERATOR — packages/ai/src/agents/course/slide-generator.ts
// AI SDK v6 powered slide deck generation
// ============================================================

import { generateText } from 'ai'
import type { SlideData } from '@inkdown/shared/types'
import { sanitizeJSONString } from './tools'
import { resolveModel } from '../../providers/ai-sdk-factory'
import { trackAISDKUsage } from '../../providers/ai-sdk-usage'

export async function generateSlidesWithModel(
  lessonTitle: string,
  keyTopics: string[],
  researchContext: string,
  _geminiApiKey?: string,
  _modelName?: string,
  maxSlides: number = 15
): Promise<SlideData[]> {
  const { model, entry } = resolveModel('slides')

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

  const { text } = await generateText({
    model,
    prompt,
    temperature: 0.7,
    onFinish: trackAISDKUsage({ model: entry.id, taskType: 'slides' }),
  })

  return parseSlidesJSON(text)
}

export async function generateSlides(
  lessonTitle: string,
  keyTopics: string[],
  researchContext: string,
  _geminiApiKey?: string,
  maxSlides: number = 15
): Promise<SlideData[]> {
  return generateSlidesWithModel(
    lessonTitle,
    keyTopics,
    researchContext,
    undefined,
    undefined,
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
