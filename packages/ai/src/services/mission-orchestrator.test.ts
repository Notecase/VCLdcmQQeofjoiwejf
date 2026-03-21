import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  buildDailyPlanMarkdown,
  createDefaultMissionSteps,
  createMissionApprovalForStage,
  isTransientMissionError,
  toMissionEvent,
  MissionOrchestratorService,
  MISSION_STAGE_ORDER,
} from './mission-orchestrator'
import type { SupabaseClient } from '@supabase/supabase-js'

describe('createDefaultMissionSteps', () => {
  it('returns the canonical 4-stage sequence in waiting state', () => {
    const steps = createDefaultMissionSteps()
    expect(steps.map((s) => s.stage)).toEqual([
      'research',
      'course_draft',
      'daily_plan',
      'note_pack',
    ])
    expect(steps.every((s) => s.status === 'waiting')).toBe(true)
  })
})

describe('createMissionApprovalForStage', () => {
  it('creates a high-risk course approval gate', () => {
    const approval = createMissionApprovalForStage({
      stage: 'course_draft',
      goal: 'Master AWS in 8 weeks',
      handoffPayload: { title: 'AWS Mastery Sprint' },
    })
    expect(approval?.actionType).toBe('create_course_entities')
    expect(approval?.riskLevel).toBe('high')
  })

  it('returns null for non-gated stage', () => {
    const approval = createMissionApprovalForStage({
      stage: 'research',
      goal: 'Master AWS in 8 weeks',
      handoffPayload: {},
    })
    expect(approval).toBeNull()
  })
})

describe('buildDailyPlanMarkdown', () => {
  it('renders a secretary-compatible markdown plan skeleton', () => {
    const markdown = buildDailyPlanMarkdown('Master AWS in 8 weeks')
    expect(markdown).toContain("# Today's Plan")
    expect(markdown).toContain('## Schedule')
    expect(markdown).toContain('- [ ] 09:00')
  })
})

describe('isTransientMissionError', () => {
  it('classifies timeout/rate limit/server errors as transient', () => {
    expect(isTransientMissionError(new Error('Request timeout'))).toBe(true)
    expect(isTransientMissionError(new Error('429 rate limit'))).toBe(true)
    expect(isTransientMissionError(new Error('503 upstream unavailable'))).toBe(true)
  })

  it('classifies semantic validation failures as non-transient', () => {
    expect(isTransientMissionError(new Error('validation failed: goal is empty'))).toBe(false)
  })
})

describe('toMissionEvent', () => {
  it('creates a normalized event envelope with timestamp', () => {
    const event = toMissionEvent({
      type: 'step-start',
      missionId: 'mission-1',
      stepId: 'step-1',
      agent: 'system',
      data: { stage: 'research' },
    })

    expect(event.type).toBe('step-start')
    expect(event.seq).toBe(0)
    expect(event.missionId).toBe('mission-1')
    expect(event.stepId).toBe('step-1')
    expect(event.agent).toBe('system')
    expect(typeof event.ts).toBe('string')
    expect(event.data).toEqual({ stage: 'research' })
  })
})

// =============================================================================
// Integration tests with mock Supabase
// =============================================================================

function createMockSupabase() {
  const missions = new Map<string, Record<string, unknown>>()
  const steps = new Map<string, Record<string, unknown>[]>()
  const events = new Map<string, Record<string, unknown>[]>()
  const handoffs = new Map<string, Record<string, unknown>[]>()
  const approvals = new Map<string, Record<string, unknown>[]>()
  const locks = new Map<string, Record<string, unknown>>()

  function chainableQuery(data: unknown = null, error: unknown = null) {
    const chain = {
      select: () => chain,
      insert: () => chain,
      update: () => chain,
      upsert: () => chain,
      delete: () => chain,
      eq: () => chain,
      gt: () => chain,
      in: () => chain,
      order: () => chain,
      limit: () => chain,
      single: () => Promise.resolve({ data, error }),
      maybeSingle: () => Promise.resolve({ data, error }),
      then: (resolve: (v: { data: unknown; error: unknown }) => void) =>
        Promise.resolve({ data: Array.isArray(data) ? data : data ? [data] : [], error }).then(resolve),
    }
    return chain
  }

  const mock = {
    from: vi.fn((table: string) => {
      return {
        insert: vi.fn((row: Record<string, unknown> | Record<string, unknown>[]) => {
          if (table === 'missions') {
            const r = Array.isArray(row) ? row[0] : row
            missions.set(r.id as string, r)
          }
          if (table === 'mission_steps') {
            const rows = Array.isArray(row) ? row : [row]
            const mId = rows[0]?.mission_id as string
            steps.set(mId, rows.map((r, i) => ({ ...r, id: `step-${i}`, created_at: new Date().toISOString() })))
          }
          if (table === 'mission_events') {
            const r = Array.isArray(row) ? row[0] : row
            const mId = r.mission_id as string
            const existing = events.get(mId) || []
            existing.push(r)
            events.set(mId, existing)
          }
          if (table === 'mission_handoffs') {
            const r = Array.isArray(row) ? row[0] : row
            const mId = r.mission_id as string
            const existing = handoffs.get(mId) || []
            const newRow = { ...r, id: `handoff-${existing.length}`, created_at: new Date().toISOString() }
            existing.push(newRow)
            handoffs.set(mId, existing)
            return chainableQuery(newRow)
          }
          if (table === 'mission_approvals') {
            const r = Array.isArray(row) ? row[0] : row
            const mId = r.mission_id as string
            const existing = approvals.get(mId) || []
            const newRow = {
              ...r,
              id: `approval-${existing.length}`,
              created_at: new Date().toISOString(),
              expires_at: null,
              resolved_at: null,
              resolution_note: null,
            }
            existing.push(newRow)
            approvals.set(mId, existing)
            return chainableQuery(newRow)
          }
          return chainableQuery(null)
        }),
        select: vi.fn(() => {
          return {
            eq: vi.fn((_col: string, _val: string) => {
              return {
                eq: vi.fn(() => ({
                  single: () => {
                    if (table === 'missions') {
                      const m = [...missions.values()][0]
                      return Promise.resolve({ data: m || null, error: m ? null : { message: 'Not found' } })
                    }
                    return Promise.resolve({ data: null, error: null })
                  },
                  order: () => ({
                    limit: () => Promise.resolve({ data: [], error: null }),
                    then: (r: (v: { data: unknown[]; error: null }) => void) =>
                      Promise.resolve({ data: [], error: null }).then(r),
                  }),
                  then: (r: (v: { data: unknown[]; error: null }) => void) =>
                    Promise.resolve({ data: [], error: null }).then(r),
                })),
                order: () => ({
                  limit: () => Promise.resolve({ data: [], error: null }),
                  then: (r: (v: { data: unknown[]; error: null }) => void) =>
                    Promise.resolve({ data: [], error: null }).then(r),
                }),
                single: () => {
                  if (table === 'missions') {
                    const m = [...missions.values()][0]
                    return Promise.resolve({ data: m || null, error: m ? null : { message: 'Not found' } })
                  }
                  return Promise.resolve({ data: null, error: null })
                },
                then: (r: (v: { data: unknown[]; error: null }) => void) =>
                  Promise.resolve({ data: [], error: null }).then(r),
              }
            }),
            then: (r: (v: { data: unknown[]; error: null }) => void) =>
              Promise.resolve({ data: [], error: null }).then(r),
          }
        }),
        update: vi.fn(() => chainableQuery(null)),
        upsert: vi.fn(() => chainableQuery(null)),
        delete: vi.fn(() => chainableQuery(null)),
      }
    }),
    rpc: vi.fn(() => Promise.resolve({ data: 1, error: null })),
    _missions: missions,
    _steps: steps,
    _events: events,
    _locks: locks,
  }

  return mock as unknown as SupabaseClient & typeof mock
}

