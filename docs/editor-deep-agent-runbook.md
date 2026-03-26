# Editor Deep Agent Runbook

## Overview

The EditorDeepAgent is the sole editor AI runtime. It handles all note-editing AI requests via a `ToolLoopAgent` pattern with 12 tools + stream adapter.

- Route: `POST /api/agent/secretary`
- Compound requests detected by `isCompoundRequest()` are routed to EditorDeepAgent
- Simple requests go through SecretaryAgent's intent classification

## Stream Event Contract

EditorDeepAgent emits these SSE payloads (`data` JSON with `type` + `data`):

- `assistant-start`
- `assistant-delta`
- `assistant-final`
- `tool-call`
- `tool-result`
- `thinking`
- `clarification-requested`
- `error`
- `done`

Frontend parser (`apps/web/src/services/ai.service.ts`) handles both DeepAgent and Secretary stream schemas.

## Persistence Model

Tables:

- `editor_threads`: top-level conversation threads
- `editor_messages`: user/assistant messages with `tool_calls` and `tool_results`
- `editor_thread_state`: persisted runtime state + editor context snapshot + `last_message_at` + `last_note_id` + `rolling_summary`
- `editor_memories`: scoped long-term memory (`scope_type`, `scope_id`, `importance`, `last_used_at`, `source_thread_id`)

## Failure Handling

1. **Missing note context:** Tools emit `clarification-requested`. User receives prompt to open/select note.
2. **Empty model output:** `EditorDeepStreamNormalizer.finalize()` emits `assistant-final` fallback before `done`.
3. **Tool failures:** Stream still completes with assistant fallback text.
4. **Request crash:** API sends `error` event. Thread status updated to `error`. Error message persisted for continuity.

## Smoke Checklist

After deploy, run:

1. Ask: `what's this note about` with an open note.
2. Confirm at least one assistant text event arrives before completion.
3. Ask: `add a paragraph about X`.
4. Ask: `remove paragraph 2`.
5. Ask: `create an artifact from this note`.
6. Confirm no generic empty fallback appears in normal operation.
