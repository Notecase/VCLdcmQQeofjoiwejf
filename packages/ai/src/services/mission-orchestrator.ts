import type { SupabaseClient } from '@supabase/supabase-js'
import {
  DEFAULT_WORKFLOW_KEY,
  WORKFLOW_KEYS,
  WORKFLOW_STAGE_MAP,
} from '@inkdown/shared/types'
import type {
  Mission,
  MissionApproval,
  ContextEntryType,
  MissionEventEnvelope,
  MissionHandoff,
  MissionMode,
  MissionStage,
  MissionStateResponse,
  MissionStatus,
  MissionStep,
  MissionStepStatus,
  TriggerSource,
  WorkflowKey,
} from '@inkdown/shared/types'
import type { SharedContextService } from './shared-context.service'
import {
  type MissionAdapterDeps,
  runResearchAdapter,
  runCourseOutlineAdapter,
  applyCourseEntities as applyCourseEntitiesAdapter,
  runDailyPlanAdapter,
  applyDailyPlanPatch as applyDailyPlanPatchAdapter,
  runNotePackAdapter,
  applyNotePack as applyNotePackAdapter,
} from './mission-adapters'

export const MISSION_STAGE_ORDER: MissionStage[] = [
  'research',
  'course_draft',
  'daily_plan',
  'note_pack',
]

const runnerRegistry = new Map<string, Promise<void>>()

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface MissionStepTemplate {
  stage: MissionStage
  status: MissionStepStatus
  retryCount: number
}

interface MissionApprovalTemplate {
  actionType: string
  title: string
  details: string
  payload: Record<string, unknown>
  riskLevel: 'low' | 'medium' | 'high'
}

interface MissionResearchAdapter {
  buildBrief(input: {
    goal: string
    relevantContext: string
  }): Promise<{
    summary: string
    payload: Record<string, unknown>
  }>
}

interface MissionCourseAdapter {
  buildOutline(input: {
    goal: string
    researchBrief: Record<string, unknown> | null
    relevantContext: string
  }): Promise<{
    summary: string
    payload: Record<string, unknown>
  }>
  apply(payload: Record<string, unknown>): Promise<Record<string, unknown>>
}

interface MissionSecretaryAdapter {
  buildPlanPatch(input: {
    goal: string
    courseOutline: Record<string, unknown> | null
    relevantContext: string
  }): Promise<{
    summary: string
    payload: Record<string, unknown>
  }>
  apply(payload: Record<string, unknown>): Promise<Record<string, unknown>>
}

interface MissionEditorAdapter {
  buildNotePack(input: {
    goal: string
    dailyPlanPatch: Record<string, unknown> | null
    relevantContext: string
    workflowKey?: WorkflowKey
    sourceTaskTitle?: string
    sourcePlanTitle?: string
    sourceTopic?: string
    sourceProjectId?: string
    sourcePlanId?: string
  }): Promise<{
    summary: string
    payload: Record<string, unknown>
  }>
  apply(payload: Record<string, unknown>): Promise<Record<string, unknown>>
}

interface MissionAdapters {
  research: MissionResearchAdapter
  course: MissionCourseAdapter
  secretary: MissionSecretaryAdapter
  editor: MissionEditorAdapter
}

/** Per-stage lock TTL defaults (ms). Long-running stages get more time. */
const STAGE_LOCK_TTL_MS: Record<MissionStage, number> = {
  research: 120_000,
  course_draft: 300_000,
  daily_plan: 120_000,
  note_pack: 120_000,
}

/** How often to refresh the lock during a long-running stage (ms). */
const LOCK_HEARTBEAT_INTERVAL_MS = 30_000

interface MissionOrchestratorConfig {
  supabase: SupabaseClient
  userId: string
  openaiApiKey?: string
  sharedContextService?: SharedContextService
  lockTtlMs?: number
  stageLockTtlMs?: Partial<Record<MissionStage, number>>
  now?: () => Date
  adapters?: Partial<MissionAdapters>
}

interface MissionDbRow {
  id: string
  user_id: string
  goal: string
  mode: MissionMode
  status: MissionStatus
  current_stage: MissionStage | null
  constraints: Record<string, unknown> | null
  last_error: string | null
  created_at: string
  updated_at: string
}

