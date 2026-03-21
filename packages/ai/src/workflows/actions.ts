/**
 * Workflow Actions
 *
 * Quick actions that process sources and generate useful outputs.
 * Each action uses AI to analyze source content.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  WorkflowActionType,
  ActionResult,
  StudyNoteResult,
  SummaryResult,
  KeyTermsResult,
  ComparisonResult,
  QAResult,
  ConflictsResult,
  CitationsResult,
  TimelineResult,
  ActionProgress,
} from './types'
import { createSourceStorage } from '../sources/storage'
import { generateText } from 'ai'
import { resolveModel } from '../providers/ai-sdk-factory'
import { trackAISDKUsage } from '../providers/ai-sdk-usage'

/**
 * Workflow Actions Executor
 */
export class WorkflowActions {
  private storage: ReturnType<typeof createSourceStorage>

  constructor(
    supabase: SupabaseClient,
    userId: string,
    _openaiApiKey?: string
  ) {
    // API key no longer needed — AI SDK reads from env vars via model registry
    this.storage = createSourceStorage(supabase, userId)
  }

  /**
   * Execute a workflow action
   */
  async execute(
    noteId: string,
    actionType: WorkflowActionType,
    _options: Record<string, unknown> = {},
    onProgress?: (progress: ActionProgress) => void
  ): Promise<ActionResult | null> {
    try {
      onProgress?.({
        actionType,
        status: 'starting',
        progress: 10,
        message: 'Loading sources...',
      })

      // Get all sources for the note
      const sources = await this.storage.getSourcesForNote(noteId, 'ready')

      if (sources.length === 0) {
        throw new Error('No sources available for this note')
      }

      // Execute the appropriate action
      switch (actionType) {
        case 'generate_study_note':
          return await this.generateStudyNote(sources, onProgress)
        case 'create_summary':
          return await this.createSummary(sources, onProgress)
        case 'extract_key_terms':
          return await this.extractKeyTerms(sources, onProgress)
        case 'compare_sources':
          return await this.compareSources(sources, onProgress)
        case 'generate_qa':
          return await this.generateQA(sources, onProgress)
        case 'find_conflicts':
          return await this.findConflicts(sources, onProgress)
        case 'extract_citations':
          return await this.extractCitations(sources, onProgress)
        case 'build_timeline':
          return await this.buildTimeline(sources, onProgress)
        default:
          throw new Error(`Unknown action type: ${actionType}`)
      }
    } catch (error) {
      onProgress?.({
        actionType,
        status: 'error',
        progress: 0,
        message: error instanceof Error ? error.message : 'Action failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      return null
    }
  }

  /**
   * Generate comprehensive study notes from all sources
   */
  private async generateStudyNote(
    sources: Array<{ id: string; title: string; content: string }>,
    onProgress?: (progress: ActionProgress) => void
  ): Promise<StudyNoteResult> {
    onProgress?.({
      actionType: 'generate_study_note',
      status: 'processing',
      progress: 30,
      message: 'Analyzing sources...',
    })

    const combinedContent = sources
      .map((s) => `## Source: ${s.title}\n\n${s.content.slice(0, 10000)}`)
      .join('\n\n')

    const prompt = `You are a study assistant. Create comprehensive study notes from the provided sources.

Instructions:
- Organize content with clear headings and subheadings using markdown (# ## ###)
- Include key concepts, definitions, examples, and important details
- Synthesize information from all sources
- Use bullet points for lists
- Highlight important terms in **bold**
- Add relevant connections between concepts
- IMPORTANT: Output in plain markdown format only. Do NOT use JSON format.

Sources:
${combinedContent}

Create detailed, well-organized study notes in markdown format:`

    onProgress?.({
      actionType: 'generate_study_note',
      status: 'processing',
      progress: 50,
      message: 'Generating study notes...',
    })

    const result = await this.callAI(prompt, false)

    onProgress?.({
      actionType: 'generate_study_note',
      status: 'complete',
      progress: 100,
      message: 'Study notes generated successfully',
    })

    return {
      type: 'study_note',
      content: result,
      wordCount: result.split(/\s+/).length,
      sourcesUsed: sources.map((s) => s.title),
    }
  }

  /**
   * Create a summary of all sources
   */
  private async createSummary(
    sources: Array<{ id: string; title: string; content: string }>,
    onProgress?: (progress: ActionProgress) => void
  ): Promise<SummaryResult> {
    onProgress?.({
      actionType: 'create_summary',
      status: 'processing',
      progress: 30,
      message: 'Analyzing sources...',
    })

    const combinedContent = sources
      .map((s) => `## Source: ${s.title}\n\n${s.content.slice(0, 8000)}`)
      .join('\n\n')

    const prompt = `Summarize the following sources into a concise overview.

Instructions:
- Provide a brief paragraph summary (3-5 sentences)
- List 5-10 key points as bullet points
- Focus on the most important information
- Be concise but comprehensive
- IMPORTANT: Output in plain text/markdown format only. Do NOT use JSON format.

Sources:
${combinedContent}

Provide your response in this format:
SUMMARY:
[Your summary paragraph in plain text]

KEY POINTS:
- [Point 1]
- [Point 2]
...`

    onProgress?.({
      actionType: 'create_summary',
      status: 'processing',
      progress: 60,
      message: 'Creating summary...',
    })

    const result = await this.callAI(prompt, false)

    // Parse the result
    const summaryMatch = result.match(/SUMMARY:\s*([\s\S]*?)(?=KEY POINTS:|$)/i)
    const keyPointsMatch = result.match(/KEY POINTS:\s*([\s\S]*)/i)

    const summary = summaryMatch?.[1]?.trim() || result
    const keyPointsText = keyPointsMatch?.[1] || ''
    const keyPoints = keyPointsText
      .split('\n')
      .map((line) => line.replace(/^[-•*]\s*/, '').trim())
      .filter((line) => line.length > 0)

    onProgress?.({
      actionType: 'create_summary',
      status: 'complete',
      progress: 100,
      message: 'Summary created successfully',
    })

    return {
      type: 'summary',
      content: summary,
      keyPoints,
      sourcesUsed: sources.map((s) => s.title),
    }
  }

  /**
   * Extract key terms and definitions
   */
  private async extractKeyTerms(
    sources: Array<{ id: string; title: string; content: string }>,
    onProgress?: (progress: ActionProgress) => void
  ): Promise<KeyTermsResult> {
    onProgress?.({
      actionType: 'extract_key_terms',
      status: 'processing',
      progress: 30,
      message: 'Analyzing sources for key terms...',
    })

    const combinedContent = sources
      .map((s) => `## Source: ${s.title} (ID: ${s.id})\n\n${s.content.slice(0, 8000)}`)
      .join('\n\n')

    const prompt = `Extract key terms and their definitions from the following sources.

Instructions:
- Identify important terms, concepts, and technical vocabulary
- Provide clear, concise definitions
- Note which source each term comes from
- Include relevant quotes where available
- Extract 10-20 key terms

Sources:
${combinedContent}

Provide your response as JSON in this format:
{
  "terms": [
    {
      "term": "Term Name",
      "definition": "Clear definition of the term",
      "sourceId": "source id",
      "sourceTitle": "Source Title",
      "quote": "Optional relevant quote from the source"
    }
  ]
}`

    onProgress?.({
      actionType: 'extract_key_terms',
      status: 'processing',
      progress: 60,
      message: 'Extracting key terms...',
    })

    const result = await this.callAI(prompt, true)

    // Parse JSON response
    let terms = []
    try {
      const jsonMatch = result.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        terms = parsed.terms || []
      }
    } catch {
      // Fallback: try to parse line by line
      terms = []
    }

    // Transform to expected format
    const keyTerms = terms.map(
      (t: {
        term: string
        definition: string
        sourceId?: string
        sourceTitle?: string
        quote?: string
      }) => ({
        term: t.term,
        definition: t.definition,
        sources: [
          {
            sourceId: t.sourceId || sources[0]?.id || '',
            title: t.sourceTitle || sources[0]?.title || '',
            quote: t.quote,
          },
        ],
      })
    )

    onProgress?.({
      actionType: 'extract_key_terms',
      status: 'complete',
      progress: 100,
      message: `Extracted ${keyTerms.length} key terms`,
    })

    return {
      type: 'key_terms',
      terms: keyTerms,
    }
  }

  /**
   * Compare sources for agreements and differences
   */
  private async compareSources(
    sources: Array<{ id: string; title: string; content: string }>,
    onProgress?: (progress: ActionProgress) => void
  ): Promise<ComparisonResult> {
    if (sources.length < 2) {
      throw new Error('Need at least 2 sources to compare')
    }

    onProgress?.({
      actionType: 'compare_sources',
      status: 'processing',
      progress: 30,
      message: 'Comparing sources...',
    })

    const combinedContent = sources
      .map((s) => `## Source: ${s.title} (ID: ${s.id})\n\n${s.content.slice(0, 6000)}`)
      .join('\n\n')

    const prompt = `Compare the following sources and identify agreements, differences, and unique insights.

Sources:
${combinedContent}

Analyze these sources and provide your response as JSON:
{
  "agreements": [
    {
      "topic": "Topic where sources agree",
      "sources": ["Source Title 1", "Source Title 2"],
      "summary": "What they agree on"
    }
  ],
  "differences": [
    {
      "topic": "Topic where sources differ",
      "comparisons": [
        {
          "sourceId": "id",
          "title": "Source Title",
          "position": "What this source says"
        }
      ]
    }
  ],
  "uniqueInsights": [
    {
      "sourceId": "id",
      "title": "Source Title",
      "insight": "Unique insight only found in this source"
    }
  ]
}`

    onProgress?.({
      actionType: 'compare_sources',
      status: 'processing',
      progress: 60,
      message: 'Analyzing differences and agreements...',
    })

    const result = await this.callAI(prompt, true)

    // Parse JSON response
    let comparison = { agreements: [], differences: [], uniqueInsights: [] }
    try {
      const jsonMatch = result.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        comparison = JSON.parse(jsonMatch[0])
      }
    } catch {
      // Use empty defaults
    }

    onProgress?.({
      actionType: 'compare_sources',
      status: 'complete',
      progress: 100,
      message: 'Comparison complete',
    })

    return {
      type: 'comparison',
      agreements: comparison.agreements || [],
      differences: comparison.differences || [],
      uniqueInsights: comparison.uniqueInsights || [],
    }
  }

