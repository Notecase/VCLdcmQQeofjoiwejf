# AI Secretary Feature — Agent Team Prompt

> **Usage**: Paste this entire prompt into Claude Code to spawn an agent team that will build the AI Secretary feature for Inkdown.
> **Prerequisites**: Enable agent teams with `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in settings.json.

---

## Master Prompt

Create an agent team to build the **AI Secretary** feature for the Inkdown app. This is a full-stack feature that adds an AI-powered daily planner, roadmap manager, and personalized learning assistant — accessed via the calendar icon in the navigation dock.

Use **delegate mode** (Shift+Tab after team creation) so you focus only on coordination.

### Team Structure

Spawn **4 teammates** using Sonnet for each:

1. **`backend-agent`** — Builds the deepagentsjs secretary agent, tools, memory system, and Supabase storage in `packages/ai/`
2. **`api-agent`** — Builds the Hono API routes connecting frontend to backend in `apps/api/`
3. **`frontend-agent`** — Builds the Vue 3 dashboard view, components, and Pinia store in `apps/web/`
4. **`types-agent`** — Defines all shared TypeScript types in `packages/shared/` (this agent finishes first, others depend on it)

### Task Execution Order

**Phase 1** (types-agent only):
- Define all shared types in `packages/shared/src/types/secretary.ts`

**Phase 2** (backend-agent + api-agent, after Phase 1):
- Backend: Build deepagentsjs secretary agent with tools and memory
- API: Build Hono routes for secretary operations

**Phase 3** (frontend-agent, after Phase 2):
- Build the full dashboard UI with Vue components and Pinia store

**Phase 4** (all agents):
- Integration testing, wiring everything together

### File Ownership (NO CONFLICTS)

| Agent | Owns These Files/Folders |
|-------|--------------------------|
| types-agent | `packages/shared/src/types/secretary.ts` |
| backend-agent | `packages/ai/src/agents/secretary/` (new folder) |
| api-agent | `apps/api/src/routes/secretary.ts` |
| frontend-agent | `apps/web/src/views/SecretaryView.vue`, `apps/web/src/components/secretary/`, `apps/web/src/stores/secretary.ts` |

---

## PART 1: REFERENCE ARCHITECTURE (from Note3)

The AI Secretary is modeled after the Note3 app's planning system. Here is how Note3 works — replicate this architecture adapted to Inkdown's stack.

### Note3's Core Concept

Note3 has an AI Secretary that manages learning roadmaps and daily schedules through **markdown memory files**:

- **Plan.md** — Multi-roadmap index with active plans, progress tracking, and "This Week" schedule
- **AI.md** — User preferences (focus times, break frequency, study hours)
- **Today.md** — Today's time-blocked schedule with task checkboxes
- **Tomorrow.md** — AI-generated tomorrow's plan (shown after 9pm, user approves it)

### Note3's Dashboard Layout (replicate this)

```
┌─────────────────────────────────────────────────────────────────────┐
│ MEMORY FILES    │  Good evening                    │ Prepare Tomorrow│
│ • AI.md         │  Today: OPT Day 4 • AWS Day 2   │  Thu, Feb 5    │
│ • Plan.md       │                                   │                │
│ • Today.md      │  ── ACTIVE PLANS (3) ──────────────────────────── │
│ • Tomorrow.md   │  [Optics ████░░ 60%] [AWS ██░░░ 40%] [AI ████ ✓] │
│                 │  Jan 5-15 • 2h/day   Jan 6-13     Jan 19-30      │
│  PLANS/ARCHIVE  │                                                   │
│                 │  ── THIS WEEK: JAN 4 - JAN 10 ──                 │
│                 │                                                   │
│                 │  TODAY              0/7    │ FOR YOU              │
│                 │  ○ 10:00 📖 study   3h    │ Personalized assistant│
│                 │  ○ 10:45 ☕ Break   15min │                       │
│                 │  ○ 11:00 💻 practice 45min│ TODAY'S FOCUS         │
│                 │  ○ 11:45 ☕ Break   15min │ • Day 4: Lens combos │
│                 │  ○ 14:00 📖 AWS     45min │ • Day 2: S3 + Lambda │
│                 │  ○ 14:45 ☕ Break   15min │                       │
│                 │  ○ 15:00 💻 AWS lab 45min │ THIS WEEK calendar   │
│                 │                           │ [M][T][W][T][F][S][S]│
│                 │  TOMORROW   GENERATING... │                       │
│                 │                           │ QUICK ACTIONS         │
└─────────────────────────────────────────────────────────────────────┘
```

### Note3's AI Agent Architecture

Note3 uses a **LangGraph StateGraph** with 4 nodes:
1. **loadMemory** — Load AI.md + Plan.md context
2. **classifyIntent** — Route to correct handler (8 intents)
3. **callModel** — Invoke LLM with tools
4. **executeTools** — Run tool calls

**7 Core Tools**: `create_roadmap`, `save_roadmap`, `read_memory_file`, `write_memory_file`, `list_memory_files`, `delete_memory_file`, `rename_memory_file`

---

## PART 2: TECHNOLOGY STACK FOR INKDOWN

### Backend AI Agent: DeepAgentsJS

Use the `deepagents` npm package (LangGraph-based) to build the secretary agent.

**Key imports:**
```typescript
import { createDeepAgent, type SubAgent, CompositeBackend, StateBackend, StoreBackend } from 'deepagents'
import { ChatOpenAI } from '@langchain/openai'
import { tool } from 'langchain'
import { z } from 'zod'
import { MemorySaver, InMemoryStore } from '@langchain/langgraph'
import { HumanMessage } from '@langchain/core/messages'
```

**Why deepagentsjs:**
- Built-in planning tools (`write_todos`) for task decomposition
- SubAgent orchestration for parallel research/generation
- Memory system (AGENTS.md) for always-loaded preferences
- File system middleware for reading/writing memory files
- CompositeBackend for persistent + ephemeral storage
- Summarization middleware for long conversations
- Checkpointing for conversation continuity

### Storage: Supabase

Memory files (Plan.md, AI.md, Today.md, Tomorrow.md) are stored in a Supabase table, not the local filesystem (since Inkdown is a web app).

### Frontend: Vue 3 + Pinia

Dashboard view with components following Inkdown's existing patterns (NavigationDock, SideBar layout).

### API: Hono

New routes in `apps/api/src/routes/secretary.ts` for secretary operations.

---

## PART 3: DETAILED IMPLEMENTATION SPECS

### 3.1 — Shared Types (`packages/shared/src/types/secretary.ts`)

**types-agent** creates this file FIRST. All other agents import from here.

```typescript
// ============================================================
// SECRETARY TYPES — packages/shared/src/types/secretary.ts
// ============================================================

