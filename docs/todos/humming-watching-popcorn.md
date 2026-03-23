# Infrastructure Cleanup: Unified API Deployment & Reliable AI

## Context

The Inkdown API (`apps/api`) accumulated technical debt during the CF Workers → Railway migration:
- **Two API backends** exist (CF Workers `worker.ts` + Railway `index.ts`), unclear which serves production
- **Web app API routing is hacky** — secretary/deepAgent do `.replace('/api/agent', '')` to derive base URL; course service hardcodes paths
- **Model fallback only in secretary** — all other agents fail silently on Gemini rate limits ("high demand")
- **Env vars fragmented** across CF Workers secrets, Railway vars, and Vercel env vars

**Goal:** One API target (Railway), clean frontend routing, model fallback everywhere, simple env management.

---

## Phase 1: Remove Cloudflare Workers

**Delete files:**
- `apps/api/src/worker.ts` — CF Workers entry point
- `apps/api/wrangler.toml` — CF Workers config
- `apps/api/.gitignore` — only contained `.vercel`

**Modify:**
- `apps/api/package.json` — remove `wrangler` from devDependencies, change `"start"` script to `"tsx src/index.ts"`
- `apps/api/src/config.ts` — remove comment about CF Workers env binding timing (lines ~9-11). Keep getter pattern (good practice regardless)

**Verify:** `grep -r "wrangler\|worker\.ts" apps/api/` returns nothing. `pnpm typecheck` passes.

---

## Phase 2: Unify Frontend API URL Construction

**Problem:** Two env vars (`VITE_API_BASE`, `VITE_API_URL`) used inconsistently. `VITE_API_BASE` defaults to `/api/agent` and services hack it with `.replace('/api/agent', '')`.

**Solution:** Standardize on `VITE_API_URL` — the base URL of the API server (empty string in dev → Vite proxy, `https://api.noteshell.io` in prod).

| File | Current | New |
|------|---------|-----|
| `apps/web/src/services/ai.service.ts:16` | `VITE_API_BASE \|\| '/api/agent'` | `` `${VITE_API_URL \|\| ''}/api/agent` `` |
| `apps/web/src/stores/secretary.ts:54` | `VITE_API_BASE?.replace('/api/agent','') \|\| ''` | `VITE_API_URL \|\| ''` |
| `apps/web/src/stores/deepAgent.ts:40` | `VITE_API_BASE?.replace('/api/agent','') \|\| ''` | `VITE_API_URL \|\| ''` |
| `apps/web/src/services/deepAgent.service.ts:14` | `VITE_API_BASE?.replace('/api/agent','') \|\| ''` | `VITE_API_URL \|\| ''` |
| `apps/web/src/services/course.service.ts:24` | `'/api/course'` (hardcoded) | `` `${VITE_API_URL \|\| ''}/api/course` `` |
| `apps/web/src/components/secretary/plan/PlanCreationChat.vue:24` | `VITE_API_BASE?.replace('/api/agent','') \|\| ''` | `VITE_API_URL \|\| ''` |
| `turbo.json` | Has `VITE_API_BASE` in passthrough | Remove `VITE_API_BASE`, keep `VITE_API_URL` |

**Manual step:** Set `VITE_API_URL=https://api.noteshell.io` in Vercel Dashboard → Environment Variables → Production. Then rebuild.

**Verify:** `grep -r "VITE_API_BASE" apps/web/` returns nothing. `pnpm dev` works (Vite proxy). Production build works.

---

## Phase 3: Add Shared Fallback Utilities

**Add to `packages/ai/src/providers/ai-sdk-factory.ts`:**

```typescript
/** Check if an error is transient (rate limit, capacity, etc.) */
export function isTransientError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error)
  return /high demand|rate limit|overloaded|Resource exhausted|\b503\b|\b429\b/i.test(msg)
}

/** Get primary + fallback models, respecting optional user model override */
export function resolveModelsForTask(
  taskType: AITaskType,
  overrideModelId?: string
): {
  primary: { model: LanguageModel; entry: ModelEntry }
  fallback: { model: LanguageModel; entry: ModelEntry } | null
} {
  if (overrideModelId) {
    const overrideEntry = getModel(overrideModelId)
    if (overrideEntry) {
      const fallbackEntry = selectFallbackModel(taskType)
      return {
        primary: { model: createAIModel(overrideEntry), entry: overrideEntry },
        fallback: fallbackEntry ? { model: createAIModel(fallbackEntry), entry: fallbackEntry } : null,
      }
    }
  }
  return getModelsForTask(taskType)
}
```

**Export from `packages/ai/src/providers/index.ts`:** Add `getModelsForTask`, `resolveModelsForTask`, `isTransientError` to exports.

**Also export `selectFallbackModel`** from `model-registry.ts` barrel.

---

## Phase 4: Add Model Fallback to All Agents

