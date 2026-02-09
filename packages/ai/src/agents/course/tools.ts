// ============================================================
// COURSE TOOLS — packages/ai/src/agents/course/tools.ts
// Helper functions for parsing, assembling, and persisting courses
// ============================================================

import type {
  Course,
  CourseModule,
  CourseOutline,
  CourseOutlineLesson,
  CourseOutlineModule,
  LessonContent,
  PracticeProblem,
  SlideData,
} from '@inkdown/shared/types'

/**
 * Parse a CourseOutline JSON from raw LLM text.
 * Handles markdown code-block wrappers and plain JSON.
 */
export function parseOutlineJSON(text: string): CourseOutline {
  const jsonStr = extractJSON(text)
  const parsed = JSON.parse(jsonStr) as CourseOutline

  // Validate required fields
  if (!parsed.title || !parsed.modules || !Array.isArray(parsed.modules)) {
    throw new Error('Invalid outline JSON: missing title or modules array')
  }

  const usedModuleIds = new Set<string>()
  const usedLessonIds = new Set<string>()

  const normalizedModules = parsed.modules.map((module: CourseOutlineModule, moduleIndex: number) => {
    const normalizedLessons = module.lessons.map((lesson: CourseOutlineLesson, lessonIndex: number) => ({
      ...lesson,
      id: normalizeUniqueUUID(lesson.id, usedLessonIds),
      order: normalizePositiveOrder(lesson.order, lessonIndex + 1),
    }))

    return {
      ...module,
      id: normalizeUniqueUUID(module.id, usedModuleIds),
      order: normalizePositiveOrder(module.order, moduleIndex + 1),
      lessons: normalizedLessons,
    }
  })

  return {
    ...parsed,
    modules: normalizedModules,
  }
}

/**
 * Parse a lesson-specific JSON response into LessonContent.
 * Adapts the raw LLM output to match the LessonContent interface based on lesson type.
 */
export function parseLessonContent(text: string, _outline: CourseOutlineLesson): LessonContent {
  const jsonStr = extractJSON(text)
  const parsed = JSON.parse(jsonStr) as Record<string, unknown>

  const content: LessonContent = {
    markdown: String(parsed.markdown ?? ''),
  }

  // Parse practice problems (used by lecture, practice, quiz types)
  if (Array.isArray(parsed.practiceProblems)) {
    content.practiceProblems = parsed.practiceProblems.map(normalizeProblem)
  }

  // Parse slides
  if (Array.isArray(parsed.slides)) {
    content.slides = parsed.slides.map(normalizeSlide)
  }

  // Parse key terms (lecture type)
  if (Array.isArray(parsed.keyTerms)) {
    content.keyTerms = parsed.keyTerms.map((kt: Record<string, unknown>) => ({
      term: String(kt.term ?? ''),
      definition: String(kt.definition ?? ''),
    }))
  }

  // Parse key points (video type)
  if (Array.isArray(parsed.keyPoints)) {
    content.keyPoints = parsed.keyPoints.map(String)
  }

  return content
}

/**
 * Assemble the final Course object from an approved outline and generation state.
 */