interface MissionStepDbRow {
  id: string
  mission_id: string
  stage: MissionStage
  status: MissionStepStatus
  retry_count: number
  input_ref: Record<string, unknown> | null
  output_ref: Record<string, unknown> | null
  error_message: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

interface MissionHandoffDbRow {
  id: string
  mission_id: string
  step_id: string | null
  type: MissionHandoff['type']
  summary: string
  payload: Record<string, unknown> | null
  created_at: string
}

interface MissionApprovalDbRow {
  id: string
  mission_id: string
  step_id: string | null
  action_type: string
  title: string
  details: string
  payload: Record<string, unknown> | null
  risk_level: MissionApproval['riskLevel']
  status: MissionApproval['status']
  expires_at: string | null
  resolved_at: string | null
  resolution_note: string | null
  created_at: string
}

interface MissionEventDbRow {
  mission_id: string
  step_id: string | null
  seq: number
  type: MissionEventEnvelope['type']
  agent: MissionEventEnvelope['agent']
  data: Record<string, unknown>
  ts: string
}

export interface StartMissionInput {
  goal: string
  mode?: MissionMode
  constraints?: Record<string, unknown>
  workflowKey?: WorkflowKey
  triggerSource?: TriggerSource
}

export interface ResolveApprovalInput {
  missionId: string
  approvalId: string
  decision: 'approved' | 'rejected'
  note?: string
}

export function createDefaultMissionSteps(): MissionStepTemplate[] {
  return MISSION_STAGE_ORDER.map((stage) => ({
    stage,
    status: 'waiting',
    retryCount: 0,
  }))
}

function isWorkflowKey(value: unknown): value is WorkflowKey {
  return typeof value === 'string' && WORKFLOW_KEYS.includes(value as WorkflowKey)
}

function resolveWorkflowKey(input?: StartMissionInput | Record<string, unknown>): WorkflowKey {
  const explicit = input && 'workflowKey' in input ? input.workflowKey : undefined
  if (isWorkflowKey(explicit)) return explicit

  const constraintsValue =
    input && 'constraints' in input && typeof input.constraints === 'object'
      ? (input.constraints as Record<string, unknown>)?.workflowKey
      : (input as Record<string, unknown> | undefined)?.workflowKey

  return isWorkflowKey(constraintsValue) ? constraintsValue : DEFAULT_WORKFLOW_KEY
}

function resolveTriggerSource(input?: StartMissionInput | Record<string, unknown>): TriggerSource {
  const explicit = input && 'triggerSource' in input ? input.triggerSource : undefined
  if (typeof explicit === 'string') return explicit as TriggerSource

  const constraintsValue =
    input && 'constraints' in input && typeof input.constraints === 'object'
      ? (input.constraints as Record<string, unknown>)?.triggerSource
      : (input as Record<string, unknown> | undefined)?.triggerSource

  return typeof constraintsValue === 'string' ? (constraintsValue as TriggerSource) : 'user'
}

export function createMissionStepsForWorkflow(
  workflowKey: WorkflowKey = DEFAULT_WORKFLOW_KEY
): MissionStepTemplate[] {
  const stages = WORKFLOW_STAGE_MAP[workflowKey] || WORKFLOW_STAGE_MAP[DEFAULT_WORKFLOW_KEY]
  return stages.map((stage) => ({
    stage,
    status: 'waiting',
    retryCount: 0,
  }))
}

export function buildDailyPlanMarkdown(goal: string): string {
  const today = new Date().toISOString().slice(0, 10)
  return `# Today's Plan

Date: ${today}
Mission Goal: ${goal}

## Schedule
- [ ] 09:00 Deep work sprint (60min)
- [ ] 10:15 Practice + recall (45min)
- [ ] 14:00 Build + apply (60min)
- [ ] 15:30 Review and notes (45min)
`
}

export function createMissionApprovalForStage(input: {
  stage: MissionStage
  goal: string
  handoffPayload: Record<string, unknown>
}): MissionApprovalTemplate | null {
  if (input.stage === 'course_draft') {
    return {
      actionType: 'create_course_entities',
      title: 'Approve Course Draft',
      details: `Create/update course entities for mission goal: ${input.goal}`,
      payload: input.handoffPayload,
      riskLevel: 'high',
    }
  }

  if (input.stage === 'daily_plan') {
    return {
      actionType: 'change_daily_plan',
      title: 'Approve Daily Plan Patch',
      details: `Update Today.md based on mission goal: ${input.goal}`,
      payload: input.handoffPayload,
      riskLevel: 'high',
    }
  }

  if (input.stage === 'note_pack') {
    return {
      actionType: 'write_notes',
      title: 'Approve Note Pack Creation',
      details: `Create mission notes for goal: ${input.goal}`,
      payload: input.handoffPayload,
      riskLevel: 'high',
    }
  }

  return null
}

export function isTransientMissionError(error: unknown): boolean {
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase()
  return (
    msg.includes('timeout') ||
    msg.includes('rate limit') ||
    msg.includes('429') ||
    msg.includes('503') ||
    msg.includes('temporar')
  )
}

export function toMissionEvent<T = unknown>(input: {
  seq?: number
  type: MissionEventEnvelope<T>['type']
  missionId: string
  stepId?: string
  agent: MissionEventEnvelope<T>['agent']
  data: T
}): MissionEventEnvelope<T> {
  return {
    seq: input.seq ?? 0,
    type: input.type,
    missionId: input.missionId,
    stepId: input.stepId,
    agent: input.agent,
    data: input.data,
    ts: new Date().toISOString(),
  }
}

export class MissionOrchestratorService {
  private supabase: SupabaseClient
  private userId: string
  private openaiApiKey: string
  private sharedContextService?: SharedContextService
  private lockTtlMs: number
  private stageLockTtlMs: Record<MissionStage, number>
  private now: () => Date
  private maxRetries = 2
  private adapters: MissionAdapters
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private activeMissionContext:
    | {
        missionId: string
        stepId: string
        stage: MissionStage
        workflowKey?: WorkflowKey
        triggerSource?: TriggerSource
      }
    | undefined

  constructor(config: MissionOrchestratorConfig) {
    this.supabase = config.supabase
    this.userId = config.userId
    this.openaiApiKey = config.openaiApiKey || process.env.OPENAI_API_KEY || ''
    this.sharedContextService = config.sharedContextService
    this.lockTtlMs = config.lockTtlMs ?? 120_000
    this.stageLockTtlMs = {
      ...STAGE_LOCK_TTL_MS,
      ...(config.stageLockTtlMs || {}),
    }
    this.now = config.now ?? (() => new Date())
    this.adapters = {
      ...this.createDefaultAdapters(),
      ...(config.adapters || {}),
    } as MissionAdapters
  }

