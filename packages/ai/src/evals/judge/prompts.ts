/**
 * Judge Prompt Templates
 *
 * Builds structured prompts for LLM-as-judge evaluation across 7 quality dimensions.
 * Each prompt sets the role, provides a 1-5 rubric with anchored descriptions,
 * includes calibration examples, and requests structured JSON output.
 */

import type { CalibrationExample } from '../types'

// =============================================================================
// Rubric Definitions
// =============================================================================

type JudgeDimension =
  | 'depth'
  | 'structure'
  | 'citation-integrity'
  | 'synthesis'
  | 'intent-alignment'
  | 'voice-preservation'
  | 'design-quality'

interface RubricLevel {
  score: number
  label: string
  description: string
}

interface DimensionRubric {
  dimension: JudgeDimension
  description: string
  levels: RubricLevel[]
}

const RUBRICS: Record<JudgeDimension, DimensionRubric> = {
  depth: {
    dimension: 'depth',
    description:
      'How deeply the output explores the topic. Measures analytical rigor, use of concrete examples, and whether the response goes beyond surface-level information.',
    levels: [
      {
        score: 1,
        label: 'Surface-only',
        description:
          'Only states basic facts with no analysis. A reader learns nothing beyond what a single Google search would reveal. Example: "Python is a programming language used for many things."',
      },
      {
        score: 2,
        label: 'Shallow explanation',
        description:
          'Explains concepts but superficially. Touches on "why" but without supporting evidence or examples. Feels like a rushed summary.',
      },
      {
        score: 3,
        label: 'Decent analysis',
        description:
          'Provides reasonable analysis with some supporting points. Covers the topic adequately but misses nuances or advanced considerations.',
      },
      {
        score: 4,
        label: 'Thorough with examples',
        description:
          'In-depth exploration with concrete examples, comparisons, or data points. Addresses edge cases and trade-offs. A knowledgeable reader would find value.',
      },
      {
        score: 5,
        label: 'Expert-level deep dive',
        description:
          'Demonstrates mastery-level understanding. Includes original analysis, historical context, counterarguments, and nuanced trade-offs. Could be published as a reference piece.',
      },
    ],
  },

  structure: {
    dimension: 'structure',
    description:
      'Organization and readability of the output. Evaluates logical flow, use of headings, transitions between sections, and overall document architecture.',
    levels: [
      {
        score: 1,
        label: 'No organization',
        description:
          'Wall of text with no headings, sections, or logical grouping. Ideas jump randomly between topics. Painful to read.',
      },
      {
        score: 2,
        label: 'Some headings',
        description:
          'Has basic headings or bullet points but the flow is disjointed. Sections exist but their order feels arbitrary.',
      },
      {
        score: 3,
        label: 'Logical flow',
        description:
          'Clear section organization with a discernible progression. Readable, though transitions between ideas could be smoother.',
      },
      {
        score: 4,
        label: 'Well-structured with transitions',
        description:
          'Professional structure with clear hierarchy, smooth transitions, and appropriate use of formatting (headings, lists, code blocks). Easy to scan and navigate.',
      },
      {
        score: 5,
        label: 'Publishable structure',
        description:
          'Magazine-quality organization. Perfect information hierarchy, each section builds on the previous, concludes with synthesis. Could be published as-is.',
      },
    ],
  },

  'citation-integrity': {
    dimension: 'citation-integrity',
    description:
      'Accuracy and reliability of referenced sources. Checks whether citations are real, properly attributed, and include verifiable details like dates and URLs.',
    levels: [
      {
        score: 1,
        label: 'Fabricated sources',
        description:
          'Contains hallucinated citations -- references to papers, articles, or data that do not exist. Actively misleading.',
      },
      {
        score: 2,
        label: 'Vague references',
        description:
          'Makes claims like "studies show" or "experts say" without naming specific sources. Impossible to verify.',
      },
      {
        score: 3,
        label: 'Some real sources',
        description:
          'References some real publications or authors but lacks full citation details. Mix of verifiable and unverifiable claims.',
      },
      {
        score: 4,
        label: 'Well-cited',
        description:
          'Most claims are attributed to specific, verifiable sources. Includes author names, publication names, and approximate dates for key claims.',
      },
      {
        score: 5,
        label: 'Rigorous with dates',
        description:
          'All factual claims are backed by specific, verifiable sources with full attribution (author, title, date, URL where applicable). Distinguishes between established facts and claims needing citation.',
      },
    ],
  },

  synthesis: {
    dimension: 'synthesis',
    description:
      'Originality of how information is combined and presented. Measures whether the output creates new understanding by connecting ideas rather than merely restating sources.',
    levels: [
      {
        score: 1,
        label: 'Copy-paste feel',
        description:
          'Reads like chunks copied from different sources and pasted together. No original voice or connective tissue between ideas.',
      },
      {
        score: 2,
        label: 'Basic paraphrase',
        description:
          'Rephrases source material but does not combine ideas in new ways. Each paragraph could stand alone without the others.',
      },
      {
        score: 3,
        label: 'Some original connection',
        description:
          'Draws a few connections between different sources or ideas. Shows some original thinking but mostly follows standard narratives.',
      },
      {
        score: 4,
        label: 'Strong synthesis',
        description:
          'Weaves multiple sources into a coherent narrative with original framing. Identifies patterns, contrasts viewpoints, and draws non-obvious conclusions.',
      },
      {
        score: 5,
        label: 'Novel insights',
        description:
          'Creates genuinely new understanding by combining information in unexpected ways. Surfaces insights that none of the individual sources contain. Publishable original analysis.',
      },
    ],
  },

  'intent-alignment': {
    dimension: 'intent-alignment',
    description:
      'How well the output matches what the user actually asked for. Evaluates whether the response addresses the stated need, appropriate scope, and implicit expectations.',
    levels: [
      {
        score: 1,
        label: 'Misunderstood request',
        description:
          "The output addresses a different topic or completely misinterprets the user's intent. Example: user asks for a comparison table but gets a narrative essay.",
      },
      {
        score: 2,
        label: 'Partially relevant',
        description:
          'Touches on the right topic but misses key aspects of the request. Answers a related but different question.',
      },
      {
        score: 3,
        label: 'Addresses request',
        description:
          'Covers the core of what was asked. Meets the basic requirements but does not go beyond the literal interpretation.',
      },
      {
        score: 4,
        label: 'Anticipates needs',
        description:
          'Fully addresses the request AND anticipates follow-up questions or unstated needs. Provides context the user did not ask for but clearly benefits from.',
      },
      {
        score: 5,
        label: 'Exceeds expectations',
        description:
          "Not only answers perfectly but reframes the question in a more useful way, provides actionable next steps, and demonstrates deep understanding of the user's underlying goal.",
      },
    ],
  },

  'voice-preservation': {
    dimension: 'voice-preservation',
    description:
      'How well the output matches the existing writing style when editing or extending a document. Evaluates tone, vocabulary level, sentence patterns, and stylistic consistency.',
    levels: [
      {
        score: 1,
        label: 'Completely different voice',
        description:
          'The added content is jarring -- clearly written by a different "author." Tone, vocabulary, and sentence structure clash with the original.',
      },
      {
        score: 2,
        label: 'Inconsistent',
        description:
          'Some sentences match the original style but others feel distinctly AI-generated. Switches between formal and casual without reason.',
      },
      {
        score: 3,
        label: 'Acceptable',
        description:
          'Generally compatible with the original voice. A careful reader might notice the transition but it does not distract.',
      },
      {
        score: 4,
        label: 'Natural match',
        description:
          'Convincingly matches the original voice. Same vocabulary level, sentence rhythm, and tone. Only an expert would detect the boundary.',
      },
      {
        score: 5,
        label: 'Seamless continuation',
        description:
          'Indistinguishable from the original author. Captures not just style but personality -- the same quirks, emphasis patterns, and perspective. No seam visible.',
      },
    ],
  },

  'design-quality': {
    dimension: 'design-quality',
    description:
      'Visual and functional quality of generated artifacts (HTML, CSS, interactive components). Evaluates aesthetics, responsiveness, accessibility, and production readiness.',
    levels: [
      {
        score: 1,
        label: 'Broken/ugly',
        description:
          'Renders incorrectly, has broken layouts, missing styles, or is visually unusable. Would embarrass the user if shared.',
      },
      {
        score: 2,
        label: 'Functional but poor',
        description:
          'Works technically but looks like a homework assignment. Default browser styling, misaligned elements, no visual hierarchy.',
      },
      {
        score: 3,
        label: 'Acceptable',
        description:
          'Decent appearance with basic styling. Usable but clearly "template-like." Would pass in an internal tool but not a customer-facing product.',
      },
      {
        score: 4,
        label: 'Polished',
        description:
          'Professional appearance with thoughtful color choices, typography, spacing, and responsive behavior. Minor refinements needed for production.',
      },
      {
        score: 5,
        label: 'Production-ready',
        description:
          'Could be shipped to customers immediately. Pixel-perfect, accessible, responsive, with smooth interactions and attention to detail.',
      },
    ],
  },
}