  /**
   * Generate Q&A study questions
   */
  private async generateQA(
    sources: Array<{ id: string; title: string; content: string }>,
    onProgress?: (progress: ActionProgress) => void
  ): Promise<QAResult> {
    onProgress?.({
      actionType: 'generate_qa',
      status: 'processing',
      progress: 30,
      message: 'Generating study questions...',
    })

    const combinedContent = sources
      .map((s) => `## Source: ${s.title} (ID: ${s.id})\n\n${s.content.slice(0, 8000)}`)
      .join('\n\n')

    const prompt = `Generate study questions and answers based on the following sources.

Instructions:
- Create 10-15 questions that test understanding of key concepts
- Include a mix of difficulty levels (easy, medium, hard)
- Questions should have clear, factual answers from the sources
- Reference which source each question comes from

Sources:
${combinedContent}

Provide your response as JSON:
{
  "questions": [
    {
      "question": "The question text",
      "answer": "The answer",
      "sourceId": "id",
      "sourceTitle": "Source Title",
      "difficulty": "easy|medium|hard"
    }
  ]
}`

    onProgress?.({
      actionType: 'generate_qa',
      status: 'processing',
      progress: 60,
      message: 'Creating questions...',
    })

    const result = await this.callAI(prompt, true)

    let questions = []
    try {
      const jsonMatch = result.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        questions = parsed.questions || []
      }
    } catch {
      questions = []
    }