  /** Resolve the lock TTL for a given stage (falls back to global default). */
  private getLockTtlForStage(stage: MissionStage): number {
    return this.stageLockTtlMs[stage] ?? this.lockTtlMs
  }

  /** Start a heartbeat that refreshes the run lock periodically. */
  private startLockHeartbeat(missionId: string, lockToken: string, stage: MissionStage): void {
    this.stopLockHeartbeat()
    this.heartbeatTimer = setInterval(async () => {
      try {
        await this.refreshRunLock(missionId, lockToken, stage)
      } catch {
        // Best-effort — if refresh fails the lock will eventually expire
      }
    }, LOCK_HEARTBEAT_INTERVAL_MS)
  }

  /** Stop the lock heartbeat. */
  private stopLockHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  /** Extend the run lock expiry for the current stage. */
  private async refreshRunLock(missionId: string, lockToken: string, stage: MissionStage): Promise<void> {
    const ttl = this.getLockTtlForStage(stage)
    const expiresAt = new Date(this.now().getTime() + ttl).toISOString()
    await this.supabase
      .from('mission_run_locks')
      .update({ expires_at: expiresAt })
      .eq('mission_id', missionId)
      .eq('lock_token', lockToken)
  }

  async startMission(input: StartMissionInput): Promise<string> {
    const missionId = crypto.randomUUID()
    const mode = input.mode ?? 'suggest_approve'
    const workflowKey = resolveWorkflowKey(input)
    const triggerSource = resolveTriggerSource(input)
    const constraints = {
      ...(input.constraints ?? {}),
      workflowKey,
      triggerSource,
    }
    const nowIso = this.now().toISOString()

    const { error: missionError } = await this.supabase.from('missions').insert({
      id: missionId,
      user_id: this.userId,
      goal: input.goal,
      mode,
      status: 'pending',
      current_stage: null,
      constraints,
      created_at: nowIso,
      updated_at: nowIso,
    })
    if (missionError) throw missionError

    const steps = createMissionStepsForWorkflow(workflowKey).map((step) => ({
      mission_id: missionId,
      stage: step.stage,
      status: step.status,
      retry_count: step.retryCount,
      input_ref: {},
      output_ref: {},
    }))

    const { error: stepsError } = await this.supabase.from('mission_steps').insert(steps)
    if (stepsError) throw stepsError

    return missionId
  }

  async getMissionState(missionId: string): Promise<MissionStateResponse> {
    const mission = await this.fetchMission(missionId)
    const steps = await this.fetchMissionSteps(missionId)
    const handoffs = await this.fetchMissionHandoffs(missionId)
    const approvals = await this.fetchMissionApprovals(missionId)
    const lastEventSeq = await this.getLastEventSeq(missionId)
    return { mission, steps, handoffs, approvals, lastEventSeq }
  }

  async getMissionEvents(missionId: string, afterSeq = 0, limit = 200): Promise<MissionEventEnvelope[]> {
    await this.fetchMission(missionId)
    return this.fetchMissionEvents(missionId, afterSeq, limit)
  }

  runMissionInBackground(missionId: string): void {
    const registryKey = `${this.userId}:${missionId}`
    if (runnerRegistry.has(registryKey)) return

    const runPromise = this.runMission(missionId)
      .catch((error) => {
        console.error('[MissionHub] Background mission run failed:', {
          missionId,
          userId: this.userId,
          error: error instanceof Error ? error.message : String(error),
        })
      })
      .finally(() => {
        runnerRegistry.delete(registryKey)
      })

    runnerRegistry.set(registryKey, runPromise)
  }

  async resumeMission(missionId: string): Promise<boolean> {
    const mission = await this.fetchMission(missionId)
    if (mission.status === 'completed' || mission.status === 'cancelled') {
      return false
    }
    this.runMissionInBackground(missionId)
    return true
  }

  async resolveApproval(input: ResolveApprovalInput): Promise<MissionApproval> {
    const mission = await this.fetchMission(input.missionId)

    const nowIso = this.now().toISOString()
    const { data, error } = await this.supabase
      .from('mission_approvals')
      .update({
        status: input.decision,
        resolved_at: nowIso,
        resolution_note: input.note || null,
      })
      .eq('id', input.approvalId)
      .eq('mission_id', input.missionId)
      .select('*')
      .single()

    if (error || !data) {
      throw error || new Error('Approval not found')
    }

    if (input.decision === 'rejected') {
      await this.updateMission(input.missionId, {
        status: 'blocked',
        last_error: input.note || 'Approval rejected',
      })
    } else {
      await this.updateMission(input.missionId, {
        status: 'running',
        last_error: null,
      })
    }
    const mappedApproval = this.mapApprovalRow(data as MissionApprovalDbRow)

    await this.appendMissionEvent({
      type: 'approval-resolved',
      missionId: input.missionId,
      stepId: mappedApproval.stepId || undefined,
      agent: 'system',
      data: {
        approvalId: mappedApproval.id,
        decision: input.decision,
        status: mappedApproval.status,
      },
    })

    if (input.decision === 'rejected') {
      if (mappedApproval.stepId) {
        const { error: blockStepError } = await this.supabase
          .from('mission_steps')
          .update({
            status: 'blocked',
            error_message: input.note || 'Approval rejected',
          })
          .eq('id', mappedApproval.stepId)
          .eq('mission_id', input.missionId)

        if (blockStepError) throw blockStepError
      }

      await this.appendMissionEvent({
        type: 'mission-error',
        missionId: input.missionId,
        stepId: mappedApproval.stepId || undefined,
        agent: 'system',
        data: {
          stage: mission.currentStage,
          message: input.note || 'Approval rejected',
        },
      })
    } else {
      this.runMissionInBackground(input.missionId)
    }

    return mappedApproval
  }

