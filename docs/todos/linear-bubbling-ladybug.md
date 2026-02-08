# AI Course Generation Feature — Agent Team Prompt

> **Usage**: Paste this entire prompt into Claude Code to spawn an agent team that will build the AI Course Generation feature for Inkdown.
> **Prerequisites**: Enable agent teams with `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in settings.json.

---

## Context

Inkdown needs an AI-powered course generation system — its future core feature. Users provide a topic, the system performs deep research across the domain using Gemini's Deep Research Agent API, then generates a full Coursera-quality course with modules, lessons (lectures, slides, videos, practice problems, quizzes, exams), YouTube video matching, and interactive content. A human-in-the-loop approval gate ensures the outline meets user expectations before full content generation begins.

This prompt is modeled after the existing AI Secretary Agent Team Prompt (`docs/plans/2026-02-05-ai-secretary-agent-team-prompt.md`).

---

## Master Prompt

Create an agent team to build the **AI Course Generation** feature for the Inkdown app. This is a full-stack feature that adds an AI-powered course generator and Coursera-like course viewer — producing comprehensive courses with deep research, lectures, slides, videos, quizzes, exams, and practice problems.

Use **delegate mode** (Shift+Tab after team creation) so you focus only on coordination.

### Team Structure

Spawn **5 teammates** using **Opus 4.6** for each:

1. **`types-agent`** — Defines all shared TypeScript types and Supabase migration in `packages/shared/`
2. **`research-agent`** — Builds the deep research pipeline using Gemini Deep Research Agent API + RAG indexing in `packages/ai/src/agents/course/research/`
3. **`content-agent`** — Builds the course content generation pipeline (outline, lessons, video matching, quizzes) in `packages/ai/src/agents/course/`
4. **`api-agent`** — Builds the Hono API routes connecting frontend to backend in `apps/api/src/routes/course.ts`
5. **`frontend-agent`** — Builds the full Coursera-like Vue 3 course viewer, components, and Pinia store in `apps/web/`

### Task Execution Order

**Phase 1** (types-agent only):
- Define all shared types in `packages/shared/src/types/course.ts`
- Create Supabase migration for course tables
- Export from `packages/shared/src/types/index.ts`

**Phase 2** (research-agent + content-agent, after Phase 1):
- Research-agent: Build Gemini Deep Research pipeline with async polling + RAG indexing
- Content-agent: Build LangGraph course generation pipeline (outline → content → video → finalize)

**Phase 3** (api-agent, after Phase 2):
- Build Hono routes for course generation, polling, approval, and course retrieval

**Phase 4** (frontend-agent, after Phase 3):
- Build the full Coursera-like course viewer with Vue 3 components and Pinia store

**Phase 5** (all agents):
- Integration testing, wiring everything together

### File Ownership (NO CONFLICTS)

| Agent | Owns These Files/Folders |
|-------|--------------------------|
| types-agent | `packages/shared/src/types/course.ts`, `supabase/migrations/010_courses.sql` |
| research-agent | `packages/ai/src/agents/course/research/` (new folder) |
| content-agent | `packages/ai/src/agents/course/` (top-level files: `index.ts`, `agent.ts`, `prompts.ts`, `tools.ts`, `video-matcher.ts`) |
| api-agent | `apps/api/src/routes/course.ts` |
| frontend-agent | `apps/web/src/views/CourseView.vue`, `apps/web/src/views/CourseGeneratorView.vue`, `apps/web/src/components/course/`, `apps/web/src/stores/course.ts` |

---

## PART 1: REFERENCE ARCHITECTURE (from Note3)

The AI Course Generator is modeled after the Note3 app's course generation system. Here is how Note3 works — replicate this architecture adapted to Inkdown's stack.

### Note3's Core Pipeline

Note3 generates courses through a **6-stage pipeline** running in a Web Worker:

```
Stage 0: Deep Research        → Gemini Deep Research Agent API (async polling)
Stage 0.5: Knowledge Indexing → LlamaIndex RAG (embed research into vector store)
Stage 1: Topic Analysis       → Analyze prerequisites, core concepts, learning sequence
Stage 2: Outline Generation   → Create modules & lessons structure
         ⏸️ HUMAN APPROVAL GATE → User reviews/rejects/adjusts outline
Stage 3: Content Generation   → Generate lesson content per type (lecture/video/slides/practice/quiz)
Stage 4: Video Matching       → YouTube API finds best-fit videos for video lessons
Stage 5: Finalize             → Assemble complete course, assign video URLs
```

### Note3's Content Types

Each lesson has a specific type with tailored content:

| Type | Content | Description |
|------|---------|-------------|
| `lecture` | Markdown + practice problems | Detailed text content with LaTeX math, examples, step-by-step explanations |
| `video` | Video overview + YouTube embed | Pre/post viewing questions, key concepts, embedded YouTube video |
| `slides` | Slide deck (6-20 slides) | Title, subtitle, bullets, speaker notes per slide |
| `practice` | Worked examples + problems | Concept recap, worked example, 5-8 graded problems |
| `quiz` | Assessment questions | 8-10 multiple choice questions, mixed difficulty |

### Note3's Human-in-the-Loop Pattern

1. Deep research + analysis runs automatically
2. Outline is generated and **presented to user for review**
3. User can:
   - **Approve** → content generation begins
   - **Reject with feedback** → outline regenerates incorporating feedback
   - **Edit directly** → modify module/lesson structure before approving
4. Only after approval does expensive content generation start
5. This loop can repeat (reject → regenerate → review → approve)

### Note3's Content Coherence Strategy

Each lesson generation includes context from previous lessons:
- Track `lessonSummaries` (title, concepts introduced, summary) per generated lesson
- Pass last 5 lesson summaries as context to each new lesson prompt
- Prompt says: "Reference concepts from previous lessons... Do NOT repeat explanations already covered... Build progressively on established knowledge"

### Note3's YouTube Video Matching

For `video` type lessons:
- Search YouTube Data API v3 with query: `"{lesson title} tutorial"`
- Return top 3 results with videoId, title, channel, thumbnail, description
- Auto-select top result, user can override
- Embed URL: `https://www.youtube.com/watch?v={videoId}`

---

## PART 2: TECHNOLOGY STACK FOR INKDOWN

### Backend AI Pipeline: LangGraph.js

Use `@langchain/langgraph` for the course generation state machine. Each pipeline stage is a graph node.

**Key imports:**
```typescript
import { StateGraph, Annotation, START, END } from '@langchain/langgraph'
import { ChatAnthropic } from '@langchain/anthropic'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { MemorySaver } from '@langchain/langgraph'
import { z } from 'zod'
```

**Model Selection:**
- **Opus 4.6** (`claude-opus-4-6`): All reasoning — topic analysis, outline generation, lecture content, quiz generation, practice problems, video overviews
- **Gemini** (`gemini-3-pro-preview`): Slide generation ONLY (visual/presentation content)
- **Gemini Deep Research** (`deep-research-pro-preview-12-2025`): Deep research phase ONLY

### Deep Research: Gemini Deep Research Agent API

**NOT Tavily, NOT Google Search grounding**. Use the full Gemini Deep Research Agent — same approach as Note3.

**API Pattern: Async Polling (Production-proven in Note3)**

```
Step 1: POST /v1beta/interactions?key={api_key}
        Body: { input, agent: "deep-research-pro-preview-12-2025", background: true }
        Returns: { id: "interaction-xyz", status: "in_progress" }

Step 2: Poll GET /v1beta/interactions/{id}?key={api_key}
        Every 5 seconds, max 120 polls (10 min timeout)
        Returns: { status: "completed", outputs: [...], content: "report" }
```

Since Inkdown is a web app (no Tauri), the Hono backend makes these API calls directly — no CORS issues on server side.

