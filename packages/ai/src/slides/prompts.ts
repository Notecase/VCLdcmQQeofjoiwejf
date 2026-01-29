/**
 * Slide Generation Prompts
 *
 * Prompt templates for AI-generated educational slides.
 * Ported from Note3's geminiService.ts
 */

import type { SlideType } from './themes'

// ============================================================================
// Slide Outline Prompt
// ============================================================================

export const SLIDE_OUTLINE_PROMPT = `You are an expert PowerPoint presentation designer creating educational slides. Analyze the following note content and create a detailed outline for a professional presentation.

NOTE CONTENT:
{NOTE_CONTENT}

Create a comprehensive presentation plan. Determine the optimal number of slides (max {NUM_SLIDES}) to explain these concepts effectively.

For each slide, you must determine:
1. The slide title
2. The best slide layout/type (concept, diagram, comparison, etc.)
3. The specific content to include
4. A detailed image generation prompt for a high-fidelity slide

CRITICAL:
- You have FULL AUTONOMY over the structure. Do NOT follow a fixed template like "The What/The Why".
- Choose section headers that are descriptive and specific to the content (e.g., "Market Trends", "Neural Architecture", "Historical Context").
- Ensure a consistent "Visual Style Strategy" is defined for the whole deck.

For "Visual Style Strategy", determine:
- theme: "Technical/Engineering", "Organic/Biological", "History/Paper", or "Modern/Abstract"
- primaryColor: Dominant professional color
- accentColor: High-contrast accent color
- backgroundTexture: Texture description (e.g., "grid", "paper", "noise")

Return ONLY a JSON array:
[
  {
    "slideNumber": 1,
    "title": "Descriptive Title",
    "type": "concept|architecture|process|comparison|example|overview",
    "keyPoints": ["Point 1", "Point 2"],
    "visualElements": ["diagram description", "chart description"],
    "imagePrompt": "Detailed prompt for the image generator...",
    "visualStyle": {
      "theme": "Technical/Engineering",
      "primaryColor": "#001f3f",
      "accentColor": "#FFD700",
      "backgroundTexture": "clean light background with subtle engineering grid pattern"
    }
  }
]`

// ============================================================================
// Type-Specific Prompt Templates
// ============================================================================

export const ARCHITECTURE_PROMPT_TEMPLATE = `Create a COMPLETE PowerPoint presentation slide explaining: {TOPIC}

SLIDE TITLE (at very top):
"{TITLE}" in distinct, bold, high-contrast text

CONTENT & GOAL:
{CONTEXT}

DESIGN INSTRUCTION:
- Design a layout that BEST communicates this specific system or structure.
- You have full autonomy to choose split-screen, full-width diagram, or other layouts.
- Use clear hierarchies and bold headers.
- DO NOT use generic headers like "The What" or "The Logic". Use specific, descriptive headers relevant to the topic.
- Include annotations and arrows where they add value.

VISUAL STYLE & THEME (MUST FOLLOW):
- Theme: {THEME}
- Background: {BACKGROUND_TEXTURE}
- Primary Color: {PRIMARY_COLOR}
- Accent Color: {ACCENT_COLOR}
- Style: Professional notebook/blueprint aesthetic. High fidelity lines.
- No flat vector art. Use textured, professional rendering.`

export const CONCEPT_PROMPT_TEMPLATE = `Create a COMPLETE PowerPoint presentation slide explaining the concept: {TOPIC}

SLIDE TITLE (at very top):
"{TITLE}" in distinct, bold, high-contrast text

CONTENT & GOAL:
{CONTEXT}

DESIGN INSTRUCTION:
- Design a layout that BEST explains this concept.
- If it's a mathematical concept, center the formula and annotate it.
- If it's a structural concept, use a diagram.
- Use specific, descriptive headers (e.g., "Key Principles", "Historical Impact") instead of generic ones.
- Ensure the slide is balanced and professional.

VISUAL STYLE & THEME (MUST FOLLOW):
- Theme: {THEME}
- Background: {BACKGROUND_TEXTURE}
- Primary Color: {PRIMARY_COLOR}
- Accent Color: {ACCENT_COLOR}
- Style: Professional high-fidelity presentation.
- Rendering: Clean, sharp lines, subtle depth.`

export const PROCESS_PROMPT_TEMPLATE = `Create a COMPLETE PowerPoint presentation slide showing the process: {TOPIC}

SLIDE TITLE (at top):
"{TITLE}" in distinct, bold, high-contrast text

CONTENT & GOAL:
{CONTEXT}

DESIGN INSTRUCTION:
- Design a visual flow that clearly communicates the steps or evolution.
- Choose the best layout: horizontal flow, vertical list, or cyclical diagram.
- Use clear indicators (numbers, arrows) to guide the eye.
- DO NOT Use generic headers.
- Focus on clarity and readability.

VISUAL STYLE & THEME (MUST FOLLOW):
- Theme: {THEME}
- Background: {BACKGROUND_TEXTURE}
- Primary Color: {PRIMARY_COLOR}
- Accent Color: {ACCENT_COLOR}
- Style: Clean visual process flow. High readability.`