  async runMission(missionId: string): Promise<void> {
    const lockToken = crypto.randomUUID()
    const lockAcquired = await this.acquireRunLock(missionId, lockToken)
    if (!lockAcquired) {
      return
    }

    try {
      let mission = await this.fetchMission(missionId)
      let steps = await this.fetchMissionSteps(missionId)
      const lastEventSeq = await this.getLastEventSeq(missionId)

      if (lastEventSeq === 0) {
        await this.appendMissionEvent({
          type: 'mission-start',
          missionId,
          agent: 'mission-orchestrator',
          data: {
            goal: mission.goal,
            mode: mission.mode,
            status: mission.status,
            currentStage: mission.currentStage,
          },
        })
      }

      if (mission.status === 'completed' || mission.status === 'cancelled') {
        await this.appendMissionEvent({
          type: 'mission-complete',
          missionId,
          agent: 'system',
          data: { status: mission.status },
        })
        return
      }

      await this.updateMission(missionId, { status: 'running' })
      mission = await this.fetchMission(missionId)

      for (const stage of MISSION_STAGE_ORDER) {
        const step = steps.find((item) => item.stage === stage)
        if (!step || step.status === 'completed') continue

        await this.setStepInProgress(step.id, missionId, stage)
        this.startLockHeartbeat(missionId, lockToken, stage)
        await this.appendMissionEvent({
          type: 'step-start',
          missionId,
          stepId: step.id,
          agent: 'mission-orchestrator',
          data: { stage },
        })

        try {
          const result = await this.runStageWithRetry(mission, step)

          if (result.kind === 'await_approval') {
            await this.updateMission(missionId, {
              status: 'awaiting_approval',
              current_stage: stage,
            })
            await this.appendMissionEvent({
              type: 'approval-required',
              missionId,
              stepId: step.id,
              agent: 'system',
              data: { approval: result.approval },
            })
            return
          }

          const payloadWithContext = {
            ...result.payload,
            workflowKey: mission.workflowKey,
            triggerSource: mission.triggerSource,
            sourceTaskId: mission.sourceTaskId,
            sourcePlanId: mission.sourcePlanId,
          }

          const handoffRow = await this.createHandoff(missionId, step.id, {
            type: result.handoffType,
            summary: result.summary,
            payload: payloadWithContext,
          })

          // Wrap step completion + event append atomically:
          // If event append fails after step is marked complete, roll back step status.
          await this.completeStepWithEvents(step.id, missionId, stage, handoffRow, {
            ...result,
            payload: payloadWithContext,
          })

          this.stopLockHeartbeat()
          steps = await this.fetchMissionSteps(missionId)
        } catch (error) {
          this.stopLockHeartbeat()
          const message = error instanceof Error ? error.message : String(error)
          await this.failStep(step.id, message)
          await this.updateMission(missionId, {
            status: 'blocked',
            current_stage: stage,
            last_error: message,
          })
          await this.appendMissionEvent({
            type: 'mission-error',
            missionId,
            stepId: step.id,
            agent: 'system',
            data: { stage, message },
          })
          return
        }
      }

      await this.updateMission(missionId, {
        status: 'completed',
        current_stage: MISSION_STAGE_ORDER[MISSION_STAGE_ORDER.length - 1],
        last_error: null,
      })
      await this.appendMissionEvent({
        type: 'mission-complete',
        missionId,
        agent: 'mission-orchestrator',
        data: { status: 'completed' },
      })
    } finally {
      this.stopLockHeartbeat()
      await this.releaseRunLock(missionId, lockToken)
    }
  }

  /** Build adapter deps for the current orchestrator instance + current step. */
  private buildAdapterDeps(missionId?: string, stepId?: string, stage?: MissionStage): MissionAdapterDeps {
    return {
      supabase: this.supabase,
      userId: this.userId,
      openaiApiKey: this.openaiApiKey,
      sharedContextService: this.sharedContextService,
      missionContext:
        missionId && stepId && stage
          ? {
              missionId,
              stepId,
              stage,
              workflowKey: this.activeMissionContext?.workflowKey,
              triggerSource: this.activeMissionContext?.triggerSource,
            }
          : this.activeMissionContext,
    }
  }

