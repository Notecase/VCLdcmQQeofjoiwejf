// ============================================================
// COURSE GENERATION AGENT — packages/ai/src/agents/course/agent.ts
// LangGraph StateGraph pipeline for end-to-end course generation
// ============================================================

import { Annotation, END, START, StateGraph } from '@langchain/langgraph'
import { ChatAnthropic } from '@langchain/anthropic'
import type {
  Course,
  CourseGenerationProgress,
  CourseModule,
  CourseOutline,
  CourseSettings,
  GenerationStageType,
  Lesson,
  LessonVideoMatch,
  ResearchProgress,
  YouTubeVideo,
} from '@inkdown/shared/types'
import { runDeepResearch, indexResearchReport, queryRAG } from './research'
import type { DeepResearchResult, RAGIndex } from './research'
import { PROMPTS } from './prompts'
import { matchVideosForLessons } from './video-matcher'
import { generateSlides } from './slide-generator'
import { parseOutlineJSON, parseLessonContent, assembleCourse, saveCourseToSupabase } from './tools'

// --- Config Interface ---

export interface CourseAgentConfig {
  anthropicApiKey: string
  geminiApiKey: string
  youtubeApiKey?: string
  userId: string
  supabaseClient: any
  onProgress?: (progress: CourseGenerationProgress) => void
  onOutlineReady?: (outline: CourseOutline) => void
  onResearchProgress?: (progress: ResearchProgress) => void
}

// --- State Schema ---

const CourseState = Annotation.Root({
  // Input
  topic: Annotation<string>,
  difficulty: Annotation<string>,
  settings: Annotation<CourseSettings>,
  focusAreas: Annotation<string[]>,
  courseId: Annotation<string>,

  // Research
  researchReport: Annotation<string | null>,
  researchSources: Annotation<{ url: string; title: string }[]>,
  ragIndex: Annotation<RAGIndex | null>,

  // Outline
  pendingOutline: Annotation<CourseOutline | null>,
  approvedOutline: Annotation<CourseOutline | null>,
  outlineFeedback: Annotation<string | null>,

  // Content
  generatedModules: Annotation<CourseModule[]>,
  lessonVideos: Annotation<LessonVideoMatch[]>,
  lessonSummaries: Annotation<string[]>,

  // Pipeline
  currentStage: Annotation<GenerationStageType>,
  stageProgress: Annotation<number>,
  thinkingOutput: Annotation<string>,
  error: Annotation<string | null>,

  // Output
  finalCourse: Annotation<Course | null>,
})

type CourseStateType = typeof CourseState.State

// --- Node Implementations ---

