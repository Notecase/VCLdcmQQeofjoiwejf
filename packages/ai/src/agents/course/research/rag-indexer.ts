import { AppError, ErrorCode } from '@inkdown/shared'
import { selectModel } from '../../../providers/model-registry'
import { createOpenAIClient } from '../../../providers/client-factory'
import type { RAGIndex } from './types'

const EMBEDDING_MODEL = selectModel('embedding').id
const CHUNK_SIZE = 512
const CHUNK_OVERLAP = 50
const DEFAULT_TOP_K = 3

function splitIntoChunks(text: string): string[] {
  const chunks: string[] = []
  let start = 0

  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length)
    chunks.push(text.slice(start, end))

    if (end >= text.length) break
    start = end - CHUNK_OVERLAP
  }

  return chunks
}

async function embedText(text: string, _openaiApiKey?: string): Promise<number[]> {
  const embeddingModel = selectModel('embedding')
  const client = createOpenAIClient(embeddingModel)
  try {
    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text,
    })
    return response.data[0].embedding
  } catch (error) {
    throw new AppError(
      `Embedding request failed: ${error instanceof Error ? error.message : String(error)}`,
      ErrorCode.AI_PROVIDER_ERROR,
      'Failed to generate embeddings.',
      { model: EMBEDDING_MODEL }
    )
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB)
  if (denominator === 0) return 0

  return dotProduct / denominator
}

export async function indexResearchReport(report: string, openaiApiKey: string): Promise<RAGIndex> {
  const textChunks = splitIntoChunks(report)
  const chunks: RAGIndex['chunks'] = []

  for (const text of textChunks) {
    const embedding = await embedText(text, openaiApiKey)
    chunks.push({ text, embedding })
  }

  return { chunks }
}

export async function queryRAG(
  index: RAGIndex,
  query: string,
  openaiApiKey: string,
  topK: number = DEFAULT_TOP_K
): Promise<string> {
  if (index.chunks.length === 0) return ''

  const queryEmbedding = await embedText(query, openaiApiKey)

  const scored = index.chunks.map((chunk) => ({
    text: chunk.text,
    score: cosineSimilarity(queryEmbedding, chunk.embedding),
  }))

  scored.sort((a, b) => b.score - a.score)

  return scored
    .slice(0, topK)
    .map((s) => s.text)
    .join('\n\n---\n\n')
}