// --- Memory File Types ---

export interface MemoryFile {
  id: string
  userId: string
  filename: string          // 'Plan.md' | 'AI.md' | 'Today.md' | 'Tomorrow.md' | 'Plans/*.md'
  content: string           // Raw markdown content
  updatedAt: string         // ISO timestamp
  createdAt: string
}

// --- Roadmap Types ---

export interface LearningRoadmap {
  id: string                // Short ID like 'OPT', 'AWS', 'AI'
  name: string              // "11-Day Optics Roadmap"
  status: 'active' | 'completed' | 'paused' | 'archived'
  dateRange: {
    start: string           // YYYY-MM-DD
    end: string
  }
  schedule: {
    hoursPerDay: number     // e.g. 2
    studyDays: string[]     // ['Mon', 'Wed', 'Fri'] or ['Daily']
    dates?: string[]        // Computed exact dates
  }
  progress: {
    currentWeek: number
    totalWeeks: number
    currentDay: number
    totalDays: number
    percentComplete: number
  }
  currentTopic: string      // "Day 4: Lens combinations + magnification"
  archiveFilename: string   // "Plans/optics-roadmap.md"
}

// --- Daily Plan Types ---

export type TaskType = 'learn' | 'practice' | 'review' | 'project' | 'break'
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'skipped'

export interface ScheduledTask {
  id: string
  title: string
  type: TaskType
  status: TaskStatus
  scheduledTime: string     // "09:00" (HH:MM)
  durationMinutes: number   // 45, 60, 15, etc.
  planId?: string           // Links to LearningRoadmap.id
  aiGenerated: boolean
  aiReason?: string         // Why AI scheduled this
}

export interface DailyPlan {
  id: string
  date: string              // YYYY-MM-DD
  tasks: ScheduledTask[]
  createdAt: string
  updatedAt: string
  isApproved: boolean       // User confirmed the plan
  aiGeneratedAt?: string
  userModified: boolean     // User edited after AI generation
  totalMinutes: number
  completedMinutes: number
}

// --- User Preferences (parsed from AI.md) ---

export interface UserPreferences {
  focusTime: {
    bestStart: string       // "09:00"
    bestEnd: string         // "12:00"
  }
  breakFrequency: number    // minutes between breaks (e.g. 45)
  breakDuration: number     // minutes per break (e.g. 15)
  weekdayHours: number      // study hours on weekdays
  weekendHours: number      // study hours on weekends
  availability: {
    weekday: { start: string, end: string }
    weekend: { start: string, end: string }
  }
}

// --- Reflection Types ---

export type ReflectionMood = 'great' | 'good' | 'okay' | 'struggling' | 'overwhelmed'

export interface DailyReflection {
  date: string
  mood: ReflectionMood
  content: string
  submittedAt: string
}

// --- Secretary Intent Types ---

export type SecretaryIntent =
  | 'create_roadmap'
  | 'save_roadmap'
  | 'modify_roadmap'
  | 'daily_plan'
  | 'preferences'
  | 'calendar'
  | 'query'
  | 'general'

// --- API Request/Response Types ---

export interface SecretaryChatRequest {
  message: string
  threadId?: string         // For conversation continuity
}

export interface SecretaryChatResponse {
  type: 'text' | 'roadmap_preview' | 'daily_plan' | 'memory_update' | 'error'
  content: string
  metadata?: {
    roadmap?: LearningRoadmap
    dailyPlan?: DailyPlan
    updatedFiles?: string[]
  }
}

export interface SecretaryStreamEvent {
  event: 'text' | 'tool_call' | 'tool_result' | 'roadmap_preview' | 'daily_plan' | 'thinking' | 'done' | 'error'
  data: string
  metadata?: Record<string, unknown>
}

// --- Dashboard State Types ---

export interface SecretaryDashboardState {
  activePlans: LearningRoadmap[]
  todayPlan: DailyPlan | null
  tomorrowPlan: DailyPlan | null
  todayReflection: DailyReflection | null
  memoryFiles: MemoryFile[]
  thisWeek: WeekSchedule
  isGeneratingPlan: boolean
  isGeneratingTomorrow: boolean
}

export interface WeekSchedule {
  weekStart: string         // YYYY-MM-DD (Monday)
  weekEnd: string           // YYYY-MM-DD (Sunday)
  days: WeekDay[]
}

