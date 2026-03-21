---
name: morning-routine
description: Complete morning planning workflow — gathers context, analyzes yesterday, archives stale plans, picks focus from active roadmaps, generates Today.md, and presents a dashboard
platform: universal
tools_required: [soul_read, secretary_today, secretary_preferences, secretary_plans_list, secretary_analytics, secretary_recurring_manage, calendar_events, context_entries, secretary_memory_write, secretary_carryover, secretary_plan_progress, secretary_memory_read, secretary_daily_generate, notes_create, context_write]
---

# Morning Routine

> Orchestrates a full daily planning session. Run this each morning to review yesterday, plan today, and align with your active roadmaps.

## Guardrails

1. **Never overwrite Today.md without archiving first** — always check the date header before writing.
2. **Never modify Plan.md plan entries** — read-only during morning routine. Use `secretary_plan_activate` separately if needed.
3. **Never delete notes or memory files** — this workflow is additive only.
4. **Show proposed plan to user and confirm before writing** — present the draft, ask "Does this look good?", then write on approval.
5. **Idempotent** — if Today.md already has today's date, warn the user and ask whether to regenerate.

---

## Step 1: Gather Context (parallel reads)

Read all relevant state in parallel. These are all read-only operations.

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
- No Plan.md → suggest using the `study-planning.md` skill first to create a roadmap.
- No History → skip analytics. Note "This is your first morning routine — welcome!"
- No AI.md → use defaults: 09:00–17:00 study window, 50min focus / 10min break.

---

## Step 2: Analyze Yesterday (reasoning, no tools)

Parse the Today.md content from Step 1:

1. **Check date**: Extract the date from the `# Today's Plan — YYYY-MM-DD` header.
2. **Task markers**: Count `[x]` (done), `[ ]` (pending), `[>]` (carried), `[-]` (skipped).
3. **Completion rate**: `done / (done + pending + carried + skipped) * 100`.
4. **Reflection**: Extract the "End of Day" section if present (mood, went well, struggled with).
5. **Stale detection**: If the date in Today.md ≠ today → it's stale and needs archiving.

If Today.md is empty or missing, skip to Step 5.

---

## Step 3: Archive & Carry Over

**Only run if Today.md is stale (date ≠ today).**

### 3a. Archive stale Today.md to History

```
secretary_memory_write {
  filename: "History/YYYY-MM-DD.md",
  content: <full content of stale Today.md>
}
```

Use the date extracted from Today.md's header (NOT today's date) as the archive filename.

### 3b. Carry over incomplete tasks

```
secretary_carryover
```

This moves `[ ]` tasks from Today.md → Tomorrow.md and marks them `[>]` in Today.md.

**If Today.md already has today's date**: Skip archiving. Warn the user: "Today.md already has a plan for today. Would you like to regenerate it?" Only proceed if they confirm.

---

## Step 4: Pick Today's Focus (reasoning + reads)

1. From Plan.md (read in Step 1), find the **active plan** with the next incomplete day.
2. If there's an active plan, read its full content:

```
secretary_memory_read { filename: "Plans/<active-plan-filename>.md" }
```

3. Cross-reference the plan's current day/topic with the user's soul goals to prioritize.
4. If using `secretary_plan_progress` tool:

```
secretary_plan_progress { plan_id: "<PLAN_ID>", action: "read" }
```

5. If no active plan exists, focus on recurring blocks + calendar events only.

---

## Step 5: Generate Today's Plan

Combine all inputs into a structured daily plan:

- **Recurring blocks** (from Recurring.md)
- **Calendar events** (from Calendar.md)
- **Carried-over tasks** (from Tomorrow.md after carryover)
- **Plan tasks** (from active plan's current day)
- **Breaks** (from AI.md preferences, default 10min every 50min)

### Plan format

```markdown
# Today's Plan — YYYY-MM-DD

## Focus: [Active plan topic or "Free day"]

- [ ] HH:MM (XXmin) Task description [PLAN_ID]
- [ ] HH:MM (XXmin) Another task [PLAN_ID]
- [ ] HH:MM (10min) Break ☕
- [ ] HH:MM (XXmin) Recurring: [block name]
...
```

### Present for confirmation

Show the proposed plan to the user:

> Here's your proposed plan for today. Does this look good? I can adjust times, add/remove tasks, or regenerate.

**Wait for user approval before writing.**

Once approved:

```
secretary_daily_generate { target: "Today.md", content: <approved plan> }
```

---

## Step 6: Write Morning Brief Note

Create a note summarizing the morning routine for the user's knowledge base:

```
notes_create {
  title: "Morning Brief — YYYY-MM-DD",
  content: <brief with yesterday's stats, today's focus, active plan progress>
}
```

Log to the context bus:

```
context_write {
  agent: "mcp",
  type: "active_plan",
  summary: "Morning routine completed. Focus: [topic]. Plan: [plan_id] Day X/Y.",
  payload: { "plan_id": "...", "day": X, "total_days": Y, "completion_yesterday": Z }
}
```

---

## Step 7: Present Dashboard (text output, no tools)

Output a formatted dashboard:

```
┌─────────────────────────────────────────┐
│           🌅 Morning Dashboard          │
├─────────────────────────────────────────┤
│ Yesterday                               │
│   Completion: 85% (6/7 tasks)           │
│   Mood: good                            │
│   Streak: 5 days                        │
├─────────────────────────────────────────┤
│ Today's Schedule                        │
│   09:00  (60min) Topic A [PLAN]         │
│   10:15  (45min) Topic B [PLAN]         │
│   11:15  (10min) Break ☕               │
│   11:30  (30min) Review [PLAN]          │
│   12:00  (60min) Lunch                  │
│   13:00  (45min) Carried: Task C [PLAN] │
│   14:00  (30min) Calendar: Meeting      │
├─────────────────────────────────────────┤
│ Focus Area                              │
│   [ALGO] Algorithm Mastery — Day 5/14   │
│   Topic: Dynamic Programming            │
├─────────────────────────────────────────┤
│ Suggestions                             │
│   • You struggled with DP yesterday     │
│     → Start with review before new      │
│   • Completion trending up this week    │
│   • Consider adding a short quiz        │
└─────────────────────────────────────────┘
```

Adapt the dashboard based on available data. If this is a first run, keep it minimal.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Today.md already has today's date | Ask user: regenerate or keep current? |
| No active plans | Generate day from recurring + calendar only |
| No soul/preferences | Guide user through initial setup |
| Analytics show low completion | Suggest lighter schedule, shorter focus blocks |
| Multiple active plans | Prioritize by plan order in Plan.md, or ask user |
