---
name: weekly-review
description: Weekly review workflow — aggregates 7 days of history, identifies patterns, checks plan progress, generates summary note, and suggests adjustments
platform: universal
tools_required:
  [
    secretary_analytics,
    secretary_history_bulk,
    secretary_memory_list,
    secretary_memory_read,
    secretary_plans_list,
    secretary_plan_progress,
    soul_read,
    notes_create,
    soul_update,
    context_write,
  ]
---

# Weekly Review

> Analyzes the past week's history, identifies patterns in completion and struggles, checks roadmap progress, and generates an actionable summary. Run on Sunday evening or Monday morning.

## Guardrails

1. **Read-only on History files** — never modify archived daily plans.
2. **Read-only on Plan.md** — suggest changes but don't apply automatically.
3. **Ask before updating soul** — present proposed changes and get approval.
4. **Handle missing data gracefully** — if fewer than 7 days of history exist, work with what's available.

---

## Step 1: Gather Weekly Data

### 1a. Get aggregated analytics

```
secretary_analytics { days: 7 }
```

This returns completion rates, streaks, mood trends, struggled/strong topics.

### 1b. Read individual History files

```
secretary_history_bulk { limit: 7 }
```

If `secretary_history_bulk` is not available, fall back to:

```
secretary_memory_list { prefix: "History/" }
```

Then read each file individually (up to 7 most recent).

### 1c. Read active plans

```
secretary_plans_list → Plan.md index
soul_read            → user goals
```

---

## Step 2: Analyze Patterns (reasoning, no tools)

From the History files, identify:

1. **Completion trend**: Is the rate improving, declining, or stable?
2. **Time-of-day patterns**: When are tasks most often completed vs skipped?
3. **Topic difficulty**: Which subjects appear in "struggled with" across multiple days?
4. **Momentum**: Longest streak, current streak, any gaps.
5. **Mood trajectory**: How mood changed over the week.
6. **Overcommitment signals**: Days with > 8 tasks or < 40% completion.

---

## Step 3: Check Plan Progress

For each active plan in Plan.md:

```
secretary_plan_progress { plan_id: "<PLAN_ID>", action: "read" }
```

Calculate:

- Expected progress vs actual progress
- Days remaining
- Whether the plan is on track, ahead, or behind

If a plan is significantly behind (> 2 days), flag it.

---

## Step 4: Generate Weekly Summary Note

```
notes_create {
  title: "Weekly Review — YYYY-MM-DD",
  content: <formatted summary below>
}
```

### Summary format

```markdown
# Weekly Review — YYYY-MM-DD

## Overview

- Days tracked: X/7
- Average completion: X%
- Current streak: X days
- Mood trend: [great, good, okay, good, good]

## Completion by Day

| Day | Date  | Completion | Mood | Notes             |
| --- | ----- | ---------- | ---- | ----------------- |
| Mon | 03-07 | 85%        | good | Finished arrays   |
| Tue | 03-08 | 70%        | okay | Struggled with DP |
| ... | ...   | ...        | ...  | ...               |

## Patterns Identified

### Strengths

- Consistently strong in [topics]
- Best focus during [morning/afternoon]

### Growth Areas

- [Topic X] appeared in struggles 3/5 days
- Completion drops after 3pm
- [Specific pattern]

## Plan Progress

### [ALGO] Algorithm Mastery

- Expected: Day 8/14 | Actual: Day 6/14
- Status: 2 days behind
- Recommendation: [adjustment suggestion]

## Suggestions for Next Week

1. [Actionable suggestion based on data]
2. [Another suggestion]
3. [Optional: soul update suggestion]

## Raw Stats

- Total tasks scheduled: XX
- Total completed: XX
- Total carried over: XX
- Total skipped: XX
```

---

## Step 5: Suggest Adjustments

Based on the analysis, suggest specific changes:

### If completion < 50%

> Your completion rate was X% this week. Consider:
>
> - Reducing daily tasks from Y to Z
> - Shortening focus blocks from 60min to 45min
> - Adding more breaks

### If a plan is behind schedule

> [PLAN_ID] is 2 days behind. Options:
>
> 1. Extend the plan deadline
> 2. Combine lighter days
> 3. Pause a secondary plan to focus

### If mood is declining

> Your mood has trended from [good] to [struggling]. Consider:
>
> - Taking a lighter day
> - Reviewing if the current plan difficulty is appropriate
> - Updating your soul with adjusted goals

---

## Step 6: Offer Soul Update

If the week's data reveals new insights about the user's learning style or goals:

> Based on this week, I'd suggest updating your soul with:
>
> - Learning style: "Prefers shorter focus blocks (45min vs 60min)"
> - Strength: "Strong in [topic] — can move faster here"
> - Challenge: "[Topic] needs more time — allocate extra review"
>
> Would you like me to update your soul?

If approved:

```
soul_update { content: <updated soul content> }
```

---

## Step 7: Log to Context Bus

```
context_write {
  agent: "mcp",
  type: "active_plan",
  summary: "Weekly review completed. Avg completion: X%. Streak: Y days. [Plan status].",
  payload: {
    "week_ending": "YYYY-MM-DD",
    "avg_completion": X,
    "streak": Y,
    "plans_status": { "ALGO": "behind", "OPT": "on_track" }
  }
}
```

---

## Troubleshooting

| Issue                         | Solution                                             |
| ----------------------------- | ---------------------------------------------------- |
| Fewer than 7 days of history  | Work with available data, note "X of 7 days tracked" |
| No active plans               | Focus on general productivity patterns only          |
| All plans completed           | Congratulate user, suggest new plan creation         |
| No reflection data in history | Base analysis on task completion only                |
