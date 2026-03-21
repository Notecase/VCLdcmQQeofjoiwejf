# Plans as Smart Folders — Full Implementation Plan

**Date:** 2026-03-20
**Branch:** `feat/plan-smart-folders`

## Context

Plans in the AI Secretary currently live as markdown files in `secretary_memory` and have no connection to the note editor's folder/project system. The user wants plans to act as "smart folders" — each plan automatically gets a linked folder in the note editor sidebar, and autonomous agents save generated notes into that folder. This bridges the two major surfaces of the app: the note editor and the AI secretary.

The core problem: when the heartbeat triggers a recurring task (e.g., "generate daily study note"), the `NoteAgent` creates an orphan note with no `project_id`. There's no way to link generated content back to a plan or make it discoverable in the folder tree.

### What exists today
- `plan_schedules` table (recurring automations per plan)
- Mission orchestrator pipeline: research -> course -> daily_plan -> note_pack
- `NoteAgent` already accepts `projectId?: string` in its input schema
- `runNotePackAdapter` in `mission-adapters.ts` calls `noteAgent.stream()` but does NOT pass `projectId` (line 331-334)
- Heartbeat edge function checks due schedules and creates missions
- Plan workspace at `/calendar/plan/:planId` with PlanHeader, PlanOverview, PlanSchedule, PlanArtifacts

### What's missing
- No database link between plans (text ID like "OPT") and projects/folders (UUID)
- `runNotePackAdapter` doesn't pass `projectId` to NoteAgent — notes are orphaned
- No plan creation UI (hybrid form + AI chat)
- PlanSchedule uses row-based selects (user dislikes the bar design)
- No bidirectional navigation between plan dashboard and folder sidebar
- Plan instructions not injected into agent prompts during mission execution

---

## Phase 1: Database + Types (Foundation)

### 1.1 New migration: `029_plan_project_links.sql`

```sql
CREATE TABLE IF NOT EXISTS plan_project_links (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id    TEXT NOT NULL,          -- LearningRoadmap.id (e.g., "OPT")
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, plan_id)           -- One project per plan per user
);

CREATE INDEX idx_plan_project_user    ON plan_project_links(user_id, plan_id);
CREATE INDEX idx_plan_project_project ON plan_project_links(project_id);

ALTER TABLE plan_project_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own plan-project links"
  ON plan_project_links FOR ALL USING (auth.uid() = user_id);
```

**Why a junction table:** Plans live as markdown in `secretary_memory` keyed by short text IDs. Projects use UUIDs. A junction table cleanly maps the two without altering either existing table.

### 1.2 Type changes

**`packages/shared/src/types/secretary.ts`:**
- Add `projectId?: string` to `LearningRoadmap`
- Add `projectId?: string` and `projectNotes?: Array<{ id: string; title: string; updatedAt: string }>` to `PlanWorkspaceState`

**`packages/shared/src/types/mission.ts`:**
- Add `sourceProjectId?: string | null` to the `Mission.constraints` type

---

## Phase 2: Backend — Auto-Link + Pipeline Threading

### 2.1 Auto-create folder on plan creation

**File: `packages/ai/src/agents/secretary/tools.ts`** — In `save_roadmap` tool handler:

After saving the roadmap markdown, check if a `plan_project_links` row exists. If not:
1. Create a project via `supabase.from('projects').insert({ name: planName, icon: '📋', color: '#10b981' })`
2. Insert `plan_project_links` row linking `plan_id` -> `project.id`

This means every new plan automatically gets a folder in the note editor sidebar.

### 2.2 Thread `projectId` through mission pipeline

**File: `packages/ai/src/services/mission-orchestrator.ts`:**

In `runStageWithRetry`, when stage is `note_pack`, look up the target folder:
```typescript
const { data: link } = await this.supabase
  .from('plan_project_links')
  .select('project_id')
  .eq('user_id', this.userId)
  .eq('plan_id', mission.constraints.sourcePlanId)
  .single()
```
Pass `sourceProjectId: link?.project_id` to the note pack adapter.

**File: `packages/ai/src/services/mission-adapters.ts`:**

