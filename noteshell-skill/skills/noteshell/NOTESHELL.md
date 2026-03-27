# Noteshell Methodology Guide

> Complete step-by-step workflows for daily planning, reflection, study management, and note organization. Each section is a self-contained workflow — jump to the one matching the user's request.

---

## 1. Morning Routine

> Orchestrates a full daily planning session. Run this each morning to review yesterday, plan today, and align with active roadmaps.

### Guardrails

1. **Never overwrite Today.md without archiving first** — always check the date header before writing.
2. **Never modify Plan.md plan entries** — read-only during morning routine.
3. **Never delete notes or memory files** — this workflow is additive only.
4. **Show proposed plan to user and confirm before writing.**
5. **Idempotent** — if Today.md already has today's date, warn the user and ask whether to regenerate.

### Step 1: Gather Context (parallel reads)

```
soul_read                    → user goals & preferences
secretary_today              → current Today.md (may be stale)
secretary_preferences        → AI.md (study hours, breaks)
secretary_plans_list         → Plan.md (active roadmaps)
secretary_analytics          → last 7 days stats
secretary_recurring_manage { action: "read" }  → recurring blocks
calendar_events              → upcoming events
context_entries              → recent cross-agent activity
```

**First-run handling:**

- No soul → ask user to describe their goals, then call `soul_update` before continuing.
- No Plan.md → suggest creating a study plan first (see Section 4).
- No History → skip analytics. Note "This is your first morning routine — welcome!"
- No AI.md → use defaults: 09:00–17:00 study window, 50min focus / 10min break.

### Step 2: Analyze Yesterday (reasoning, no tools)

Parse the Today.md content from Step 1:

1. **Check date**: Extract the date from the `# Today's Plan — YYYY-MM-DD` header.
2. **Task markers**: Count `[x]` (done), `[ ]` (pending), `[>]` (carried), `[-]` (skipped).
3. **Completion rate**: `done / (done + pending + carried + skipped) * 100`.
4. **Reflection**: Extract the "End of Day" section if present.
5. **Stale detection**: If the date in Today.md is not today → it's stale and needs archiving.

If Today.md is empty or missing, skip to Step 5.

### Step 3: Archive & Carry Over

**Only run if Today.md is stale (date is not today).**

```
# 3a. Archive stale Today.md
secretary_memory_write {
  filename: "History/YYYY-MM-DD.md",
  content: <full content of stale Today.md>
}

# 3b. Carry over incomplete tasks
secretary_carryover
```

Use the date from Today.md's header (NOT today's date) as the archive filename.

**If Today.md already has today's date**: Skip archiving. Warn the user and ask whether to regenerate.

### Step 4: Pick Today's Focus

1. From Plan.md, find the **active plan** with the next incomplete day.
2. If there's an active plan, read its full content:

```
secretary_memory_read { filename: "Plans/<active-plan-filename>.md" }
secretary_plan_progress { plan_id: "<PLAN_ID>", action: "read" }
```

3. Cross-reference the plan's current day/topic with user's soul goals.
4. If no active plan exists, focus on recurring blocks + calendar events only.

### Step 5: Generate Today's Plan

Combine all inputs into a structured daily plan:

```markdown
# Today's Plan — YYYY-MM-DD

## Focus: [Active plan topic or "Free day"]

- [ ] HH:MM (XXmin) Task description [PLAN_ID]
- [ ] HH:MM (XXmin) Another task [PLAN_ID]
- [ ] HH:MM (10min) Break
- [ ] HH:MM (XXmin) Recurring: [block name]
```

**Present for confirmation.** Wait for user approval, then:

```
secretary_daily_generate { target: "Today.md", content: <approved plan> }
```

### Step 6: Write Morning Brief Note

```
notes_create {
  title: "Morning Brief — YYYY-MM-DD",
  content: <brief with yesterday's stats, today's focus, plan progress>
}

context_write {
  agent: "mcp",
  type: "active_plan",
  summary: "Morning routine completed. Focus: [topic]. Plan: [plan_id] Day X/Y.",
  payload: { "plan_id": "...", "day": X, "total_days": Y, "completion_yesterday": Z }
}
```

### Step 7: Present Dashboard

Output a formatted summary showing: yesterday's completion/mood/streak, today's schedule, focus area, and suggestions based on analytics.

---

## 2. Evening Reflection

> Wraps up the day: reviews accomplishments, captures reflections, carries over incomplete work, and sets up tomorrow.

### Guardrails

1. **Never overwrite Today.md's task section** — only append the reflection section.
2. **Always carry over before archiving** — incomplete tasks must be saved to Tomorrow.md first.
3. **Ask for mood and reflection** — don't skip the human input step.
4. **Archive only after reflection is saved.**

### Step 1: Review Today's Progress

```
secretary_today → read current Today.md
```

