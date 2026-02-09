// New exports
export { CourseOrchestrator, createCourseOrchestrator } from './orchestrator'
export type { CourseOrchestratorConfig } from './orchestrator'

// Tool factories
export {
  createOrchestratorTools,
  createLessonWriterTools,
  createQuizWriterTools,
  createSlidesWriterTools,
} from './course-tools'

// Keep existing utility exports
export { PROMPTS } from './prompts'
export { matchVideosForLessons } from './video-matcher'
export { generateSlides, generateSlidesWithModel } from './slide-generator'
export { parseOutlineJSON, parseLessonContent, assembleCourse, saveCourseToSupabase } from './tools'

// Legacy exports (deprecated)
export { createCourseGenerationGraph, createContentGenerationGraph } from './agent.legacy'
export type { CourseAgentConfig } from './agent.legacy'
