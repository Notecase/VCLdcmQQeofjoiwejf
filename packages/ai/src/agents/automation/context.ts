/**
 * Automation Context Assembly
 *
 * Builds the layered system prompt for the AutomationAgent.
 * Inspired by Cowork's context stacking: identity → instructions → position → continuity → task.
 */

import type { LearningRoadmap } from '@inkdown/shared/types'

export interface AutomationContextInput {
  plan: LearningRoadmap
  instructions: string
  roadmapContent: string
  previousNotes: Array<{ title: string; updatedAt: string }>
  scheduleTitle: string
  scheduleInstructions?: string
}

export interface AutomationContext {
  systemPrompt: string
  taskPrompt: string
}

/**
 * Parse the active phase name from roadmap content based on current lesson progress.
 */
function findActivePhase(
  roadmapContent: string,
  completedLessons: number
): { name: string; lessonStart: number; lessonEnd: number } | null {
  for (const line of roadmapContent.split('\n')) {
    const m = line
      .trim()
      .match(/^##\s+(?:Phase\s+\d+:\s*)?(.+?)\s*\((?:Lessons?|Days?)\s+(\d+)\s*[-–]\s*(\d+)\)\s*$/)
    if (m) {
      const lessonStart = parseInt(m[2], 10)
      const lessonEnd = parseInt(m[3], 10)
      if (completedLessons < lessonEnd) {
        return { name: m[1].trim(), lessonStart, lessonEnd }
      }
    }
  }
  return null
}

/**
 * Build the 5-layer automation context.
 *
 * Layer 1: Agent identity + capabilities
 * Layer 2: Plan instructions (from Instructions box)
 * Layer 3: Roadmap position (phase, lesson, topic)
 * Layer 4: Previous notes (continuity)
 * Layer 5: Task prompt (becomes user message)
 */
export function buildAutomationContext(input: AutomationContextInput): AutomationContext {
  const { plan, instructions, roadmapContent, previousNotes, scheduleTitle, scheduleInstructions } =
    input
  const completedLessons = plan.progress?.completedLessons ?? 0
  const totalLessons = plan.progress?.totalLessons ?? 0
  const currentLesson = completedLessons + 1

  // --- Layer 1: Identity ---
  const layer1 = `You are an autonomous learning content generator for Inkdown.
Your job is to create comprehensive, high-quality study notes for a learning plan.

You MUST:
1. Research the topic using web_search if you need current information or examples.
2. Generate a complete, well-structured note with headings, code examples, tables, exercises, and math where appropriate.
3. Call save_note EXACTLY ONCE with the final note content.
4. Call advance_progress ONCE after saving to track completion.

Note title format: Use the exact format provided in the roadmap position below.

Formatting rules:
- Use markdown headings (##, ###) to organize sections
- Include code examples with language-tagged fenced blocks
- Use tables for comparisons or structured data
- Use $inline math$ and $$display math$$ for equations
- Do NOT use horizontal rules (---) to separate sections
- Include 2-3 practice exercises at the end`

  // --- Layer 2: User instructions ---
  const layer2 = instructions ? `\n\n## Content Instructions\n${instructions}` : ''

  // --- Layer 3: Roadmap position ---
  const activePhase = roadmapContent ? findActivePhase(roadmapContent, completedLessons) : null
  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  let layer3 = `\n\n## Roadmap Position
Plan: ${plan.name}
Current lesson: ${currentLesson} of ${totalLessons}`

  if (activePhase) {
    layer3 += `\nPhase: ${activePhase.name} (Lessons ${activePhase.lessonStart}–${activePhase.lessonEnd})`
  }
  if (plan.currentTopic) {
    layer3 += `\nTopic: ${plan.currentTopic}`
  }
  if (plan.schedule?.studyDays?.length) {
    const days = plan.schedule.studyDays.includes('Daily')
      ? 'Daily'
      : plan.schedule.studyDays.join(', ')
    layer3 += `\nSchedule: ${days} · ${plan.schedule.hoursPerDay}h/day`
  }
  layer3 += `\n\nNote title to use: "${today} — Lesson ${currentLesson}: ${plan.currentTopic || 'Study Session'}"`

  // --- Layer 4: Continuity ---
  let layer4 = ''
  if (previousNotes.length > 0) {
    const noteList = previousNotes
      .slice(0, 3)
      .map((n) => `- ${n.title}`)
      .join('\n')
    layer4 = `\n\n## Previous Notes\n${noteList}\nBuild on what came before. Reference earlier concepts where relevant.`
  }

  // --- Layer 5: Task prompt (user message) ---
  let taskPrompt = scheduleInstructions
    ? `${scheduleTitle}: ${scheduleInstructions}`
    : scheduleTitle || `Generate today's lesson for the current topic.`

  if (!scheduleInstructions && plan.currentTopic) {
    taskPrompt = `Generate a comprehensive lesson note on "${plan.currentTopic}" for the learning plan "${plan.name}".`
  }

  return {
    systemPrompt: layer1 + layer2 + layer3 + layer4,
    taskPrompt,
  }
}
