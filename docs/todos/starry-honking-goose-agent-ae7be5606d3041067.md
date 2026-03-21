# Always-On AI Agent Research for Inkdown Learning Platform

**Date**: 2026-03-12
**Purpose**: Technical research into building a 24/7 background AI agent for a learning platform

---

## 1. Always-On Agent Products (What Exists Today)

### Major Products

| Product                           | What It Does                                                                                                                                                                       | How It Runs                                                                                                                                                  |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Lindy AI**                      | Autonomous work assistant — inbox, meetings, calendar, lead qualification, phone calls. Agentic Reasoning (Lindy 3.0) lets it browse the web, use thousands of apps, self-correct. | Event-triggered + scheduled. Each "Lindy" follows a template, fires on triggers (email received, calendar event, etc.), runs 24/7.                           |
| **Microsoft Copilot Tasks**       | Multi-step task execution across M365 apps. User gives natural-language instruction, Copilot decomposes into steps, executes in background.                                        | **Cloud VM architecture** — each task gets its own virtual computer and browser in the cloud. No local resources used. Connectors to email/calendar/storage. |
| **Reclaim AI**                    | Background calendar optimization. Continuously rearranges schedule based on priorities (P1-P4). Responds to conflicts in ~15 seconds.                                              | Daemon-like continuous process. Watches calendar events via API, recalculates on every change. Flexible/Busy status flipping.                                |
| **Motion**                        | AI project management + calendar. Auto-schedules tasks into calendar slots, re-plans when things shift.                                                                            | Similar to Reclaim — event-driven calendar API integration with continuous re-optimization.                                                                  |
| **Google CC Agent**               | Daily "Your Day Ahead" briefing. Connects Gmail, Calendar, Drive. Learns preferences over time.                                                                                    | Scheduled (daily cron-style) + RAG over personal data.                                                                                                       |
| **Sleepless Agent** (open source) | 24/7 Claude Code agent via Slack. Processes tasks, manages workspaces, creates Git commits/PRs. Day/night usage optimization.                                                      | Python daemon + Claude Code CLI + Slack integration. Cron-scheduled with queue processing.                                                                   |
| **OpenClaw Heartbeat**            | Periodic agent wake-ups. Agent reads HEARTBEAT.md checklist, decides if action needed. Configurable intervals + active hours.                                                      | Heartbeat interval (default 30min). Gateway sends pulse, agent checks context, responds HEARTBEAT_OK (silent) or takes action.                               |

### Key Insight

The market has converged on two patterns: **event-driven** (react to triggers) and **scheduled/heartbeat** (periodic wake-up and check). Most production systems combine both.

---

## 2. Use Cases for a Learning Platform Always-On Agent

### What a 24/7 Agent Can Do That Chat Cannot

A chat agent waits for you. An always-on agent **works while you're away**. The fundamental difference is _temporal_ — it operates on schedules that don't align with user sessions.

### High-Value Use Cases (Ranked by Impact)

#### Tier 1: Core Learning Loop

1. **Spaced Repetition Orchestrator** — The agent tracks what the student has learned across all their notes/courses. Using FSRS (Free Spaced Repetition Scheduler) algorithms, it generates review sessions at optimal intervals. Every morning, the student gets a personalized review deck. No manual flashcard creation needed — the agent extracts key concepts from notes automatically.

2. **Knowledge Gap Detector** — Overnight, the agent analyzes the student's notes, course progress, and quiz performance. It identifies gaps ("You covered derivatives but never practiced chain rule applications") and proactively creates exercises or suggests resources.

3. **Adaptive Study Scheduler** — Like Reclaim AI but for studying. The agent knows the student's exam dates, course deadlines, and current mastery levels. It builds and continuously re-optimizes a study plan, blocking time on their calendar and adjusting when they miss sessions.

#### Tier 2: Content Enhancement