// =============================================================================
// Prompt Builder
// =============================================================================

function formatRubric(rubric: DimensionRubric): string {
  const lines = rubric.levels.map(
    (level) => `  ${level.score} — ${level.label}: ${level.description}`
  )
  return lines.join('\n')
}

function formatCalibrationExamples(examples: CalibrationExample[]): string {
  if (examples.length === 0) return ''

  const blocks = examples.map(
    (ex, i) =>
      `--- Calibration Example ${i + 1} ---
Prompt: ${ex.prompt}
Output (excerpt): ${ex.output}
Human Score: ${ex.score}/5
Reasoning: ${ex.reasoning}`
  )

  return `
## Calibration Examples

Use these human-scored examples to anchor your judgment. Your scores should be consistent with these benchmarks.

${blocks.join('\n\n')}
`
}

/**
 * Build a complete judge prompt for a given evaluation dimension.
 *
 * The prompt instructs the LLM to act as a strict editor, apply the rubric,
 * consider calibration examples, and return a structured JSON response.
 *
 * @param dimension - Quality dimension to evaluate (e.g., 'depth', 'structure')
 * @param userPrompt - The original user request that produced the output
 * @param agentOutput - The AI agent's response to evaluate
 * @param calibrationExamples - Optional pre-scored examples to anchor judgment
 * @returns Complete prompt string ready for LLM consumption
 */