### Storage: Supabase

Courses stored in dedicated Supabase tables (not as Inkdown notes). Structured data supports progress tracking, quiz scoring, and course browsing.

### Frontend: Vue 3 + Pinia

Full Coursera-like course viewer with module sidebar, lesson content area, notes panel, video player, slides viewer, quiz system, and AI tutor chat.

### API: Hono

Routes in `apps/api/src/routes/course.ts` for course CRUD, generation lifecycle, and progress polling.

---

## PART 3: DETAILED IMPLEMENTATION SPECS

### 3.1 — Shared Types (`packages/shared/src/types/course.ts`)

**types-agent** creates this file FIRST. All other agents import from here.

```typescript
// ============================================================
// COURSE TYPES — packages/shared/src/types/course.ts
// ============================================================

// --- Course Structure Types ---

export type CourseDifficulty = 'beginner' | 'intermediate' | 'advanced'
export type CourseStatus = 'generating' | 'ready' | 'archived'
export type LessonType = 'lecture' | 'video' | 'slides' | 'practice' | 'quiz'
export type LessonStatus = 'locked' | 'available' | 'in_progress' | 'completed'
export type ModuleStatus = 'locked' | 'available' | 'in_progress' | 'completed'

export interface Course {
  id: string
  userId: string
  title: string
  topic: string
  description: string
  difficulty: CourseDifficulty
  estimatedHours: number
  prerequisites: string[]
  learningObjectives: string[]
  status: CourseStatus
  progress: number                    // 0-100 overall completion
  settings: CourseSettings
  researchReport: string | null       // Raw deep research report
  thinkingTrace: string | null        // AI reasoning trace
  generatedAt: string                 // ISO timestamp
  createdAt: string
  updatedAt: string
}

export interface CourseModule {
  id: string
  courseId: string
  title: string
  description: string
  order: number
  status: ModuleStatus
  progress: number                    // 0-100 module completion
  lessons: Lesson[]
}

export interface Lesson {
  id: string
  moduleId: string
  title: string
  type: LessonType
  duration: string                    // "15 min", "30 min"
  order: number
  status: LessonStatus
  content: LessonContent
  completedAt?: string
}

export interface LessonContent {
  markdown: string                    // Main content (all lesson types)
  practiceProblems?: PracticeProblem[]
  slides?: SlideData[]                // For 'slides' type
  videoUrl?: string                   // For 'video' type
  videoId?: string                    // YouTube video ID
  videoThumbnail?: string
  videoChannel?: string
  keyPoints?: string[]                // For 'video' and 'lecture' types
  timestamps?: { time: string; label: string }[]  // For 'video' type
  transcript?: string                 // For 'video' type
  keyTerms?: { term: string; definition: string }[]  // For 'lecture'/'reading'
}

export interface SlideData {
  id: number
  title: string
  subtitle?: string
  bullets?: string[]
  notes?: string                      // Speaker notes
  visual?: string                     // Diagram description
}

export interface PracticeProblem {
  id: string
  type: 'multiple-choice' | 'matching' | 'short-answer'
  question: string
  options?: string[]                  // For multiple-choice
  correctIndex?: number               // For multiple-choice
  pairs?: { left: string; right: string }[]  // For matching
  sampleAnswer?: string               // For short-answer
  explanation: string
  rubric?: string[]                   // For short-answer grading
}

// --- Course Settings ---

export interface CourseSettings {
  includeVideos: boolean
  includeSlides: boolean
  includePractice: boolean
  includeQuizzes: boolean
  estimatedWeeks: number
  hoursPerWeek: number
  focusAreas: string[]
  maxSlidesPerLesson: number          // Default: 20
}

// --- Generation Pipeline Types ---

export type GenerationStageType =
  | 'research'       // Deep Research phase
  | 'indexing'        // RAG indexing phase
  | 'analysis'        // Topic analysis
  | 'planning'        // Outline generation
  | 'approval'        // Waiting for human approval
  | 'content'         // Lesson content generation
  | 'multimedia'      // Video matching + slide generation
  | 'review'          // Final quality review
  | 'complete'        // Done

export interface CourseOutline {
  title: string
  topic: string
  description: string
  difficulty: CourseDifficulty
  estimatedHours: number
  prerequisites: string[]
  learningObjectives: string[]
  modules: CourseOutlineModule[]
}

export interface CourseOutlineModule {
  id: string
  title: string
  description: string
  order: number
  lessons: CourseOutlineLesson[]
}

export interface CourseOutlineLesson {
  id: string
  title: string
  type: LessonType
  estimatedMinutes: number
  keyTopics: string[]
  learningObjectives: string[]
  order: number
}

// --- Generation Progress & Events ---

export interface CourseGenerationProgress {
  courseId: string
  threadId: string
  stage: GenerationStageType
  stageProgress: number               // 0-100 within current stage
  overallProgress: number             // 0-100 total
  thinkingOutput: string              // AI reasoning trace
  currentNode: string                 // Current LangGraph node
  error?: string
}

export interface ResearchProgress {
  status: 'starting' | 'researching' | 'writing' | 'complete' | 'failed'
  progress: number
  thinking: string
  sources: ResearchSource[]
  partialReport: string | null
}

export interface ResearchSource {
  url: string
  title: string
  status: 'queued' | 'reading' | 'done' | 'failed'
}

// --- API Request/Response Types ---

export interface StartCourseGenerationRequest {
  topic: string
  difficulty?: CourseDifficulty
  settings?: Partial<CourseSettings>
  focusAreas?: string[]
}

export interface CourseGenerationResponse {
  status: 'running' | 'awaiting_approval' | 'complete' | 'error' | 'cancelled'
  courseId: string
  threadId: string
  outline: CourseOutline | null
  course: Course | null
  stage: GenerationStageType
  progress: number
  thinkingOutput: string
  error?: string
}

export interface ApproveOutlineRequest {
  threadId: string
  courseId: string
  modifiedOutline?: CourseOutline      // User-edited outline (optional)
}

export interface RejectOutlineRequest {
  threadId: string
  courseId: string
  feedback: string                     // Why rejected, what to change
}

// --- Course Stream Events (SSE) ---

export type CourseStreamEvent =
  | { event: 'progress'; data: CourseGenerationProgress }
  | { event: 'research_progress'; data: ResearchProgress }
  | { event: 'outline_ready'; data: { outline: CourseOutline; thinking: string } }
  | { event: 'content_progress'; data: { moduleIndex: number; lessonIndex: number; totalModules: number; totalLessons: number } }
  | { event: 'complete'; data: { courseId: string } }
  | { event: 'error'; data: { message: string; stage: GenerationStageType } }

// --- Quiz & Exam Types ---

export interface QuizAttempt {
  id: string
  lessonId: string
  courseId: string
  userId: string
  answers: Record<string, number | string>  // problemId → answer
  score: number                              // 0-100
  passed: boolean
  submittedAt: string
}

export interface CourseProgress {
  courseId: string
  userId: string
  completedLessons: string[]           // Lesson IDs
  quizScores: Record<string, number>   // lessonId → best score
  totalProgress: number                // 0-100
  lastAccessedAt: string
  startedAt: string
}

// --- YouTube Video Types ---

export interface YouTubeVideo {
  videoId: string
  title: string
  channelTitle: string
  thumbnailUrl: string
  description: string
}

export interface LessonVideoMatch {
  lessonId: string
  videos: YouTubeVideo[]
  selectedVideoId: string | null
}
```

**Also re-export from `packages/shared/src/types/index.ts`:**
```typescript
export * from './course'
```

---

### 3.2 — Supabase Migration (`supabase/migrations/010_courses.sql`)

**types-agent** also creates this migration file.