    onProgress?.({
      actionType: 'generate_qa',
      status: 'complete',
      progress: 100,
      message: `Generated ${questions.length} questions`,
    })

    return {
      type: 'qa',
      questions,
    }
  }

  /**
   * Find conflicting information between sources
   */
  private async findConflicts(
    sources: Array<{ id: string; title: string; content: string }>,
    onProgress?: (progress: ActionProgress) => void
  ): Promise<ConflictsResult> {
    if (sources.length < 2) {
      return { type: 'conflicts', conflicts: [], hasConflicts: false }
    }

    onProgress?.({
      actionType: 'find_conflicts',
      status: 'processing',
      progress: 30,
      message: 'Analyzing sources for conflicts...',
    })

    const combinedContent = sources
      .map((s) => `## Source: ${s.title} (ID: ${s.id})\n\n${s.content.slice(0, 6000)}`)
      .join('\n\n')

    const prompt = `Identify any conflicting or contradictory information between the following sources.

Look for:
- Factual disagreements
- Contradictory claims or statistics
- Different conclusions about the same topic
- Inconsistent definitions

Sources:
${combinedContent}

Provide your response as JSON:
{
  "conflicts": [
    {
      "topic": "The topic of conflict",
      "conflictingSources": [
        {
          "sourceId": "id",
          "title": "Source Title",
          "claim": "What this source claims",
          "quote": "Optional direct quote"
        }
      ],
      "analysis": "Brief analysis of the conflict"
    }
  ]
}

If no conflicts are found, return: {"conflicts": []}`

    onProgress?.({
      actionType: 'find_conflicts',
      status: 'processing',
      progress: 60,
      message: 'Checking for contradictions...',
    })

    const result = await this.callAI(prompt, true)

    let conflicts = []
    try {
      const jsonMatch = result.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        conflicts = parsed.conflicts || []
      }
    } catch {
      conflicts = []
    }

    onProgress?.({
      actionType: 'find_conflicts',
      status: 'complete',
      progress: 100,
      message: conflicts.length > 0 ? `Found ${conflicts.length} conflicts` : 'No conflicts found',
    })

    return {
      type: 'conflicts',
      conflicts,
      hasConflicts: conflicts.length > 0,
    }
  }

  /**
   * Extract citations and references
   */
  private async extractCitations(
    sources: Array<{ id: string; title: string; content: string }>,
    onProgress?: (progress: ActionProgress) => void
  ): Promise<CitationsResult> {
    onProgress?.({
      actionType: 'extract_citations',
      status: 'processing',
      progress: 30,
      message: 'Extracting citations...',
    })

    const combinedContent = sources
      .map((s) => `## Source: ${s.title} (ID: ${s.id})\n\n${s.content.slice(0, 8000)}`)
      .join('\n\n')

    const prompt = `Extract all citations, references, and bibliography entries from the following sources.

Look for:
- Academic citations (Author, Year format)
- Bibliography entries
- Footnotes and endnotes
- URLs and web references
- Book and article references

Sources:
${combinedContent}

Provide your response as JSON:
{
  "citations": [
    {
      "text": "Full citation text",
      "authors": ["Author 1", "Author 2"],
      "year": 2023,
      "source": "Journal/Book name if available",
      "foundIn": {
        "sourceId": "id",
        "sourceTitle": "Title"
      }
    }
  ]
}`

    onProgress?.({
      actionType: 'extract_citations',
      status: 'processing',
      progress: 60,
      message: 'Processing references...',
    })

    const result = await this.callAI(prompt, true)

    let citations = []
    try {
      const jsonMatch = result.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        citations = parsed.citations || []
      }
    } catch {
      citations = []
    }

    onProgress?.({
      actionType: 'extract_citations',
      status: 'complete',
      progress: 100,
      message: `Found ${citations.length} citations`,
    })

    return {
      type: 'citations',
      citations,
    }
  }

  /**
   * Build a timeline of events
   */
  private async buildTimeline(
    sources: Array<{ id: string; title: string; content: string }>,
    onProgress?: (progress: ActionProgress) => void
  ): Promise<TimelineResult> {
    onProgress?.({
      actionType: 'build_timeline',
      status: 'processing',
      progress: 30,
      message: 'Extracting dates and events...',
    })

    const combinedContent = sources
      .map((s) => `## Source: ${s.title} (ID: ${s.id})\n\n${s.content.slice(0, 8000)}`)
      .join('\n\n')

    const prompt = `Extract all dates and events from the following sources to build a timeline.

Look for:
- Specific dates (years, months, days)
- Historical events
- Milestones and achievements
- Deadlines and timeframes

Sources:
${combinedContent}

Provide your response as JSON with events sorted chronologically:
{
  "events": [
    {
      "date": "YYYY-MM-DD or YYYY or descriptive (e.g., 'Early 2020')",
      "event": "Brief event title",
      "description": "More detailed description if available",
      "sourceId": "id",
      "sourceTitle": "Title"
    }
  ]
}`

    onProgress?.({
      actionType: 'build_timeline',
      status: 'processing',
      progress: 60,
      message: 'Building timeline...',
    })

    const result = await this.callAI(prompt, true)

    let events = []
    try {
      const jsonMatch = result.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        events = parsed.events || []
      }
    } catch {
      events = []
    }

    onProgress?.({
      actionType: 'build_timeline',
      status: 'complete',
      progress: 100,
      message: `Found ${events.length} timeline events`,
    })

    return {
      type: 'timeline',
      events,
    }
  }

  /**
   * Call AI model
   * @param prompt - The prompt to send
   * @param expectJson - If true, instructs the model to output valid JSON. If false, instructs for markdown output.
   */
  private async callAI(prompt: string, expectJson: boolean = false): Promise<string> {
    const systemContent = expectJson
      ? 'You are a helpful assistant that analyzes source documents. When asked for JSON output, respond with valid JSON only.'
      : 'You are a helpful assistant that creates well-formatted markdown content. Always output in clean markdown format with proper headings, bullet points, and formatting. Never output JSON format unless explicitly asked.'

    const { model, entry } = resolveModel('research')

    const { text } = await generateText({
      model,
      system: systemContent,
      prompt,
      temperature: 0.3,
      maxOutputTokens: 4000,
      onFinish: trackAISDKUsage({ model: entry.id, taskType: 'research' }),
    })

    return text
  }
}

/**
 * Create a workflow actions instance
 */
export function createWorkflowActions(
  supabase: SupabaseClient,
  userId: string,
  openaiApiKey: string
): WorkflowActions {
  return new WorkflowActions(supabase, userId, openaiApiKey)
}