export interface WeekDay {
  date: string              // YYYY-MM-DD
  dayName: string           // 'Mon', 'Tue', etc.
  isToday: boolean
  planEntries: {
    planId: string          // Links to LearningRoadmap.id
    topic: string
  }[]
}
```

**Also re-export from `packages/shared/src/types/index.ts`:**
```typescript
export * from './secretary'
```

---

### 3.2 — Supabase Migration (`supabase/migrations/009_secretary.sql`)

**types-agent** also creates this migration file.

```sql
-- Secretary Memory Files
CREATE TABLE IF NOT EXISTS secretary_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,                    -- 'Plan.md', 'AI.md', 'Today.md', 'Tomorrow.md', 'Plans/optics.md'
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, filename)
);

-- Secretary Chat Threads (for conversation continuity)
CREATE TABLE IF NOT EXISTS secretary_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id TEXT NOT NULL,                   -- LangGraph thread ID
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, thread_id)
);

-- Row Level Security
ALTER TABLE secretary_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE secretary_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own memory files"
  ON secretary_memory FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own threads"
  ON secretary_threads FOR ALL
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_secretary_memory_user ON secretary_memory(user_id);
CREATE INDEX idx_secretary_memory_filename ON secretary_memory(user_id, filename);
CREATE INDEX idx_secretary_threads_user ON secretary_threads(user_id);
```

---

### 3.3 — Backend Agent (`packages/ai/src/agents/secretary/`)

**backend-agent** builds this entire folder. Install dependencies first:

```bash
cd packages/ai && pnpm add deepagents @langchain/openai @langchain/langgraph zod
```

#### File Structure

```
packages/ai/src/agents/secretary/
├── index.ts                 # Export createSecretaryAgent()
├── agent.ts                 # Main deepagentsjs agent setup
├── tools.ts                 # 7 secretary tools (file I/O, roadmap CRUD)
├── subagents.ts             # Subagent definitions (planner, researcher)
├── prompts.ts               # System prompt + intent-specific prompts
├── memory.ts                # Memory file service (Supabase CRUD)
└── types.ts                 # Internal types (re-exports from @inkdown/shared)
```

#### `agent.ts` — Main Agent

```typescript
import { createDeepAgent, StateBackend, type SubAgent } from 'deepagents'
import { ChatOpenAI } from '@langchain/openai'
import { MemorySaver } from '@langchain/langgraph'
import { HumanMessage } from '@langchain/core/messages'
import { secretaryTools } from './tools'
import { plannerSubAgent, researcherSubAgent } from './subagents'
import { SECRETARY_SYSTEM_PROMPT } from './prompts'

export interface SecretaryAgentConfig {
  openaiApiKey: string
  openaiModel?: string
  userId: string
  supabaseClient: any        // SupabaseClient type
}

export function createSecretaryAgent(config: SecretaryAgentConfig) {
  const model = new ChatOpenAI({
    apiKey: config.openaiApiKey,
    model: config.openaiModel || 'gpt-4o',
    temperature: 0.7,
  })

  const checkpointer = new MemorySaver()

  const tools = secretaryTools(config.userId, config.supabaseClient)

  const agent = createDeepAgent({
    model,
    systemPrompt: SECRETARY_SYSTEM_PROMPT,
    tools,
    subagents: [plannerSubAgent, researcherSubAgent],
    backend: (backendConfig) => new StateBackend(backendConfig),
    checkpointer,
  })

  return {
    async chat(message: string, threadId: string) {
      const result = await agent.invoke(
        { messages: [new HumanMessage(message)] },
        {
          configurable: { thread_id: threadId },
          recursionLimit: 50,
        }
      )
      return result
    },

    async *stream(message: string, threadId: string) {
      for await (const event of agent.stream(
        { messages: [new HumanMessage(message)] },
        {
          configurable: { thread_id: threadId },
          recursionLimit: 50,
          streamMode: 'updates',
        }
      )) {
        yield event
      }
    },
  }
}
```

#### `tools.ts` — 7 Secretary Tools

Replicate Note3's tool pattern but backed by Supabase:

```typescript
import { tool } from 'langchain'
import { z } from 'zod'

