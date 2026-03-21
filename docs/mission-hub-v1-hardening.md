# Mission Hub V1 Hardening Note

## Current Build (Before Hardening)

- Mission entities (`missions`, `mission_steps`, `mission_handoffs`, `mission_approvals`, `mission_run_locks`) exist.
- Mission Hub UI routes and stores exist.
- Shared context bus (`user_context_entries`, `user_soul`) is integrated for semantic memory.
- Core orchestration flow exists but continuity and autonomous execution needed hardening.

## Hardened Target Flow (V1)

1. `POST /api/missions/start` creates mission rows and immediately launches a background runner.
2. Mission runner executes stages with one active step at a time under DB lock.
3. All transitions append durable `mission_events` with monotonic per-mission `seq`.
4. `GET /api/missions/:id/state` hydrates deterministic state plus `lastEventSeq`.
5. `GET /api/missions/:id/stream?afterSeq=n` replays from durable events, then tails new events (observer only).
6. High-impact writes are approval-gated; approve/reject emits `approval-resolved`.
7. `POST /api/missions/:id/resume` resumes eligible blocked/pending runs.
8. Each completed stage writes both deterministic mission state and a shared-context summary entry.

## Safety and Source of Truth

- Mission execution truth: mission tables + mission event log.
- Shared context bus role: prompt enrichment and cross-agent semantic memory.
- Shared context bus is **not** used as execution queue or pending-action ledger.

## Rollout

- Mission Hub V1 is controlled by `MISSION_HUB_V1` (API) and `VITE_MISSION_HUB_V1` (web).
- Default policy: enabled in non-production, disabled in production until internal rollout gates are met.
