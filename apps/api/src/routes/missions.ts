import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { TRIGGER_SOURCES, WORKFLOW_KEYS } from '@inkdown/shared/types'
import { authMiddleware, requireAuth } from '../middleware/auth'

const missions = new Hono()

missions.use('*', authMiddleware)

const StartMissionSchema = z.object({
  goal: z.string().min(3).max(500),
  mode: z.enum(['suggest_approve', 'guardrailed_auto', 'full_auto']).optional(),
  constraints: z.record(z.unknown()).optional(),
  workflowKey: z.enum(WORKFLOW_KEYS).optional(),
  triggerSource: z.enum(TRIGGER_SOURCES).optional(),
})

const ResolveApprovalSchema = z.object({
  note: z.string().max(1000).optional(),
})

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

missions.post('/start', zValidator('json', StartMissionSchema), async (c) => {
  const auth = requireAuth(c)
  const body = c.req.valid('json')

  const { MissionOrchestratorService, SharedContextService } = await import('@inkdown/ai/services')
  const service = new MissionOrchestratorService({
    supabase: auth.supabase,
    userId: auth.userId,
    sharedContextService: new SharedContextService(auth.supabase, auth.userId),
  })

  const missionId = await service.startMission({
    goal: body.goal,
    mode: body.mode,
    constraints: body.constraints,
    workflowKey: body.workflowKey,
    triggerSource: body.triggerSource,
  })
  service.runMissionInBackground(missionId)

  return c.json({ missionId })
})

missions.get('/:missionId/state', async (c) => {
  const auth = requireAuth(c)
  const missionId = c.req.param('missionId')

  const { MissionOrchestratorService, SharedContextService } = await import('@inkdown/ai/services')
  const service = new MissionOrchestratorService({
    supabase: auth.supabase,
    userId: auth.userId,
    sharedContextService: new SharedContextService(auth.supabase, auth.userId),
  })

  const state = await service.getMissionState(missionId)
  return c.json(state)
})

missions.post(
  '/:missionId/approvals/:approvalId/approve',
  zValidator('json', ResolveApprovalSchema),
  async (c) => {
    const auth = requireAuth(c)
    const missionId = c.req.param('missionId')
    const approvalId = c.req.param('approvalId')
    const body = c.req.valid('json')

    const { MissionOrchestratorService, SharedContextService } = await import('@inkdown/ai/services')
    const service = new MissionOrchestratorService({
      supabase: auth.supabase,
      userId: auth.userId,
      sharedContextService: new SharedContextService(auth.supabase, auth.userId),
    })

    const approval = await service.resolveApproval({
      missionId,
      approvalId,
      decision: 'approved',
      note: body.note,
    })
    return c.json({ approval })
  }
)

missions.post(
  '/:missionId/approvals/:approvalId/reject',
  zValidator('json', ResolveApprovalSchema),
  async (c) => {
    const auth = requireAuth(c)
    const missionId = c.req.param('missionId')
    const approvalId = c.req.param('approvalId')
    const body = c.req.valid('json')

    const { MissionOrchestratorService, SharedContextService } = await import('@inkdown/ai/services')
    const service = new MissionOrchestratorService({
      supabase: auth.supabase,
      userId: auth.userId,
      sharedContextService: new SharedContextService(auth.supabase, auth.userId),
    })

    const approval = await service.resolveApproval({
      missionId,
      approvalId,
      decision: 'rejected',
      note: body.note,
    })
    return c.json({ approval })
  }
)

missions.post('/:missionId/resume', async (c) => {
  const auth = requireAuth(c)
  const missionId = c.req.param('missionId')

  const { MissionOrchestratorService, SharedContextService } = await import('@inkdown/ai/services')
  const service = new MissionOrchestratorService({
    supabase: auth.supabase,
    userId: auth.userId,
    sharedContextService: new SharedContextService(auth.supabase, auth.userId),
  })

  const accepted = await service.resumeMission(missionId)
  return c.json({ accepted })
})

missions.get('/:missionId/stream', async (c) => {
  const auth = requireAuth(c)
  const missionId = c.req.param('missionId')
  const rawAfterSeq = c.req.query('afterSeq')
  const parsedAfterSeq = Number.parseInt(rawAfterSeq ?? '0', 10)
  const afterSeq = Number.isFinite(parsedAfterSeq) && parsedAfterSeq > 0 ? parsedAfterSeq : 0

  const { MissionOrchestratorService, SharedContextService } = await import('@inkdown/ai/services')
  const service = new MissionOrchestratorService({
    supabase: auth.supabase,
    userId: auth.userId,
    sharedContextService: new SharedContextService(auth.supabase, auth.userId),
  })

  return streamSSE(c, async (stream) => {
    let clientConnected = true
    let cursor = afterSeq

    const heartbeatInterval = setInterval(async () => {
      if (!clientConnected) return
      try {
        await stream.writeSSE({ event: 'heartbeat', data: '' })
      } catch {
        clientConnected = false
      }
    }, 15_000)

    try {
      while (clientConnected) {
        const events = await service.getMissionEvents(missionId, cursor, 500)
        if (events.length === 0) {
          await wait(900)
          continue
        }

        for (const event of events) {
          if (!clientConnected) break
          try {
            await stream.writeSSE({
              id: String(event.seq),
              event: event.type,
              data: JSON.stringify(event),
            })
            cursor = Math.max(cursor, event.seq)
          } catch {
            clientConnected = false
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (clientConnected) {
        await stream.writeSSE({
          event: 'mission-error',
          data: JSON.stringify({
            seq: cursor,
            type: 'mission-error',
            missionId,
            agent: 'system',
            data: { message },
            ts: new Date().toISOString(),
          }),
        })
      }
    } finally {
      clearInterval(heartbeatInterval)
    }
  })
})

export default missions