function createNodes(config: CourseAgentConfig) {
  const anthropic = new ChatAnthropic({
    model: 'claude-opus-4-6',
    apiKey: config.anthropicApiKey,
    maxTokens: 8192,
  })

  function emitProgress(
    state: CourseStateType,
    stage: GenerationStageType,
    stageProgress: number,
    currentNode: string,
  ) {
    config.onProgress?.({
      courseId: state.courseId,
      threadId: state.courseId,
      stage,
      stageProgress,
      overallProgress: computeOverallProgress(stage, stageProgress),
      thinkingOutput: state.thinkingOutput,
      currentNode,
    })
  }

  // Node 1: Deep Research
  async function deepResearch(state: CourseStateType): Promise<Partial<CourseStateType>> {
    emitProgress(state, 'research', 0, 'deepResearch')

    const result: DeepResearchResult = await runDeepResearch(state.topic, state.focusAreas, {
      geminiApiKey: config.geminiApiKey,
      onProgress: config.onResearchProgress,
    })

    if (!result.success || !result.report) {
      return {
        currentStage: 'research',
        error: result.error ?? 'Research failed to produce a report',
        researchReport: null,
        researchSources: [],
        thinkingOutput: `${state.thinkingOutput}\n[Research] Failed: ${result.error}`,
      }
    }

    return {
      currentStage: 'indexing',
      researchReport: result.report,
      researchSources: result.sources.filter(s => s.status === 'done').map(s => ({ url: s.url, title: s.title })),
      thinkingOutput: `${state.thinkingOutput}\n[Research] Complete: ${result.sources.length} sources analyzed`,
    }
  }

  // Node 2: Index Knowledge
  async function indexKnowledge(state: CourseStateType): Promise<Partial<CourseStateType>> {
    emitProgress(state, 'indexing', 0, 'indexKnowledge')

    if (!state.researchReport) {
      return {
        ragIndex: null,
        thinkingOutput: `${state.thinkingOutput}\n[Indexing] Skipped: no research report`,
      }
    }

    const ragIndex = await indexResearchReport(state.researchReport, config.geminiApiKey)

    return {
      currentStage: 'analysis',
      ragIndex,
      thinkingOutput: `${state.thinkingOutput}\n[Indexing] Indexed ${ragIndex.chunks.length} chunks`,
    }
  }

  // Node 3: Analyze Topic
  async function analyzeTopic(state: CourseStateType): Promise<Partial<CourseStateType>> {
    emitProgress(state, 'analysis', 0, 'analyzeTopic')

    const researchContext = state.ragIndex
      ? await queryRAG(state.ragIndex, `Overview of ${state.topic}: key concepts, prerequisites, learning path`, config.geminiApiKey, 5)
      : state.researchReport ?? ''

    const prompt = PROMPTS.ANALYSIS
      .replace(/{TOPIC}/g, state.topic)
      .replace(/{DIFFICULTY}/g, state.difficulty)
      .replace(/{FOCUS_AREAS}/g, state.focusAreas.join(', '))
      .replace(/{RESEARCH_CONTEXT}/g, researchContext)

    const response = await anthropic.invoke(prompt)
    const analysisResult = typeof response.content === 'string'
      ? response.content
      : response.content.map(c => ('text' in c ? c.text : '')).join('')

    return {
      currentStage: 'planning',
      stageProgress: 100,
      thinkingOutput: `${state.thinkingOutput}\n[Analysis] Topic analyzed successfully\n${analysisResult.slice(0, 500)}`,
    }
  }

  // Node 4: Generate Outline
  async function generateOutline(state: CourseStateType): Promise<Partial<CourseStateType>> {
    emitProgress(state, 'planning', 0, 'generateOutline')

    const researchContext = state.ragIndex
      ? await queryRAG(state.ragIndex, `Course structure for ${state.topic}: modules, lessons, learning sequence`, config.geminiApiKey, 5)
      : state.researchReport ?? ''

    const feedbackSection = state.outlineFeedback
      ? `## Previous Feedback\nThe previous outline was rejected with this feedback:\n${state.outlineFeedback}\n\nPlease incorporate this feedback into the revised outline.`
      : ''

    const courseContext = `Topic: ${state.topic}\nDifficulty: ${state.difficulty}\nFocus Areas: ${state.focusAreas.join(', ')}\nSettings: Videos=${state.settings.includeVideos}, Slides=${state.settings.includeSlides}, Practice=${state.settings.includePractice}, Quizzes=${state.settings.includeQuizzes}\nEstimated Weeks: ${state.settings.estimatedWeeks}, Hours/Week: ${state.settings.hoursPerWeek}`

    const prompt = PROMPTS.OUTLINE
      .replace(/{TOPIC}/g, state.topic)
      .replace(/{DIFFICULTY}/g, state.difficulty)
      .replace(/{FOCUS_AREAS}/g, state.focusAreas.join(', '))
      .replace(/{RESEARCH_CONTEXT}/g, researchContext)
      .replace(/{COURSE_CONTEXT}/g, courseContext)
      .replace(/{FEEDBACK_SECTION}/g, feedbackSection)

    const response = await anthropic.invoke(prompt)
    const content = typeof response.content === 'string'
      ? response.content
      : response.content.map(c => ('text' in c ? c.text : '')).join('')

    const outline = parseOutlineJSON(content)

    // Notify that outline is ready for approval — graph pauses here
    config.onOutlineReady?.(outline)

    return {
      currentStage: 'approval',
      pendingOutline: outline,
      thinkingOutput: `${state.thinkingOutput}\n[Outline] Generated: ${outline.modules.length} modules, awaiting approval`,
    }
  }

  // Node 5: Generate Content
  async function generateContent(state: CourseStateType): Promise<Partial<CourseStateType>> {
    const outline = state.approvedOutline
    if (!outline) {
      return { error: 'No approved outline available for content generation' }
    }

    emitProgress(state, 'content', 0, 'generateContent')

    const modules: CourseModule[] = []
    const summaries: string[] = [...state.lessonSummaries]
    let totalLessons = 0
    let completedLessons = 0

    // Count total lessons for progress
    for (const mod of outline.modules) {
      totalLessons += mod.lessons.length
    }

    const courseContext = `Course: ${outline.title}\nTopic: ${outline.topic}\nDifficulty: ${outline.difficulty}`

    for (const outlineMod of outline.modules) {
      const lessons: Lesson[] = []

      for (const outlineLesson of outlineMod.lessons) {
        completedLessons++
        const progress = Math.round((completedLessons / totalLessons) * 100)
        emitProgress(state, 'content', progress, `generateContent:${outlineMod.title}/${outlineLesson.title}`)

        // Query RAG for per-lesson context
        const lessonResearchContext = state.ragIndex
          ? await queryRAG(state.ragIndex, `${outlineLesson.title}: ${outlineLesson.keyTopics.join(', ')}`, config.geminiApiKey, 3)
          : state.researchReport ?? ''

        // Build previous lessons context (last 5 summaries)
        const previousLessons = summaries.slice(-5).map((s, i) => `${i + 1}. ${s}`).join('\n')

        // Select prompt based on lesson type
        const promptKey = outlineLesson.type.toUpperCase() as keyof typeof PROMPTS
        const promptTemplate = PROMPTS[promptKey] ?? PROMPTS.LECTURE

        const prompt = promptTemplate
          .replace(/{LESSON_TITLE}/g, outlineLesson.title)
          .replace(/{KEY_TOPICS}/g, outlineLesson.keyTopics.join(', '))
          .replace(/{LEARNING_OBJECTIVES}/g, outlineLesson.learningObjectives.join('\n- '))
          .replace(/{MODULE_CONTEXT}/g, `Module: ${outlineMod.title} — ${outlineMod.description}`)
          .replace(/{COURSE_CONTEXT}/g, courseContext)
          .replace(/{RESEARCH_CONTEXT}/g, lessonResearchContext)
          .replace(/{PREVIOUS_LESSONS}/g, previousLessons || 'This is the first lesson.')

        const response = await anthropic.invoke(prompt)
        const responseText = typeof response.content === 'string'
          ? response.content
          : response.content.map(c => ('text' in c ? c.text : '')).join('')

        let content = parseLessonContent(responseText, outlineLesson)

        // Generate slides with Gemini if this is a slides-type lesson
        if (outlineLesson.type === 'slides' && state.settings.includeSlides) {
          const slides = await generateSlides(
            outlineLesson.title,
            outlineLesson.keyTopics,
            lessonResearchContext,
            config.geminiApiKey,
            state.settings.maxSlidesPerLesson,
          )
          content = { ...content, slides }
        }

        const lesson: Lesson = {
          id: outlineLesson.id,
          moduleId: outlineMod.id,
          title: outlineLesson.title,
          type: outlineLesson.type,
          duration: `${outlineLesson.estimatedMinutes} min`,
          order: outlineLesson.order,
          status: 'available',
          content,
        }

        lessons.push(lesson)

        // Track summary for coherence
        summaries.push(`${outlineLesson.title} (${outlineLesson.type}): ${outlineLesson.keyTopics.join(', ')}`)
      }

      modules.push({
        id: outlineMod.id,
        courseId: state.courseId,
        title: outlineMod.title,
        description: outlineMod.description,
        order: outlineMod.order,
        status: 'available',
        progress: 0,
        lessons,
      })
    }

    return {
      currentStage: 'multimedia',
      generatedModules: modules,
      lessonSummaries: summaries,
      thinkingOutput: `${state.thinkingOutput}\n[Content] Generated ${completedLessons} lessons across ${modules.length} modules`,
    }
  }

  // Node 6: Match Videos
  async function matchVideos(state: CourseStateType): Promise<Partial<CourseStateType>> {
    if (!state.settings.includeVideos || !config.youtubeApiKey) {
      return {
        currentStage: 'review',
        lessonVideos: [],
        thinkingOutput: `${state.thinkingOutput}\n[Videos] Skipped: videos not enabled or no API key`,
      }
    }

    emitProgress(state, 'multimedia', 0, 'matchVideos')

    const matches = await matchVideosForLessons(state.generatedModules, config.youtubeApiKey)

    // Apply video data to matching lessons
    for (const match of matches) {
      if (!match.selectedVideoId || match.videos.length === 0) continue

      const selectedVideo = match.videos.find((v: YouTubeVideo) => v.videoId === match.selectedVideoId)
      if (!selectedVideo) continue

      for (const mod of state.generatedModules) {
        for (const lesson of mod.lessons) {
          if (lesson.id === match.lessonId) {
            lesson.content.videoId = selectedVideo.videoId
            lesson.content.videoUrl = `https://www.youtube.com/watch?v=${selectedVideo.videoId}`
            lesson.content.videoThumbnail = selectedVideo.thumbnailUrl
            lesson.content.videoChannel = selectedVideo.channelTitle
          }
        }
      }
    }

    return {
      currentStage: 'review',
      lessonVideos: matches,
      thinkingOutput: `${state.thinkingOutput}\n[Videos] Matched ${matches.length} lessons with YouTube videos`,
    }
  }

  // Node 7: Finalize
  async function finalize(state: CourseStateType): Promise<Partial<CourseStateType>> {
    const outline = state.approvedOutline
    if (!outline) {
      return { error: 'No approved outline for finalization' }
    }

    emitProgress(state, 'review', 50, 'finalize')

    const course = assembleCourse(outline, {
      generatedModules: state.generatedModules,
      userId: config.userId,
      courseId: state.courseId,
      researchReport: state.researchReport,
      thinkingTrace: state.thinkingOutput,
      settings: state.settings,
    })

    // Persist to Supabase
    await saveCourseToSupabase(course, state.generatedModules, config.supabaseClient)

    emitProgress(state, 'complete', 100, 'finalize')

    return {
      currentStage: 'complete',
      stageProgress: 100,
      finalCourse: course,
      thinkingOutput: `${state.thinkingOutput}\n[Finalize] Course "${course.title}" saved successfully`,
    }
  }

  return { deepResearch, indexKnowledge, analyzeTopic, generateOutline, generateContent, matchVideos, finalize }
}

