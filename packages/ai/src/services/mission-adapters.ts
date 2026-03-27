/**
 * Mission Hub — Real Agent Adapters
 *
 * Each adapter wraps a real agent (ResearchAgent, CourseOrchestrator, SecretaryAgent)
 * and consumes its streaming output to produce a structured { summary, payload } result
 * for the MissionOrchestrator.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { MissionStage, WorkflowKey } from '@inkdown/shared/types'

/** Context passed to agents when executing within a mission. */
interface MissionContext {
  missionId: string
  stepId: string
  stage: MissionStage
}
import type { SharedContextService } from './shared-context.service'

// =============================================================================
// Shared config all adapters need
// =============================================================================

export interface MissionAdapterDeps {
  supabase: SupabaseClient
  userId: string
  sharedContextService?: SharedContextService
  missionContext?: MissionContext
  /** Optional event callback for progress streaming */
  onEvent?: (event: { type: string; data: unknown }) => void
}

// =============================================================================
// Research Adapter
// =============================================================================

export async function runResearchAdapter(
  deps: MissionAdapterDeps,
  input: { goal: string; relevantContext: string }
): Promise<{ summary: string; payload: Record<string, unknown> }> {
  const { ResearchAgent } = await import('../agents/research/agent')

  const agent = new ResearchAgent({
    supabase: deps.supabase,
    userId: deps.userId,
    sharedContextService: deps.sharedContextService,
    tavilyApiKey: process.env.TAVILY_API_KEY,
  })

  let fullText = ''
  let threadId = ''
  const files: Array<{ name: string; content: string }> = []

  for await (const event of agent.stream({
    message: `Research the following learning goal thoroughly and produce a comprehensive brief:\n\n${input.goal}\n\nContext:\n${input.relevantContext}`,
    outputPreference: 'md_file',
  })) {
    if (event.event === 'text') {
      fullText += event.data || ''
    } else if (event.event === 'file-write' && event.data) {
      try {
        const file = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
        if (file.name && file.content) {
          files.push({ name: file.name, content: file.content })
        }
      } catch {
        /* ignore parse errors */
      }
    } else if (event.event === 'thread-id' && event.data) {
      try {
        const parsed = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
        threadId = parsed.threadId || ''
      } catch {
        /* ignore */
      }
    } else if (event.event === 'thinking' && deps.onEvent) {
      deps.onEvent({ type: 'thinking', data: event.data })
    }
  }

  // Use file content if available (markdown mode produces a file)
  const briefContent = files.length > 0 ? files[0].content : fullText
  const briefSummary = briefContent.slice(0, 200).replace(/\n/g, ' ').trim()

  return {
    summary: `Research brief completed: ${briefSummary}...`,
    payload: {
      goal: input.goal,
      brief: briefContent,
      threadId,
      files: files.map((f) => f.name),
      missionContext: deps.missionContext || null,
    },
  }
}

// =============================================================================
// Course Adapter
// =============================================================================

export async function runCourseOutlineAdapter(
  deps: MissionAdapterDeps,
  input: {
    goal: string
    researchBrief: Record<string, unknown> | null
    relevantContext: string
  }
): Promise<{ summary: string; payload: Record<string, unknown> }> {
  // Extract key info from research brief for the course prompt
  const briefText =
    typeof input.researchBrief?.brief === 'string'
      ? input.researchBrief.brief
      : input.relevantContext

  // Parse weeks from goal
  const weeksMatch = /(\d+)\s*(week|weeks|wk|wks)/i.exec(input.goal)
  const estimatedWeeks = weeksMatch ? Math.max(2, Math.min(24, Number(weeksMatch[1]))) : 8

  // Extract focus areas from brief
  const focusAreas = extractFocusAreasFromBrief(briefText, input.goal)

  // Build a structured outline using the research brief
  const modules = focusAreas.slice(0, 6).map((area, idx) => ({
    title: `Module ${idx + 1}: ${area}`,
    objective: `Build practical capability in ${area}`,
    lessons: [
      `${area} foundations`,
      `${area} hands-on implementation`,
      `${area} review and assessment`,
    ],
  }))

  const cleanedGoal = input.goal
    .replace(/^master\s+/i, '')
    .replace(/^learn\s+/i, '')
    .replace(/\s+in\s+\d+\s*(week|weeks|wk|wks)\b.*/i, '')
    .trim()

  const courseTitle = cleanedGoal ? `${cleanedGoal} Mission Track` : 'Mission Course'

  const payload = {
    title: courseTitle,
    topic: input.goal,
    description: `Mission Hub course outline generated from research brief for: ${input.goal}`,
    difficulty: 'intermediate',
    estimatedWeeks,
    modules,
    sourceBrief: input.researchBrief || {},
    missionContext: deps.missionContext || null,
  }

  return {
    summary: `Course outline drafted with ${modules.length} modules from research brief.`,
    payload,
  }
}