In `runNotePackAdapter` (line 270-360):
1. Add `sourceProjectId?: string` to the input type
2. Add `sourcePlanId?: string` to the input type (for instruction loading)
3. On line 331-334, change `noteAgent.stream({ action: 'create', input: def.input })` to include `projectId: input.sourceProjectId`
4. Before building `noteDefs`, load plan instructions from `secretary_memory` filename `Plans/<planId>-instructions.md` and prepend to each note prompt

### 2.3 Thread `projectId` through heartbeat

**File: `supabase/functions/heartbeat/actions.ts`:**

In `executePlanSchedule`, look up `plan_project_links.project_id` and include `sourceProjectId` in mission constraints.

### 2.4 New API routes for plan-project links

**File: `apps/api/src/routes/secretary.ts`** — Add:

| Route | Purpose |
|-------|---------|
| `GET /api/secretary/plan-links` | All links for user (bulk, called on init) |
| `POST /api/secretary/plan/:planId/link-project` | Create project + link |
| `DELETE /api/secretary/plan/:planId/unlink-project` | Remove link |

Enhance existing `GET /api/secretary/plan/:planId` to return `projectId` and `projectNotes[]` from the linked folder.

---

## Phase 3: Frontend — Plan Creation Wizard

### 3.1 New route

**File: `apps/web/src/main.ts`** — Add:
```typescript
{ path: '/calendar/plan/new', name: 'plan-create', component: () => import('./views/PlanCreateView.vue') }
```

### 3.2 Entry points

Add a "+ Create Plan" button in two places:
1. **ActivePlansOverview** — A dashed-border "add" card at the end of the horizontal plan cards scroll on the dashboard
2. **Plans tab** — A button in the Plans browser view header

### 3.3 PlanCreateView + PlanCreationWizard

**New files:**
- `apps/web/src/views/PlanCreateView.vue` — thin wrapper
- `apps/web/src/components/secretary/plan/PlanCreationWizard.vue` — 2-step wizard

**Step 1 — Form fields (user fills in):**
- Plan name (text)
- Date range (start + end date pickers)
- Hours per day (number, 0.5-8)
- Active days (day-of-week toggles: Mon, Tue, ...)
- Icon picker (optional, defaults to "📋")

**Step 2 — AI Chat (conversational refinement):**
- Chat interface using existing secretary SSE streaming
- System prompt constrained to roadmap creation mode
- Form data from Step 1 injected as structured context in the first message
- User describes what they want to learn / what the agent should do
- AI generates: topic roadmap, instructions, schedule suggestions
- "Create Plan" button triggers `save_roadmap` tool → auto-creates folder

**Design:** Clean modal or full-page view. Form step uses the app's existing input styles (dark, warm neutral grays). Chat step reuses the existing secretary chat component style.

### 3.4 Recurring task creation form

When creating a plan, after the roadmap is saved, optionally prompt to add recurring automations. The form (modal or inline) has:
- Title (text input)
- Description/Instructions (textarea — "What should the AI do each time?")
- Workflow type (segmented pills: Note / Research / Course)
- Frequency (segmented pills: Daily / Weekly / Custom)
- Time picker
- Day selector (toggle chips, shown for weekly/custom)

This same form is reused in PlanSchedule.vue for adding automations to existing plans.

---

## Phase 4: Frontend — Redesign PlanSchedule

### 4.1 Replace row-based list with compact row cards

**File: `apps/web/src/components/secretary/plan/PlanSchedule.vue`**

Replace the current `<select>` dropdowns + rows with compact row card layout:

```
┌─────────────────────────────────────────────┐
│ ◉  Daily Study Note    Every day · 7:05 AM  │
│    ┌──────┐                                  │
│    │ Note │  3 runs · last: success          │
│    └──────┘                                  │
└─────────────────────────────────────────────┘
```

Each schedule is a single compact card:
- **Row 1:** Enabled toggle + title (bold) + schedule text ("Every day · 7:05 AM")
- **Row 2:** Workflow badge (colored pill: "Note" green, "Research" blue, "Course" purple) + run count + last status
- **Click to expand:** Shows instructions preview + full edit form inline + delete button