export const GRAPH_PROMPT_TEMPLATE = `Create a COMPLETE PowerPoint presentation slide with data visualization: {TOPIC}

SLIDE TITLE (at top):
"{TITLE}" in distinct, bold, high-contrast text

CONTENT & GOAL:
{CONTEXT}

DESIGN INSTRUCTION:
- Choose the best data visualization type (bar, line, scatter, etc.) for this data.
- Layout the slide to highlight the key insights effectively.
- Ensure axis labels and data points are large and legible.
- Use callouts or annotations to explain the "So What?" of the data.

VISUAL STYLE & THEME (MUST FOLLOW):
- Theme: {THEME}
- Background: {BACKGROUND_TEXTURE}
- Primary Color: {PRIMARY_COLOR}
- Accent Color: {ACCENT_COLOR}
- Style: Professional notebook/scientific publication aesthetic.`

export const COMPARISON_PROMPT_TEMPLATE = `Create a COMPLETE PowerPoint presentation slide comparing: {TOPIC}

SLIDE TITLE (at top):
"{TITLE}" in distinct, bold, high-contrast text

CONTENT & GOAL:
{CONTEXT}

DESIGN INSTRUCTION:
- Design a layout that clearly juxtaposes the two (or more) concepts.
- Choose between a Split-Screen, Table/Matrix, or Overlaid Diagram layout.
- Ensure distinctive visual separation between the compared items.
- Use headers that name the concepts being compared.

VISUAL STYLE & THEME (MUST FOLLOW):
- Theme: {THEME}
- Background: {BACKGROUND_TEXTURE}
- Primary Color: {PRIMARY_COLOR}
- Accent Color: {ACCENT_COLOR}
- Style: Clean, symmetrical, professional comparison.`

export const OVERVIEW_PROMPT_TEMPLATE = `Create a COMPLETE PowerPoint presentation slide overview: {TOPIC}

SLIDE TITLE (at top):
"{TITLE}" in distinct, bold, high-contrast text

CONTENT & GOAL:
{CONTEXT}

DESIGN INSTRUCTION:
- Design a high-level overview layout.
- You might use a central hub diagram, a list of key pillars, or a dashboard style.
- Ensure the main takeaways are immediately visible.
- Use iconography and large text for impact.

VISUAL STYLE & THEME (MUST FOLLOW):
- Theme: {THEME}
- Background: {BACKGROUND_TEXTURE}
- Primary Color: {PRIMARY_COLOR}
- Accent Color: {ACCENT_COLOR}
- Style: Broad, clean overview. Engaging visual hierarchy.`

// ============================================================================
// Prompt Template Map
// ============================================================================

export const PROMPT_TEMPLATES: Record<SlideType, string> = {
  architecture: ARCHITECTURE_PROMPT_TEMPLATE,
  concept: CONCEPT_PROMPT_TEMPLATE,
  process: PROCESS_PROMPT_TEMPLATE,
  graph: GRAPH_PROMPT_TEMPLATE,
  comparison: COMPARISON_PROMPT_TEMPLATE,
  overview: OVERVIEW_PROMPT_TEMPLATE,
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the appropriate prompt template for a slide type
 */
export function getPromptTemplate(type: SlideType): string {
  return PROMPT_TEMPLATES[type] || OVERVIEW_PROMPT_TEMPLATE
}

// Alias for compatibility
export const getSlidePrompt = getPromptTemplate

// Visual style interface
export interface SlideVisualStyle {
  theme: string
  primaryColor: string
  accentColor: string
  backgroundTexture: string
}

/**
 * Build a slide generation prompt from template
 */
export function buildSlidePrompt(
  type: SlideType,
  params: {
    topic: string
    title: string
    context: string
    theme: string
    backgroundTexture: string
    primaryColor: string
    accentColor: string
  }
): string {
  const template = getPromptTemplate(type)

  return template
    .replace('{TOPIC}', params.topic)
    .replace('{TITLE}', params.title)
    .replace('{CONTEXT}', params.context)
    .replace('{THEME}', params.theme)
    .replace('{BACKGROUND_TEXTURE}', params.backgroundTexture)
    .replace('{PRIMARY_COLOR}', params.primaryColor)
    .replace('{ACCENT_COLOR}', params.accentColor)
}

/**
 * Build the slide outline prompt
 */
export function buildOutlinePrompt(noteContent: string, maxSlides: number): string {
  return SLIDE_OUTLINE_PROMPT
    .replace('{NOTE_CONTENT}', noteContent.substring(0, 8000))
    .replace('{NUM_SLIDES}', String(Math.min(maxSlides, 14)))
}
