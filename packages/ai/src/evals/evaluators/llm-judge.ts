/**
 * LLM Judge Evaluator
 *
 * Uses a separate LLM to score agent output on a single quality dimension.
 * Parses the structured JSON response, maps diagnosis patterns to FixSignals,
 * and returns a DimensionResult.
 */

import { generateText } from 'ai'
import { resolveModel } from '../../providers/ai-sdk-factory'
import { buildJudgePrompt } from '../judge/prompts'
import { getCalibrationExamples } from '../judge/calibration'
import type { DimensionResult, DimensionName, FixSignal, CalibrationExample } from '../types'

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_JUDGE_MODEL = 'gemini-3-flash-preview'

/** Maximum tokens for judge response (JSON is compact) */
const MAX_JUDGE_TOKENS = 1024

// =============================================================================
// Response Parsing
// =============================================================================

interface JudgeResponse {
  score: number
  evidence: string
  diagnosis: string
  suggestion: string
}

/**
 * Extract and parse the JSON response from the judge model.
 * Handles common LLM quirks: markdown fencing, trailing text, etc.
 */
function parseJudgeResponse(text: string): JudgeResponse {
  // Strip markdown code fences if present
  let cleaned = text.trim()
  if (cleaned.startsWith('```')) {
    // Remove opening fence (with optional language tag)
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '')
    // Remove closing fence
    cleaned = cleaned.replace(/\n?```\s*$/, '')
  }

  // Try to extract JSON object if there is surrounding text
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    return {
      score: 0,
      evidence: 'Failed to parse judge response — no JSON object found.',
      diagnosis: `Raw response: ${text.slice(0, 200)}`,
      suggestion: 'Check judge model output format.',
    }
  }

  const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>

  const score = typeof parsed.score === 'number' ? Math.round(parsed.score) : 0
  const clampedScore = Math.max(0, Math.min(5, score))

  return {
    score: clampedScore,
    evidence: typeof parsed.evidence === 'string' ? parsed.evidence : '',
    diagnosis: typeof parsed.diagnosis === 'string' ? parsed.diagnosis : '',
    suggestion: typeof parsed.suggestion === 'string' ? parsed.suggestion : '',
  }
}

// =============================================================================
// Fix Signal Generation
// =============================================================================

/** Diagnosis pattern → FixSignal mapping */
interface DiagnosisPattern {
  pattern: RegExp
  component: FixSignal['component']
  priority: FixSignal['priority']
}

const DIAGNOSIS_PATTERNS: DiagnosisPattern[] = [
  {
    pattern: /system prompt|instruction|directive/i,
    component: 'system-prompt',
    priority: 'high',
  },
  {
    pattern: /tool definition|tool schema|tool description/i,
    component: 'tool-definition',
    priority: 'medium',
  },
  {
    pattern: /model config|temperature|max.?tokens|model selection/i,
    component: 'model-config',
    priority: 'medium',
  },
  {
    pattern: /post.?process|format|clean.?up|trim/i,
    component: 'post-processing',
    priority: 'low',
  },
  {
    pattern: /agent logic|routing|planning|decompos/i,
    component: 'agent-logic',
    priority: 'high',
  },
  {
    pattern: /bullet|list|heading|markdown/i,
    component: 'system-prompt',
    priority: 'medium',
  },
  {
    pattern: /search|web|citation|source|reference/i,
    component: 'tool-definition',
    priority: 'medium',
  },
  {
    pattern: /voice|tone|style|writing/i,
    component: 'system-prompt',
    priority: 'medium',
  },
  {
    pattern: /design|css|layout|responsive|render/i,
    component: 'post-processing',
    priority: 'medium',
  },
]

/**
 * Map a diagnosis string to a FixSignal by matching against known patterns.
 * Returns undefined if no pattern matches.
 */
function generateFixSignal(diagnosis: string, suggestion: string): FixSignal | undefined {
  if (!diagnosis || diagnosis === 'No issues identified') return undefined

  for (const { pattern, component, priority } of DIAGNOSIS_PATTERNS) {
    if (pattern.test(diagnosis) || pattern.test(suggestion)) {
      return { component, suggestion, priority }
    }
  }

  // Default: attribute to system-prompt with low priority
  return {
    component: 'system-prompt',
    suggestion,
    priority: 'low',
  }
}

// =============================================================================
// Main Evaluator
// =============================================================================

/**
 * Evaluate agent output on a single dimension using an LLM judge.
 *
 * The judge model receives:
 *   - A rubric with anchored 1-5 descriptions for the dimension
 *   - Calibration examples (golden human-scored samples)
 *   - The user prompt and agent output
 *
 * Returns a DimensionResult with score, evidence, diagnosis, and optional FixSignal.
 *
 * @param dimension - Quality dimension to evaluate
 * @param userPrompt - The original user request
 * @param agentOutput - The AI agent's response text
 * @param threshold - Minimum score (1-5) to pass
 * @param options - Optional overrides (judge model ID)
 */
export async function evaluateWithJudge(
  dimension: DimensionName,
  userPrompt: string,
  agentOutput: string,
  threshold: number,
  options?: { model?: string }
): Promise<DimensionResult> {
  try {
    // Gather calibration examples for this dimension
    const calibrationExamples: CalibrationExample[] = getCalibrationExamples(dimension)

    // Build the judge prompt
    const prompt = buildJudgePrompt(dimension, userPrompt, agentOutput, calibrationExamples)

    // Resolve the judge model
    const modelId = options?.model ?? DEFAULT_JUDGE_MODEL
    const { model } = resolveModel('chat', modelId)

    // Call the judge
    const result = await generateText({
      model,
      prompt,
      maxOutputTokens: MAX_JUDGE_TOKENS,
      temperature: 0, // Deterministic scoring
    })

    // Parse the response
    const response = parseJudgeResponse(result.text)

    // Generate fix signal from diagnosis
    const fixSignal =
      response.score < threshold
        ? generateFixSignal(response.diagnosis, response.suggestion)
        : undefined

    return {
      dimension,
      evaluator: 'llm-judge',
      score: response.score,
      passed: response.score >= threshold,
      threshold,
      evidence: response.evidence,
      diagnosis: response.diagnosis,
      fixSignal,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    return {
      dimension,
      evaluator: 'llm-judge',
      score: 0,
      passed: false,
      threshold,
      evidence: 'Judge evaluation failed.',
      diagnosis: `Judge error: ${message}`,
      fixSignal: {
        component: 'model-config',
        suggestion: `Judge model failed for dimension "${dimension}". Check API key and model availability.`,
        priority: 'high',
      },
    }
  }
}
