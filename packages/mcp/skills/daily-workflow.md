---
name: daily-workflow
description: Activity logging, quick task updates, and mid-day productivity patterns
---

# Daily Workflow with Noteshell

> For full morning planning, use **`skills/morning-routine.md`**.
> For end-of-day reflection, use **`skills/evening-reflection.md`**.
> For weekly analysis, use **`skills/weekly-review.md`**.

## Quick Start: Check Your Day

```
secretary_today → see scheduled tasks
context_entries → what happened recently
```

### Adjust Tasks
```
secretary_task_modify {
  target: "Today.md",
  task_pattern: "09:00 (60min) Original task",
  replacement: "- [ ] 09:30 (45min) Updated task [PLAN]"
}
```

## During the Day

### Log Activity
```
secretary_log_activity { entry: "Completed 45min of Arrays & Hashing. Solved 3/5 problems." }
```

### Complete Tasks
Update task status in Today.md:
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
  title: "Quick: Insight about hash collisions",
  content: "Realized that chaining is O(n) worst case but O(1) amortized..."
}
```

## Evening Routine

> For the full evening workflow (reflection + archive + tomorrow prep), use **`skills/evening-reflection.md`**.

### Quick Reflect
```
secretary_reflect {
  mood: "good",
  reflection: "Productive day. Finished all algorithm problems.",
  went_well: "Hash map problems, time management",
  struggled_with: "DP memoization patterns"
}
```

### Quick Carry Over
```
secretary_carryover → moves [ ] tasks from Today → Tomorrow
```

## Weekly Review

> For the full weekly analysis, use **`skills/weekly-review.md`**.

### Quick Stats
```
secretary_analytics → completion rates, streaks, mood trends
```
