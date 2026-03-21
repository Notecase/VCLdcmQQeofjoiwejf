/**
 * Secretary Subagents
 *
 * Specialized subagents for the secretary:
 * - Planner: Creates detailed learning roadmaps
 * - Researcher: Researches subjects for curriculum design
 */

import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { PLANNER_SUBAGENT_PROMPT, RESEARCHER_SUBAGENT_PROMPT } from './prompts'
import { selectModel } from '../../providers/model-registry'
import { createLangChainModel } from '../../providers/client-factory'
import { TokenTrackingCallback } from '../../providers/langchain-token-callback'

// ============================================================================
// Types
// ============================================================================

export interface SubagentConfig {
  openaiApiKey: string
  model?: string
}

export interface RoadmapPreview {
  id: string
  name: string
  content: string
  durationDays: number
  hoursPerDay: number
}

export interface ResearchResult {
  subject: string
  prerequisites: string[]
  coreTopics: string[]
  progression: string
  resources: string
}

// ============================================================================
// Planner Subagent
// ============================================================================

export async function runPlannerSubagent(
  config: SubagentConfig,
  subject: string,
  options?: { durationDays?: number; hoursPerDay?: number }
): Promise<RoadmapPreview> {
  const plannerModel = selectModel('secretary')
  const llm = await createLangChainModel(plannerModel, {
    temperature: 0.4,
    callbacks: [new TokenTrackingCallback({ model: plannerModel.id, taskType: 'secretary' })],
  })

  const userPrompt = `Create a detailed learning roadmap for: "${subject}"
Duration: ${options?.durationDays || 14} days
Hours per day: ${options?.hoursPerDay || 2}

Generate a unique short ID (2-4 uppercase letters) and provide the full day-by-day plan.`

  const response = await llm.invoke([
    new SystemMessage(PLANNER_SUBAGENT_PROMPT),
    new HumanMessage(userPrompt),
  ])

  const content = typeof response.content === 'string' ? response.content : ''

  // Extract ID from the response
  const idMatch = content.match(/^#\s*\[(\w{2,4})\]/m)
  const nameMatch = content.match(/^#\s*\[\w{2,4}\]\s*(.+)/m)

  return {
    id: idMatch?.[1] || subject.slice(0, 3).toUpperCase(),
    name: nameMatch?.[1]?.trim() || `${subject} Roadmap`,
    content,
    durationDays: options?.durationDays || 14,
    hoursPerDay: options?.hoursPerDay || 2,
  }
}

// ============================================================================
// Researcher Subagent
// ============================================================================

export async function runResearcherSubagent(
  config: SubagentConfig,
  subject: string
): Promise<ResearchResult> {
  const researcherModel = selectModel('secretary')
  const llm = await createLangChainModel(researcherModel, {
    temperature: 0.3,
    callbacks: [new TokenTrackingCallback({ model: researcherModel.id, taskType: 'secretary' })],
  })

  const response = await llm.invoke([
    new SystemMessage(RESEARCHER_SUBAGENT_PROMPT),
    new HumanMessage(`Research the subject: "${subject}" for curriculum design.`),
  ])

  const content = typeof response.content === 'string' ? response.content : ''

  // Parse structured sections from the response
  const getSection = (heading: string): string[] => {
    const pattern = new RegExp(
      `(?:#{1,3}\\s*)?${heading}[:\\s]*\\n([\\s\\S]*?)(?=\\n#{1,3}\\s|$)`,
      'i'
    )
    const match = content.match(pattern)
    if (!match) return []
    return match[1]
      .split('\n')
      .map((l) => l.replace(/^[-*]\s*/, '').trim())
      .filter(Boolean)
  }

  return {
    subject,
    prerequisites: getSection('Prerequisites'),
    coreTopics: getSection('Core Concepts'),
    progression: content,
    resources: content,
  }
}