  private createDefaultAdapters(): MissionAdapters {
    return {
      research: {
        buildBrief: async ({ goal, relevantContext }) => {
          return runResearchAdapter(this.buildAdapterDeps(), { goal, relevantContext })
        },
      },
      course: {
        buildOutline: async ({ goal, researchBrief, relevantContext }) => {
          return runCourseOutlineAdapter(this.buildAdapterDeps(), { goal, researchBrief, relevantContext })
        },
        apply: async (payload) => applyCourseEntitiesAdapter(this.buildAdapterDeps(), payload),
      },
      secretary: {
        buildPlanPatch: async ({ goal, courseOutline, relevantContext }) => {
          return runDailyPlanAdapter(this.buildAdapterDeps(), { goal, courseOutline, relevantContext })
        },
        apply: async (payload) => applyDailyPlanPatchAdapter(this.buildAdapterDeps(), payload),
      },
      editor: {
        buildNotePack: async ({ goal, dailyPlanPatch, relevantContext, workflowKey, sourceTaskTitle, sourcePlanTitle, sourceTopic, sourceProjectId, sourcePlanId }) => {
          return runNotePackAdapter(this.buildAdapterDeps(), { goal, dailyPlanPatch, relevantContext, workflowKey, sourceTaskTitle, sourcePlanTitle, sourceTopic, sourceProjectId, sourcePlanId })
        },
        apply: async (payload) => applyNotePackAdapter(this.buildAdapterDeps(), payload),
      },
    }
  }

  private async runStageWithRetry(
    mission: Mission,
    step: MissionStep
  ): Promise<
    | {
        kind: 'completed'
        handoffType: MissionHandoff['type']
        summary: string
        payload: Record<string, unknown>
        outputRef: Record<string, unknown>
        agent: MissionEventEnvelope['agent']
      }
    | {
        kind: 'await_approval'
        approval: MissionApproval
      }
  > {
    let attempt = 0
    let lastError: unknown

    while (attempt <= this.maxRetries) {
      try {
        this.activeMissionContext = {
          missionId: mission.id,
          stepId: step.id,
          stage: step.stage,
          workflowKey: mission.workflowKey,
          triggerSource: mission.triggerSource,
        }
        const relevantContext = await this.readRelevantContextForStage(step.stage)

        if (step.stage === 'research') {
          const research = await this.adapters.research.buildBrief({
            goal: mission.goal,
            relevantContext,
          })
          return {
            kind: 'completed',
            handoffType: 'research_brief',
            summary: research.summary,
            payload: research.payload,
            outputRef: {},
            agent: 'research',
          }
        }

        if (step.stage === 'course_draft') {
          const researchBrief =
            (await this.fetchLatestHandoffPayloadByType(mission.id, 'research_brief')) || null
          const outline = await this.adapters.course.buildOutline({
            goal: mission.goal,
            researchBrief,
            relevantContext,
          })

          const gated = await this.resolveApprovalGate(mission, step, outline.payload)
          if (gated) return gated

          const courseOutput = await this.adapters.course.apply(outline.payload)
          return {
            kind: 'completed',
            handoffType: 'course_outline',
            summary: outline.summary,
            payload: { ...outline.payload, ...courseOutput },
            outputRef: courseOutput,
            agent: 'course',
          }
        }

        if (step.stage === 'daily_plan') {
          const courseOutline =
            (await this.fetchLatestHandoffPayloadByType(mission.id, 'course_outline')) || null
          const planPatch = await this.adapters.secretary.buildPlanPatch({
            goal: mission.goal,
            courseOutline,
            relevantContext,
          })
          const gated = await this.resolveApprovalGate(mission, step, planPatch.payload)
          if (gated) return gated

          const planOutput = await this.adapters.secretary.apply(planPatch.payload)
          return {
            kind: 'completed',
            handoffType: 'daily_plan_patch',
            summary: planPatch.summary,
            payload: { ...planPatch.payload, ...planOutput },
            outputRef: planOutput,
            agent: 'secretary',
          }
        }

        const dailyPlanPatch =
          (await this.fetchLatestHandoffPayloadByType(mission.id, 'daily_plan_patch')) || null

        // Look up linked project folder for the plan
        let sourceProjectId: string | undefined
        if (mission.sourcePlanId) {
          try {
            const { data: link } = await this.supabase
              .from('plan_project_links')
              .select('project_id')
              .eq('user_id', this.userId)
              .eq('plan_id', mission.sourcePlanId)
              .maybeSingle()
            if (link) sourceProjectId = link.project_id
          } catch {
            // Non-critical — notes will be unlinked
          }
        }
        // Also check constraints for explicitly passed sourceProjectId
        if (!sourceProjectId && typeof mission.constraints.sourceProjectId === 'string') {
          sourceProjectId = mission.constraints.sourceProjectId
        }

        const notePack = await this.adapters.editor.buildNotePack({
          goal: mission.goal,
          dailyPlanPatch,
          relevantContext,
          workflowKey: mission.workflowKey,
          sourceTaskTitle:
            typeof mission.constraints.sourceTaskTitle === 'string'
              ? mission.constraints.sourceTaskTitle
              : undefined,
          sourcePlanTitle:
            typeof mission.constraints.sourcePlanTitle === 'string'
              ? mission.constraints.sourcePlanTitle
              : undefined,
          sourceTopic:
            typeof mission.constraints.sourceTopic === 'string'
              ? mission.constraints.sourceTopic
              : undefined,
          sourceProjectId,
          sourcePlanId: mission.sourcePlanId || undefined,
        })
        const gated = await this.resolveApprovalGate(mission, step, notePack.payload)
        if (gated) return gated

        const noteOutput = await this.adapters.editor.apply(notePack.payload)
        return {
          kind: 'completed',
          handoffType: 'note_draft_set',
          summary: notePack.summary,
          payload: { ...notePack.payload, ...noteOutput },
          outputRef: noteOutput,
          agent: 'editor',
        }
      } catch (error) {
        lastError = error
        await this.bumpRetry(step.id, attempt + 1, error)
        if (!isTransientMissionError(error) || attempt >= this.maxRetries) {
          throw error
        }
        await wait(Math.min(2_500, 500 * (attempt + 1)))
        attempt += 1
      } finally {
        this.activeMissionContext = undefined
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError))
  }