export function buildJudgePrompt(
  dimension: string,
  userPrompt: string,
  agentOutput: string,
  calibrationExamples?: CalibrationExample[]
): string {
  const rubric = RUBRICS[dimension as JudgeDimension]

  if (!rubric) {
    // For unknown dimensions, build a generic prompt
    return buildGenericPrompt(dimension, userPrompt, agentOutput)
  }

  const calibrationSection = formatCalibrationExamples(calibrationExamples ?? [])

  return `You are a strict editor evaluating AI-generated content. Your task is to score the output on a single dimension: **${rubric.dimension}**.

## Dimension: ${rubric.dimension}

${rubric.description}

## Rubric (1-5 scale)

${formatRubric(rubric)}

${calibrationSection}

## Content to Evaluate

### User Prompt
${userPrompt}

### Agent Output
${agentOutput}

## Instructions

1. Read the user prompt carefully to understand what was requested.
2. Read the agent output thoroughly.
3. Compare the output against each rubric level, starting from level 1.
4. Select the score that BEST matches the output. Do not round up out of generosity — be strict.
5. Provide concrete evidence from the text supporting your score.
6. Diagnose the root cause of any quality issues (e.g., "system prompt lacks specificity", "model defaults to bullet lists", "no web search was used for time-sensitive claims").
7. Suggest a specific, actionable improvement.

## Required Output Format

Respond with ONLY a JSON object (no markdown fencing, no explanation outside the JSON):

{
  "score": <integer 1-5>,
  "evidence": "<2-3 sentences citing specific parts of the output that justify your score>",
  "diagnosis": "<1-2 sentences identifying the root cause of quality issues, or 'No issues identified' for score 5>",
  "suggestion": "<1 concrete, actionable suggestion to improve the output>"
}`
}

/**
 * Fallback prompt for dimensions not in the predefined rubric set.
 * Uses a generic 1-5 scale without dimension-specific anchors.
 */
function buildGenericPrompt(dimension: string, userPrompt: string, agentOutput: string): string {
  return `You are a strict editor evaluating AI-generated content. Your task is to score the output on a single dimension: **${dimension}**.

## Rubric (1-5 scale)

  1 — Very poor: Fails completely on this dimension.
  2 — Below average: Significant issues, barely functional.
  3 — Adequate: Meets minimum requirements but nothing more.
  4 — Good: Above average with minor issues.
  5 — Excellent: Exceptional quality, no meaningful issues.

## Content to Evaluate

### User Prompt
${userPrompt}

### Agent Output
${agentOutput}

## Instructions

1. Evaluate the output strictly on the "${dimension}" dimension.
2. Provide concrete evidence from the text.
3. Diagnose root causes of any issues.
4. Suggest a specific improvement.

## Required Output Format

Respond with ONLY a JSON object (no markdown fencing, no explanation outside the JSON):

{
  "score": <integer 1-5>,
  "evidence": "<2-3 sentences citing specific parts of the output that justify your score>",
  "diagnosis": "<1-2 sentences identifying the root cause of quality issues, or 'No issues identified' for score 5>",
  "suggestion": "<1 concrete, actionable suggestion to improve the output>"
}`
}

/** Exported for testing — the raw rubric definitions */
export { RUBRICS }
export type { JudgeDimension, DimensionRubric, RubricLevel }