// --- Graph Construction ---

export function createCourseGenerationGraph(config: CourseAgentConfig) {
  const nodes = createNodes(config)

  const graph = new StateGraph(CourseState)
    .addNode('deepResearch', nodes.deepResearch)
    .addNode('indexKnowledge', nodes.indexKnowledge)
    .addNode('analyzeTopic', nodes.analyzeTopic)
    .addNode('generateOutline', nodes.generateOutline)
    .addNode('generateContent', nodes.generateContent)
    .addNode('matchVideos', nodes.matchVideos)
    .addNode('finalize', nodes.finalize)
    .addEdge(START, 'deepResearch')
    .addEdge('deepResearch', 'indexKnowledge')
    .addEdge('indexKnowledge', 'analyzeTopic')
    .addEdge('analyzeTopic', 'generateOutline')
    // After outline generation, the graph pauses for approval.
    // External code resumes by invoking the graph again with approvedOutline set.
    // The conditional edge routes based on whether the outline is approved.
    .addConditionalEdges('generateOutline', (state) => {
      if (state.error) return END
      // Graph pauses here — it will be resumed externally with approvedOutline set
      return '__end__'
    })
    .addEdge('generateContent', 'matchVideos')
    .addEdge('matchVideos', 'finalize')
    .addEdge('finalize', END)

  // For the approval-resumption flow, we add generateContent as a separate entry
  // The external code will create a new invocation starting from generateContent
  // by compiling with the appropriate entry point

  return graph.compile()
}