export function secretaryTools(userId: string, supabase: any) {
  // Tool 1: create_roadmap
  const createRoadmap = tool(
    async ({ name, duration, studyDays, hoursPerDay, topics }) => {
      // Generate a structured roadmap with phases, weeks, daily topics
      // Return the roadmap as markdown for preview (NOT saved yet)
      // ...
    },
    {
      name: 'create_roadmap',
      description: 'Create a new learning roadmap. Returns a preview — user must confirm before saving.',
      schema: z.object({
        name: z.string().describe('Roadmap title, e.g. "11-Day Optics Roadmap"'),
        duration: z.number().describe('Total days'),
        studyDays: z.array(z.string()).describe('Days of week, e.g. ["Mon", "Wed", "Fri"]'),
        hoursPerDay: z.number().describe('Study hours per day'),
        topics: z.array(z.object({
          week: z.number(),
          theme: z.string(),
          dailyTopics: z.array(z.string()),
        })).describe('Week-by-week topic breakdown'),
      }),
    }
  )

  // Tool 2: save_roadmap
  const saveRoadmap = tool(
    async ({ roadmapMarkdown, planId }) => {
      // 1. Save full roadmap to Plans/<filename>.md in secretary_memory
      // 2. Update Plan.md with new active plan entry
      // 3. Return confirmation
    },
    {
      name: 'save_roadmap',
      description: 'Save a confirmed roadmap to Plan.md and create its archive file.',
      schema: z.object({
        roadmapMarkdown: z.string().describe('Full roadmap markdown content'),
        planId: z.string().describe('Short plan ID like OPT, AWS, AI'),
      }),
    }
  )

  // Tool 3: read_memory_file
  const readMemoryFile = tool(
    async ({ filename }) => {
      const { data } = await supabase
        .from('secretary_memory')
        .select('content')
        .eq('user_id', userId)
        .eq('filename', filename)
        .single()
      return data?.content || `File "${filename}" not found.`
    },
    {
      name: 'read_memory_file',
      description: 'Read a memory file. Available files: Plan.md, AI.md, Today.md, Tomorrow.md, or Plans/*.md',
      schema: z.object({
        filename: z.string().describe('Filename to read'),
      }),
    }
  )

  // Tool 4: write_memory_file
  const writeMemoryFile = tool(
    async ({ filename, content }) => {
      await supabase
        .from('secretary_memory')
        .upsert({
          user_id: userId,
          filename,
          content,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,filename' })
      return `File "${filename}" saved successfully.`
    },
    {
      name: 'write_memory_file',
      description: 'Write/update a memory file.',
      schema: z.object({
        filename: z.string().describe('Filename to write'),
        content: z.string().describe('Full file content (replaces existing)'),
      }),
    }
  )

  // Tool 5: list_memory_files
  const listMemoryFiles = tool(
    async ({ directory }) => {
      const query = supabase
        .from('secretary_memory')
        .select('filename, updated_at')
        .eq('user_id', userId)
      if (directory) {
        query.like('filename', `${directory}%`)
      }
      const { data } = await query
      return JSON.stringify(data || [])
    },
    {
      name: 'list_memory_files',
      description: 'List all memory files, optionally filtered by directory prefix.',
      schema: z.object({
        directory: z.string().optional().describe('Directory prefix filter, e.g. "Plans/"'),
      }),
    }
  )

  // Tool 6: delete_memory_file
  const deleteMemoryFile = tool(
    async ({ filename }) => {
      await supabase
        .from('secretary_memory')
        .delete()
        .eq('user_id', userId)
        .eq('filename', filename)
      return `File "${filename}" deleted.`
    },
    {
      name: 'delete_memory_file',
      description: 'Delete a memory file.',
      schema: z.object({
        filename: z.string().describe('Filename to delete'),
      }),
    }
  )

  // Tool 7: generate_daily_plan
  const generateDailyPlan = tool(
    async ({ date, planIds }) => {
      // 1. Read AI.md for user preferences (focus time, break frequency)
      // 2. Read Plan.md for active plans and today's topics
      // 3. Generate time-blocked schedule following the pattern:
      //    - Start at user's bestFocusTime
      //    - Alternate: Learn (45min) → Break (15min) → Practice (60min) → Break → Review (45min)
      //    - Total time = weekdayHours or weekendHours from AI.md
      // 4. Write to Today.md or Tomorrow.md
      // 5. Return the generated plan
    },
    {
      name: 'generate_daily_plan',
      description: 'Generate a time-blocked daily study plan based on active roadmaps and user preferences.',
      schema: z.object({
        date: z.string().describe('Target date YYYY-MM-DD'),
        planIds: z.array(z.string()).optional().describe('Specific plan IDs to include, or all active plans'),
      }),
    }
  )

  return [createRoadmap, saveRoadmap, readMemoryFile, writeMemoryFile, listMemoryFiles, deleteMemoryFile, generateDailyPlan]
}
```

#### `subagents.ts` — Subagent Definitions

```typescript
import type { SubAgent } from 'deepagents'

export const plannerSubAgent: SubAgent = {
  name: 'planner',
  description: 'Generates detailed learning roadmaps with week-by-week topic breakdowns. Give it a subject, duration, and schedule constraints.',
  systemPrompt: `You are a learning plan specialist. When given a subject and constraints:
1. Break the subject into logical phases (fundamentals → intermediate → advanced)
2. Create a week-by-week breakdown with daily topics
3. Ensure each day builds on previous knowledge
4. Balance theory (learn), practice, and review
5. Output a structured markdown roadmap

Format each day as: "Day N: [Topic] - [Brief description]"
Group into weeks with themes.`,
}

export const researcherSubAgent: SubAgent = {
  name: 'researcher',
  description: 'Researches a topic to create a curriculum outline. Use when the user wants a roadmap for a subject you need to understand first.',
  systemPrompt: `You are a curriculum researcher. Research the given topic and create:
1. A prerequisite list
2. Core concepts (ordered by dependency)
3. Recommended progression path
4. Estimated time per concept
Return a structured outline the planner can use.`,
}
```

#### `prompts.ts` — System Prompt

```typescript
export const SECRETARY_SYSTEM_PROMPT = `You are an AI Secretary — a personalized learning assistant that manages study roadmaps, daily schedules, and learning progress.

## Your Role
You help the user plan, schedule, and track their learning. You are proactive, organized, and respectful of the user's time preferences.

## Memory Files
You have access to memory files stored as markdown:
- **Plan.md** — Index of all active learning plans with progress tracking and "This Week" schedule
- **AI.md** — User preferences (focus times, break frequency, study hours, availability)
- **Today.md** — Today's time-blocked schedule with task checkboxes
- **Tomorrow.md** — Tomorrow's proposed schedule (generated, awaiting user approval)
- **Plans/*.md** — Full roadmap archives with week-by-week topic breakdowns

## Critical Rules
1. ALWAYS use your tools to read/write files. NEVER guess file contents.
2. Before generating a daily plan, ALWAYS read AI.md for user preferences first.
3. Before creating a roadmap, ALWAYS read Plan.md to see existing active plans.
4. When creating a roadmap, show a preview FIRST. Only save after user confirms.
5. Time-block daily plans following the user's focus window and break patterns.

## Daily Plan Generation Workflow
1. Read AI.md → Extract: bestFocusTime, breakFrequency, breakDuration, weekdayHours/weekendHours
2. Read Plan.md → Extract: Active plans, today's topics from "This Week" section
3. For each active plan scheduled today, read Plans/<archive>.md for detailed day topics
4. Generate time-blocked schedule:
   - Start at bestFocusTime
   - Task pattern: Learn (45min) → Break (15min) → Practice (60min) → Break (15min) → Review (45min)
   - Emoji prefixes: 📖 learn, 💻 practice, 🔄 review, 🎯 project, ☕ break
   - Total study time = weekdayHours or weekendHours
5. Write the plan to Today.md or Tomorrow.md

## Daily Plan Format (strict — frontend parses this)
\`\`\`markdown
# Daily Plan

**Date:** YYYY-MM-DD
**Focus:** [Main topics for the day]

## Schedule

- [ ] HH:MM (XXmin) EMOJI Task description
- [ ] HH:MM (XXmin) ☕ Break
- [ ] HH:MM (XXmin) EMOJI Task description
...

## AI Notes
> Brief explanation of scheduling decisions
\`\`\`

## Plan.md Format (strict — frontend parses this)
\`\`\`markdown
# Learning Plans

## Active Plans

| ID | Name | Date Range | Schedule | Progress |
|----|------|------------|----------|----------|
| OPT | 11-Day Optics Roadmap | Jan 5 - Jan 15 | 2h/day | W2/4 |
| AWS | AWS Fundamentals | Jan 6 - Jan 13 | 2h/day | W1/2 |

## This Week (Mon DD - Sun DD)

**Mon:** OPT - Day 4: Lens combinations
**Tue:** AWS - Day 2: S3 + Lambda
**Wed:** OPT - Day 5: Wave optics
...

## Archived Plans
[Completed plans listed here]
\`\`\`

## AI.md Default Format
\`\`\`markdown
# Learning Preferences

## Focus Time
Best focus: 9am-12pm

## Break Pattern
Break every: 45 minutes
Break duration: 15 minutes

## Availability
Weekdays: 2h/day
Weekends: 4h/day
Weekday window: 9am-12pm, 2pm-5pm
Weekend window: 10am-2pm
\`\`\`

## Intent Handling
- **create_roadmap**: User wants a new learning plan → use planner subagent → show preview → wait for confirmation
- **save_roadmap**: User confirms a roadmap → save to Plan.md + Plans/ archive
- **modify_roadmap**: User wants to change an existing plan → read, modify, save
- **daily_plan**: User wants today/tomorrow's schedule → generate_daily_plan tool
- **preferences**: User updates study preferences → update AI.md
- **calendar**: User asks about schedule → read Plan.md "This Week" section
- **query**: User asks about progress → read Plan.md and calculate stats
- **general**: General conversation → respond naturally

Today's date: {TODAY_DATE}
Tomorrow's date: {TOMORROW_DATE}
Day of week: {DAY_OF_WEEK}
`
```

---

### 3.4 — API Routes (`apps/api/src/routes/secretary.ts`)

**api-agent** creates this file.

```typescript
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { createSecretaryAgent } from '@inkdown/ai/agents/secretary'

const secretary = new Hono()

// POST /api/secretary/chat — Streaming chat with secretary agent
secretary.post('/chat', async (c) => {
  const { message, threadId } = await c.req.json()
  const userId = c.get('userId')           // From auth middleware
  const supabase = c.get('supabase')       // From Supabase middleware

  const agent = createSecretaryAgent({
    openaiApiKey: process.env.OPENAI_API_KEY!,
    userId,
    supabaseClient: supabase,
  })

  // Stream SSE response (same pattern as existing agent.ts routes)
  return streamSSE(c, async (stream) => {
    try {
      for await (const event of agent.stream(message, threadId || crypto.randomUUID())) {
        // Parse LangGraph event and emit as SSE
        // Events: text, tool_call, tool_result, thinking, done
        await stream.writeSSE({
          event: event.type || 'text',
          data: JSON.stringify(event),
        })
      }
      await stream.writeSSE({ event: 'done', data: '{}' })
    } catch (error) {
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ message: error.message }),
      })
    }
  })
})

