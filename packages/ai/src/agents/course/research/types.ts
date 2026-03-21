import type { ResearchProgress, ResearchSource } from '@inkdown/shared/types'

export interface DeepResearchConfig {
  /** @deprecated AI SDK factory reads GOOGLE_AI_API_KEY from env. Falls back to env if not provided. */
  geminiApiKey?: string
  onProgress?: (progress: ResearchProgress) => void
  /**
   * Poll interval for interaction status checks (defaults to 5000ms).
   * Exposed mainly for tests and operational tuning.
   */
  pollIntervalMs?: number
  /**
   * Maximum number of poll attempts before timing out (defaults to 120).
   */
  maxPolls?: number
  /**
   * Per-request timeout for start/poll HTTP calls (defaults to 30000ms).
   */
  requestTimeoutMs?: number
  /**
   * Consecutive poll failures allowed before failing the run (defaults to 3).
   */
  maxConsecutivePollErrors?: number
}

export interface DeepResearchResult {
  success: boolean
  report: string | null
  sources: ResearchSource[]
  error?: string
}

export interface RAGIndex {
  chunks: { text: string; embedding: number[] }[]
}
