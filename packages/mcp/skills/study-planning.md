---
name: study-planning
description: Creating learning roadmaps, daily plans, and tracking progress with Noteshell
---

# Study Planning with Noteshell

## Creating a Roadmap

### 1. Gather Context

```
secretary_preferences  → study hours, availability, break frequency
secretary_plans_list   → existing active plans
soul_read             → learning goals and style
```

### 2. Create the Plan Archive

```
secretary_plan_create {
  filename: "algo-roadmap.md",
  content: "# Algorithm Mastery Roadmap\n**Duration:** 14 days\n**Hours/day:** 2\n**Schedule:** Mon-Fri\n\n## Week 1\n- Day 1: Arrays & Hashing\n- Day 2: Two Pointers\n...",
  plan_entry: "### [ALGO] Algorithm Mastery\n- Status: active\n- Progress: 0/14\n- Dates: 2026-03-12 → 2026-03-25\n- Schedule: Mon–Fri 2h/day\n- Current: Day 1 — Arrays & Hashing"
}
```

### 3. Generate Daily Plan

```
secretary_daily_generate {
  target: "Tomorrow.md",
  content: "# Tomorrow's Plan — 2026-03-13\n\n- [ ] 09:00 (60min) Arrays & Hashing — Leetcode problems [ALGO]\n- [ ] 10:15 (45min) Review hash map implementations [ALGO]\n- [ ] 11:15 (15min) Break ☕\n..."
}
```

## Plan Entry Format

```markdown
### [ID] Plan Name

- Status: active | paused | completed | archived
- Progress: 3/14
- Dates: YYYY-MM-DD → YYYY-MM-DD
- Schedule: Mon–Fri 2h/day
- Current: Day 4 — Topic name
```

## Daily Plan Format

```markdown
# Today's Plan — YYYY-MM-DD

- [ ] 09:00 (60min) Task description [PLAN_ID]
- [ ] 10:15 (45min) Another task [PLAN_ID]
- [ ] 11:15 (15min) Break ☕
- [x] 11:30 (30min) Completed task [PLAN_ID]
- [>] 14:00 (45min) Carried over task [PLAN_ID]
```

Task markers: `[ ]` pending, `[x]` done, `[>]` carried over, `[-]` skipped

## Progress Tracking

```
secretary_analytics → completion rates, streaks, trends
secretary_today     → check today's progress
secretary_plan_activate { plan_id: "ALGO", status: "completed" }
```