Add form redesigned as an inline card using the reusable ScheduleForm component from 3.4.

### 4.2 Instructions field on schedules

Add an optional `instructions` textarea to the schedule creation/edit form. These instructions are schedule-specific (in addition to plan-level instructions) and get prepended to the note generation prompt.

---

## Phase 5: Frontend — Bidirectional Navigation

### 5.1 Secretary store additions

**File: `apps/web/src/stores/secretary.ts`:**
- Add `planProjectLinks: Map<string, string>` (planId -> projectId) and `projectPlanLinks: Map<string, string>` (reverse)
- Add `loadPlanProjectLinks()` action (calls `GET /api/secretary/plan-links`)
- Add `linkPlanToProject(planId)` action (calls `POST /api/secretary/plan/:planId/link-project`)
- Add `getPlanIdForProject(projectId)` / `getProjectIdForPlan(planId)` getters

### 5.2 Sidebar plan badge

**File: `apps/web/src/components/layout/SideBar.vue`:**

For project folders that have a linked plan (check `projectPlanLinks` map):
- Show a small calendar/plan icon badge next to the folder name
- Add "Open Plan Dashboard" context menu item → navigates to `/calendar/plan/:planId`

### 5.3 Plan workspace folder link

**File: `apps/web/src/components/secretary/plan/PlanHeader.vue`:**
- Add "View Folder" button/link → navigates to `/editor` with the folder expanded

**File: `apps/web/src/components/secretary/plan/PlanArtifacts.vue`:**
- Show notes from `projectNotes[]` (loaded from the linked folder) alongside mission artifacts
- Deduplicate: if a note appears in both artifacts and projectNotes, show once

---

## Phase 6: Plan Instructions Injection

### 6.1 How instructions propagate

Plan-level instructions are stored in `secretary_memory` as `Plans/<planId>-instructions.md`. These are already editable in PlanOverview.vue.

**Injection points (ALL AI operations within plan scope):**
1. **Mission note_pack stage:** `runNotePackAdapter` loads instructions and prepends to each note prompt (Phase 2.2)
2. **Heartbeat execution:** Instructions included in mission goal context via `executePlanSchedule`
3. **Manual "Run Now":** Same pipeline as missions — instructions loaded from memory
4. **Manual AI editing in editor:** When the user uses the AI editor on a note inside a plan-linked folder, the editor agent looks up the note's `project_id` → `plan_project_links` → loads `Plans/<planId>-instructions.md` and injects into the prompt. This requires a small change to the editor agent (`packages/ai/src/agents/editor.agent.ts`) to accept and use plan context.

**Implementation for editor injection (Point 4):**
- In the API route `apps/api/src/routes/agent.ts`, when handling an edit request, check if the note's `project_id` has a plan link
- If linked, fetch `Plans/<planId>-instructions.md` from `secretary_memory`
- Pass as `planInstructions` to the editor agent config
- Editor agent prepends to system prompt: "Follow these plan-specific instructions: ..."

### 6.2 Scope: plan-level vs schedule-level

- **Plan instructions:** Apply to ALL AI operations within the plan scope. Stored in `Plans/<planId>-instructions.md`.
- **Schedule instructions:** Optional per-schedule overrides. Stored in `plan_schedules.instructions` column (already exists).
- **Merge order:** Plan instructions first, then schedule instructions appended.

---

## File-by-File Summary

### New files to create

| File | Purpose |
|------|---------|
| `supabase/migrations/029_plan_project_links.sql` | Junction table |
| `apps/web/src/views/PlanCreateView.vue` | Plan creation view (thin wrapper) |
| `apps/web/src/components/secretary/plan/PlanCreationWizard.vue` | 2-step wizard (form + AI chat) |
| `apps/web/src/components/secretary/plan/PlanCreationForm.vue` | Step 1: structured form |
| `apps/web/src/components/secretary/plan/PlanCreationChat.vue` | Step 2: AI chat refinement |
| `apps/web/src/components/secretary/plan/ScheduleCard.vue` | Individual schedule card component |
| `apps/web/src/components/secretary/plan/ScheduleForm.vue` | Reusable schedule creation/edit form |