```sql
-- ============================================================
-- COURSE TABLES — supabase/migrations/010_courses.sql
-- ============================================================

-- Courses (top-level)
CREATE TABLE IF NOT EXISTS courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  topic TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  difficulty TEXT NOT NULL DEFAULT 'intermediate'
    CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  estimated_hours NUMERIC NOT NULL DEFAULT 0,
  prerequisites JSONB NOT NULL DEFAULT '[]',
  learning_objectives JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'generating'
    CHECK (status IN ('generating', 'ready', 'archived')),
  progress NUMERIC NOT NULL DEFAULT 0,
  settings JSONB NOT NULL DEFAULT '{}',
  research_report TEXT,
  thinking_trace TEXT,
  generated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Course Modules
CREATE TABLE IF NOT EXISTS course_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  "order" INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('locked', 'available', 'in_progress', 'completed')),
  progress NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lessons
CREATE TABLE IF NOT EXISTS course_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES course_modules(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('lecture', 'video', 'slides', 'practice', 'quiz')),
  duration TEXT NOT NULL DEFAULT '15 min',
  "order" INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('locked', 'available', 'in_progress', 'completed')),
  content JSONB NOT NULL DEFAULT '{}',    -- LessonContent as JSON
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Quiz Attempts
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES course_lessons(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  answers JSONB NOT NULL DEFAULT '{}',
  score NUMERIC NOT NULL DEFAULT 0,
  passed BOOLEAN NOT NULL DEFAULT false,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Course Progress (per user per course)
CREATE TABLE IF NOT EXISTS course_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  completed_lessons JSONB NOT NULL DEFAULT '[]',
  quiz_scores JSONB NOT NULL DEFAULT '{}',
  total_progress NUMERIC NOT NULL DEFAULT 0,
  last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(course_id, user_id)
);

-- Course Generation Threads (for LangGraph state continuity)
CREATE TABLE IF NOT EXISTS course_generation_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'awaiting_approval', 'generating_content', 'complete', 'error', 'cancelled')),
  current_stage TEXT NOT NULL DEFAULT 'research',
  outline JSONB,                         -- Pending outline for approval
  research_report TEXT,
  thinking_trace TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, thread_id)
);

-- Row Level Security
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_generation_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own courses"
  ON courses FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can read their course modules"
  ON course_modules FOR ALL
  USING (course_id IN (SELECT id FROM courses WHERE user_id = auth.uid()));
CREATE POLICY "Users can read their course lessons"
  ON course_lessons FOR ALL
  USING (module_id IN (SELECT id FROM course_modules WHERE course_id IN (SELECT id FROM courses WHERE user_id = auth.uid())));
CREATE POLICY "Users can manage their quiz attempts"
  ON quiz_attempts FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their course progress"
  ON course_progress FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their generation threads"
  ON course_generation_threads FOR ALL USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_courses_user ON courses(user_id);
CREATE INDEX idx_courses_status ON courses(user_id, status);
CREATE INDEX idx_course_modules_course ON course_modules(course_id);
CREATE INDEX idx_course_lessons_module ON course_lessons(module_id);
CREATE INDEX idx_quiz_attempts_lesson ON quiz_attempts(lesson_id, user_id);
CREATE INDEX idx_course_progress_user ON course_progress(user_id);
CREATE INDEX idx_course_gen_threads_user ON course_generation_threads(user_id);
```

---

### 3.3 — Research Pipeline (`packages/ai/src/agents/course/research/`)

**research-agent** builds this entire folder. Install dependencies first:

```bash
cd packages/ai && pnpm add @google/genai
```

#### File Structure

```
packages/ai/src/agents/course/research/
├── index.ts                    # Export runDeepResearch(), queryRAG()
├── deep-research.ts            # Gemini Deep Research Agent API (async polling)
├── rag-indexer.ts              # LlamaIndex-style RAG (embed + query)
└── types.ts                    # Internal research types
```

#### `deep-research.ts` — Gemini Deep Research Agent API

**CRITICAL**: Use the async polling pattern proven in Note3's production environment.

```typescript
/**
 * Gemini Deep Research Agent API — Async Polling Pattern
 *
 * Flow:
 * 1. POST /v1beta/interactions → creates background research task
 * 2. Poll GET /v1beta/interactions/{id} every 5 seconds
 * 3. Extract report + sources when status === 'completed'
 *
 * Model: deep-research-pro-preview-12-2025
 * Endpoint: https://generativelanguage.googleapis.com/v1beta/interactions
 */

import type { ResearchProgress, ResearchSource } from '@inkdown/shared/types'

const RESEARCH_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/interactions'
const RESEARCH_AGENT_MODEL = 'deep-research-pro-preview-12-2025'
const POLL_INTERVAL_MS = 5000    // 5 seconds
const MAX_POLLS = 120            // 10 minute timeout

export interface DeepResearchConfig {
  geminiApiKey: string
  onProgress?: (progress: ResearchProgress) => void
}

export interface DeepResearchResult {
  success: boolean
  report: string | null
  sources: ResearchSource[]
  error?: string
}

export async function runDeepResearch(
  topic: string,
  focusAreas: string[],
  config: DeepResearchConfig
): Promise<DeepResearchResult> {
  const { geminiApiKey, onProgress } = config

  // Build research prompt
  const focusSection = focusAreas.length > 0
    ? `\nFOCUS AREAS:\n${focusAreas.map(a => `- ${a}`).join('\n')}`
    : ''

  const researchPrompt = `Research comprehensive, accurate, up-to-date content for creating an educational course about: "${topic}"
${focusSection}

Please research and provide:
1. DEFINITIONS & TERMINOLOGY — Precise definitions, correct terminology, acronym expansions
2. CORE CONCEPTS — Essential concepts ordered by dependency (fundamentals → advanced)
3. CURRENT STATE (2024-2026) — Latest developments, breakthroughs, current best practices
4. KEY FIGURES & WORK — Important researchers, papers, organizations in this field
5. PRACTICAL APPLICATIONS — Real-world use cases, industry applications, case studies
6. COMMON MISCONCEPTIONS — What learners typically get wrong
7. LEARNING PREREQUISITES — What someone needs to know before studying this
8. RECOMMENDED RESOURCES — Key papers, books, tools, websites with actual URLs