// GET /api/secretary/memory — Get all memory files for dashboard
secretary.get('/memory', async (c) => {
  const userId = c.get('userId')
  const supabase = c.get('supabase')

  const { data } = await supabase
    .from('secretary_memory')
    .select('*')
    .eq('user_id', userId)
    .order('filename')

  return c.json({ files: data || [] })
})

// GET /api/secretary/memory/:filename — Get specific memory file
secretary.get('/memory/:filename', async (c) => {
  const userId = c.get('userId')
  const supabase = c.get('supabase')
  const filename = c.req.param('filename')

  const { data } = await supabase
    .from('secretary_memory')
    .select('*')
    .eq('user_id', userId)
    .eq('filename', decodeURIComponent(filename))
    .single()

  if (!data) return c.json({ error: 'File not found' }, 404)
  return c.json(data)
})

// PUT /api/secretary/memory/:filename — Update memory file (user edits)
secretary.put('/memory/:filename', async (c) => {
  const userId = c.get('userId')
  const supabase = c.get('supabase')
  const filename = decodeURIComponent(c.req.param('filename'))
  const { content } = await c.req.json()

  const { data } = await supabase
    .from('secretary_memory')
    .upsert({
      user_id: userId,
      filename,
      content,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,filename' })
    .select()
    .single()

  return c.json(data)
})

// POST /api/secretary/initialize — Create default memory files for new user
secretary.post('/initialize', async (c) => {
  const userId = c.get('userId')
  const supabase = c.get('supabase')

  const defaults = [
    { filename: 'Plan.md', content: '# Learning Plans\n\n## Active Plans\n\nNo active plans yet. Chat with the AI Secretary to create one!\n\n## This Week\n\nNo schedule yet.\n\n## Archived Plans\n' },
    { filename: 'AI.md', content: '# Learning Preferences\n\n## Focus Time\nBest focus: 9am-12pm\n\n## Break Pattern\nBreak every: 45 minutes\nBreak duration: 15 minutes\n\n## Availability\nWeekdays: 2h/day\nWeekends: 4h/day\nWeekday window: 9am-12pm, 2pm-5pm\nWeekend window: 10am-2pm\n' },
    { filename: 'Today.md', content: '' },
    { filename: 'Tomorrow.md', content: '' },
  ]

  for (const file of defaults) {
    await supabase
      .from('secretary_memory')
      .upsert({
        user_id: userId,
        ...file,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,filename' })
  }

  return c.json({ success: true })
})

// POST /api/secretary/prepare-tomorrow — Trigger tomorrow plan generation
secretary.post('/prepare-tomorrow', async (c) => {
  const userId = c.get('userId')
  const supabase = c.get('supabase')

  const agent = createSecretaryAgent({
    openaiApiKey: process.env.OPENAI_API_KEY!,
    userId,
    supabaseClient: supabase,
  })

  // Automatically generate tomorrow's plan
  const result = await agent.chat(
    'Generate tomorrow\'s daily study plan based on my active roadmaps and preferences. Write it to Tomorrow.md.',
    `prepare-tomorrow-${Date.now()}`
  )

  return c.json({ success: true, result })
})

// POST /api/secretary/approve-tomorrow — Move tomorrow plan to today
secretary.post('/approve-tomorrow', async (c) => {
  const userId = c.get('userId')
  const supabase = c.get('supabase')

  // Read Tomorrow.md
  const { data: tomorrow } = await supabase
    .from('secretary_memory')
    .select('content')
    .eq('user_id', userId)
    .eq('filename', 'Tomorrow.md')
    .single()

  if (!tomorrow?.content) {
    return c.json({ error: 'No tomorrow plan to approve' }, 400)
  }

  // Move Tomorrow.md content to Today.md
  await supabase
    .from('secretary_memory')
    .upsert({
      user_id: userId,
      filename: 'Today.md',
      content: tomorrow.content,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,filename' })

  // Clear Tomorrow.md
  await supabase
    .from('secretary_memory')
    .upsert({
      user_id: userId,
      filename: 'Tomorrow.md',
      content: '',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,filename' })

  return c.json({ success: true })
})

export { secretary }
```

**Also register routes in the main API app** — add to existing `apps/api/src/index.ts`:
```typescript
import { secretary } from './routes/secretary'
app.route('/api/secretary', secretary)
```

---

### 3.5 — Frontend Store (`apps/web/src/stores/secretary.ts`)

**frontend-agent** creates this Pinia store.

```typescript
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  LearningRoadmap, DailyPlan, ScheduledTask, MemoryFile,
  WeekSchedule, DailyReflection, SecretaryDashboardState, TaskStatus
} from '@inkdown/shared/types'

export const useSecretaryStore = defineStore('secretary', () => {
  // --- State ---
  const activePlans = ref<LearningRoadmap[]>([])
  const todayPlan = ref<DailyPlan | null>(null)
  const tomorrowPlan = ref<DailyPlan | null>(null)
  const todayReflection = ref<DailyReflection | null>(null)
  const memoryFiles = ref<MemoryFile[]>([])
  const thisWeek = ref<WeekSchedule | null>(null)

  const isLoading = ref(false)
  const isGeneratingTomorrow = ref(false)
  const activeMemoryFile = ref<string | null>(null)  // Currently editing file

  // Chat state
  const chatMessages = ref<Array<{ role: 'user' | 'assistant'; content: string }>>([])
  const threadId = ref<string>(crypto.randomUUID())
  const isChatStreaming = ref(false)

  // --- Computed ---
  const todayProgress = computed(() => {
    if (!todayPlan.value) return { completed: 0, total: 0 }
    const tasks = todayPlan.value.tasks.filter(t => t.type !== 'break')
    return {
      completed: tasks.filter(t => t.status === 'completed').length,
      total: tasks.length,
    }
  })

  const showTomorrowSection = computed(() => {
    const hour = new Date().getHours()
    return hour >= 21 || hour < 4  // Show 9pm-4am
  })

  const showReflectionSection = computed(() => {
    const hour = new Date().getHours()
    return hour >= 20 || hour < 4  // Show 8pm-4am
  })

  // --- Actions ---

  async function initialize() {
    isLoading.value = true
    try {
      // 1. Fetch all memory files
      const res = await fetch('/api/secretary/memory')
      const { files } = await res.json()
      memoryFiles.value = files

      // 2. If no files exist, create defaults
      if (files.length === 0) {
        await fetch('/api/secretary/initialize', { method: 'POST' })
        const res2 = await fetch('/api/secretary/memory')
        const { files: newFiles } = await res2.json()
        memoryFiles.value = newFiles
      }

      // 3. Parse Plan.md to extract active plans and this week
      const planFile = memoryFiles.value.find(f => f.filename === 'Plan.md')
      if (planFile) {
        activePlans.value = parsePlanMd(planFile.content)
        thisWeek.value = parseThisWeek(planFile.content)
      }

      // 4. Parse Today.md to extract daily plan
      const todayFile = memoryFiles.value.find(f => f.filename === 'Today.md')
      if (todayFile?.content) {
        todayPlan.value = parseDailyPlan(todayFile.content)
      }

      // 5. Parse Tomorrow.md
      const tomorrowFile = memoryFiles.value.find(f => f.filename === 'Tomorrow.md')
      if (tomorrowFile?.content) {
        tomorrowPlan.value = parseDailyPlan(tomorrowFile.content)
      }
    } finally {
      isLoading.value = false
    }
  }

  async function updateTaskStatus(taskId: string, status: TaskStatus) {
    if (!todayPlan.value) return
    const task = todayPlan.value.tasks.find(t => t.id === taskId)
    if (task) {
      task.status = status
      todayPlan.value.userModified = true
      if (status === 'completed') {
        todayPlan.value.completedMinutes += task.durationMinutes
      }
      // Sync back to Today.md
      await syncTodayToFile()
    }
  }

  async function prepareTomorrow() {
    isGeneratingTomorrow.value = true
    try {
      await fetch('/api/secretary/prepare-tomorrow', { method: 'POST' })
      // Refresh tomorrow plan
      const res = await fetch('/api/secretary/memory/Tomorrow.md')
      const file = await res.json()
      if (file?.content) {
        tomorrowPlan.value = parseDailyPlan(file.content)
      }
    } finally {
      isGeneratingTomorrow.value = false
    }
  }

  async function approveTomorrow() {
    await fetch('/api/secretary/approve-tomorrow', { method: 'POST' })
    todayPlan.value = tomorrowPlan.value
    tomorrowPlan.value = null
  }

  async function sendChatMessage(message: string) {
    chatMessages.value.push({ role: 'user', content: message })
    isChatStreaming.value = true

    try {
      const res = await fetch('/api/secretary/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, threadId: threadId.value }),
      })

      // Process SSE stream
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let assistantMessage = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value)
        // Parse SSE events and accumulate text
        const lines = chunk.split('\n')
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6))
            if (data.type === 'text') {
              assistantMessage += data.content
            }
          }
        }
      }

      chatMessages.value.push({ role: 'assistant', content: assistantMessage })

      // Refresh dashboard data after chat (agent may have updated files)
      await initialize()
    } finally {
      isChatStreaming.value = false
    }
  }

  async function syncTodayToFile() {
    if (!todayPlan.value) return
    const content = dailyPlanToMarkdown(todayPlan.value)
    await fetch('/api/secretary/memory/Today.md', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    })
  }

  // --- Parsers (markdown ↔ structured data) ---
  // These parse the strict markdown formats defined in the system prompt

  function parsePlanMd(content: string): LearningRoadmap[] {
    // Parse the Active Plans table from Plan.md
    // Extract: ID, Name, Date Range, Schedule, Progress
    // Implementation: regex-based table parsing
    return [] // TODO: implement
  }

  function parseThisWeek(content: string): WeekSchedule {
    // Parse "This Week" section from Plan.md
    // Extract: date range, daily plan entries
    // Implementation: line-by-line parsing
    return { weekStart: '', weekEnd: '', days: [] } // TODO: implement
  }

  function parseDailyPlan(content: string): DailyPlan {
    // Parse Today.md / Tomorrow.md format
    // Extract: date, focus, scheduled tasks with times/durations
    // Implementation: regex for "- [ ] HH:MM (XXmin) EMOJI Task" pattern
    return {} as DailyPlan // TODO: implement
  }

  function dailyPlanToMarkdown(plan: DailyPlan): string {
    // Convert structured DailyPlan back to markdown
    // For syncing user edits back to file
    return '' // TODO: implement
  }

  return {
    // State
    activePlans, todayPlan, tomorrowPlan, todayReflection,
    memoryFiles, thisWeek, isLoading, isGeneratingTomorrow,
    activeMemoryFile, chatMessages, threadId, isChatStreaming,
    // Computed
    todayProgress, showTomorrowSection, showReflectionSection,
    // Actions
    initialize, updateTaskStatus, prepareTomorrow, approveTomorrow,
    sendChatMessage, syncTodayToFile,
  }
})
```

---

### 3.6 — Frontend View & Components (`apps/web/src/views/SecretaryView.vue`)

**frontend-agent** builds all of these.

#### Routing — Add to `apps/web/src/main.ts`

Add this route:
```typescript
{ path: '/calendar', name: 'secretary', component: () => import('./views/SecretaryView.vue') },
```

#### Component Structure

```
apps/web/src/components/secretary/
├── SecretaryDashboard.vue       # Main dashboard content area
├── ActivePlansOverview.vue      # Active plans with progress bars
├── TodayPlan.vue                # Today's time-blocked schedule
├── TomorrowPlan.vue             # Tomorrow's plan with approve/edit
├── SecretaryPanel.vue           # "For You" right panel (focus + calendar)
├── WeekCalendar.vue             # 7-day mini calendar
├── MemoryFileList.vue           # Left sidebar memory file list
├── MemoryFileEditor.vue         # Edit Plan.md, AI.md directly
├── SecretaryChat.vue            # Chat with AI secretary
└── ReflectionSection.vue        # End-of-day reflection
```

#### `SecretaryView.vue` — Main View (follows EditorView pattern)

```vue
<template>
  <div class="secretary-view" :style="sidebarWidthStyle">
    <!-- Left: Memory Files Sidebar -->
    <aside v-if="layoutStore.sidebarVisible" class="secretary-sidebar">
      <MemoryFileList
        :files="secretaryStore.memoryFiles"
        :active-file="secretaryStore.activeMemoryFile"
        @select="secretaryStore.activeMemoryFile = $event"
      />
    </aside>

    <!-- Center: Main Content -->
    <div class="main-area">
      <NavigationDock />

      <div class="secretary-content">
        <!-- Memory File Editor (when a file is selected) -->
        <MemoryFileEditor
          v-if="secretaryStore.activeMemoryFile"
          :filename="secretaryStore.activeMemoryFile"
          @close="secretaryStore.activeMemoryFile = null"
        />

        <!-- Dashboard (default view) -->
        <SecretaryDashboard v-else />
      </div>
    </div>

    <!-- Right: For You Panel -->
    <SecretaryPanel v-if="layoutStore.rightPanelVisible" />
  </div>