4. **Note Enrichment Agent** — While the student sleeps, the agent reviews their notes and: adds cross-references between related concepts, suggests missing information, creates summary cards, generates practice questions, links to relevant course material.

5. **Research Digest** — For students doing research, the agent monitors arxiv/journals/feeds for papers related to their topics and delivers a morning digest with relevance scores and summaries.

6. **Course Content Freshness** — For course creators, the agent checks if referenced links are dead, if information is outdated, if new developments make content stale.

#### Tier 3: Engagement & Motivation

7. **Learning Streak & Momentum Tracker** — Tracks daily engagement, sends encouraging nudges at optimal times (not spam — based on user's actual behavior patterns), celebrates milestones.

8. **Weekly Learning Report** — Every Sunday, generates a summary: what was learned, time spent, mastery progress, upcoming deadlines, suggested focus areas for next week.

9. **Study Group Coordinator** — For collaborative learning, the agent identifies students struggling with the same topics and suggests study group sessions.

#### Tier 4: Advanced/Future

10. **Concept Map Builder** — Continuously builds and updates a visual knowledge graph from all the student's notes, showing connections between concepts across courses.

11. **Exam Simulator** — Before exams, the agent generates realistic practice tests based on the student's weakest areas, adjusting difficulty dynamically.

12. **Learning Path Optimizer** — Analyzes the student's goals, current knowledge, and available courses to suggest the optimal learning path, re-optimizing as they progress.

---

## 3. Technical Architecture

### Architecture Options (Compared)

| Approach                           | How It Works                                                                          | Pros                                                             | Cons                                                         | Best For                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| **Cron Jobs**                      | Scheduled functions that run at intervals (e.g., every 30min, daily at 6am)           | Simple, predictable, cheap when idle                             | No real-time reactivity, cold start latency                  | Scheduled reports, daily digests, overnight processing                               |
| **Event-Driven (Queue + Workers)** | Events published to queue (note saved, course completed), workers consume and process | Real-time, scales horizontally, fault-tolerant                   | More complex infrastructure, need message broker             | Reacting to user actions (note enrichment on save, gap detection on quiz completion) |
| **Heartbeat Pattern**              | Agent wakes periodically, checks context, decides if action needed                    | Low cost (silent heartbeats are cheap), proactive but not spammy | Latency between heartbeats, needs well-designed checklist    | Monitoring, status checks, rotating task execution                                   |
| **Daemon Process**                 | Long-running process that maintains state and reacts continuously                     | Lowest latency, maintains context                                | Resource-intensive, complex state management, crash recovery | High-frequency operations (calendar re-optimization like Reclaim)                    |
| **Cloud Function + Trigger**       | Serverless functions triggered by database changes, webhooks, or schedules            | Zero idle cost, auto-scales, no server management                | Cold starts, execution time limits, stateless                | Individual task processing, webhook handlers                                         |

### Recommended Architecture for Inkdown

**Hybrid: Event-Driven + Scheduled, built on existing Supabase + Hono stack**

```
                    +------------------+
                    |   Supabase DB    |
                    |  (events table)  |
                    +--------+---------+
                             |
              +--------------+--------------+
              |                             |
    +---------v---------+     +-------------v-----------+
    |  DB Trigger /     |     |   Cron Scheduler        |
    |  Realtime Sub     |     |   (node-cron or         |
    |                   |     |    Supabase pg_cron)     |
    +--------+----------+     +------------+------------+
             |                             |
             v                             v
    +------------------------------------------+
    |         Agent Task Queue                 |
    |    (Supabase table or BullMQ/Redis)      |
    +-------------------+----------------------+
                        |
                        v
    +------------------------------------------+
    |         Agent Worker Process             |
    |                                          |
    |  +------------+  +-------------------+   |
    |  | Task Router|  | Model Router      |   |
    |  | (pick task)|  | (cheap vs premium)|   |
    |  +-----+------+  +--------+----------+   |
    |        |                  |               |
    |        v                  v               |
    |  +------------+  +-----------------+      |
    |  | Agent Logic|  | @inkdown/ai     |      |
    |  | (per task) |  | (LLM calls)     |      |
    |  +------------+  +-----------------+      |
    +-------------------+----------------------+
                        |
                        v
    +------------------------------------------+
    |    Results / Notifications                |
    |  - Update notes in DB                     |
    |  - Queue notification for user            |
    |  - Create review deck                     |
    |  - Generate report                        |
    +------------------------------------------+
```

### Key Components

**1. Event Source Layer**

- **DB Triggers**: Supabase Realtime or pg_notify when notes are saved, courses completed, quizzes taken
- **Cron**: pg_cron (already in Supabase) or node-cron in the API server for daily digests, weekly reports, spaced repetition scheduling
- **Webhooks**: External integrations (calendar, etc.)

**2. Task Queue**

- Simplest: A Supabase table (`agent_tasks`) with status, priority, scheduled_at, payload
- Worker polls or listens via Realtime subscription
- Alternative: BullMQ + Redis for more robust queue semantics (retries, DLQ, rate limiting)

**3. Agent Worker**

- Runs as part of the existing Hono API server (new route/background process) or as a separate worker
- **Task Router**: Picks next task based on priority and schedule
- **Model Router**: Routes to appropriate LLM based on task complexity (see Cost section)
- Uses existing `@inkdown/ai` package for LLM interactions

**4. Agent Task Types** (each is a module)

```typescript
interface AgentTask {
  id: string
  userId: string
  type:
    | 'spaced-review'
    | 'note-enrich'
    | 'gap-detect'
    | 'daily-digest'
    | 'weekly-report'
    | 'study-schedule'
  status: 'pending' | 'processing' | 'completed' | 'failed'
  priority: number
  scheduledAt: Date
  payload: Record<string, unknown>
  result?: Record<string, unknown>
  createdAt: Date
  completedAt?: Date
}
```

**5. Notification Delivery**

- In-app notifications (store in DB, show in UI)
- Email (via Supabase Edge Functions or Resend)
- Push notifications (future, via web push API)

### Implementation Path for Inkdown

**Phase 1: Foundation (Simplest Always-On)**

- Add `agent_tasks` and `agent_results` tables to Supabase
- Add a cron endpoint to the Hono API server
- Implement one task: **Daily Study Digest** — runs at 6am, analyzes user's notes and recent activity, generates a summary + review suggestions
- Use pg_cron to trigger the endpoint daily

**Phase 2: Event-Driven Tasks**

- Add Supabase Realtime listener for note saves
- Implement **Note Enrichment** — when a note is saved, queue a task to add cross-references, generate summary, extract key concepts
- Implement **Spaced Repetition** — track concept exposure, schedule reviews using FSRS algorithm

**Phase 3: Intelligent Scheduling**

- Implement **Adaptive Study Scheduler** with priority-based scheduling
- Add **Knowledge Gap Detection** that runs weekly
- Build the **Weekly Learning Report**

**Phase 4: Advanced**

- Multi-agent coordination (one agent discovers gaps, another creates exercises)
- Concept map generation
- Research digest for power users

---

## 4. Cost Management

### The Core Problem

An always-on agent that makes LLM calls every 30 minutes for every user will bankrupt you. At ~$3/1M input tokens (Claude Sonnet), a single user with hourly heartbeats processing 5K tokens each = ~$0.36/day = ~$11/month just for heartbeats. Scale to 10K users = $110K/month.

### Cost Control Strategies (Ranked by Impact)

#### 1. Tiered Model Routing (Saves 50-80%)

Route tasks to the cheapest model that can handle them:

| Task Type                                | Model Tier | Example Models                   | Cost              |
| ---------------------------------------- | ---------- | -------------------------------- | ----------------- |
| Heartbeat check (is action needed?)      | Tiny       | Haiku, GPT-4o-mini, Gemini Flash | ~$0.075/1M tokens |
| Note summarization, flashcard generation | Small      | Sonnet, GPT-4o-mini              | ~$0.30/1M tokens  |
| Knowledge gap analysis, study planning   | Medium     | Sonnet, GPT-4o                   | ~$3/1M tokens     |
| Complex reasoning, research synthesis    | Large      | Opus, GPT-4o, o3                 | ~$15/1M tokens    |

**Implementation**: A lightweight classifier (or even regex/heuristic) examines the task type and routes accordingly. The `@inkdown/ai` factory pattern already supports this.

#### 2. Prompt Caching (Saves 75-90% on repeated contexts)

- System prompts, user profile, course structure = cached (75% cheaper)
- Anthropic, OpenAI, and Google all support prompt caching
- For an always-on agent, the system prompt + user context is the same across many calls
- **Impact**: If 80% of tokens are cached context, effective cost drops by ~60%

#### 3. Semantic Caching (Saves 70%+ on similar queries)

- Cache LLM responses keyed by semantic similarity of input
- If a user's notes haven't changed, don't re-analyze them
- Use embeddings + vector similarity to detect cache hits
- **Implementation**: Redis or Supabase pgvector for cache store

#### 4. Batch Processing (Saves 50%+ on per-call overhead)

- Instead of processing each note individually, batch all of a user's notes into one LLM call
- Daily digest: one call per user, not one per note
- **Implementation**: Aggregate tasks in queue, process in batches on schedule

#### 5. Smart Scheduling (Reduces total calls by 60-80%)

- **Rotating heartbeats**: Don't check everything every cycle. Check the most overdue item.
- **Change detection**: Only process notes that changed since last analysis (use updated_at timestamps)
- **Active hours**: Only run during user's active hours (no 3am processing unless deadline)
- **Backoff**: If user hasn't logged in for 3 days, reduce agent frequency

#### 6. Pre-computation & Templates

- Pre-compute common patterns (standard flashcard templates, common gap analysis prompts)
- Use retrieval (RAG) instead of generation where possible
- Store and reuse generated content (don't regenerate the same summary twice)

### Cost Projection (Realistic)

For 1,000 active users with smart optimization:

| Component                              | Calls/Day   | Tokens/Call    | Model  | Daily Cost   |
| -------------------------------------- | ----------- | -------------- | ------ | ------------ |
| Daily digest                           | 1,000       | 3K in, 1K out  | Haiku  | $0.30        |
| Note enrichment (on save, ~5/user/day) | 5,000       | 2K in, 500 out | Haiku  | $0.88        |
| Spaced repetition deck gen (daily)     | 1,000       | 4K in, 2K out  | Sonnet | $15.00       |
| Weekly gap analysis                    | 143/day avg | 8K in, 2K out  | Sonnet | $4.00        |
| Weekly report                          | 143/day avg | 5K in, 2K out  | Haiku  | $0.13        |
| **Total**                              |             |                |        | **~$20/day** |

That's **$600/month for 1,000 users**, or **$0.60/user/month** — very manageable at even a $10/month subscription.

---

## 5. Examples from Other Domains

### Reclaim AI — Background Calendar Optimization

- **Pattern**: Continuous daemon that watches calendar via API
- **Key insight**: Priority-based scheduling (P1-P4) with real-time re-optimization (~15 second response)
- **Technical**: Flexible/Busy status flipping — events start as "Free", flip to "Busy" as time fills up
- **Lesson for Inkdown**: Study sessions could work the same way — tentatively scheduled, confirmed as the time approaches, rescheduled if conflicts arise

### OpenClaw Heartbeat — Proactive Agent Pattern

- **Pattern**: Periodic wake-up with checklist evaluation
- **Key insight**: HEARTBEAT.md as a configurable checklist — the agent reads it each cycle and decides what needs attention
- **Technical**: Rotating checks (most overdue item gets priority), active hours window, configurable intervals
- **Lesson for Inkdown**: A "Learning Heartbeat" could check: any overdue reviews? any notes updated but not enriched? any upcoming deadlines? Costs are flat because most heartbeats result in "nothing to do" (HEARTBEAT_OK).

### Microsoft Copilot Tasks — Cloud VM Execution

- **Pattern**: Each task gets its own cloud VM with browser
- **Key insight**: Decomposes natural-language instructions into discrete steps with dependency tracking
- **Technical**: Cloud-provisioned compute, connectors to services, background execution with status reporting
- **Lesson for Inkdown**: Overkill for a learning platform, but the task decomposition pattern (natural language -> discrete steps -> execute -> report) is exactly right.

### Karpathy's AutoResearch — Overnight Autonomous Research

- **Pattern**: AI agent conducts experiments overnight, keeps improvements, discards failures
- **Key insight**: The "try, evaluate, keep or discard" loop running unattended
- **Lesson for Inkdown**: A "research mode" where the agent explores a topic overnight, follows citation chains, and presents a curated research summary in the morning.

---

## 6. Proactive Agent UX: Helpful vs. Annoying

### The Autonomy Spectrum

Research identifies a clear framework for agent autonomy levels:

| Level          | Role         | Agent Behavior                          | User Experience                                             |
| -------------- | ------------ | --------------------------------------- | ----------------------------------------------------------- |
| L1: Reactive   | Operator     | Only acts when asked                    | "Help me study"                                             |
| L2: Suggestive | Consultant   | Suggests actions, user approves         | "You should review calculus today" (dismiss/accept)         |
| L3: Proactive  | Collaborator | Acts on routine tasks, asks for unusual | Auto-generates review deck, asks before restructuring notes |
| L4: Autonomous | Approver     | Acts independently, user reviews after  | Enriches notes overnight, user reviews in morning           |
| L5: Full Auto  | Observer     | Fully autonomous within boundaries      | Manages entire learning schedule, user just shows up        |

### Progressive Autonomy Pattern (Recommended)

**Start at L2, let users upgrade to L3-L4 per feature.** This is the key UX pattern.

1. **Week 1**: Agent only suggests ("You have 3 overdue review topics")
2. **Week 2**: If user consistently accepts, offer to automate ("Want me to auto-generate review decks daily?")
3. **Ongoing**: User controls autonomy per feature via settings

### Rules for Not Being Annoying

1. **Frequency caps**: Max 2-3 proactive notifications per day. Batch related items.
2. **Timing awareness**: Learn when the user is active. Don't notify at 11pm unless they're a night owl.
3. **Dismissal memory**: If user dismisses a suggestion type 3 times, reduce frequency. After 5, stop suggesting.
4. **Value threshold**: Only surface things with clear, immediate value. "You might want to review X" is weak. "You have an exam in 3 days and haven't reviewed Y, which appears in 40% of past exams" is strong.
5. **Undo everything**: Every autonomous action must be reversible. Note enrichment? Show diff, let user revert. Schedule change? One-click undo.
6. **Quiet mode**: Users can mute the agent entirely for a period ("Focus mode — no agent for 2 hours").
7. **Transparency**: Show exactly what the agent did and why. "I generated 12 review cards from your Calculus notes because your last review was 5 days ago and optimal spacing is 3 days."
8. **Earn trust incrementally**: Start with low-stakes actions (summaries, suggestions). Only graduate to high-stakes actions (schedule changes, note modifications) after the user opts in.

### Anti-Patterns to Avoid

- **Notification spam**: More than 3 unsolicited messages/day = user disables the feature
- **Irrelevant suggestions**: Generic advice not grounded in the user's actual data
- **Irreversible actions**: Modifying notes without undo capability
- **Unexplained actions**: Doing things without showing reasoning
- **Ignoring dismissals**: Keeping suggesting something the user has rejected
- **Over-personalization early**: Making assumptions before having enough data (cold start problem)

---

## 7. Synthesis: Recommended Approach for Inkdown

### Minimum Viable Always-On Agent

**Start with exactly two features:**

1. **Morning Study Brief** (Cron, daily, Haiku-tier)
   - Runs at user's preferred time (default 7am)
   - Analyzes: overdue spaced repetition items, upcoming deadlines, recent progress
   - Generates: prioritized review list + 1 encouragement insight
   - Delivery: in-app notification + optional email
   - Cost: ~$0.001/user/day

2. **Note Enrichment on Save** (Event-driven, on note save, Haiku-tier)
   - Triggers when user saves a note
   - Generates: 3-5 key concept extractions, suggested cross-references to other notes
   - Stores results in DB, shows as subtle UI suggestions (not intrusive)
   - Debounced: only runs if note hasn't been saved in last 5 minutes
   - Cost: ~$0.0003/enrichment

### Technical Stack (Using What Inkdown Already Has)

- **Queue**: New Supabase table `agent_tasks`
- **Scheduler**: pg_cron (built into Supabase) for daily tasks
- **Event trigger**: Supabase Realtime or database trigger on `notes` table
- **Worker**: New route/module in `apps/api` using existing `@inkdown/ai` providers
- **Model routing**: Extend `packages/ai/src/providers/factory.ts` with a task-complexity router
- **Notifications**: New Supabase table `notifications` + new Vue component

### What NOT to Build Yet

- Calendar integration (complex, needs OAuth)
- Real-time daemon (overkill for initial use cases)
- Multi-agent coordination (premature complexity)
- Push notifications (browser API complexity)
- Full knowledge graph (requires significant graph infrastructure)

---

## Sources

### Always-On Agent Products

- [AI Agents in 2026: Building Your Autonomous Digital Workforce](https://medium.com/illumination/ai-agents-in-2026-building-your-autonomous-digital-workforce-no-code-required-a993695a2c85)
- [Taming AI Agents: The Autonomous Workforce of 2026](https://www.cio.com/article/4064998/taming-ai-agents-the-autonomous-workforce-of-2026.html)
- [Top 5 AI Agents 2026: Production-Ready Solutions](https://beam.ai/agentic-insights/top-5-ai-agents-in-2026-the-ones-that-actually-work-in-production)
- [Measuring AI Agent Autonomy (Anthropic)](https://www.anthropic.com/research/measuring-agent-autonomy)
- [AI Agents Promise to Work While You Sleep — Reality Is Messier (Fortune)](https://fortune.com/2026/02/23/always-on-ai-agents-openclaw-claude-promise-work-while-sleeping-reality-problems-oversight-guardrails/)

### Proactive AI & Background Tasks

- [Proactive AI in 2026: Moving Beyond the Prompt](https://www.alpha-sense.com/resources/research-articles/proactive-ai/)
- [Microsoft Copilot Tasks: Autonomous AI Worker](https://windowsnews.ai/article/microsoft-copilot-tasks-the-autonomous-ai-assistant-that-works-in-the-background.403380)
- [Copilot Tasks Runs on Its Own Cloud PC](https://www.techbuzz.ai/articles/microsoft-copilot-tasks-runs-on-its-own-cloud-pc)
- [Google CC Daily Briefing Agent](https://www.business-standard.com/technology/tech-news/year-ender-2025-ai-assistants-rise-alexa-siri-google-assistant-chatgpt-meta-gemini-125122200324_1.html)
- [OpenClaw Heartbeat: Cheap Checks First](https://dev.to/damogallagher/heartbeats-in-openclaw-cheap-checks-first-models-only-when-you-need-them-4bfi)

### Learning & Education AI

- [Spaced Repetition Scheduler AI Agent (ClickUp)](https://clickup.com/p/ai-agents/spaced-repetition-scheduler)
- [StudyFetch AI-Powered Spaced Repetition](https://www.studyfetch.com/section/ai-powered-spaced-repetition-system-smart-flashcard-scheduler)
- [FSRS Algorithm Resources](https://github.com/open-spaced-repetition/awesome-fsrs)
- [AI-Powered Educational Agents: Opportunities and Challenges](https://www.mdpi.com/2078-2489/16/6/469)
- [AI Agents for Education (MindStudio)](https://www.mindstudio.ai/blog/education/)

### Technical Architecture

- [OmniDaemon: Event-Driven Runtime for AI Agents](https://codemaker2016.medium.com/omnidaemon-the-universal-event-driven-runtime-for-production-ready-ai-agents-02b1a5e63dfb)
- [The Future of AI Agents Is Event-Driven (Confluent)](https://www.confluent.io/blog/the-future-of-ai-agents-is-event-driven/)
- [AI Agent Job Scheduling: Best Patterns for 2026](https://fast.io/resources/ai-agent-job-scheduling/)
- [Trigger.dev: AI Agent Runtime](https://trigger.dev/)
- [How I Built 9 Autonomous AI Agents That Run 24/7](https://dev.to/quantbit/how-i-built-9-autonomous-ai-agents-that-run-247-46hl)
- [Sleepless Agent (GitHub)](https://github.com/context-machine-lab/sleepless-agent)
- [OpenClaw Heartbeat Docs](https://docs.openclaw.ai/gateway/heartbeat)

### Cost Optimization

- [AI Agent Token Cost Optimization: Complete Guide 2026](https://fast.io/resources/ai-agent-token-cost-optimization/)
- [LLM Token Optimization: Cut Costs & Latency (Redis)](https://redis.io/blog/llm-token-optimization-speed-up-apps/)
- [How I Reduced LLM Token Costs by 90%](https://medium.com/@ravityuval/how-i-reduced-llm-token-costs-by-90-using-prompt-rag-and-ai-agent-optimization-f64bd1b56d9f)
- [Reducing Token Costs in Long-Running Agent Workflows](https://agentsarcade.com/blog/reducing-token-costs-long-running-agent-workflows)
- [Cost Optimization Strategies for Enterprise AI Agents](https://datagrid.com/blog/8-strategies-cut-ai-agent-costs)
- [Optimize LLM Costs with Effective Caching (AWS)](https://aws.amazon.com/blogs/database/optimize-llm-response-costs-and-latency-with-effective-caching/)

### Scheduling Products

- [Reclaim AI: How It Manages Your Schedule](https://help.reclaim.ai/en/articles/6207587-how-reclaim-manages-your-schedule-automatically)
- [Lindy AI: Always-On Agent](https://www.lindy.ai/)
- [Lindy AI Review (Rimo)](https://rimo.app/en/blogs/lindy-ai-review_en-US)
- [Agents @ Work: Lindy.ai (Latent.Space)](https://www.latent.space/p/lindy)

### UX & Autonomy Levels

- [Levels of Autonomy for AI Agents (Knight Columbia)](https://knightcolumbia.org/content/levels-of-autonomy-for-ai-agents-1)
- [Practical Guide to Levels of AI Agent Autonomy](https://seanfalconer.medium.com/the-practical-guide-to-the-levels-of-ai-agent-autonomy-ac5115d3af26)
- [Designing for Autonomy: UX Principles for Agentic AI](https://uxmag.com/articles/designing-for-autonomy-ux-principles-for-agentic-ai-systems)
- [Beyond Generative: Rise of Agentic AI (Smashing Magazine)](https://www.smashingmagazine.com/2026/01/beyond-generative-rise-agentic-ai-user-centric-design/)
- [Need Help? Designing Proactive AI Assistants (CHI 2025)](https://dl.acm.org/doi/10.1145/3706598.3714002)