Apply the secretary's fallback pattern to all agents. For agents using `streamText`/`generateText` directly (not ToolLoopAgent), the pattern is:

```typescript
const { primary, fallback } = resolveModelsForTask('chat', this.model)
for (const opt of [primary, fallback]) {
  if (!opt) continue
  try {
    const result = streamText({ model: opt.model, ... })
    // ... process stream ...
    return // success
  } catch (err) {
    if (isTransientError(err) && opt === primary && fallback) {
      console.warn(`[Agent] ${opt.entry.id} unavailable, falling back to ${fallback.entry.id}`)
      continue
    }
    throw err
  }
}
```

**Agents to update (in order of simplicity):**

| Agent | File | Call Sites | Model Resolution |
|-------|------|-----------|-----------------|
| ChatAgent | `packages/ai/src/agents/chat.agent.ts` | ~2 (streamChat, generateResponse) | `resolveModel` → `resolveModelsForTask` |
| NoteAgent | `packages/ai/src/agents/note.agent.ts` | ~3 (create, update, organize) | `resolveModel` → `resolveModelsForTask` |
| PlannerAgent | `packages/ai/src/agents/planner.agent.ts` | ~2 (generateText calls) | `resolveModel` → `resolveModelsForTask` |
| EditorDeepAgent | `packages/ai/src/agents/editor-deep/agent.ts` | 1 (ToolLoopAgent) | `getModelForTask` → `getModelsForTask` |
| ResearchAgent | `packages/ai/src/agents/research/agent.ts` | ~5 | `resolveModel` → `resolveModelsForTask` |
| SecretaryAgent | Already done | — | — |

**Note:** Start with ChatAgent (simplest, 2 call sites), verify pattern works, then proceed to others.

---

## Phase 5: Documentation & Cleanup

1. **`CLAUDE.md`** — Update deploy instructions: `railway up` instead of `wrangler deploy`. Remove `VITE_API_BASE` from env vars section. Add `VITE_API_URL`.
2. **`docs/ARCHITECTURE.md`** — Change API hosting from "CF Workers" to "Railway (api.noteshell.io)". Document model fallback pattern.
3. **`apps/api/.env.example`** — Already correct, no changes needed.
4. **`apps/web/.env.example`** — Already documents `VITE_API_URL`, no changes needed.

---

## Phase 6: Decommission CF Workers (Manual)

After Railway is verified stable for 24-48h:
1. **Cloudflare Dashboard** → Workers → `inkdown-api` → Delete
2. If there's a GitHub integration auto-deploying to CF Workers, disconnect it
3. Remove any DNS records pointing to CF Workers

---

## Verification Checklist

### Build & Types
- [ ] `pnpm install` succeeds (lockfile updated after removing wrangler)
- [ ] `pnpm build` succeeds
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test:run` passes

### Dead Code Removal
- [ ] `grep -r "wrangler\|worker\.ts" apps/api/` — zero results
- [ ] `grep -r "VITE_API_BASE" apps/web/` — zero results
- [ ] `apps/api/src/worker.ts` does not exist
- [ ] `apps/api/wrangler.toml` does not exist

### Local Dev
- [ ] `pnpm dev` starts both web (:5173) and api (:3001)
- [ ] Secretary chat works on localhost
- [ ] Other AI features work on localhost

### Production
- [ ] `VITE_API_URL=https://api.noteshell.io` set in Vercel
- [ ] Vercel rebuild triggered (with build cache disabled)
- [ ] `curl https://api.noteshell.io/health` returns `{"status":"ok"}`
- [ ] Secretary chat works on app.noteshell.io
- [ ] CORS preflight from app.noteshell.io succeeds

### Model Fallback
- [ ] `isTransientError()` utility exists and exported
- [ ] Secretary agent has fallback (already done)
- [ ] ChatAgent has fallback
- [ ] NoteAgent has fallback
- [ ] PlannerAgent has fallback
- [ ] EditorDeepAgent has fallback
- [ ] ResearchAgent has fallback

---

## Implementation Order

| Step | Phase | Time Est. | Risk |
|------|-------|-----------|------|
| 1 | Delete CF Workers files | 5 min | None |
| 2 | Unify API URL construction | 15 min | Low — test with `pnpm dev` |
| 3 | Add shared fallback utilities | 10 min | None |
| 4a | ChatAgent fallback | 15 min | Low |
| 4b | NoteAgent fallback | 15 min | Low |
| 4c | PlannerAgent fallback | 10 min | Low |
| 4d | EditorDeepAgent fallback | 15 min | Low |
| 4e | ResearchAgent fallback | 20 min | Medium — most call sites |
| 5 | Documentation | 10 min | None |
| 6 | Set Vercel env var + rebuild | 5 min | **Manual — user must do** |
| 7 | Decommission CF Workers | 5 min | **Manual — user must do** |

**Total code work:** ~2 hours. Steps 6-7 are manual by the user.
