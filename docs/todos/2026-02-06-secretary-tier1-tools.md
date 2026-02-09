# Secretary Agent Evolution — Tier 1 Implementation Plan

## Context

The Secretary agent (11 tools) manages learning roadmaps and daily study plans effectively, but falls short when real life collides with schedules. Users face daily pain points: no bulk schedule operations, incomplete tasks silently vanishing, plans conflicting with recurring commitments (meetings, gym), and untracked ad-hoc study.

**Scope:** Tier 1 only — 4 new tools that address the highest-frequency, highest-frustration gaps. Added as separate tools (not consolidated into existing ones).

**Decisions:**

- Carry-over: Auto-save to `Carryover.md` during day transition + manual `carry_over_tasks` tool for user control
- Recurring blocks: Stored in new `Recurring.md` file (separate from AI.md preferences)

---

## Tool 1: `bulk_modify_plan` — Schedule Surgery

The single most requested capability. Handles 3 operations that currently require multiple tedious `modify_plan` calls.

### Schema

```typescript
{
  action: 'shift_after' | 'insert_block' | 'swap',
  target: 'today' | 'tomorrow',       // default: 'today'
  // shift_after: push all tasks at/after afterTime by shiftMinutes
  afterTime?: string,                  // HH:MM
  shiftMinutes?: number,               // positive = later, negative = earlier
  // insert_block: add blocked time, push conflicting tasks after it
  blockStart?: string,                 // HH:MM
  blockDuration?: number,              // minutes
  blockDescription?: string,           // "Doctor appointment"
  // swap: exchange two tasks' time slots (keep durations + descriptions)
  taskTimeA?: string,                  // HH:MM
  taskTimeB?: string,                  // HH:MM
}
```

### Implementation Logic

**`shift_after`:**

1. Parse all task lines in Schedule section
2. For each task at/after `afterTime`, parse time as minutes-since-midnight
3. Add `shiftMinutes`, convert back to HH:MM
4. Replace all matched lines with new times
5. Return count of shifted tasks

**`insert_block`:**

1. Find all tasks that overlap with `[blockStart, blockStart + blockDuration]`
2. Insert a blocked-time line: `- [=] HH:MM (XXmin) blockDescription`
3. Shift all overlapping + subsequent tasks to after block ends
4. Return what was inserted and how many tasks were shifted

**`swap`:**

1. Find task at `taskTimeA` and task at `taskTimeB`
2. Extract their full line content (duration, description, plan ID)
3. Replace task A's time with B's time and vice versa
4. Return confirmation of the swap

### Example Triggers

- "Push everything after 10am back 90 minutes" → `shift_after`
- "I have a meeting 2-3pm, work around it" → `insert_block`
- "Swap my 9am and 11am tasks" → `swap`

---

## Tool 2: `carry_over_tasks` — Rescue Incomplete Work

### Schema

```typescript
{
  source: 'today' | 'yesterday',      // default: 'today'
  destination: 'today' | 'tomorrow',   // default: 'tomorrow'
  filter: 'all_incomplete' | 'pending_only' | 'in_progress_only',  // default: 'all_incomplete'
}
```

### Implementation Logic