Provide DETAILED, WELL-SOURCED information. This will be used as the source of truth for generating an educational course, so accuracy is critical.`

  // Notify progress: starting
  onProgress?.({
    status: 'starting',
    progress: 0,
    thinking: 'Initializing Gemini Deep Research Agent...',
    sources: [],
    partialReport: null,
  })

  try {
    // Step 1: Create background interaction
    const createResponse = await fetch(`${RESEARCH_API_BASE}?key=${geminiApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: researchPrompt,
        agent: RESEARCH_AGENT_MODEL,
        background: true,
      }),
    })

    if (!createResponse.ok) {
      const errorText = await createResponse.text()
      throw new Error(`Deep Research API error ${createResponse.status}: ${errorText}`)
    }

    const interaction = await createResponse.json()
    const interactionId = interaction.id

    onProgress?.({
      status: 'researching',
      progress: 10,
      thinking: `Research task created (ID: ${interactionId}). Polling for results...`,
      sources: [],
      partialReport: null,
    })

    // Step 2: Poll for completion
    for (let poll = 0; poll < MAX_POLLS; poll++) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))

      const pollResponse = await fetch(
        `${RESEARCH_API_BASE}/${interactionId}?key=${geminiApiKey}`,
        { headers: { 'Content-Type': 'application/json' } }
      )

      if (!pollResponse.ok) continue

      const pollData = await pollResponse.json()
      const status = pollData.status

      // Extract sources from grounding metadata if available
      const sources: ResearchSource[] = []
      if (pollData.outputs) {
        for (const output of pollData.outputs) {
          if (output.groundings) {
            for (const g of output.groundings) {
              sources.push({ url: g.url, title: g.title, status: 'done' })
            }
          }
        }
      }

      if (status === 'completed') {
        // Extract report from outputs
        const reportParts = (pollData.outputs || [])
          .filter((o: any) => o.type === 'report' || o.type === 'text')
          .map((o: any) => o.text)

        const report = reportParts.join('\n\n') || pollData.content || ''

        onProgress?.({
          status: 'complete',
          progress: 100,
          thinking: `Deep Research complete! Found ${sources.length} sources, ${report.length} chars.`,
          sources,
          partialReport: report,
        })

        return { success: true, report, sources }
      }

      if (status === 'failed') {
        const errorMsg = pollData.error?.message || 'Deep Research failed'
        onProgress?.({
          status: 'failed',
          progress: 0,
          thinking: `Research failed: ${errorMsg}`,
          sources: [],
          partialReport: null,
        })
        return { success: false, report: null, sources: [], error: errorMsg }
      }

      // Still in progress — update progress
      const progressPct = Math.min(10 + Math.round((poll / MAX_POLLS) * 80), 90)
      onProgress?.({
        status: 'researching',
        progress: progressPct,
        thinking: `Researching... (poll ${poll + 1}/${MAX_POLLS})`,
        sources,
        partialReport: null,
      })
    }

    // Timeout
    return { success: false, report: null, sources: [], error: 'Research timed out after 10 minutes' }

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error'
    onProgress?.({
      status: 'failed',
      progress: 0,
      thinking: `Research error: ${errorMsg}`,
      sources: [],
      partialReport: null,
    })
    return { success: false, report: null, sources: [], error: errorMsg }
  }
}
```

#### `rag-indexer.ts` — Research Context Retrieval

Implement a simple in-memory embedding + similarity search for feeding research context to each lesson. Use Gemini embeddings since the user has free Gemini API credits.

```typescript
/**
 * RAG Indexer — Embeds research report and provides per-lesson context retrieval.
 *
 * Uses Gemini text-embedding-004 for embeddings.
 * Chunks the research report, embeds each chunk, and provides similarity search.
 */

export interface RAGIndex {
  chunks: { text: string; embedding: number[] }[]
}

export async function indexResearchReport(
  report: string,
  geminiApiKey: string
): Promise<RAGIndex> {
  // 1. Split report into chunks (512 chars, 50 char overlap)
  // 2. Embed each chunk using Gemini text-embedding-004
  // 3. Return in-memory index
}

export async function queryRAG(
  index: RAGIndex,
  query: string,
  geminiApiKey: string,
  topK: number = 3
): Promise<string> {
  // 1. Embed query using same model
  // 2. Cosine similarity search against index chunks
  // 3. Return top-K chunks concatenated as context string
}
```

---

### 3.4 — Course Generation Agent (`packages/ai/src/agents/course/`)

**content-agent** builds these files.

#### File Structure

```
packages/ai/src/agents/course/
├── index.ts                    # Export CourseGenerationAgent
├── agent.ts                    # Main LangGraph pipeline (StateGraph)
├── prompts.ts                  # All prompt templates (analysis, outline, 5 lesson types)
├── tools.ts                    # LangChain tools for course operations
├── video-matcher.ts            # YouTube Data API v3 integration
└── slide-generator.ts          # Gemini-powered slide generation
```

#### `agent.ts` — Main LangGraph Pipeline

```typescript
/**
 * Course Generation Agent — LangGraph StateGraph
 *
 * Nodes:
 *   deepResearch → indexKnowledge → analyzeTopic → generateOutline
 *     → [APPROVAL GATE] → generateContent → matchVideos → generateSlides → finalize
 *
 * State:
 *   CourseGeneratorState tracks the full pipeline state
 *
 * Models:
 *   - Opus 4.6: Topic analysis, outline, lectures, quizzes, practice
 *   - Gemini 3 Pro: Slides only
 *   - Gemini Deep Research: Research phase only
 */

import { StateGraph, Annotation, START, END } from '@langchain/langgraph'
import { ChatAnthropic } from '@langchain/anthropic'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import type {
  CourseOutline, Course, CourseModule, Lesson, LessonContent,
  CourseSettings, GenerationStageType, ResearchSource, LessonVideoMatch,
  CourseGenerationProgress
} from '@inkdown/shared/types'
import { runDeepResearch } from './research'
import { indexResearchReport, queryRAG, type RAGIndex } from './research/rag-indexer'
import { PROMPTS } from './prompts'
import { matchVideosForLessons } from './video-matcher'
import { generateSlides } from './slide-generator'

// --- State Schema ---
const CourseGeneratorState = Annotation.Root({
  // Input
  topic: Annotation<string>(),
  difficulty: Annotation<string>(),
  settings: Annotation<Partial<CourseSettings>>(),
  focusAreas: Annotation<string[]>(),

  // Research
  researchReport: Annotation<string | null>(),
  researchSources: Annotation<ResearchSource[]>(),
  ragIndex: Annotation<RAGIndex | null>(),

  // Outline
  pendingOutline: Annotation<CourseOutline | null>(),
  approvedOutline: Annotation<CourseOutline | null>(),
  outlineFeedback: Annotation<string | null>(),

  // Content
  generatedModules: Annotation<CourseModule[]>(),
  lessonVideos: Annotation<LessonVideoMatch[]>(),
  lessonSummaries: Annotation<Map<string, { title: string; topics: string[]; summary: string }>>(),

  // Pipeline state
  currentStage: Annotation<GenerationStageType>(),
  stageProgress: Annotation<number>(),
  thinkingOutput: Annotation<string>(),
  error: Annotation<string | null>(),

  // Final output
  finalCourse: Annotation<Course | null>(),
})

export interface CourseAgentConfig {
  anthropicApiKey: string
  geminiApiKey: string
  youtubeApiKey?: string
  userId: string
  supabaseClient: any
  onProgress?: (progress: CourseGenerationProgress) => void
  onOutlineReady?: (outline: CourseOutline) => void
  onResearchProgress?: (progress: any) => void
}