</template>
```

#### `SecretaryDashboard.vue` — Dashboard Layout

```vue
<template>
  <div class="dashboard">
    <!-- Header -->
    <header class="dashboard-header">
      <div>
        <h1>{{ greeting }}</h1>
        <p class="today-summary">Today: {{ todaySummary }}</p>
      </div>
      <div class="header-actions">
        <button class="prepare-btn" @click="secretaryStore.prepareTomorrow()">
          <CalendarIcon :size="16" />
          Prepare Tomorrow
        </button>
        <span class="date">{{ formattedDate }}</span>
      </div>
    </header>

    <!-- Active Plans -->
    <ActivePlansOverview :plans="secretaryStore.activePlans" />

    <!-- This Week Label -->
    <div class="week-label">THIS WEEK: {{ weekRange }}</div>

    <!-- Today + Tomorrow -->
    <div class="plans-grid">
      <div class="today-column">
        <TodayPlan
          :plan="secretaryStore.todayPlan"
          :progress="secretaryStore.todayProgress"
          @update-task="secretaryStore.updateTaskStatus"
        />

        <TomorrowPlan
          v-if="secretaryStore.showTomorrowSection"
          :plan="secretaryStore.tomorrowPlan"
          :is-generating="secretaryStore.isGeneratingTomorrow"
          @approve="secretaryStore.approveTomorrow()"
        />
      </div>

      <!-- For You (inline, not the right panel) -->
      <div class="foryou-column">
        <SecretaryPanel :inline="true" />
      </div>
    </div>

    <!-- Chat with Secretary -->
    <SecretaryChat />
  </div>