1. Read source file (Today.md or yesterday's History file)
2. Parse task lines, filter by status: `[ ]` (pending), `[>]` (in_progress), `[-]` (skipped — NOT carried over)
3. Read destination file
4. Append carried-over tasks at the end of the Schedule section, with a `## Carried Over` sub-heading
5. Format: `- [ ] --:-- (XXmin) description [PLAN_ID]` (time set to `--:--` meaning "unscheduled, assign a slot")
6. Write destination file
7. Return count and list of carried-over tasks

### Auto Carry-Over (in `performDayTransition()`)

When Today.md is archived to History:

1. Extract incomplete tasks (pending + in_progress)
2. Write them to `Carryover.md` as a simple list
3. Next `generate_daily_plan` reads `Carryover.md` and includes those tasks in the prompt context
4. After generation, clear `Carryover.md`

This is passive — the LLM decides how to incorporate carried-over tasks (might reschedule them, spread across days, or ask user). The manual `carry_over_tasks` tool gives direct control.

---

## Tool 3: `manage_recurring_blocks` — Persistent Life Constraints

### Schema

```typescript
{
  action: 'add' | 'list' | 'remove',
  name?: string,                       // "Team standup", "Gym"
  days?: string[],                     // ['Mon','Wed','Fri'] or ['Daily']
  startTime?: string,                  // "09:30"
  endTime?: string,                    // "10:00"
  category?: 'work' | 'personal' | 'health',  // default: 'other'
}
```

### Recurring.md Format

```markdown
# Recurring Time Blocks

- **Team Standup** | Mon,Tue,Wed,Thu,Fri | 09:30-10:00 | work
- **Gym** | Mon,Wed,Fri | 18:00-19:00 | health
- **Lunch** | Daily | 12:00-13:00 | personal
```

Simple pipe-delimited format — easy for regex parsing and LLM reading/writing.

### Implementation Logic

**`add`:** Append a new line to Recurring.md (create file if doesn't exist)
**`list`:** Read and return Recurring.md content
**`remove`:** Find line matching `name`, remove it

### Integration with Plan Generation

In `generate_daily_plan` (tools.ts), after loading context:

1. Read `Recurring.md`
2. Filter blocks for the target day's day-of-week
3. Include in the prompt to the planner subagent: "BLOCKED TIMES (do not schedule study during these): 09:30-10:00 Team Standup, 18:00-19:00 Gym"
4. The subagent generates the schedule respecting these constraints

### Example Triggers

- "I have team standup every weekday at 9:30 for 30 minutes" → `add`
- "What recurring blocks do I have?" → `list`
- "Remove the Thursday meeting" → `remove`

---

## Tool 4: `log_activity` — Track What Actually Happened

### Schema

```typescript
{
  description: string,                 // "Watched async Rust tutorial"
  startTime: string,                   // HH:MM
  durationMinutes: number,             // 30
  planId?: string,                     // "RUST" — associate with roadmap
  target: 'today' | 'tomorrow',       // default: 'today'
}
```

### Implementation Logic

1. Read target file (Today.md / Tomorrow.md)
2. Build completed task line: `- [x] HH:MM (XXmin) description [PLAN_ID]`
3. Find insertion point in Schedule section (chronological order by time)
4. Insert the line
5. Write file
6. Return confirmation

### Example Triggers

- "I just did 30 minutes of Rust practice on ownership" → log_activity with planId="RUST"
- "Log 45 minutes of AWS video I watched during lunch" → log_activity

---

## Prompt Updates (`prompts.ts`)

### New Tool Listing (add to "YOUR TOOLS" section)

```
12. **bulk_modify_plan** - Bulk schedule operations: shift tasks after a time, insert a blocked time period, or swap two tasks. For single-task edits, use modify_plan instead.
13. **carry_over_tasks** - Move incomplete tasks from today/yesterday to today/tomorrow's plan.
14. **manage_recurring_blocks** - Add, list, or remove recurring time blocks (meetings, gym, etc.) stored in Recurring.md. These are respected during plan generation.
15. **log_activity** - Log a completed activity retroactively (adds a pre-completed task to the schedule).
```

### New Intent Handling (add to INTENT HANDLING section)

```
- **schedule_disruption**: User reports a disruption ("something came up", "push everything back", "I have a meeting at X")
  -> Use `bulk_modify_plan` with appropriate action (shift_after, insert_block)
  -> For simple single-task changes, use `modify_plan` instead

- **carry_over**: User wants to move incomplete tasks ("carry over my tasks", "what didn't I finish?")
  -> Use `carry_over_tasks` to move incomplete tasks to tomorrow

- **recurring_constraint**: User mentions a regular commitment ("I always have standup at 9:30", "gym every MWF")
  -> Use `manage_recurring_blocks` to save the constraint

- **activity_log**: User reports completed unplanned work ("I just spent 30min on X", "log my extra study")
  -> Use `log_activity` to add a pre-completed task
```

### Update generate_daily_plan guidance

Add to the daily plan workflow: "Before generating, also read Recurring.md and Carryover.md to respect blocked times and include carried-over tasks."

---

## Memory Service Changes (`memory.ts`)

### `performDayTransition()` Enhancement

After archiving Today.md to History/, before clearing:

1. Parse Today.md for incomplete tasks (status `[ ]` or `[>]`)
2. If any found, write to `Carryover.md`:

```markdown
# Carried Over Tasks (from YYYY-MM-DD)

- (XXmin) description [PLAN_ID]
- (XXmin) description [PLAN_ID]
```

3. Log: "Saved N incomplete tasks to Carryover.md"

### `getFullContext()` Enhancement

Add to returned context:

- `recurringBlocks: string` — raw content of Recurring.md (if exists)
- `carryoverTasks: string` — raw content of Carryover.md (if exists)

These are included in the system prompt context summary for the agent.

---

## Files to Modify

| File                                          | What Changes                                                                                                                                        |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/ai/src/agents/secretary/tools.ts`   | Add 4 new tools: bulk_modify_plan, carry_over_tasks, manage_recurring_blocks, log_activity. Return array includes them.                             |
| `packages/ai/src/agents/secretary/prompts.ts` | Add 4 tools to listing. Add 4 new intent types. Update daily plan workflow to mention Recurring.md + Carryover.md. Update tool count from 11 to 15. |
| `packages/ai/src/agents/secretary/memory.ts`  | Add carry-over logic to `performDayTransition()`. Add `recurringBlocks` + `carryoverTasks` to `getFullContext()` return.                            |

No new types needed in shared — all tools use simple string/number params and return string results (same pattern as existing tools).

---

## Implementation Order

1. **`manage_recurring_blocks`** first — it introduces `Recurring.md` which other features reference
2. **`bulk_modify_plan`** second — the highest-frequency pain reliever
3. **`carry_over_tasks`** + `performDayTransition()` enhancement third — these work together
4. **`log_activity`** fourth — smallest, self-contained
5. **Prompt updates** — after all tools are added, update prompts.ts holistically

---

## Verification

1. `pnpm build` after each tool addition — no TypeScript errors
2. **bulk_modify_plan tests:**
   - "Push everything after 10am back 90 minutes" → all tasks at/after 10:00 shift by +90min
   - "I have a meeting 2-3pm" → block inserted, tasks reflowed
   - "Swap 9am and 11am" → times exchanged, descriptions preserved
3. **carry_over_tasks tests:**
   - Today has 2 incomplete tasks → carry_over_tasks → Tomorrow.md gains 2 tasks
   - Day transition with incomplete tasks → Carryover.md created
4. **manage_recurring_blocks tests:**
   - "Add standup MWF 9:30-10:00" → Recurring.md has entry
   - "List recurring" → shows all blocks
   - "Remove standup" → entry removed
   - generate_daily_plan reads Recurring.md and avoids blocked times
5. **log_activity tests:**
   - "Log 30min Rust study at 12:30" → Today.md gains `- [x] 12:30 (30min) ...` in correct position