// Create a separate graph for the post-approval phase
export function createContentGenerationGraph(config: CourseAgentConfig) {
  const nodes = createNodes(config)

  const graph = new StateGraph(CourseState)
    .addNode('generateContent', nodes.generateContent)
    .addNode('matchVideos', nodes.matchVideos)
    .addNode('finalize', nodes.finalize)
    .addEdge(START, 'generateContent')
    .addEdge('generateContent', 'matchVideos')
    .addEdge('matchVideos', 'finalize')
    .addEdge('finalize', END)

  return graph.compile()
}

// --- Helpers ---

function computeOverallProgress(stage: GenerationStageType, stageProgress: number): number {
  const stageWeights: Record<GenerationStageType, { start: number; weight: number }> = {
    research: { start: 0, weight: 15 },
    indexing: { start: 15, weight: 5 },
    analysis: { start: 20, weight: 5 },
    planning: { start: 25, weight: 10 },
    approval: { start: 35, weight: 0 },
    content: { start: 35, weight: 45 },
    multimedia: { start: 80, weight: 10 },
    assembly: { start: 90, weight: 5 },
    saving: { start: 95, weight: 0 },
    review: { start: 90, weight: 5 },
    complete: { start: 95, weight: 5 },
  }

  const sw = stageWeights[stage] ?? { start: 0, weight: 0 }
  return Math.min(100, sw.start + Math.round((stageProgress / 100) * sw.weight))
}
