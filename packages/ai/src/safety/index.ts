/**
 * Safety Module — Barrel Export
 *
 * Centralized safety infrastructure for the Inkdown AI system.
 */

export { detectInjection, sanitizeForLLM, sanitizeWebContent } from './input-guard'
export type { InjectionDetectionResult, WebSearchResult } from './input-guard'

export { sanitizeOutput } from './output-guard'

export { CONTENT_POLICY_DIRECTIVE, buildSystemPrompt } from './content-policy'

export { verifyCitations } from './citation-verifier'
export type { CitationVerificationResult } from './citation-verifier'
