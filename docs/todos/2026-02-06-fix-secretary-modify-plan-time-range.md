# Fix Secretary Agent `modify_plan` Tool — Time Range Handling Bugs

## Context

The Secretary agent's `modify_plan` tool has two related bugs when users specify time ranges like "from 11am to 4pm":

**Bug 1 — `extend` adds duration instead of setting it:**
When user says "deep work for coding from 11am to 4pm", the LLM calls `extend` with `duration: 300`. But `extend` (line 547 of `tools.ts`) does `currentMinutes + duration` — it ADDS 300 minutes to the existing duration instead of SETTING it to 300. Calling it repeatedly keeps adding 300 each time.

**Bug 2 — `reschedule` moves start time instead of setting range:**
When user says "change Deep work for coding to from 11am to 6pm", the LLM calls `reschedule` with `taskTime: "11:00"` and `newTime: "18:00"`. But `reschedule` (line 513) replaces the START time, so the task moves from 11:00 to 18:00 keeping its old duration → ends up at 18:00-23:00 instead of 11:00-18:00.

**Root cause:** The `modify_plan` tool has no action that can SET absolute duration or change both time and duration simultaneously. The 4 current actions (`remove`, `reschedule`, `add`, `extend`) don't cover the "set this task to run from X to Y" use case.

## Plan

### Step 1: Add `update` action to `modify_plan` tool

**File:** `packages/ai/src/agents/secretary/tools.ts` (lines 489-575)

Add a new `update` action to the `modify_plan` switch statement. This action can modify a task's start time AND/OR duration AND/OR description in one operation.

### Step 2: Update the system prompt to guide LLM on time-range requests

**File:** `packages/ai/src/agents/secretary/prompts.ts` (around line 301)

Update the `modify_plan` intent handling section to include clear guidance on when to use `update` vs `reschedule` vs `extend`.

### Step 3: Add `update` to tool listing in system prompt

**File:** `packages/ai/src/agents/secretary/prompts.ts` (around line 51)

## Files to Modify

1. `packages/ai/src/agents/secretary/tools.ts`
2. `packages/ai/src/agents/secretary/prompts.ts`
