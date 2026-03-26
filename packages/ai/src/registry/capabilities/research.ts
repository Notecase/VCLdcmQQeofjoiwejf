/**
 * research.quick Capability
 *
 * Quick research query via ResearchAgent in chat mode.
 * Collects text deltas from the async generator stream.
 */

import { z } from 'zod'
import type { Capability, CapabilityContext } from '../types'

const inputSchema = z.object({
  query: z.string().describe('Research query to investigate'),
})

async function execute(input: unknown, context: CapabilityContext): Promise<string> {
  const { query } = inputSchema.parse(input)

  // Dynamic import to avoid circular dependencies
  const { ResearchAgent } = await import('../../agents/research/agent')

  const agent = new ResearchAgent({
    supabase: context.supabase,
    userId: context.userId,
    tavilyApiKey: process.env.TAVILY_API_KEY,
  })

  let result = ''
  for await (const event of agent.stream({ message: query })) {
    if (event.event === 'text' && event.isDelta) {
      result += event.data
    }
  }

  return result || 'No research results generated.'
}

export const researchQuick: Capability = {
  name: 'research.quick',
  description:
    'Run a quick research query using web search and AI synthesis. Returns a concise research summary.',
  inputSchema,
  execute,
}