Parse: count `[x]`, `[ ]`, `[>]`, `[-]`. Calculate completion rate. Check if reflection already exists.

Present a summary:

> **Today's Results:** Completed: X/Y tasks (Z%). Pending: N tasks (will carry over).

### Step 2: Capture Reflection

Ask the user:

1. **How did today feel?** (great / good / okay / struggling / overwhelmed)
2. **What went well?**
3. **What did you struggle with?**
4. **Any other thoughts?**

```
secretary_reflect {
  mood: "<user's choice>",
  reflection: "<user's reflection text>",
  went_well: "<what went well>",
  struggled_with: "<what was difficult>"
}
```

### Step 3: Carry Over Incomplete Tasks

```
secretary_carryover
```

Moves `[ ]` tasks from Today.md to Tomorrow.md and marks them `[>]` in Today.md.

### Step 4: Prepare Tomorrow's Skeleton

```
secretary_preferences        → study hours, break pattern
secretary_plans_list         → active roadmaps
secretary_recurring_manage { action: "read" }  → recurring blocks
calendar_events              → tomorrow's events
```

If an active plan exists, read the next day's content:

```
secretary_plan_progress { plan_id: "<PLAN_ID>", action: "read" }
secretary_memory_read { filename: "Plans/<plan>.md" }
```

Generate tomorrow's skeleton and write:

```
secretary_daily_generate { target: "Tomorrow.md", content: <generated plan> }
```

### Step 5: Archive Today

```
secretary_memory_write {
  filename: "History/YYYY-MM-DD.md",
  content: <full Today.md content with reflection>
}
```

### Step 6: Log & Present Summary

```
context_write {
  agent: "mcp",
  type: "active_plan",
  summary: "Evening reflection done. Completion: X%. Mood: Y. Carried Z tasks.",
  payload: { "completion_rate": X, "mood": "Y", "carried_tasks": Z }
}
```

Output a brief wrap-up showing completion, mood, streak, carried tasks, and tomorrow's focus.

---

## 3. Weekly Review

> Analyzes the past week's history, identifies patterns, checks roadmap progress, and generates an actionable summary. Run on Sunday evening or Monday morning.

### Guardrails

1. **Read-only on History files** — never modify archived daily plans.
2. **Read-only on Plan.md** — suggest changes but don't apply automatically.
3. **Ask before updating soul** — present proposed changes and get approval.
4. **Handle missing data gracefully** — if fewer than 7 days of history, work with available data.

### Step 1: Gather Weekly Data

```
secretary_analytics { days: 7 }     → aggregated stats
secretary_history_bulk { limit: 7 } → individual history files
secretary_plans_list                → Plan.md index
soul_read                          → user goals
```

If `secretary_history_bulk` is not available, fall back to `secretary_memory_list { prefix: "History/" }` then read individually.

### Step 2: Analyze Patterns (reasoning, no tools)

From History files, identify:

1. **Completion trend**: improving, declining, or stable?
2. **Time-of-day patterns**: when are tasks most often completed vs skipped?
3. **Topic difficulty**: which subjects appear in "struggled with" across multiple days?
4. **Momentum**: longest streak, current streak, any gaps.
5. **Mood trajectory**: how mood changed over the week.
6. **Overcommitment signals**: days with > 8 tasks or < 40% completion.

### Step 3: Check Plan Progress

For each active plan:

```
secretary_plan_progress { plan_id: "<PLAN_ID>", action: "read" }
```

Calculate expected vs actual progress. Flag plans > 2 days behind.

### Step 4: Generate Weekly Summary Note

```
notes_create {
  title: "Weekly Review — YYYY-MM-DD",
  content: <formatted summary with overview, completion by day, patterns, plan progress, suggestions>
}
```

### Step 5: Suggest Adjustments

Based on analysis:

- **Completion < 50%**: suggest reducing daily tasks, shorter focus blocks, more breaks.
- **Plan behind schedule**: offer to extend deadline, combine days, or pause secondary plans.
- **Mood declining**: suggest lighter day, review plan difficulty, update soul goals.

### Step 6: Offer Soul Update

If insights warrant it, propose soul updates (learning style, strengths, challenges). Get user approval before writing:

```
soul_update { content: <updated soul content> }
```

### Step 7: Log to Context Bus

```
context_write {
  agent: "mcp",
  type: "active_plan",
  summary: "Weekly review completed. Avg completion: X%. Streak: Y days.",
  payload: { "week_ending": "YYYY-MM-DD", "avg_completion": X, "streak": Y }
}
```

---

## 4. Study Planning

> Creating learning roadmaps, daily plans, and tracking progress.

### Create a Roadmap

1. Gather context:

```
secretary_preferences  → study hours, availability, break frequency
secretary_plans_list   → existing active plans
soul_read             → learning goals and style
```

2. Create the plan archive:

