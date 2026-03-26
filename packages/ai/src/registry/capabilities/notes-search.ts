/**
 * notes.search Capability
 *
 * Semantic search across user's notes using embeddings.
 * Extracted from ChatAgent.retrieveContext() — zero LLM cost (embedding only).
 */

import { z } from 'zod'
import { embed } from 'ai'
import { getEmbeddingModel } from '../../providers/ai-sdk-factory'
import type { Capability, CapabilityContext } from '../types'

const inputSchema = z.object({
  query: z.string().describe('Search query to find relevant notes'),
  maxResults: z.number().optional().default(5).describe('Maximum number of results to return'),
})

async function execute(input: unknown, context: CapabilityContext): Promise<string> {
  const { query, maxResults } = inputSchema.parse(input)

  // Generate embedding for the query
  const { embedding: queryEmbedding } = await embed({
    model: getEmbeddingModel(),
    value: query,
  })

  // Search for similar chunks via Supabase RPC
  const { data: chunks, error } = await context.supabase.rpc('search_embeddings', {
    query_embedding: queryEmbedding,
    match_threshold: 0.7,
    match_count: maxResults,
    p_user_id: context.userId,
  })

  if (error || !chunks || chunks.length === 0) {
    return 'No matching notes found.'
  }

  // Format results (DB-side match_threshold already filters by 0.7)
  const results = (
    chunks as Array<{
      note_id: string
      note_title: string
      chunk_text: string
      similarity: number
    }>
  ).map((chunk, i) => {
    const score = (chunk.similarity * 100).toFixed(1)
    return `[${i + 1}] "${chunk.note_title}" (${score}% match)\n${chunk.chunk_text.slice(0, 300)}`
  })

  if (results.length === 0) {
    return 'No matching notes found.'
  }

  return `Found ${results.length} relevant note chunks:\n\n${results.join('\n\n---\n\n')}`
}

export const notesSearch: Capability = {
  name: 'notes.search',
  description:
    "Search across all of the user's notes using semantic similarity. Returns relevant text chunks with note titles and similarity scores.",
  inputSchema,
  execute,
}