export async function applyCourseEntities(
  deps: MissionAdapterDeps,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const { data, error } = await deps.supabase
    .from('courses')
    .insert({
      user_id: deps.userId,
      title: String(payload.title || 'Mission Course'),
      topic: String(payload.topic || 'Mission Topic'),
      description: 'Autogenerated by Mission Hub',
      difficulty: String(payload.difficulty || 'intermediate'),
      estimated_hours: 40,
      prerequisites: [],
      learning_objectives: [],
      status: 'ready',
      progress: 0,
      settings: {
        estimatedWeeks: payload.estimatedWeeks || 8,
        includeVideos: true,
        includeSlides: true,
      },
      generated_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (error || !data) throw error || new Error('Failed to create course entity')
  return { courseId: (data as { id: string }).id }
}

// =============================================================================
// Secretary/Daily Plan Adapter
// =============================================================================

export async function runDailyPlanAdapter(
  deps: MissionAdapterDeps,
  input: {
    goal: string
    courseOutline: Record<string, unknown> | null
    relevantContext: string
  }
): Promise<{ summary: string; payload: Record<string, unknown> }> {
  const { SecretaryAgent } = await import('../agents/secretary/agent')

  const agent = new SecretaryAgent({
    supabase: deps.supabase,
    userId: deps.userId,
    sharedContextService: deps.sharedContextService,
  })

  // Build a message that asks the secretary to create a study plan
  const moduleTitles = extractModuleTitlesFromOutline(input.courseOutline)
  const moduleContext =
    moduleTitles.length > 0 ? `The course has these modules: ${moduleTitles.join(', ')}.` : ''

  const message = [
    `Create a daily study plan for my mission goal: "${input.goal}".`,
    moduleContext,
    'Structure it with specific time blocks (09:00-16:00 range), each 45-90 minutes.',
    'Include focus work, practice, and review blocks.',
    input.relevantContext ? `Context: ${input.relevantContext.slice(0, 400)}` : '',
  ]
    .filter(Boolean)
    .join(' ')

  let fullText = ''
  for await (const event of agent.stream({ message })) {
    if (event.event === 'text') {
      fullText += event.data || ''
    } else if (event.event === 'thinking' && deps.onEvent) {
      deps.onEvent({ type: 'thinking', data: event.data })
    }
  }

  // Build the daily plan payload
  const today = new Date().toISOString().slice(0, 10)
  const scheduleFromAgent = fullText.trim()

  const payload = {
    filename: 'Today.md',
    markdown: scheduleFromAgent || buildFallbackDailyPlan(input.goal, moduleTitles),
    date: today,
    sourceCourse: input.courseOutline || {},
    missionContext: deps.missionContext || null,
  }

  return {
    summary: `Daily execution plan prepared for ${today} with mission-aligned study blocks.`,
    payload,
  }
}

export async function applyDailyPlanPatch(
  deps: MissionAdapterDeps,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const filename = String(payload.filename || 'Today.md')
  const content = String(payload.markdown || '')
  const { error } = await deps.supabase.from('secretary_memory').upsert(
    {
      user_id: deps.userId,
      filename,
      content,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,filename' }
  )
  if (error) throw error
  return { filename }
}

// =============================================================================
// Editor/Note Pack Adapter
// =============================================================================

export async function runNotePackAdapter(
  deps: MissionAdapterDeps,
  input: {
    goal: string
    dailyPlanPatch: Record<string, unknown> | null
    relevantContext: string
    workflowKey?: WorkflowKey
    sourceTaskTitle?: string
    sourcePlanTitle?: string
    sourceTopic?: string
    sourceProjectId?: string | null
    sourcePlanId?: string | null
  }
): Promise<{ summary: string; payload: Record<string, unknown> }> {
  const { streamCreateNote } = await import('../utils/note-creator')

  // Load plan instructions if we have a sourcePlanId
  let planInstructions = ''
  if (input.sourcePlanId) {
    try {
      const { MemoryService } = await import('../agents/secretary/memory')
      const memService = new MemoryService(deps.supabase, deps.userId)
      const instFile = await memService.readFile(
        `Plans/${input.sourcePlanId.toLowerCase()}-instructions.md`
      )
      if (instFile?.content) planInstructions = instFile.content
    } catch {
      // Non-critical — continue without instructions
    }
  }

  const instructionPrefix = planInstructions
    ? `Follow these plan instructions:\n${planInstructions}\n\n`
    : ''

  const singleTaskNotePrompt =
    input.workflowKey === 'make_note_from_task'
      ? [
          instructionPrefix,
          `Create a polished study note for "${input.sourceTaskTitle || input.goal}".`,
          input.sourcePlanTitle ? `Plan context: ${input.sourcePlanTitle}.` : '',
          input.sourceTopic ? `Topic focus: ${input.sourceTopic}.` : '',
          'Use a clear title, a short overview, key concepts, actionable study bullets, and a quick review section.',
          input.relevantContext ? `Context: ${input.relevantContext.slice(0, 400)}` : '',
        ]
          .filter(Boolean)
          .join(' ')
      : null

  const noteDefs = singleTaskNotePrompt
    ? [
        {
          input: singleTaskNotePrompt,
          fallbackTitle: input.sourceTaskTitle || input.sourceTopic || 'Study Note',
        },
      ]
    : [
        {
          input: `Create a comprehensive mission brief note for the learning goal: "${input.goal}". Include why this matters, key milestones, and success criteria. Context: ${input.relevantContext.slice(0, 400)}`,
          fallbackTitle: 'Mission Brief',
        },
        {
          input: `Create a daily execution checklist note for studying "${input.goal}". Include time-blocked study slots, key tasks, and end-of-day review prompts.`,
          fallbackTitle: 'Daily Execution Checklist',
        },
        {
          input: `Create a reflection and retention note template for learning "${input.goal}". Include prompts for: what became clearer, where I struggled, what to practice next, and spaced repetition cues.`,
          fallbackTitle: 'Reflection and Retention',
        },
      ]

  const createdNotes: Array<{ noteId: string; title: string }> = []

  for (const def of noteDefs) {
    let noteId: string | undefined
    let title: string | undefined

    for await (const chunk of streamCreateNote({
      prompt: def.input,
      supabase: deps.supabase,
      userId: deps.userId,
      projectId: input.sourceProjectId || undefined,
    })) {
      if (chunk.type === 'title') {
        title = chunk.data
      } else if (chunk.type === 'finish') {
        if (chunk.data.success && chunk.data.noteId) {
          noteId = chunk.data.noteId
          title = chunk.data.title || title
        }
      }
    }

    if (noteId) {
      createdNotes.push({ noteId, title: title || def.fallbackTitle })
    }
  }

  return {
    summary: `Note pack created with ${createdNotes.length} editor-ready drafts.`,
    payload: {
      notes: createdNotes,
      noteIds: createdNotes.map((n) => n.noteId),
      sourcePlan: input.dailyPlanPatch || {},
      missionContext: deps.missionContext || null,
    },
  }
}

export async function applyNotePack(
  _deps: MissionAdapterDeps,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  // Notes are already created by streamCreateNote during buildNotePack
  const noteIds = Array.isArray(payload.noteIds) ? payload.noteIds : []
  return { noteIds }
}

// =============================================================================
// Helpers
// =============================================================================

function extractFocusAreasFromBrief(briefText: string, goal: string): string[] {
  // Try to extract headings from the brief
  const headings = briefText
    .split('\n')
    .filter((line) => /^#{2,3}\s/.test(line))
    .map((line) => line.replace(/^#{2,3}\s+/, '').trim())
    .filter((h) => h.length > 3 && h.length < 80)
    .slice(0, 6)

  if (headings.length >= 3) return headings

  // Fallback: tokenize from goal
  const tokens = `${goal} ${briefText}`
    .split(/[\n,.;:()-]+/g)
    .map((part) => part.trim())
    .filter((part) => part.length >= 4)
    .slice(0, 6)

  const seen = new Set<string>()
  const deduped: string[] = []
  for (const value of tokens) {
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(value)
    if (deduped.length >= 6) break
  }

  return deduped.length > 0
    ? deduped
    : ['Core fundamentals', 'Hands-on practice', 'Review and retention']
}

function extractModuleTitlesFromOutline(courseOutline: Record<string, unknown> | null): string[] {
  if (!courseOutline) return []
  const modules = courseOutline.modules
  if (!Array.isArray(modules)) return []

  return modules
    .map((module) => {
      if (typeof module === 'string') return module
      if (
        typeof module === 'object' &&
        module !== null &&
        typeof (module as { title?: unknown }).title === 'string'
      ) {
        return String((module as { title: string }).title)
      }
      return null
    })
    .filter((item): item is string => Boolean(item && item.trim()))
    .slice(0, 6)
}

function buildFallbackDailyPlan(goal: string, moduleTitles: string[]): string {
  const today = new Date().toISOString().slice(0, 10)
  const schedule =
    moduleTitles.length > 0
      ? moduleTitles
          .slice(0, 4)
          .map((title, idx) => {
            const times = ['09:00', '10:30', '14:00', '15:30']
            return `- [ ] ${times[idx] || '16:30'} ${title}`
          })
          .join('\n')
      : `- [ ] 09:00 Deep work sprint (60min)\n- [ ] 10:15 Practice + recall (45min)\n- [ ] 14:00 Build + apply (60min)\n- [ ] 15:30 Review and notes (45min)`

  return `# Today's Plan\n\nDate: ${today}\nMission Goal: ${goal}\n\n## Schedule\n${schedule}\n`
}