export function assembleCourse(
  outline: CourseOutline,
  state: {
    generatedModules: CourseModule[]
    userId: string
    courseId: string
    researchReport: string | null
    thinkingTrace: string | null
    settings: {
      includeVideos: boolean
      includeSlides: boolean
      includePractice: boolean
      includeQuizzes: boolean
      estimatedWeeks: number
      hoursPerWeek: number
      focusAreas: string[]
      maxSlidesPerLesson: number
    }
  },
): Course {
  const now = new Date().toISOString()

  return {
    id: state.courseId,
    userId: state.userId,
    title: outline.title,
    topic: outline.topic,
    description: outline.description,
    difficulty: outline.difficulty,
    estimatedHours: outline.estimatedHours,
    prerequisites: outline.prerequisites,
    learningObjectives: outline.learningObjectives,
    status: 'ready',
    progress: 0,
    settings: state.settings,
    researchReport: state.researchReport,
    thinkingTrace: state.thinkingTrace,
    generatedAt: now,
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Save a course and its modules/lessons to Supabase.
 */
export async function saveCourseToSupabase(
  course: Course,
  modules: CourseModule[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  onProgress?: (info: { modulesCompleted: number; totalModules: number }) => void,
): Promise<void> {
  // Update the existing course record (created by POST /generate with status 'generating')
  console.log(`[saveCourseToSupabase] Updating course ${course.id}...`)
  const { error: courseError } = await supabase.from('courses').update({
    title: course.title,
    topic: course.topic,
    description: course.description,
    difficulty: course.difficulty,
    estimated_hours: course.estimatedHours,
    prerequisites: course.prerequisites,
    learning_objectives: course.learningObjectives,
    status: course.status,
    progress: course.progress,
    settings: course.settings,
    research_report: course.researchReport,
    thinking_trace: course.thinkingTrace,
    generated_at: course.generatedAt,
    updated_at: new Date().toISOString(),
  }).eq('id', course.id)

  if (courseError) {
    throw new Error(`Failed to save course: ${courseError.message}`)
  }
  console.log(`[saveCourseToSupabase] Course ${course.id} updated successfully`)

  // Insert modules and their lessons
  console.log(`[saveCourseToSupabase] Inserting ${modules.length} modules...`)
  let modulesCompleted = 0
  for (const mod of modules) {
    const { error: modError } = await supabase.from('course_modules').insert({
      id: mod.id,
      course_id: course.id,
      title: mod.title,
      description: mod.description,
      order: mod.order,
      status: mod.status,
      progress: mod.progress,
    })

    if (modError) {
      throw new Error(`Failed to save module "${mod.title}": ${modError.message}`)
    }

    for (const lesson of mod.lessons) {
      const { error: lessonError } = await supabase.from('course_lessons').insert({
        id: lesson.id,
        module_id: mod.id,
        title: lesson.title,
        type: lesson.type,
        duration: lesson.duration,
        order: lesson.order,
        status: lesson.status,
        content: lesson.content,
      })

      if (lessonError) {
        throw new Error(`Failed to save lesson "${lesson.title}": ${lessonError.message}`)
      }
    }

    modulesCompleted++
    onProgress?.({ modulesCompleted, totalModules: modules.length })
  }
  console.log(`[saveCourseToSupabase] All modules and lessons saved successfully`)
}

/**
 * Extract usable markdown content from a raw LLM response that failed JSON parsing.
 * Tries multiple strategies to salvage the content rather than losing the lesson.
 */
export function extractMarkdownFallback(raw: string): string {
  // Strategy 1: Try to extract the "markdown" field value via regex
  // Match "markdown": "..." allowing for escaped chars
  const mdFieldMatch = raw.match(/"markdown"\s*:\s*"([\s\S]+)/)
  if (mdFieldMatch) {
    // Take everything after "markdown": " and try to find the end
    let value = mdFieldMatch[1]
    // Remove trailing JSON structure (practiceProblems, keyTerms, etc.)
    const trailingFieldMatch = value.search(/"\s*,\s*"(?:practiceProblems|keyTerms|keyPoints|slides)"/)
    if (trailingFieldMatch > 0) {
      value = value.slice(0, trailingFieldMatch)
    }
    // Unescape JSON string encoding
    const unescaped = value
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
    if (unescaped.length > 50) return unescaped
  }

  // Strategy 2: Strip JSON/code-block wrappers and use raw text
  const stripped = raw
    .replace(/^```(?:json)?\s*\n?/m, '')
    .replace(/\n?```\s*$/m, '')
    .replace(/^\s*\{[\s\S]{0,30}"markdown"\s*:\s*"/m, '')
    .trim()

  if (stripped.length > 50) return stripped

  return ''
}

// --- Internal Helpers ---

/**
 * Sanitize raw LLM output to produce parseable JSON.
 * Fixes LaTeX backslashes (\sum, \gamma, etc.), control characters,
 * and other common invalid escape sequences inside JSON string values.
 */
export function sanitizeJSONString(raw: string): string {
  let result = ''
  let inString = false
  let i = 0

  while (i < raw.length) {
    const ch = raw[i]

    if (ch === '"' && (i === 0 || raw[i - 1] !== '\\')) {
      inString = !inString
      result += ch
      i++
      continue
    }

    if (inString && ch === '\\') {
      const next = raw[i + 1]
      if (next === undefined) {
        result += '\\\\'
        i++
        continue
      }
      // Valid JSON escapes: " \ / b f n r t
      if ('"\\bfnrt/'.includes(next)) {
        result += ch + next
        i += 2
        continue
      }
      // Unicode escape \uXXXX
      if (next === 'u' && /^[0-9a-fA-F]{4}$/.test(raw.slice(i + 2, i + 6))) {
        result += raw.slice(i, i + 6)
        i += 6
        continue
      }
      // Invalid escape (e.g. \s, \g, \p from LaTeX) → double-escape
      result += '\\\\' + next
      i += 2
      continue
    }

    // Replace raw control characters inside strings
    if (inString && ch.charCodeAt(0) < 32) {
      if (ch === '\n') result += '\\n'
      else if (ch === '\r') result += '\\r'
      else if (ch === '\t') result += '\\t'
      else result += '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0')
      i++
      continue
    }

    result += ch
    i++
  }

  return result
}

/**
 * Extract a balanced JSON object from text using brace counting.
 * Handles nested braces and string literals (including escaped quotes).
 * Returns the substring from the first `{` to its matching `}`, or null.
 */
export function extractBalancedJSON(text: string): string | null {
  const start = text.indexOf('{')
  if (start === -1) return null

  let depth = 0
  let inString = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]

    if (inString) {
      if (ch === '\\') {
        i++ // skip escaped character
        continue
      }
      if (ch === '"') {
        inString = false
      }
      continue
    }

    if (ch === '"') {
      inString = true
    } else if (ch === '{') {
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0) {
        return text.slice(start, i + 1)
      }
    }
  }

  return null
}

export function extractJSON(text: string): string {
  // 1. Try json-tagged code block — use GREEDY match to skip inner ``` in markdown content
  const jsonBlockMatch = text.match(/```json\s*\n?([\s\S]*)```/)
  if (jsonBlockMatch) {
    const balanced = extractBalancedJSON(jsonBlockMatch[1])
    if (balanced) return sanitizeJSONString(balanced)
    return sanitizeJSONString(jsonBlockMatch[1].trim())
  }

  // 2. Try any code block (```python, ```text, ```, etc.) — GREEDY match
  const anyBlockMatch = text.match(/```\w*\s*\n?([\s\S]*)```/)
  if (anyBlockMatch) {
    const balanced = extractBalancedJSON(anyBlockMatch[1])
    if (balanced) return sanitizeJSONString(balanced)
    const arrInBlock = anyBlockMatch[1].match(/\[[\s\S]*\]/)
    if (arrInBlock) return sanitizeJSONString(arrInBlock[0])
  }

  // 3. Try to find a balanced JSON object in raw text
  const balanced = extractBalancedJSON(text)
  if (balanced) return sanitizeJSONString(balanced)

  // 4. Try to find a JSON array in raw text
  const jsonArrMatch = text.match(/\[[\s\S]*\]/)
  if (jsonArrMatch) {
    return sanitizeJSONString(jsonArrMatch[0])
  }

  // 5. Last resort
  return sanitizeJSONString(text.trim())
}

function normalizeProblem(raw: Record<string, unknown>): PracticeProblem {
  return {
    id: String(raw.id ?? ''),
    type: normalizeQuestionType(raw.type),
    question: String(raw.question ?? ''),
    options: Array.isArray(raw.options) ? raw.options.map(String) : undefined,
    correctIndex: typeof raw.correctIndex === 'number' ? raw.correctIndex : undefined,
    pairs: Array.isArray(raw.pairs)
      ? raw.pairs.map((p: Record<string, unknown>) => ({
          left: String(p.left ?? ''),
          right: String(p.right ?? ''),
        }))
      : undefined,
    sampleAnswer: raw.sampleAnswer != null ? String(raw.sampleAnswer) : undefined,
    explanation: String(raw.explanation ?? ''),
    rubric: Array.isArray(raw.rubric) ? raw.rubric.map(String) : undefined,
  }
}

function normalizeQuestionType(type: unknown): PracticeProblem['type'] {
  const str = String(type ?? 'multiple-choice').toLowerCase()
  if (str === 'matching') return 'matching'
  if (str === 'short-answer' || str === 'short_answer' || str === 'shortanswer') return 'short-answer'
  return 'multiple-choice'
}

function normalizeSlide(raw: Record<string, unknown>, index: number): SlideData {
  return {
    id: typeof raw.id === 'number' ? raw.id : index + 1,
    title: String(raw.title ?? ''),
    subtitle: raw.subtitle != null ? String(raw.subtitle) : undefined,
    bullets: Array.isArray(raw.bullets) ? raw.bullets.map(String) : undefined,
    notes: raw.notes != null ? String(raw.notes) : undefined,
    visual: raw.visual != null ? String(raw.visual) : undefined,
  }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isValidUUID(value: unknown): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value)
}

function generateUUID(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID()
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16)
    const value = char === 'x' ? random : (random & 0x3) | 0x8
    return value.toString(16)
  })
}

function normalizeUniqueUUID(candidate: unknown, used: Set<string>): string {
  let id = isValidUUID(candidate) ? candidate : generateUUID()

  while (used.has(id)) {
    id = generateUUID()
  }

  used.add(id)
  return id
}

function normalizePositiveOrder(value: unknown, fallback: number): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return fallback
  const normalized = Math.trunc(numeric)
  return normalized > 0 ? normalized : fallback
}