describe('MissionOrchestratorService', () => {
  let supabase: ReturnType<typeof createMockSupabase>

  beforeEach(() => {
    supabase = createMockSupabase()
  })

  describe('startMission', () => {
    it('creates a mission and 4 steps', async () => {
      const orchestrator = new MissionOrchestratorService({
        supabase: supabase as unknown as SupabaseClient,
        userId: 'user-1',
      })

      const missionId = await orchestrator.startMission({
        goal: 'Master TypeScript in 4 weeks',
      })

      expect(missionId).toBeTruthy()
      expect(typeof missionId).toBe('string')
      // Should have called insert on missions and mission_steps
      expect(supabase.from).toHaveBeenCalledWith('missions')
      expect(supabase.from).toHaveBeenCalledWith('mission_steps')
    })

    it('uses default mode suggest_approve', async () => {
      const orchestrator = new MissionOrchestratorService({
        supabase: supabase as unknown as SupabaseClient,
        userId: 'user-1',
      })

      await orchestrator.startMission({ goal: 'Learn React' })

      // The mission should have been inserted with mode 'suggest_approve'
      const missionInsert = supabase.from('missions').insert as ReturnType<typeof vi.fn>
      const insertCalls = missionInsert.mock.calls
      expect(insertCalls.length).toBeGreaterThan(0)
      expect(insertCalls[0][0].mode).toBe('suggest_approve')
    })
  })

  describe('MISSION_STAGE_ORDER', () => {
    it('has exactly 4 stages in the correct order', () => {
      expect(MISSION_STAGE_ORDER).toEqual(['research', 'course_draft', 'daily_plan', 'note_pack'])
    })
  })

  describe('approval gate logic', () => {
    it('creates approval gates for course_draft, daily_plan, and note_pack', () => {
      for (const stage of ['course_draft', 'daily_plan', 'note_pack'] as const) {
        const approval = createMissionApprovalForStage({
          stage,
          goal: 'Test goal',
          handoffPayload: { test: true },
        })
        expect(approval).not.toBeNull()
        expect(approval!.riskLevel).toBe('high')
      }
    })

    it('does not create approval gate for research stage', () => {
      const approval = createMissionApprovalForStage({
        stage: 'research',
        goal: 'Test goal',
        handoffPayload: {},
      })
      expect(approval).toBeNull()
    })
  })

  describe('transient error classification', () => {
    it('identifies rate limit errors as transient', () => {
      expect(isTransientMissionError(new Error('429 Too Many Requests'))).toBe(true)
      expect(isTransientMissionError(new Error('rate limit exceeded'))).toBe(true)
    })

    it('identifies 503 as transient', () => {
      expect(isTransientMissionError(new Error('503 Service Unavailable'))).toBe(true)
    })

    it('identifies timeout as transient', () => {
      expect(isTransientMissionError(new Error('Request timeout after 30s'))).toBe(true)
    })

    it('identifies validation errors as non-transient', () => {
      expect(isTransientMissionError(new Error('Invalid goal format'))).toBe(false)
      expect(isTransientMissionError(new Error('Missing required field'))).toBe(false)
    })

    it('handles non-Error objects', () => {
      expect(isTransientMissionError('timeout')).toBe(true)
      expect(isTransientMissionError('bad input')).toBe(false)
    })
  })
})
