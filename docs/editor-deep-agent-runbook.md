# Editor Deep Agent Runbook

## Overview

This runbook documents the normal note editor AI migration to the DeepAgents runtime.

- Route: `POST /api/agent/secretary`
- Runtime selector:
  - Legacy: `EditorAgent` (+ existing compound `InkdownDeepAgent` behavior)
  - Deep: `EditorDeepAgent` (default runtime)

## Runtime Controls

Environment flags:

- `EDITOR_DEEP_AGENT_ENABLED`:
  - `true`/`1` keeps deep runtime enabled (default behavior).
  - `false` disables deep globally (except allowlisted users or explicit runtime override).
- `EDITOR_DEEP_AGENT_USER_ALLOWLIST`:
  - Optional comma-separated user IDs for controlled rollout/rollback gates.
- `EDITOR_DEEP_AGENT_KILL_SWITCH`:
  - `true`/`1` forces legacy runtime for all requests.
- `EDITOR_DEEP_AGENT_HISTORY_WINDOW_TURNS`:
  - Number of recent turns replayed into each deep run (default: `12`).

Request override:

- `runtime: "legacy"` forces legacy runtime for that request.
- `runtime: "editor-deep"` requests deep runtime (still subject to kill switch).

## Stream Event Contract

Deep editor runtime emits these SSE payloads (`data` JSON with `type` + `data`):

- `assistant-start`
- `assistant-delta`
- `assistant-final`
- `tool-call`
- `tool-result`
- `thinking`
- `clarification-requested`
- `error`
- `done`

Legacy editor runtime still emits existing events (for backward compatibility):

- `text-delta`, `finish`, `clarification-request`, `edit-proposal`, `artifact`, etc.

Frontend parser (`apps/web/src/services/ai.service.ts`) supports both schemas.

## Persistence Model

Migrations:

- `supabase/migrations/015_editor_deep_agent.sql`
- `supabase/migrations/016_editor_deep_memory_scope.sql`

Tables:

- `editor_threads`: top-level conversation threads
- `editor_messages`: user/assistant messages with `tool_calls` and `tool_results`
- `editor_thread_state`: persisted deep runtime state + editor context snapshot + `last_message_at` + `last_note_id` + `rolling_summary`
- `editor_memories`: scoped long-term memory (`scope_type`, `scope_id`, `importance`, `last_used_at`, `source_thread_id`)

## Failure Handling

1. Missing note context:
   - Tools emit `clarification-requested`.
   - User receives prompt to open/select note.
2. Empty model output:
   - `EditorDeepStreamNormalizer.finalize()` emits `assistant-final` fallback before `done`.
   - Metrics counter increments: `editor_agent_empty_response_total`.
3. Tool failures:
   - Stream still completes with assistant fallback text.
   - Metrics counter increments: `editor_agent_tool_error_total`.
4. Request crash:
   - API sends `error` event.
   - Thread status is updated to `error`.
   - Error assistant message is persisted for continuity.

## Observability

Current structured logging in `apps/api/src/routes/agent.ts` emits:

- `metric_editor_agent_latency_ms`
- `metric_editor_agent_empty_response_total`
- `metric_editor_agent_tool_call_total`
- `metric_editor_agent_tool_error_total`
- `threadId`, `runtime`, `userId`

## Rollback Procedure

Immediate rollback:

1. Set `EDITOR_DEEP_AGENT_KILL_SWITCH=true`.
2. Redeploy API.
3. Verify new requests return legacy stream events (`text-delta`, `finish`).

Selective rollout fallback:

1. Set `EDITOR_DEEP_AGENT_ENABLED=false`.
2. Use `EDITOR_DEEP_AGENT_USER_ALLOWLIST` for internal test users only.

## Smoke Checklist

After deploy, run:

1. Ask: `what's this note about` with an open note.
2. Confirm at least one assistant text event arrives before completion.
3. Ask: `add a paragraph about X`.
4. Ask: `remove paragraph 2`.
5. Ask: `create an artifact from this note`.
6. Confirm no generic empty fallback appears in normal operation.