export function createCourseGenerationGraph(config: CourseAgentConfig) {
  const opus = new ChatAnthropic({
    apiKey: config.anthropicApiKey,
    model: 'claude-opus-4-6',
    temperature: 0.7,
    maxTokens: 8192,
  })

  const gemini = new ChatGoogleGenerativeAI({
    apiKey: config.geminiApiKey,
    model: 'gemini-3-pro-preview',
    temperature: 0.7,
    maxOutputTokens: 8192,
  })

  const graph = new StateGraph(CourseGeneratorState)

  // Node 1: Deep Research
  graph.addNode('deepResearch', async (state) => {
    const result = await runDeepResearch(state.topic, state.focusAreas, {
      geminiApiKey: config.geminiApiKey,
      onProgress: config.onResearchProgress,
    })
    return {
      researchReport: result.report,
      researchSources: result.sources,
      currentStage: 'indexing' as const,
      stageProgress: 15,
    }
  })

  // Node 2: Index Knowledge (RAG)
  graph.addNode('indexKnowledge', async (state) => {
    if (!state.researchReport) return {}
    const ragIndex = await indexResearchReport(state.researchReport, config.geminiApiKey)
    return { ragIndex, currentStage: 'analysis' as const, stageProgress: 20 }
  })

  // Node 3: Analyze Topic (Opus 4.6)
  graph.addNode('analyzeTopic', async (state) => {
    const prompt = PROMPTS.ANALYSIS
      .replace('{TOPIC}', state.topic)
      .replace('{DIFFICULTY}', state.difficulty)
      .replace('{FOCUS_AREAS}', state.focusAreas.join(', ') || 'None')
    const response = await opus.invoke(prompt)
    // Parse analysis JSON from response
    return { currentStage: 'planning' as const, stageProgress: 25 }
  })

  // Node 4: Generate Outline (Opus 4.6)
  graph.addNode('generateOutline', async (state) => {
    const researchContext = state.researchReport
      ? `\nRESEARCH FINDINGS (USE AS SOURCE OF TRUTH):\n${state.researchReport.slice(0, 6000)}\n`
      : ''
    const feedbackSection = state.outlineFeedback
      ? `\nIMPORTANT: Address this feedback from the user:\n${state.outlineFeedback}\n`
      : ''

    const prompt = PROMPTS.OUTLINE
      .replace('{TOPIC}', state.topic)
      .replace('{DIFFICULTY}', state.difficulty)
      .replace('{FOCUS_AREAS}', state.focusAreas.join(', ') || 'None')
      .replace('{RESEARCH_CONTEXT}', researchContext)
      .replace('{FEEDBACK_SECTION}', feedbackSection)

    const response = await opus.invoke(prompt)
    const outline = parseOutlineJSON(response.content as string)

    // Notify frontend that outline is ready for approval
    config.onOutlineReady?.(outline)

    return {
      pendingOutline: outline,
      currentStage: 'approval' as const,
      stageProgress: 30,
    }
  })

  // Node 5: Generate Content (Opus 4.6 — one lesson at a time)
  graph.addNode('generateContent', async (state) => {
    const outline = state.approvedOutline!
    const generatedModules: CourseModule[] = []
    const lessonSummaries = new Map(state.lessonSummaries)
    const completedLessons: { title: string; topics: string[]; moduleTitle: string }[] = []

    for (let i = 0; i < outline.modules.length; i++) {
      const moduleOutline = outline.modules[i]
      const lessons: Lesson[] = []

      for (const lessonOutline of moduleOutline.lessons) {
        // Get RAG context for this lesson
        let ragContext = ''
        if (state.ragIndex) {
          ragContext = await queryRAG(
            state.ragIndex, lessonOutline.title, config.geminiApiKey
          )
        }

        // Build previous lessons context for coherence
        const prevContext = completedLessons.slice(-5).map((l, idx) =>
          `${idx + 1}. "${l.title}" (${l.moduleTitle}) — covered: ${l.topics.join(', ')}`
        ).join('\n')

        // Get type-specific prompt
        const prompt = PROMPTS[lessonOutline.type.toUpperCase()]
          .replace('{LESSON_TITLE}', lessonOutline.title)
          .replace('{KEY_TOPICS}', lessonOutline.keyTopics.join(', '))
          .replace('{LEARNING_OBJECTIVES}', lessonOutline.learningObjectives.join(', '))
          .replace('{MODULE_CONTEXT}', `${moduleOutline.title}: ${moduleOutline.description}`)
          .replace('{COURSE_CONTEXT}', `${outline.title} — ${outline.description}`)
          .replace('{RESEARCH_CONTEXT}', ragContext ? `\nRESEARCH CONTEXT:\n${ragContext}\n` : '')
          .replace('{PREVIOUS_LESSONS}', prevContext || 'This is the first lesson.')

        // Use Gemini for slides, Opus for everything else
        const model = lessonOutline.type === 'slides' ? gemini : opus
        const response = await model.invoke(prompt)

        const content = parseLessonContent(response.content as string, lessonOutline)

        lessons.push({
          id: lessonOutline.id,
          moduleId: moduleOutline.id,
          title: lessonOutline.title,
          type: lessonOutline.type,
          duration: `${lessonOutline.estimatedMinutes} min`,
          order: lessonOutline.order,
          status: 'available',
          content,
        })

        completedLessons.push({
          title: lessonOutline.title,
          topics: lessonOutline.keyTopics,
          moduleTitle: moduleOutline.title,
        })

        // Report progress
        const pct = 30 + Math.round(((i * moduleOutline.lessons.length + lessonOutline.order) /
          (outline.modules.length * moduleOutline.lessons.length)) * 50)
        config.onProgress?.({
          courseId: '', threadId: '', stage: 'content',
          stageProgress: pct, overallProgress: pct, thinkingOutput: '',
          currentNode: `Module ${i + 1}, Lesson ${lessonOutline.order}`,
        })
      }

      generatedModules.push({
        id: moduleOutline.id,
        courseId: '',
        title: moduleOutline.title,
        description: moduleOutline.description,
        order: moduleOutline.order,
        status: 'available',
        progress: 0,
        lessons,
      })
    }

    return {
      generatedModules,
      lessonSummaries,
      currentStage: 'multimedia' as const,
      stageProgress: 80,
    }
  })

  // Node 6: Match Videos (YouTube API)
  graph.addNode('matchVideos', async (state) => {
    if (!state.settings.includeVideos || !config.youtubeApiKey) {
      return { lessonVideos: [], stageProgress: 85 }
    }
    const lessonVideos = await matchVideosForLessons(
      state.generatedModules, config.youtubeApiKey
    )
    return { lessonVideos, stageProgress: 90 }
  })

  // Node 7: Finalize
  graph.addNode('finalize', async (state) => {
    const outline = state.approvedOutline!
    const course = assembleCourse(outline, state)
    // Save to Supabase
    await saveCourseToSupabase(course, state.generatedModules, config.supabaseClient)
    return {
      finalCourse: course,
      currentStage: 'complete' as const,
      stageProgress: 100,
    }
  })

  // Edges
  graph.addEdge(START, 'deepResearch')
  graph.addEdge('deepResearch', 'indexKnowledge')
  graph.addEdge('indexKnowledge', 'analyzeTopic')
  graph.addEdge('analyzeTopic', 'generateOutline')
  // After generateOutline: pause for approval (handled externally)
  // After approval: continue to generateContent
  graph.addEdge('generateContent', 'matchVideos')
  graph.addEdge('matchVideos', 'finalize')
  graph.addEdge('finalize', END)

  return graph.compile()
}
```

#### `prompts.ts` — All Prompt Templates

Replicate Note3's 5 lesson-type prompts, adapted for Opus 4.6 quality:

```typescript
export const PROMPTS = {
  ANALYSIS: `You are an expert curriculum designer...`, // Same pattern as Note3 ANALYSIS_PROMPT

  OUTLINE: `You are an expert curriculum designer creating a comprehensive course...
Return ONLY JSON matching the CourseOutline schema...`,  // Same as Note3 OUTLINE_PROMPT

  LECTURE: `Create detailed LECTURE content...
Include: introduction, clear explanations, step-by-step breakdowns, key definitions (use LaTeX!),
real-world applications, summary, 2-3 practice problems...
Return ONLY JSON: { "markdown": "...", "practiceProblems": [...] }`,

  VIDEO: `Create VIDEO lesson overview...
Include: brief intro, key concepts to watch for, pre-viewing questions,
notes section, post-viewing summary, reflection questions...
Return ONLY JSON: { "markdown": "...", "practiceProblems": [] }`,

  SLIDES: `Create SLIDE-BASED content (6-20 slides)...
Each slide: title, subtitle, bullets, speaker notes, visual descriptions...
Return ONLY JSON: { "markdown": "...", "slides": [...], "practiceProblems": [] }`,

  PRACTICE: `Create PRACTICE PROBLEMS...
Include: concept recap, worked example, 5-8 graded problems (easy → hard)...
Return ONLY JSON: { "markdown": "...", "practiceProblems": [...] }`,

  QUIZ: `Create a QUIZ with 8-10 questions...
Mix difficulty (easy, medium, hard), clear unambiguous questions...
Return ONLY JSON: { "markdown": "...", "practiceProblems": [...] }`,
}
```

**CRITICAL**: Each prompt MUST include:
- `{RESEARCH_CONTEXT}` — RAG-retrieved research context for accuracy
- `{PREVIOUS_LESSONS}` — Last 5 lesson summaries for coherence
- `{LESSON_TITLE}`, `{KEY_TOPICS}`, `{LEARNING_OBJECTIVES}`, `{MODULE_CONTEXT}`, `{COURSE_CONTEXT}`
- LaTeX formatting rules (identical to Note3's `LATEX_FORMATTING_RULES`)
- Mermaid diagram instructions for visual content

#### `video-matcher.ts` — YouTube Integration

```typescript
/**
 * YouTube Data API v3 — Video matching for lessons.
 * Free tier: 10,000 units/day (search costs 100 units each = 100 searches/day).
 */

