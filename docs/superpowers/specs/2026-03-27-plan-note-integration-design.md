# Plan-Note Integration Design

**Date**: 2026-03-27
**Status**: Approved
**Approach**: C — Leverage existing TaskArtifactLink infrastructure

## Problem

When the AI secretary creates a note for a plan task, the note is not linked to the plan's project folder. Notes land orphaned with no `projectId`. The plan dashboard's "Notes & Materials" section stays empty despite notes being created. Additionally, the full plan roadmap file is not viewable in the dashboard.

## Goals

1. Notes created by the secretary for plan tasks automatically appear in the plan's project folder AND in the plan dashboard
2. The plan dashboard displays the full plan markdown file in a collapsible section
3. Artifact cards show which task they were created for

## Design

### 1. Secretary Auto-Routes Notes to Plan Folders (Backend)

**Current state**: Secretary creates notes via `notes.create` capability delegation but doesn't pass `projectId`. The capability accepts `projectId` but the secretary doesn't use it.

**Change**: Prompt engineering + context verification.

The secretary already has:

- Active plans from Plan.md (parsed as `LearningRoadmap` objects)
- `ScheduledTask.planId` linking tasks to plans
- `LearningRoadmap.projectId` (needs verification that it's populated in memory context)
- `notes.create` capability accepting `projectId`

**Flow after change**:

1. User says "make a note for task 1"
2. Secretary reads Today.md, finds task 1
3. Task 1 has `planId: 'RE'`
4. Secretary looks up plan 'RE' in active plans → finds `projectId`
5. Secretary calls `notes.create` with that `projectId`
6. Note appears in the plan's folder automatically
7. Secretary calls `modifyTask` to update task's `artifacts` array with new `TaskArtifactLink`

**Files**:

- `packages/ai/src/agents/secretary/prompts.ts` — Add instructions for plan-aware note creation
- Verify: `projectId` flows through memory context to secretary

**Assumptions to verify**:

- `projectId` is populated on `LearningRoadmap` objects in secretary memory context
- If not: either store `projectId` in Plan.md markdown entries, or load from `plan_project_links` table during context building
- `modifyTask` tool supports updating the `artifacts` field on tasks

### 2. TaskArtifactLink — Add `sourceTask` Field (Shared Types)

**Current state**: `TaskArtifactLink` has `label` (artifact title) but no field for the source task title.

**Change**: Add optional `sourceTask?: string` to `TaskArtifactLink` in shared types.

```typescript
export interface TaskArtifactLink {
  id: string
  kind: TaskArtifactKind
  status: TaskArtifactStatus
  label: string
  targetId?: string
  href?: string
  missionId?: string
  createdByAgent: string
  createdAt: string
  sourceTask?: string // NEW: title of the task this artifact was created for
}
```

**Files**:

- `packages/shared/src/types/secretary.ts` — Add `sourceTask` field

### 3. PlanOverview — Collapsible Full Plan Markdown (Frontend)

**Current state**: `PlanOverview.vue` shows a brief description extract from `roadmapContent` in the left column. The full plan file content is loaded but not displayed.

**Change**: Make the Description column collapsible:

- **Collapsed** (default): Show current description extract + "Show full plan" toggle button
- **Expanded**: Render full `roadmapContent` as formatted markdown + "Collapse" button
- Smooth expand/collapse transition

**Markdown rendering**: Use a lightweight approach consistent with existing patterns in the codebase (check if there's already a markdown renderer component or use `v-html` with a markdown-to-HTML library).

**Files**:

- `apps/web/src/components/secretary/plan/PlanOverview.vue` — Collapsible section with markdown rendering

**Assumption to verify**: `roadmapContent` in the workspace API returns the full `Plans/*.md` content, not a truncated version.

### 4. PlanArtifacts — Task Label on Cards (Frontend)

**Current state**: Artifact cards show kind badge, title (2-line clamp), date, and status badge.

**Change**: When `artifact.sourceTask` exists, show it as a small muted subtitle below the title.

```
┌─────────────────────────────┐
│ 📝 Note                     │
│ Policy Gradient Notes        │  ← label (title)
│ From: Create a note on PG…   │  ← sourceTask (new, muted)
│ Mar 27, 2026    ● Ready      │
└─────────────────────────────┘
```

**Files**:

- `apps/web/src/components/secretary/plan/PlanArtifacts.vue` — Add subtitle line

## Verification Checklist

- [ ] `projectId` is populated on `LearningRoadmap` objects in secretary memory context
- [ ] `modifyTask` tool supports updating the `artifacts` field
- [ ] `roadmapContent` returns full plan file content
- [ ] Secretary prompt correctly instructs plan-aware note routing
- [ ] Notes created for plan tasks appear in plan's project folder
- [ ] Notes appear in plan dashboard "Notes & Materials" section
- [ ] Full plan markdown renders correctly in collapsible section
- [ ] Task label displays on artifact cards
- [ ] Existing functionality (Generate button, filter tabs) unaffected

## Out of Scope

- No new database tables or migrations
- No changes to the notes.create capability itself
- No changes to the project/folder system
- No real-time sync (dashboard refreshes on next load)