```
secretary_plan_create {
  filename: "algo-roadmap.md",
  content: "# Algorithm Mastery Roadmap\n**Duration:** 14 days\n**Hours/day:** 2\n...\n## Week 1\n- Day 1: Arrays & Hashing\n...",
  plan_entry: "### [ALGO] Algorithm Mastery\n- Status: active\n- Progress: 0/14\n- Dates: YYYY-MM-DD → YYYY-MM-DD\n- Schedule: Mon-Fri 2h/day\n- Current: Day 1 — Arrays & Hashing"
}
```

3. Generate first daily plan:

```
secretary_daily_generate {
  target: "Tomorrow.md",
  content: "# Tomorrow's Plan — YYYY-MM-DD\n\n- [ ] 09:00 (60min) Arrays & Hashing [ALGO]\n..."
}
```

### Plan Entry Format

```markdown
### [ID] Plan Name

- Status: active | paused | completed | archived
- Progress: 3/14
- Dates: YYYY-MM-DD → YYYY-MM-DD
- Schedule: Mon-Fri 2h/day
- Current: Day 4 — Topic name
```

### Task Markers

`[ ]` pending, `[x]` done, `[>]` carried over, `[-]` skipped

### Progress Tracking

```
secretary_analytics           → completion rates, streaks, trends
secretary_today               → check today's progress
secretary_plan_activate { plan_id: "ALGO", status: "completed" }
```

---

## 5. Note Organization

> Structuring projects, creating rich notes, and the Task-to-Note pattern.

### View Project Structure

```
projects_list                          → see all projects with note counts
notes_list { project_id: "..." }       → notes in a specific project
notes_organize { note_id: "..." }      → heading structure of a note
```

### Create Project-Based Notes

```
1. projects_list → identify target project
2. notes_create { title: "...", content: "...", project_id: "..." }
3. context_write { type: "note_created", summary: "Created [note] in [project]" }
```

### Rich Note Structure

- `#` for the main title
- `##` for major sections
- `###` for subsections
- Code blocks with language tags
- Tables for comparison data

### Task-to-Note Pattern

When a study task is completed, convert it to a note:

```
1. secretary_today → find completed task
2. notes_create { title: "Topic — Study Notes", content: "...", project_id: "..." }
3. context_write { type: "note_created", summary: "Converted task to study notes" }
```

### Bulk Organization

```
notes_list → see all notes
notes_summarize { note_id } → check structure
notes_move { note_id, project_id } → organize into projects
```

---

## 6. Research to Notes

> Capturing web research, articles, and findings as structured notes.

### Workflow

1. **Research phase**: Gather information from web sources, papers, documentation.
2. **Create structured note**:

```
notes_create {
  title: "Research: [Topic]",
  content: "# Research: [Topic]\n\n## Sources\n- [Source 1](url)\n\n## Key Findings\n### [Finding 1]\n...\n\n## Code Examples\n...\n\n## Comparison\n| Approach | Pros | Cons |\n...\n\n## Actionable Takeaways\n1. ...\n\n## Open Questions\n- ...",
  project_id: "research-project-uuid"
}
```

3. **Log to context bus**:

```
context_write {
  agent: "mcp",
  type: "research_done",
  summary: "Researched [topic]: [key findings]",
  payload: { "note_id": "...", "topics": ["topic1", "topic2"] }
}
```

### Linking Research to Plans

```
1. notes_create → create research note
2. secretary_memory_read { filename: "Plans/project.md" } → read plan
3. secretary_memory_write → update plan with research findings
```

---

## 7. Daily Workflow

> Quick task updates and mid-day operations. For full morning planning, use Section 1. For evening reflection, use Section 2.

### Check Your Day

```
secretary_today   → see scheduled tasks
context_entries   → what happened recently
```

### Adjust Tasks

```
secretary_task_modify {
  target: "Today.md",
  task_pattern: "09:00 (60min) Original task",
  replacement: "- [ ] 09:30 (45min) Updated task [PLAN]"
}
```

### Log Activity

```
secretary_log_activity { entry: "Completed 45min of Arrays & Hashing. Solved 3/5 problems." }
```

### Complete Tasks

```
secretary_task_modify {
  target: "Today.md",
  task_pattern: "[ ] 09:00",
  replacement: "- [x] 09:00 (60min) Arrays & Hashing [ALGO]"
}
```

### Quick Note Capture

```
notes_create {
  title: "Quick: Insight about [topic]",
  content: "..."
}
```

### Quick Reflect

```
secretary_reflect {
  mood: "good",
  reflection: "...",
  went_well: "...",
  struggled_with: "..."
}
```

### Quick Carry Over

```
secretary_carryover → moves [ ] tasks from Today → Tomorrow
```

### Quick Stats

```
secretary_analytics → completion rates, streaks, mood trends
```
