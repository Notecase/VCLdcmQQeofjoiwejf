# Inkdown AI Demo Pitch Script (~2.5 min)

## Context
Demo pitch covering two core AI features: the **AI Secretary** (personal learning planner) and **AI Course Generation** (end-to-end course creation with AI tutor). The script is designed to flow naturally as if walking through the app live.

---

## Script

### Opening (10s)

> "Inkdown is an AI-powered note-taking and learning platform. Today I want to show you two features that turn it into a complete self-learning system: the **AI Secretary** and **AI Course Generation**."

---

### Part 1: AI Secretary (~60s)

> "Let's say I want to master Reinforcement Learning in 4 weeks. I open the Secretary and just tell it: *'Create a 4-week RL roadmap, 3 hours a day, Monday-Wednesday-Friday.'*"

**[Show: Secretary chat + roadmap preview]**

> "Behind the scenes, a Planner sub-agent researches the topic and builds a day-by-day breakdown — foundations, policy gradients, Q-learning, all the way to advanced methods. I get a preview, I can tweak it, and when I confirm, it saves to `Plan.md` — a structured markdown file that becomes my single source of truth."

**[Show: Plan.md with active roadmap entry + Plans/rl-roadmap.md archive]**

> "Now, every morning the Secretary can generate my daily plan. It reads my active roadmaps, checks my study preferences in `AI.md` — like my best focus hours, break frequency — and respects any recurring blocks I've set, like a team standup or gym time. The result is a time-blocked schedule in `Today.md`."

**[Show: Dashboard with TodayPlan — checkboxes, time blocks, progress bar]**

> "Throughout the day, I check off tasks as I go. If something comes up — say a meeting runs long — I just chat with the Secretary: *'Push everything after 2pm by one hour.'* It reschedules instantly. If I don't finish a task, the Secretary auto-carries it over to tomorrow."

**[Show: Chat interaction modifying plan + Carryover.md]**

> "At the end of the day, I log my mood and reflection. Over time, the Secretary tracks my completion rates and streaks from the History archive, and if it sees I'm consistently below 50%, it suggests lighter schedules. Everything is stored as markdown — transparent, editable, human-readable."

---

### Part 2: AI Course Generation (~60s)

> "Now let's say I need structured content to actually learn. I go to Course Generation and type: *'AI Safety, intermediate level'* — I can toggle options like include quizzes, slides, practice problems."

**[Show: CourseTopicInput with settings]**

> "Here's where it gets interesting. The system runs a **7-stage AI pipeline**. First, it does deep research using Gemini's research API — gathering real sources from the web. Then it indexes that research into a vector store so every lesson gets context-specific information."

**[Show: GenerationProgress bar moving through stages + ResearchProgress]**

> "Next, it generates a course outline — modules, lessons, lesson types. And this is a **human-in-the-loop** moment: I see the outline, I can edit it — add a module, remove a lesson, reorder things — and only when I approve does content generation begin."

**[Show: OutlineReview with edit capabilities]**

> "Then three specialized AI sub-agents work in parallel: a **Lesson Writer** for lectures and practice content, a **Quiz Writer** for interactive assessments with explanations, and a **Slides Writer** using a higher-quality model for presentation decks. Each lesson gets injected with relevant research context from the RAG index. It also auto-matches YouTube videos for video lessons."

**[Show: SubAgentCards showing parallel generation + lesson previews appearing]**

> "The result is a full course: modules with lectures, slides you can flip through, practice problems with multiple choice and short answers, quizzes with grading and explanations, and embedded videos."

**[Show: Course viewer — navigate modules, show a lecture, flip slides, attempt a quiz]**

---

### Part 3: AI Tutor (~20s)

> "And while studying, there's an **AI Tutor** built right in. I can highlight any passage and ask *'Explain this.'* The tutor has the full lesson context — the markdown, key terms, even video transcripts — so its answers are grounded in what I'm actually studying. For quizzes, it uses Socratic questioning — guiding me to the answer instead of just giving it away."

**[Show: CourseExplainSidebar — highlight text, ask question, streaming response]**

---

### Closing (10s)

> "So the full loop: the **Secretary** plans *what* I learn and *when*, the **Course Generator** creates *the content*, and the **AI Tutor** helps me *understand it*. All backed by markdown, all transparent, all personalized. That's Inkdown."

---

## Key Technical Points to Mention If Asked

| Feature | Tech Detail |
|---------|-------------|
| Roadmap generation | Planner sub-agent + Researcher sub-agent via DeepAgents framework |
| Daily planning | Reads Plan.md + AI.md + Recurring.md + Carryover.md; generates time-blocked Today.md |
| Task rescheduling | 15 Secretary tools including `modify_plan`, `bulk_modify_plan`, `carry_over_tasks` |
| Day transitions | Auto-archives Today.md to History/, promotes Tomorrow.md, extracts carryover |
| Course pipeline | 7-stage orchestrator: Research → Index → Outline → Approve → Content → Videos → Save |
| Multi-model | Gemini Deep Research (research), Gemini Flash (lessons/quizzes), Gemini 3 Pro (slides), GPT-5.2 (tutor) |
| Human-in-loop | Outline approval with 10-min timeout; user can edit outline before content generation |
| RAG context | Research report chunked into embeddings; per-lesson retrieval for grounded content |
| AI Tutor | Lightweight ExplainAgent with full lesson context in system prompt; Socratic mode for quizzes |
| Storage | Supabase — courses/modules/lessons tables with JSONB content; Secretary uses markdown memory files |
| Streaming | All agents use async generators → Hono SSE → frontend processes chunks in real-time |
| Progress tracking | Completion rates, quiz scores, streaks, mood trends from History/*.md archives |