  private async resolveApprovalGate(
    mission: Mission,
    step: MissionStep,
    handoffPayload: Record<string, unknown>
  ): Promise<{ kind: 'await_approval'; approval: MissionApproval } | null> {
    const latestApproval = await this.fetchLatestApprovalForStep(mission.id, step.id)

    // Check approval expiry before evaluating status
    if (latestApproval?.expiresAt && new Date(latestApproval.expiresAt) < this.now()) {
      if (latestApproval.status === 'pending') {
        // Auto-expire stale pending approvals
        await this.supabase
          .from('mission_approvals')
          .update({ status: 'expired', resolved_at: this.now().toISOString() })
          .eq('id', latestApproval.id)
        throw new Error(`Approval expired for step "${step.stage}" — please restart this stage`)
      }
    }

    if (latestApproval?.status === 'pending') {
      return { kind: 'await_approval', approval: latestApproval }
    }
    if (latestApproval?.status === 'rejected' || latestApproval?.status === 'expired') {
      throw new Error(`Approval ${latestApproval.status} for step "${step.stage}"`)
    }
    if (latestApproval?.status === 'approved') {
      return null
    }

    const template = createMissionApprovalForStage({
      stage: step.stage,
      goal: mission.goal,
      handoffPayload,
    })
    if (!template) return null

    const approval = await this.createApproval(mission.id, step.id, template)
    return { kind: 'await_approval', approval }
  }

  private async readRelevantContextForStage(stage: MissionStage): Promise<string> {
    if (!this.sharedContextService) return ''

    const typeMap: Record<MissionStage, ContextEntryType[]> = {
      research: ['goal_set', 'soul_updated', 'research_done'],
      course_draft: ['research_done', 'course_saved', 'goal_set'],
      daily_plan: ['course_saved', 'active_plan', 'goal_set'],
      note_pack: ['active_plan', 'note_created', 'note_edited', 'course_saved'],
    }

    return this.sharedContextService.read({
      relevantTypes: typeMap[stage],
      maxEntries: 12,
      maxChars: 1400,
    })
  }

  private async fetchLatestHandoffPayloadByType(
    missionId: string,
    type: MissionHandoff['type']
  ): Promise<Record<string, unknown> | null> {
    const { data, error } = await this.supabase
      .from('mission_handoffs')
      .select('payload')
      .eq('mission_id', missionId)
      .eq('type', type)
      .order('created_at', { ascending: false })
      .limit(1)

    if (error) throw error
    if (!data || data.length === 0) return null
    const payload = data[0] as { payload?: Record<string, unknown> | null }
    return payload.payload || null
  }

