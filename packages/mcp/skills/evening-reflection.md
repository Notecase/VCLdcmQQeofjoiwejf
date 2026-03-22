---
name: evening-reflection
description: End-of-day reflection workflow — reviews completion, captures mood and learnings, carries over tasks, prepares tomorrow's skeleton, archives today
platform: universal
tools_required:
  [
    secretary_today,
    secretary_reflect,
    secretary_carryover,
    secretary_preferences,
    secretary_plans_list,
    secretary_plan_progress,
    secretary_recurring_manage,
    calendar_events,
    secretary_memory_write,
    secretary_daily_generate,
    secretary_memory_read,
    context_write,
  ]
---

# Evening Reflection

> Wraps up the day: reviews what you accomplished, captures reflections, carries over incomplete work, and sets up tomorrow. Run this at the end of your study/work session.

## Guardrails

1. **Never overwrite Today.md's task section** — only append the reflection section.
2. **Always carry over before archiving** — incomplete tasks must be saved to Tomorrow.md first.
3. **Ask for mood and reflection** — don't skip the human input step.
4. **Archive only after reflection is saved** — ensures the archived file has the full day's data.

---

## Step 1: Review Today's Progress

```
secretary_today → read current Today.md
```

Parse the plan:

- Count task markers: `[x]` done, `[ ]` pending, `[>]` already carried, `[-]` skipped
- Calculate completion rate
- List completed tasks and incomplete tasks separately
- Check if an "End of Day" section already exists (idempotent — warn if reflection already done)

Present a summary:

> **Today's Results:**
>
> - Completed: 5/7 tasks (71%)
> - Pending: 1 task (will carry over)
> - Skipped: 1 task
>
> Would you like to add your reflection?

---

## Step 2: Capture Reflection

Ask the user:

1. **How did today feel?** (great / good / okay / struggling / overwhelmed)
2. **What went well?**
3. **What did you struggle with?**
4. **Any other thoughts?**

Then save:

```
secretary_reflect {
  mood: "<user's choice>",
  reflection: "<user's reflection text>",
  went_well: "<what went well>",
  struggled_with: "<what was difficult>"
}
```

---

## Step 3: Carry Over Incomplete Tasks

```
secretary_carryover
```

This moves `[ ]` tasks from Today.md → Tomorrow.md and marks them `[>]` in Today.md.

---

## Step 4: Prepare Tomorrow's Skeleton

Gather inputs for tomorrow's plan:

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

Generate tomorrow's plan skeleton combining:

- Carried-over tasks (from Step 3)
- Next plan day's topics
- Recurring blocks
- Calendar events
- Appropriate breaks

```
secretary_daily_generate {
  target: "Tomorrow.md",
  content: <generated plan>
}
```

Present the skeleton to the user. They can adjust it in the morning.

---

## Step 5: Archive Today

Archive the completed Today.md (which now includes the reflection) to History:

```
secretary_memory_write {
  filename: "History/YYYY-MM-DD.md",
  content: <full Today.md content with reflection>
}
```

Use today's actual date for the archive filename.

---

## Step 6: Log to Context Bus

```
context_write {
  agent: "mcp",
  type: "active_plan",
  summary: "Evening reflection done. Completion: X%. Mood: Y. Carried Z tasks.",
  payload: {
    "completion_rate": X,
    "mood": "Y",
    "carried_tasks": Z,
    "struggled_with": "...",
    "went_well": "..."
  }
}
```

---

## Step 7: Present Summary

Output a brief wrap-up:

```
┌─────────────────────────────────────────┐
│           🌙 Evening Summary            │
├─────────────────────────────────────────┤
│ Completion: 71% (5/7 tasks)             │
│ Mood: good                              │
│ Streak: 6 days                          │
├─────────────────────────────────────────┤
│ Carried to Tomorrow: 1 task             │
│ Tomorrow's Focus: [Next topic]          │
├─────────────────────────────────────────┤
│ Rest well! See you in the morning. 🌙   │
└─────────────────────────────────────────┘
```

---

## Troubleshooting

| Issue                                 | Solution                                       |
| ------------------------------------- | ---------------------------------------------- |
| Reflection already exists in Today.md | Warn user, ask if they want to update it       |
| No tasks completed                    | Encourage user, suggest smaller tasks tomorrow |
| Today.md is empty                     | Skip review, just prepare tomorrow             |
| No active plan for tomorrow           | Generate from recurring + calendar only        |