</template>
```

#### Visual Design Guidelines

Follow Inkdown's existing dark theme (`apps/web/src/assets/themes/variables.css`):
- Background: `var(--bg-primary)` / `var(--bg-secondary)`
- Text: `var(--text-primary)` / `var(--text-secondary)`
- Accent: `var(--accent-primary)` for active states
- Cards: `var(--bg-tertiary)` with subtle border
- Progress bars: Use green gradient for active plans
- Task status: gray (pending), blue (in-progress), green (completed), yellow (skipped)
- Typography: Same font stack as rest of app
- Spacing: 8px base grid

---

## PART 4: INTEGRATION CHECKLIST

After all agents finish their parts, verify these integration points:

### Backend → API
- [ ] `createSecretaryAgent()` is importable from `@inkdown/ai/agents/secretary`
- [ ] API routes correctly instantiate the agent with Supabase client
- [ ] SSE streaming works end-to-end

### API → Frontend
- [ ] All API endpoints return correct types
- [ ] SSE stream parsing in secretary store works
- [ ] Memory file CRUD operations work

### Frontend → Router
- [ ] `/calendar` route loads SecretaryView.vue
- [ ] NavigationDock calendar button navigates to `/calendar`
- [ ] Back navigation works

### Data Flow
- [ ] New user → initialize default memory files → show empty dashboard
- [ ] Chat "create a roadmap for X" → agent generates → shows preview → user confirms → saved to Plan.md + Plans/
- [ ] Dashboard shows active plans from Plan.md
- [ ] "Prepare Tomorrow" button → generates tomorrow's plan → shows in Tomorrow section
- [ ] User approves tomorrow → moves to Today.md → shows in Today section
- [ ] Task checkboxes → update status → sync to Today.md
- [ ] Memory file edits → save to Supabase → reflect in dashboard

### Dependencies to Install
```bash
# In packages/ai/
pnpm add deepagents @langchain/openai @langchain/langgraph @langchain/core zod
```

---

## PART 5: WHAT NOT TO BUILD (YAGNI)

Keep the MVP focused. Do NOT build these in the first pass:

- ~~Recommendation service (mindmaps, flashcards, exercises)~~ — Phase 2
- ~~Reflection section with mood tracking~~ — Phase 2
- ~~PDF gallery~~ — Phase 2
- ~~Background cron jobs for auto-generating tomorrow~~ — Phase 2 (manual "Prepare Tomorrow" button for now)
- ~~Weekly auto-expansion logic~~ — Phase 2 (let the AI agent handle it conversationally)
- ~~Notification system~~ — Phase 2
- ~~Mobile responsive layout~~ — Phase 2

---

## SUMMARY FOR TEAM LEAD

You are coordinating 4 agents to build the AI Secretary feature:

1. **Kick off types-agent FIRST** — it defines all shared types that others depend on
2. **Then kick off backend-agent and api-agent in PARALLEL** — they own separate file trees
3. **Then kick off frontend-agent** — it needs the API contract to be defined
4. **Monitor file conflicts** — each agent owns specific directories, no overlap
5. **After all agents finish** — run through the integration checklist in Part 4
6. **Run `pnpm build && pnpm typecheck`** to verify everything compiles

The total feature adds:
- ~1 migration file
- ~1 types file
- ~6 backend files (agent, tools, subagents, prompts, memory, index)
- ~1 API route file
- ~1 store file
- ~1 view file + ~10 component files
- ~1 router change