export async function matchVideosForLessons(
  modules: CourseModule[],
  youtubeApiKey: string
): Promise<LessonVideoMatch[]> {
  const matches: LessonVideoMatch[] = []
  for (const module of modules) {
    for (const lesson of module.lessons) {
      if (lesson.type === 'video' || lesson.type === 'lecture') {
        const videos = await searchYouTube(`${lesson.title} tutorial`, youtubeApiKey, 3)
        matches.push({
          lessonId: lesson.id,
          videos,
          selectedVideoId: videos[0]?.videoId || null,
        })
      }
    }
  }
  return matches
}

async function searchYouTube(query: string, apiKey: string, maxResults: number): Promise<YouTubeVideo[]> {
  const params = new URLSearchParams({
    part: 'snippet', type: 'video', q: query,
    maxResults: String(maxResults), videoEmbeddable: 'true', key: apiKey,
  })
  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`)
  if (!res.ok) return []
  const data = await res.json()
  return (data.items || []).map((item: any) => ({
    videoId: item.id.videoId,
    title: item.snippet.title,
    channelTitle: item.snippet.channelTitle,
    thumbnailUrl: item.snippet.thumbnails?.high?.url || '',
    description: item.snippet.description,
  }))
}
```

#### `slide-generator.ts` — Gemini Slide Generation

```typescript
/**
 * Gemini-powered slide generation.
 * Uses Gemini 3 Pro for visual/presentation content.
 * Parses response into structured SlideData[].
 */
export async function generateSlides(
  lessonTitle: string,
  keyTopics: string[],
  researchContext: string,
  geminiApiKey: string,
  maxSlides: number = 20
): Promise<SlideData[]> {
  // Use PROMPTS.SLIDES with Gemini, parse JSON response into SlideData[]
}
```

---

### 3.5 — API Routes (`apps/api/src/routes/course.ts`)

**api-agent** creates this file.

```typescript
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import { createCourseGenerationGraph } from '@inkdown/ai/agents/course'

const course = new Hono()

// POST /api/course/generate — Start course generation (returns threadId for polling)
course.post('/generate', async (c) => {
  const body = await c.req.json()
  const { topic, difficulty, settings, focusAreas } = body
  const userId = c.get('userId')
  const supabase = c.get('supabase')

  const threadId = crypto.randomUUID()
  const courseId = crypto.randomUUID()

  // Create course record in Supabase (status: 'generating')
  await supabase.from('courses').insert({
    id: courseId, user_id: userId, title: `Generating: ${topic}`,
    topic, difficulty: difficulty || 'intermediate', status: 'generating',
    settings: settings || {},
  })

  // Create generation thread record
  await supabase.from('course_generation_threads').insert({
    course_id: courseId, user_id: userId, thread_id: threadId,
    status: 'running', current_stage: 'research',
  })

  // Start generation in background (non-blocking)
  startGenerationInBackground(courseId, threadId, topic, difficulty, settings, focusAreas, userId, supabase)

  return c.json({ courseId, threadId, status: 'running' })
})

// GET /api/course/generate/:threadId/stream — SSE stream for generation progress
course.get('/generate/:threadId/stream', async (c) => {
  const threadId = c.req.param('threadId')
  const userId = c.get('userId')
  const supabase = c.get('supabase')

  return streamSSE(c, async (stream) => {
    // Poll generation thread status and emit SSE events
    // Events: progress, research_progress, outline_ready, content_progress, complete, error
    // ...implementation sends SSE events based on generation thread state
  })
})

// GET /api/course/generate/:threadId/status — Poll generation status
course.get('/generate/:threadId/status', async (c) => {
  const threadId = c.req.param('threadId')
  const userId = c.get('userId')
  const supabase = c.get('supabase')

  const { data } = await supabase
    .from('course_generation_threads')
    .select('*')
    .eq('user_id', userId)
    .eq('thread_id', threadId)
    .single()

  if (!data) return c.json({ error: 'Thread not found' }, 404)

  return c.json({
    status: data.status,
    stage: data.current_stage,
    outline: data.outline,
    error: data.error_message,
    courseId: data.course_id,
  })
})

// POST /api/course/generate/:threadId/approve — Approve outline, continue generation
course.post('/generate/:threadId/approve', async (c) => {
  const threadId = c.req.param('threadId')
  const { modifiedOutline } = await c.req.json()
  const userId = c.get('userId')
  const supabase = c.get('supabase')

  // Update thread with approved outline, set status to 'generating_content'
  await supabase
    .from('course_generation_threads')
    .update({
      status: 'generating_content',
      outline: modifiedOutline || null,
      current_stage: 'content',
      updated_at: new Date().toISOString(),
    })
    .eq('thread_id', threadId)
    .eq('user_id', userId)

  // Resume generation pipeline (content generation phase)
  resumeContentGeneration(threadId, modifiedOutline, userId, supabase)

  return c.json({ status: 'generating_content' })
})

// POST /api/course/generate/:threadId/reject — Reject outline with feedback
course.post('/generate/:threadId/reject', async (c) => {
  const threadId = c.req.param('threadId')
  const { feedback } = await c.req.json()
  const userId = c.get('userId')
  const supabase = c.get('supabase')

  // Update thread, regenerate outline with feedback
  await supabase
    .from('course_generation_threads')
    .update({
      status: 'running',
      current_stage: 'planning',
      updated_at: new Date().toISOString(),
    })
    .eq('thread_id', threadId)
    .eq('user_id', userId)

  // Regenerate outline with feedback
  regenerateOutline(threadId, feedback, userId, supabase)

  return c.json({ status: 'regenerating' })
})

// POST /api/course/generate/:threadId/cancel — Cancel generation
course.post('/generate/:threadId/cancel', async (c) => {
  const threadId = c.req.param('threadId')
  const userId = c.get('userId')
  const supabase = c.get('supabase')

  await supabase
    .from('course_generation_threads')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('thread_id', threadId)
    .eq('user_id', userId)

  return c.json({ status: 'cancelled' })
})

// --- Course CRUD ---

// GET /api/course — List user's courses
course.get('/', async (c) => {
  const userId = c.get('userId')
  const supabase = c.get('supabase')

  const { data } = await supabase
    .from('courses')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  return c.json({ courses: data || [] })
})

// GET /api/course/:id — Get full course with modules and lessons
course.get('/:id', async (c) => {
  const courseId = c.req.param('id')
  const userId = c.get('userId')
  const supabase = c.get('supabase')

  const { data: courseData } = await supabase
    .from('courses')
    .select('*')
    .eq('id', courseId)
    .eq('user_id', userId)
    .single()

  if (!courseData) return c.json({ error: 'Course not found' }, 404)

  const { data: modules } = await supabase
    .from('course_modules')
    .select('*, course_lessons(*)')
    .eq('course_id', courseId)
    .order('order')

  return c.json({ course: courseData, modules: modules || [] })
})

// PUT /api/course/:courseId/lesson/:lessonId/complete — Mark lesson complete
course.put('/:courseId/lesson/:lessonId/complete', async (c) => {
  const { courseId, lessonId } = c.req.param()
  const userId = c.get('userId')
  const supabase = c.get('supabase')

  // Update lesson status
  await supabase
    .from('course_lessons')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', lessonId)

  // Update course progress
  // ... recalculate progress based on completed lessons

  return c.json({ success: true })
})

// POST /api/course/:courseId/quiz/:lessonId/submit — Submit quiz attempt
course.post('/:courseId/quiz/:lessonId/submit', async (c) => {
  const { courseId, lessonId } = c.req.param()
  const userId = c.get('userId')
  const supabase = c.get('supabase')
  const { answers } = await c.req.json()

  // Grade quiz, save attempt, update progress
  // ...

  return c.json({ score: 0, passed: false }) // placeholder
})

// DELETE /api/course/:id — Delete a course
course.delete('/:id', async (c) => {
  const courseId = c.req.param('id')
  const userId = c.get('userId')
  const supabase = c.get('supabase')

  await supabase.from('courses').delete().eq('id', courseId).eq('user_id', userId)
  return c.json({ success: true })
})

export { course }
```

**Register routes** in `apps/api/src/index.ts`:
```typescript
import { course } from './routes/course'
app.route('/api/course', course)
```

---

### 3.6 — Frontend Store (`apps/web/src/stores/course.ts`)

**frontend-agent** creates this Pinia store.

```typescript
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  Course, CourseModule, Lesson, CourseOutline, CourseSettings,
  CourseDifficulty, CourseGenerationProgress, ResearchProgress,
  GenerationStageType, QuizAttempt, PracticeProblem
} from '@inkdown/shared/types'

export const useCourseStore = defineStore('course', () => {
  // --- Course List State ---
  const courses = ref<Course[]>([])
  const isLoadingCourses = ref(false)

  // --- Active Course State (viewing a course) ---
  const activeCourse = ref<Course | null>(null)
  const activeModules = ref<CourseModule[]>([])
  const selectedModuleIndex = ref(0)
  const selectedLessonIndex = ref(0)
  const sidebarOpen = ref(true)
  const notesPanelOpen = ref(false)

  // --- Generation State ---
  const isGenerating = ref(false)
  const generationThreadId = ref<string | null>(null)
  const generationCourseId = ref<string | null>(null)
  const generationStage = ref<GenerationStageType>('research')
  const generationProgress = ref(0)
  const generationThinking = ref('')
  const researchProgress = ref<ResearchProgress | null>(null)
  const pendingOutline = ref<CourseOutline | null>(null)
  const isAwaitingApproval = ref(false)
  const generationError = ref<string | null>(null)

  // --- Quiz State ---
  const practiceAnswers = ref<Record<string, number | string>>({})
  const practiceSubmitted = ref(false)
  const currentSlide = ref(0)

  // --- Computed ---
  const currentModule = computed(() => activeModules.value[selectedModuleIndex.value] || null)
  const currentLesson = computed(() => currentModule.value?.lessons[selectedLessonIndex.value] || null)
  const courseProgress = computed(() => {
    if (!activeModules.value.length) return 0
    const totalLessons = activeModules.value.reduce((s, m) => s + m.lessons.length, 0)
    const completedLessons = activeModules.value.reduce((s, m) =>
      s + m.lessons.filter(l => l.status === 'completed').length, 0)
    return totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0
  })

  // --- Actions ---

  async function fetchCourses() { /* GET /api/course */ }
  async function fetchCourse(courseId: string) { /* GET /api/course/:id */ }

  async function startGeneration(topic: string, difficulty: CourseDifficulty, settings: Partial<CourseSettings>, focusAreas: string[]) {
    /* POST /api/course/generate → set isGenerating, start polling SSE stream */
  }

  async function approveOutline(modifiedOutline?: CourseOutline) {
    /* POST /api/course/generate/:threadId/approve */
  }

  async function rejectOutline(feedback: string) {
    /* POST /api/course/generate/:threadId/reject */
  }

  async function cancelGeneration() {
    /* POST /api/course/generate/:threadId/cancel */
  }

  async function completeLesson(lessonId: string) {
    /* PUT /api/course/:courseId/lesson/:lessonId/complete */
  }

  async function submitQuiz(lessonId: string, answers: Record<string, number | string>) {
    /* POST /api/course/:courseId/quiz/:lessonId/submit */
  }

  function selectLesson(moduleIndex: number, lessonIndex: number) {
    selectedModuleIndex.value = moduleIndex
    selectedLessonIndex.value = lessonIndex
    currentSlide.value = 0
    practiceAnswers.value = {}
    practiceSubmitted.value = false
  }

  function handleAnswer(problemId: string, answer: number | string) {
    practiceAnswers.value[problemId] = answer
  }

  function submitPractice() { practiceSubmitted.value = true }
  function resetPractice() { practiceAnswers.value = {}; practiceSubmitted.value = false }

  return {
    courses, isLoadingCourses, activeCourse, activeModules,
    selectedModuleIndex, selectedLessonIndex, sidebarOpen, notesPanelOpen,
    isGenerating, generationThreadId, generationCourseId, generationStage,
    generationProgress, generationThinking, researchProgress, pendingOutline,
    isAwaitingApproval, generationError,
    practiceAnswers, practiceSubmitted, currentSlide,
    currentModule, currentLesson, courseProgress,
    fetchCourses, fetchCourse, startGeneration, approveOutline, rejectOutline,
    cancelGeneration, completeLesson, submitQuiz, selectLesson,
    handleAnswer, submitPractice, resetPractice,
  }
})
```

---

### 3.7 — Frontend Components (Full Coursera-like Viewer)

**frontend-agent** builds all of these.

#### Component Structure

```
apps/web/src/views/
├── CourseGeneratorView.vue          # Course creation wizard (topic input → generation → approval)
├── CourseView.vue                   # Course viewer (Coursera-like layout)
└── CourseListView.vue               # Browse/manage generated courses

apps/web/src/components/course/
├── generator/
│   ├── CourseTopicInput.vue         # Topic input form with difficulty/focus areas
│   ├── GenerationProgress.vue       # Generation pipeline progress UI
│   ├── ResearchProgress.vue         # Deep research progress with sources
│   ├── OutlineReview.vue            # Outline approval/rejection/editing UI
│   └── OutlineEditor.vue            # Drag-to-reorder modules/lessons
│
├── viewer/
│   ├── CourseNav.vue                # Left sidebar: module tree with lesson icons
│   ├── CourseHeader.vue             # Top bar: breadcrumb, lesson title, type badge, duration
│   ├── LessonContent.vue            # Main content renderer (dispatches to type-specific)
│   ├── VideoLesson.vue              # YouTube embed, key points, timestamps, transcript
│   ├── SlidesLesson.vue             # Slide deck viewer with thumbnails + speaker notes
│   ├── LectureLesson.vue            # Markdown content with key terms, highlights
│   ├── PracticeLesson.vue           # Practice problems with grading
│   ├── QuizLesson.vue               # Quiz with submit, scoring, explanations
│   ├── ComparisonLesson.vue         # Side-by-side comparison tables
│   └── CourseNotesPanel.vue         # Right sidebar: save-to-notes functionality
│
├── shared/
│   ├── ProgressBar.vue              # Module/course progress bar
│   ├── LessonTypeIcon.vue           # Icon for lesson type (video/slides/lecture/etc)
│   └── AITutorChat.vue              # AI tutor chat panel (contextual to current lesson)
│
└── list/
    ├── CourseCard.vue               # Course card for list view
    └── CourseFilters.vue            # Filter by status, difficulty, topic
```

#### Routing — Add to router:

```typescript
{ path: '/courses', name: 'courseList', component: () => import('./views/CourseListView.vue') },
{ path: '/courses/generate', name: 'courseGenerator', component: () => import('./views/CourseGeneratorView.vue') },
{ path: '/courses/:id', name: 'courseViewer', component: () => import('./views/CourseView.vue') },
```

#### Visual Design Guidelines

Follow the React reference component's design system, adapted to Inkdown's Vue/CSS patterns:

**Color Palette:**
```css
--course-bg-primary: #FAF9F7;
--course-bg-secondary: #FFFFFF;
--course-bg-tertiary: #F5F3EF;
--course-accent-warm: #D97706;        /* Primary accent (amber) */
--course-accent-blue: #3B82F6;        /* Video lessons */
--course-accent-purple: #8B5CF6;      /* Slide lessons */
--course-accent-green: #10B981;       /* Reading/lecture lessons */
--course-accent-red: #EF4444;         /* Wrong answers */
```

**Typography:**
```css
--course-font-display: 'Fraunces', Georgia, serif;   /* Headings */
--course-font-body: 'Source Sans 3', system-ui;       /* Body text */
```

**Layout (3-panel):**
```
┌─────────────────────────────────────────────────────────────────────┐
│ HEADER: Logo, course title, progress, notes toggle, help          │
├────────────┬──────────────────────────────────┬────────────────────┤
│ NOTES      │  COURSE NAV   │  CONTENT AREA    │                   │
│ SIDEBAR    │  Module tree   │  Lesson content  │                   │
│ (320px)    │  with lesson   │  (type-specific  │                   │
│            │  list          │   rendering)     │                   │
│ • Search   │  (300px)       │                  │                   │
│ • Saved    │               │  Video player    │                   │
│   notes    │               │  Slide deck      │                   │
│ • New note │               │  Rich text       │                   │
│            │               │  Quiz form       │                   │
│            │               │  Practice probs  │                   │
│            │               │                  │                   │
├────────────┴───────────────┴──────────────────┴────────────────────┤
│ AI TUTOR CHAT (floating FAB → expandable chat window)             │
└───────────────────────────────────────────────────────────────────┘
```

---

## PART 4: INTEGRATION CHECKLIST

After all agents finish their parts, verify these integration points:

### Types → All Packages
- [ ] `@inkdown/shared/types` exports all course types correctly
- [ ] All agents import types from `@inkdown/shared/types`, not local definitions
- [ ] Migration file creates all 6 tables with correct constraints

### Research Pipeline → Content Pipeline
- [ ] `runDeepResearch()` returns `DeepResearchResult` with report + sources
- [ ] `indexResearchReport()` creates RAG index from research report
- [ ] `queryRAG()` retrieves relevant context for each lesson
- [ ] Research report saved to `course_generation_threads.research_report`

### Content Pipeline → API
- [ ] Course generation graph runs all nodes in sequence
- [ ] Approval gate pauses at `generateOutline` node, resumes after `approve`
- [ ] Rejection loop regenerates outline with feedback
- [ ] Generated course + modules + lessons saved to Supabase tables
- [ ] Progress events emitted via `onProgress` callback

### API → Frontend
- [ ] `POST /api/course/generate` returns courseId + threadId
- [ ] SSE stream emits progress, research_progress, outline_ready, complete events
- [ ] `POST /api/course/generate/:threadId/approve` resumes generation
- [ ] `POST /api/course/generate/:threadId/reject` regenerates with feedback
- [ ] `GET /api/course/:id` returns full course with modules and lessons

### Frontend → Router
- [ ] `/courses` lists all generated courses
- [ ] `/courses/generate` shows topic input → generation progress → outline review
- [ ] `/courses/:id` loads full Coursera-like course viewer
- [ ] Navigation between routes works correctly

### Data Flow (End-to-End)
- [ ] User enters topic → POST /generate → background pipeline starts
- [ ] Research progress streams via SSE → frontend shows sources + progress
- [ ] Outline generated → presented for review → user approves/rejects
- [ ] Content generated per lesson → progress updates stream
- [ ] Videos matched → slides generated (Gemini) → course assembled
- [ ] Complete course saved → viewer loads with all content types
- [ ] Quiz submission → grading → score display → progress update
- [ ] Lesson completion → progress bar updates → module completion tracking

### Dependencies to Install
```bash
# In packages/ai/
pnpm add @langchain/langgraph @langchain/anthropic @langchain/google-genai @langchain/core @google/genai zod

# Verify existing deps work:
# @langchain/openai, deepagents, @supabase/supabase-js should already be installed
```

### Environment Variables Required
```env
ANTHROPIC_API_KEY=sk-ant-...          # Opus 4.6 for content generation
GEMINI_API_KEY=AIza...                 # Deep Research + Slides + RAG embeddings
YOUTUBE_API_KEY=AIza...                # YouTube video matching (optional)
```

---

## PART 5: WHAT NOT TO BUILD (YAGNI)

Keep the MVP focused. Do NOT build these in the first pass:

- ~~Certificate generation~~ — Phase 2
- ~~Discussion forums per lesson~~ — Phase 2
- ~~Collaborative courses (shared between users)~~ — Phase 2
- ~~Course marketplace / sharing~~ — Phase 2
- ~~Spaced repetition / flashcards~~ — Phase 2
- ~~AI-generated assessments (final exams beyond quizzes)~~ — Phase 2
- ~~Course templates / cloning~~ — Phase 2
- ~~Mobile responsive layout~~ — Phase 2
- ~~Offline course access~~ — Phase 2
- ~~Course export (PDF/SCORM)~~ — Phase 2
- ~~Background auto-generation scheduling~~ — Phase 2 (manual trigger for now)
- ~~Real-time collaborative editing of outlines~~ — Phase 2
- ~~Integration with existing Secretary roadmaps~~ — Phase 2

**DO build in Phase 1:**
- Deep research with Gemini Deep Research Agent
- Full 6-stage generation pipeline with human-in-the-loop
- All 5 lesson types (lecture, video, slides, practice, quiz)
- YouTube video matching
- Full Coursera-like course viewer
- Quiz scoring and progress tracking
- Notes panel for saving lesson content
- AI tutor chat (contextual to current lesson)

---

## SUMMARY FOR TEAM LEAD

You are coordinating 5 agents to build the AI Course Generation feature:

1. **Kick off types-agent FIRST** — it defines all shared types + migration that others depend on
2. **Then kick off research-agent and content-agent in PARALLEL** — they own separate subdirectories within `packages/ai/src/agents/course/`
3. **Then kick off api-agent** — it needs the backend contracts from research + content agents
4. **Then kick off frontend-agent** — it needs the API contract to be defined
5. **Monitor file conflicts** — each agent owns specific directories, no overlap
6. **After all agents finish** — run through the integration checklist in Part 4
7. **Run `pnpm build && pnpm typecheck`** to verify everything compiles

The total feature adds:
- ~1 types file + ~1 migration file
- ~6 research pipeline files
- ~6 content generation files (agent, prompts, tools, video-matcher, slide-generator, index)
- ~1 API route file
- ~1 Pinia store file
- ~3 view files + ~15 component files
- ~3 router changes

**Model usage:**
- **Opus 4.6** (`claude-opus-4-6`): ALL reasoning — analysis, outlines, lectures, quizzes, practice
- **Gemini 3 Pro** (`gemini-3-pro-preview`): Slide generation ONLY
- **Gemini Deep Research** (`deep-research-pro-preview-12-2025`): Research phase ONLY
- **Gemini Embeddings** (`text-embedding-004`): RAG vector embeddings

**Key reference files to read first:**
- `docs/plans/2026-02-05-ai-secretary-agent-team-prompt.md` — Architecture pattern
- `packages/ai/src/agents/secretary/` — Existing agent implementation patterns
- `packages/shared/src/types/secretary.ts` — Types pattern to follow
- `apps/api/src/routes/agent.ts` — API route patterns
- `apps/web/src/stores/ai.ts` — Store patterns