  private async appendMissionEvent(input: {
    type: MissionEventEnvelope['type']
    missionId: string
    stepId?: string
    agent: MissionEventEnvelope['agent']
    data: Record<string, unknown>
  }): Promise<MissionEventEnvelope<Record<string, unknown>>> {
    let lastError: unknown

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const seq = await this.nextMissionEventSeq(input.missionId)
      const ts = this.now().toISOString()
      const { error } = await this.supabase.from('mission_events').insert({
        mission_id: input.missionId,
        step_id: input.stepId || null,
        seq,
        type: input.type,
        agent: input.agent,
        data: input.data || {},
        ts,
      })

      if (!error) {
        return {
          seq,
          type: input.type,
          missionId: input.missionId,
          stepId: input.stepId,
          agent: input.agent,
          data: input.data,
          ts,
        }
      }

      lastError = error
      const errorCode = (error as { code?: string }).code
      if (errorCode !== '23505') {
        throw error
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Failed to append mission event')
  }

  private async nextMissionEventSeq(missionId: string): Promise<number> {
    const { data, error } = await this.supabase.rpc('next_mission_event_seq', {
      p_mission_id: missionId,
    })

    if (!error && typeof data === 'number' && Number.isFinite(data)) {
      return data
    }

    const { data: fallback, error: fallbackError } = await this.supabase
      .from('mission_events')
      .select('seq')
      .eq('mission_id', missionId)
      .order('seq', { ascending: false })
      .limit(1)

    if (fallbackError) {
      throw error || fallbackError
    }

    const lastSeq = Number((fallback && fallback[0] ? (fallback[0] as { seq: number }).seq : 0) || 0)
    return lastSeq + 1
  }

  private async fetchMissionEvents(
    missionId: string,
    afterSeq = 0,
    limit = 200
  ): Promise<MissionEventEnvelope[]> {
    const safeLimit = Math.max(1, Math.min(limit, 1000))
    const { data, error } = await this.supabase
      .from('mission_events')
      .select('mission_id, step_id, seq, type, agent, data, ts')
      .eq('mission_id', missionId)
      .gt('seq', afterSeq)
      .order('seq', { ascending: true })
      .limit(safeLimit)

    if (error) throw error
    return (data || []).map((row) => this.mapEventRow(row as MissionEventDbRow))
  }

  private async getLastEventSeq(missionId: string): Promise<number> {
    const { data, error } = await this.supabase
      .from('mission_events')
      .select('seq')
      .eq('mission_id', missionId)
      .order('seq', { ascending: false })
      .limit(1)

    if (error) throw error
    if (!data || data.length === 0) return 0
    return Number((data[0] as { seq: number }).seq || 0)
  }

  private async fetchMission(missionId: string): Promise<Mission> {
    const { data, error } = await this.supabase
      .from('missions')
      .select('*')
      .eq('id', missionId)
      .eq('user_id', this.userId)
      .single()
    if (error || !data) throw error || new Error('Mission not found')
    return this.mapMissionRow(data as MissionDbRow)
  }

  private async fetchMissionSteps(missionId: string): Promise<MissionStep[]> {
    const { data, error } = await this.supabase
      .from('mission_steps')
      .select('*')
      .eq('mission_id', missionId)
      .order('created_at', { ascending: true })
    if (error) throw error
    return (data || []).map((row) => this.mapStepRow(row as MissionStepDbRow))
  }

  private async fetchMissionHandoffs(missionId: string): Promise<MissionHandoff[]> {
    const { data, error } = await this.supabase
      .from('mission_handoffs')
      .select('*')
      .eq('mission_id', missionId)
      .order('created_at', { ascending: true })
    if (error) throw error
    return (data || []).map((row) => this.mapHandoffRow(row as MissionHandoffDbRow))
  }

  private async fetchMissionApprovals(missionId: string): Promise<MissionApproval[]> {
    const { data, error } = await this.supabase
      .from('mission_approvals')
      .select('*')
      .eq('mission_id', missionId)
      .order('created_at', { ascending: true })
    if (error) throw error
    return (data || []).map((row) => this.mapApprovalRow(row as MissionApprovalDbRow))
  }

  private async fetchLatestApprovalForStep(
    missionId: string,
    stepId: string
  ): Promise<MissionApproval | null> {
    const { data, error } = await this.supabase
      .from('mission_approvals')
      .select('*')
      .eq('mission_id', missionId)
      .eq('step_id', stepId)
      .order('created_at', { ascending: false })
      .limit(1)
    if (error) throw error
    if (!data || data.length === 0) return null
    return this.mapApprovalRow(data[0] as MissionApprovalDbRow)
  }

  private async createApproval(
    missionId: string,
    stepId: string,
    template: MissionApprovalTemplate
  ): Promise<MissionApproval> {
    const { data, error } = await this.supabase
      .from('mission_approvals')
      .insert({
        mission_id: missionId,
        step_id: stepId,
        action_type: template.actionType,
        title: template.title,
        details: template.details,
        payload: template.payload,
        risk_level: template.riskLevel,
        status: 'pending',
      })
      .select('*')
      .single()
    if (error || !data) throw error || new Error('Failed to create approval')
    return this.mapApprovalRow(data as MissionApprovalDbRow)
  }

  private async createHandoff(
    missionId: string,
    stepId: string,
    input: Pick<MissionHandoff, 'type' | 'summary' | 'payload'>
  ): Promise<MissionHandoff> {
    const { data, error } = await this.supabase
      .from('mission_handoffs')
      .insert({
        mission_id: missionId,
        step_id: stepId,
        type: input.type,
        summary: input.summary,
        payload: input.payload,
      })
      .select('*')
      .single()
    if (error || !data) throw error || new Error('Failed to create handoff')
    return this.mapHandoffRow(data as MissionHandoffDbRow)
  }

  private async updateMission(missionId: string, patch: Record<string, unknown>): Promise<void> {
    const { error } = await this.supabase
      .from('missions')
      .update({
        ...patch,
        updated_at: this.now().toISOString(),
      })
      .eq('id', missionId)
      .eq('user_id', this.userId)
    if (error) throw error
  }

  private async setStepInProgress(stepId: string, missionId: string, stage: MissionStage): Promise<void> {
    const nowIso = this.now().toISOString()
    const { error } = await this.supabase
      .from('mission_steps')
      .update({
        status: 'in_progress',
        started_at: nowIso,
        error_message: null,
      })
      .eq('id', stepId)
    if (error) throw error

    await this.updateMission(missionId, {
      status: 'running',
      current_stage: stage,
      last_error: null,
    })
  }

  private async completeStep(stepId: string, patch?: { output_ref?: Record<string, unknown> }): Promise<void> {
    const { error } = await this.supabase
      .from('mission_steps')
      .update({
        status: 'completed',
        output_ref: patch?.output_ref || {},
        completed_at: this.now().toISOString(),
      })
      .eq('id', stepId)
    if (error) throw error
  }

  /**
   * Atomic step completion: marks step complete, writes context, appends events.
   * If event append fails, rolls back the step to in_progress to avoid divergence.
   */
  private async completeStepWithEvents(
    stepId: string,
    missionId: string,
    stage: MissionStage,
    handoffRow: MissionHandoff,
    result: {
      summary: string
      payload: Record<string, unknown>
      outputRef: Record<string, unknown>
      agent: MissionEventEnvelope['agent']
    }
  ): Promise<void> {
    await this.completeStep(stepId, {
      output_ref: { handoffId: handoffRow.id, ...result.outputRef },
    })

    try {
      await this.writeSharedContext(stage, missionId, stepId, result)

      await this.appendMissionEvent({
        type: 'handoff-created',
        missionId,
        stepId,
        agent: result.agent,
        data: {
          handoffId: handoffRow.id,
          type: handoffRow.type,
          summary: handoffRow.summary,
          payload: handoffRow.payload,
        },
      })
      await this.appendMissionEvent({
        type: 'step-complete',
        missionId,
        stepId,
        agent: 'system',
        data: { stage },
      })
    } catch (eventError) {
      // Roll back step status to avoid state/event divergence
      await this.supabase
        .from('mission_steps')
        .update({ status: 'in_progress', completed_at: null })
        .eq('id', stepId)
      throw eventError
    }
  }

  private async failStep(stepId: string, message: string): Promise<void> {
    const { error } = await this.supabase
      .from('mission_steps')
      .update({
        status: 'error',
        error_message: message,
      })
      .eq('id', stepId)
    if (error) throw error
  }

  private async bumpRetry(stepId: string, retryCount: number, error: unknown): Promise<void> {
    const msg = error instanceof Error ? error.message : String(error)
    const { error: updateError } = await this.supabase
      .from('mission_steps')
      .update({
        retry_count: retryCount,
        error_message: msg,
      })
      .eq('id', stepId)
    if (updateError) throw updateError
  }

  private async writeSharedContext(
    stage: MissionStage,
    missionId: string,
    stepId: string,
    result: {
      summary: string
      payload: Record<string, unknown>
    }
  ): Promise<void> {
    if (!this.sharedContextService) return

    const map: Record<MissionStage, { agent: string; type: ContextEntryType }> = {
      research: { agent: 'research', type: 'research_done' },
      course_draft: { agent: 'course', type: 'course_saved' },
      daily_plan: { agent: 'secretary', type: 'active_plan' },
      note_pack: { agent: 'editor', type: 'note_created' },
    }
    const mapped = map[stage]
    await this.sharedContextService.write({
      agent: mapped.agent,
      type: mapped.type,
      summary: result.summary,
      payload: { missionId, stepId, ...result.payload },
    })
  }

  private async acquireRunLock(missionId: string, lockToken: string): Promise<boolean> {
    const now = this.now()
    const nowIso = now.toISOString()

    const { data: existing, error: existingError } = await this.supabase
      .from('mission_run_locks')
      .select('*')
      .eq('mission_id', missionId)
      .maybeSingle()
    if (existingError) throw existingError

    if (existing && typeof existing === 'object') {
      const expires = new Date((existing as { expires_at: string }).expires_at)
      if (expires > now && (existing as { lock_token: string }).lock_token !== lockToken) {
        return false
      }
    }

    const expiresAt = new Date(now.getTime() + this.lockTtlMs).toISOString()
    const { error } = await this.supabase.from('mission_run_locks').upsert(
      {
        mission_id: missionId,
        lock_token: lockToken,
        acquired_at: nowIso,
        expires_at: expiresAt,
      },
      { onConflict: 'mission_id' }
    )
    if (error) throw error
    return true
  }

  private async releaseRunLock(missionId: string, lockToken: string): Promise<void> {
    const { error } = await this.supabase
      .from('mission_run_locks')
      .delete()
      .eq('mission_id', missionId)
      .eq('lock_token', lockToken)
    if (error) throw error
  }

  private mapMissionRow(row: MissionDbRow): Mission {
    const constraints = row.constraints || {}
    return {
      id: row.id,
      userId: row.user_id,
      goal: row.goal,
      mode: row.mode,
      status: row.status,
      currentStage: row.current_stage,
      constraints,
      workflowKey: resolveWorkflowKey(constraints),
      triggerSource: resolveTriggerSource(constraints),
      sourceTaskId:
        typeof constraints.sourceTaskId === 'string' ? constraints.sourceTaskId : null,
      sourcePlanId:
        typeof constraints.sourcePlanId === 'string' ? constraints.sourcePlanId : null,
      lastError: row.last_error,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  private mapStepRow(row: MissionStepDbRow): MissionStep {
    return {
      id: row.id,
      missionId: row.mission_id,
      stage: row.stage,
      status: row.status,
      retryCount: row.retry_count,
      inputRef: row.input_ref || {},
      outputRef: row.output_ref || {},
      errorMessage: row.error_message,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      createdAt: row.created_at,
    }
  }

  private mapHandoffRow(row: MissionHandoffDbRow): MissionHandoff {
    return {
      id: row.id,
      missionId: row.mission_id,
      stepId: row.step_id,
      type: row.type,
      summary: row.summary,
      payload: row.payload || {},
      createdAt: row.created_at,
    }
  }

  private mapApprovalRow(row: MissionApprovalDbRow): MissionApproval {
    return {
      id: row.id,
      missionId: row.mission_id,
      stepId: row.step_id,
      actionType: row.action_type,
      title: row.title,
      details: row.details,
      payload: row.payload || {},
      riskLevel: row.risk_level,
      status: row.status,
      expiresAt: row.expires_at,
      resolvedAt: row.resolved_at,
      resolutionNote: row.resolution_note,
      createdAt: row.created_at,
    }
  }

  private mapEventRow(row: MissionEventDbRow): MissionEventEnvelope {
    return {
      seq: Number(row.seq),
      type: row.type,
      missionId: row.mission_id,
      stepId: row.step_id || undefined,
      agent: row.agent,
      data: row.data || {},
      ts: row.ts,
    }
  }
}