### Files to modify

| File | Changes |
|------|---------|
| `packages/shared/src/types/secretary.ts` | Add `projectId` to LearningRoadmap + PlanWorkspaceState |
| `packages/shared/src/types/mission.ts` | Add `sourceProjectId` to Mission constraints |
| `packages/ai/src/agents/secretary/tools.ts` | Auto-create project in `save_roadmap` |
| `packages/ai/src/services/mission-orchestrator.ts` | Look up projectId from `plan_project_links`, pass to adapter |
| `packages/ai/src/services/mission-adapters.ts` | Add `sourceProjectId` + `sourcePlanId` to `runNotePackAdapter`, pass `projectId` to NoteAgent, inject instructions |
| `apps/api/src/routes/secretary.ts` | Add plan-link CRUD routes, enhance workspace endpoint |
| `apps/web/src/stores/secretary.ts` | Add planProjectLinks maps + actions |
| `apps/web/src/components/secretary/plan/PlanSchedule.vue` | Full redesign: cards + instructions field |
| `apps/web/src/components/secretary/plan/PlanHeader.vue` | Add "View Folder" link |
| `apps/web/src/components/secretary/plan/PlanArtifacts.vue` | Show folder notes alongside artifacts |
| `apps/web/src/components/secretary/ActivePlansOverview.vue` | Add "+ Create Plan" card |
| `apps/web/src/components/layout/SideBar.vue` | Plan badge on linked folders + context menu |
| `apps/web/src/main.ts` | Add `/calendar/plan/new` route |
| `apps/api/src/routes/agent.ts` | Look up plan context from note's project, pass plan instructions to editor agent |
| `packages/ai/src/agents/editor.agent.ts` | Accept + inject `planInstructions` into system prompt |
| `supabase/functions/heartbeat/actions.ts` | Include `sourceProjectId` in mission constraints |
| `docs/ARCHITECTURE.md` | Document plan-project link system |

---

## Implementation Order

1. **Migration + types** (Phase 1) — foundation, no UI changes
2. **Auto-link on save_roadmap + pipeline threading** (Phase 2) — backend, makes new plans auto-create folders
3. **Plan creation wizard** (Phase 3) — main new UI, depends on Phase 2
4. **PlanSchedule redesign** (Phase 4) — independent of Phase 3, can be parallelized
5. **Bidirectional navigation** (Phase 5) — depends on Phase 1 + 2
6. **Instructions injection** (Phase 6) — backend enhancement, can be done alongside Phase 4/5

Phases 4, 5, 6 can be parallelized after Phase 2 is complete.

---

## Verification

1. **Create a new plan via AI chat** → verify a folder appears in the sidebar
2. **Click the folder in sidebar** → verify notes inside are shown
3. **Click "Open Plan Dashboard" in sidebar context menu** → verify navigation to plan workspace
4. **Add a recurring schedule** → verify card UI shows correctly
5. **Trigger "Run Now"** → verify generated note lands in the plan's folder
6. **Check the plan workspace artifacts section** → verify the generated note appears there too
7. **Existing plans** → verify auto-creation of linked folder on first workspace load
8. **Run `pnpm typecheck && pnpm lint && pnpm test:run`** after each phase

---

## Resolved Decisions

1. **Existing plans migration**: Auto-create folder silently when opening an existing plan's workspace for the first time. Add this logic to the `loadPlanWorkspace` action in the secretary store — if workspace loads with no `projectId`, call `linkPlanToProject(planId)` automatically.
2. **Instructions scope**: Always inject plan instructions for ANY AI operation on notes in a plan-linked folder — including manual AI editing in the note editor. This requires a small addition to `apps/api/src/routes/agent.ts` to look up plan context from the note's project.
3. **Entry points**: "+ Create Plan" button appears in both ActivePlansOverview (dashed add card) and the Plans tab (header button).
4. **Schedule card style**: Compact row cards — each schedule is a single-row card with toggle, title, schedule text, workflow badge. Click to expand for details/edit.
