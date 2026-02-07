# Secretary Roadmap + Daily Sync Validation Plan

> Scope: Validate roadmap lifecycle and day-plan mutations remain synchronized across chat tool calls, memory files, parser output, and dashboard UI.

## Goal
Prevent inconsistencies like:
- roadmap summary showing one timeline while active card/progress shows another
- assistant confirms schedule edits but `Today.md` and board do not change

## Invariants (Must Always Hold)
1. `Plan.md` active roadmap entry is canonical (`### [ID] ...` block) and matches the associated `Plans/<id>-roadmap.md` duration/schedule.
2. `Progress X/Y` in active roadmap never silently falls back to `14` when roadmap content specifies another duration.
3. `modify_today_plan` returns success only when at least one matching schedule line is actually modified.
4. Every roadmap or day-plan tool mutation triggers frontend memory refresh (`memory_updated`) and visible board sync.

## Automated Regression Suite
Run:

```bash
pnpm vitest run packages/ai/src/agents/secretary/memory.activation.test.ts
pnpm vitest run packages/shared/src/secretary/markdown-parser.test.ts packages/ai/src/agents/secretary/stream-normalizer.test.ts
```

Coverage includes:
- save roadmap normalization from roadmap content metadata
- no-op detection for missing `taskTime`
- multi-line reschedule for same time slot
- break/session extension by additional minutes

## Manual End-to-End Scenarios
Use exact date anchors for deterministic checks: `2026-02-06` (Friday).

### Scenario 1: Create + Save 4-Month Roadmap
1. Chat: `Create a 4-month Reinforcement Learning roadmap, 2h/day, MWF.`
2. Confirm save.
3. Verify files:
   - `Plan.md` contains a canonical active block for RL.
   - `Plan.md` progress total reflects roadmap duration (not default `14`).
   - `Plan.md` schedule line matches roadmap schedule (`MWF 2h/day`).
   - `Plans/rl-roadmap.md` exists and includes the same duration metadata.
4. Verify dashboard card and details show the same date range/progress basis as `Plan.md`.

### Scenario 2: Generate Daily Plan
1. Chat: `Plan my day based on active roadmap.`
2. Verify:
   - `Today.md` rewritten with `## Schedule` task list.
   - Task parser renders all tasks on board.
   - Focus section topic aligns with current roadmap week/topic.

### Scenario 3: Modify Existing Schedule (Happy Paths)
1. Chat: `Move all 10:00 sessions to 11:00.`
2. Verify:
   - Assistant response reports changed count.
   - All `10:00` entries become `11:00` in `Today.md`.
   - Board reflects updated times.
3. Chat: `Extend the 10:45 break by 15 minutes.`
4. Verify:
   - Duration increments (e.g., `15min -> 30min`) in `Today.md`.
   - Board reflects new duration.

### Scenario 4: Modify Schedule (No Match)
1. Chat: `Move 07:00 session to 08:00.` (assuming no 07:00 task exists)
2. Verify:
   - Assistant/tool returns explicit no-op message (`No tasks matched ...`).
   - `Today.md` is unchanged.

### Scenario 5: Query Consistency
1. Chat: `What is my current roadmap and progress?`
2. Verify response values exactly match active block in `Plan.md` and card in dashboard.

### Scenario 6: Frequency Change Request
1. Chat: `Change RL from MWF to Daily 2h.`
2. Verify:
   - `Plan.md` schedule updated in active block.
   - `## This Week` regenerated accordingly.
   - New daily plans follow updated schedule.

## Failure Triage Rules
1. If assistant says success but file unchanged, inspect latest `modify_today_plan` tool result payload first.
2. If file changed but board unchanged, inspect `memory_updated` SSE event and client memory refresh path.
3. If roadmap duration mismatches, compare `Plans/<id>-roadmap.md` metadata vs `Plan.md` canonical block and verify no fallback defaults were applied.

## Exit Criteria
- All automated suites pass.
- All manual scenarios pass without divergence between chat confirmation, markdown files, and dashboard state.
