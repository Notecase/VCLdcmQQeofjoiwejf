import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  Mission,
  MissionApproval,
  MissionEventEnvelope,
  MissionHandoff,
  MissionMode,
  MissionStage,
  MissionStateResponse,
  MissionStep,
} from '@inkdown/shared/types'
import {
  approveMissionApproval,
  getMissionState,
  readLastMissionId,
  rejectMissionApproval,
  resumeMission as resumeMissionRequest,
  startMission as startMissionRequest,
  streamMission,
  writeLastMissionId,
} from '@/services/missions.service'

const STAGE_ORDER: MissionStage[] = ['research', 'course_draft', 'daily_plan', 'note_pack']

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export const useMissionStore = defineStore('missions', () => {
  const mission = ref<Mission | null>(null)
  const steps = ref<MissionStep[]>([])
  const handoffs = ref<MissionHandoff[]>([])
  const approvals = ref<MissionApproval[]>([])
  const events = ref<MissionEventEnvelope<unknown>[]>([])

  const activeMissionId = ref<string | null>(readLastMissionId())
  const isLoading = ref(false)
  const isStreaming = ref(false)
  const isResuming = ref(false)
  const error = ref<string | null>(null)
  const lastEventSeq = ref(0)

  let streamToken = 0
  let streamAbortController: AbortController | null = null

  const orderedSteps = computed(() => {
    return [...steps.value].sort((a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage))
  })

  const pendingApprovals = computed(() =>
    approvals.value.filter((approval) => approval.status === 'pending')
  )

  const completedSteps = computed(() =>
    orderedSteps.value.filter((step) => step.status === 'completed').length
  )

  const missionProgress = computed(() => {
    const total = orderedSteps.value.length
    if (!total) return 0
    return Math.round((completedSteps.value / total) * 100)
  })

  const healthSnapshot = computed(() => {
    const blocked = orderedSteps.value.filter((step) => step.status === 'blocked').length
    const inProgress = orderedSteps.value.filter((step) => step.status === 'in_progress').length
    return {
      blocked,
      inProgress,
      pendingApprovals: pendingApprovals.value.length,
      handoffs: handoffs.value.length,
    }
  })

  function applyState(state: MissionStateResponse): void {
    mission.value = state.mission
    steps.value = state.steps
    handoffs.value = state.handoffs
    approvals.value = state.approvals
    activeMissionId.value = state.mission.id
    lastEventSeq.value = Math.max(0, state.lastEventSeq || 0)
    writeLastMissionId(state.mission.id)
  }

  async function hydrateMission(missionId: string): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      const state = await getMissionState(missionId)
      applyState(state)
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load mission state'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  function recordEvent(event: MissionEventEnvelope<unknown>): void {
    if (typeof event.seq === 'number' && event.seq > 0) {
      const existingIndex = events.value.findIndex((item) => item.seq === event.seq)
      if (existingIndex >= 0) {
        events.value[existingIndex] = event
        return
      }
    }

    events.value.unshift(event)
    if (events.value.length > 150) {
      events.value.length = 150
    }
  }

  function updateStepStatus(stepId: string | undefined, patch: Partial<MissionStep>): void {
    if (!stepId) return
    const idx = steps.value.findIndex((item) => item.id === stepId)
    if (idx < 0) return
    steps.value[idx] = { ...steps.value[idx], ...patch }
  }

  function upsertHandoff(handoff: MissionHandoff): void {
    const idx = handoffs.value.findIndex((item) => item.id === handoff.id)
    if (idx >= 0) {
      handoffs.value[idx] = handoff
      return
    }
    handoffs.value.push(handoff)
  }

  function upsertApproval(approval: MissionApproval): void {
    const idx = approvals.value.findIndex((item) => item.id === approval.id)
    if (idx >= 0) {
      approvals.value[idx] = approval
      return
    }
    approvals.value.push(approval)
  }

  function applyMissionEvent(event: MissionEventEnvelope<unknown>): void {
    const data = (event.data || {}) as Record<string, unknown>

    switch (event.type) {
      case 'mission-start': {
        if (mission.value) {
          mission.value = {
            ...mission.value,
            status: 'running',
            currentStage: (data.currentStage as MissionStage | null | undefined) ?? mission.value.currentStage,
            updatedAt: event.ts,
          }
        }
        break
      }
      case 'step-start': {
        const stage = typeof data.stage === 'string' ? (data.stage as MissionStage) : null
        updateStepStatus(event.stepId, {
          status: 'in_progress',
          startedAt: event.ts,
          errorMessage: null,
        })

        if (mission.value) {
          mission.value = {
            ...mission.value,
            status: 'running',
            currentStage: stage ?? mission.value.currentStage,
            updatedAt: event.ts,
          }
        }
        break
      }
      case 'handoff-created': {
        const handoffId = typeof data.handoffId === 'string' ? data.handoffId : null
        const type = typeof data.type === 'string' ? data.type : null
        if (handoffId && type) {
          upsertHandoff({
            id: handoffId,
            missionId: event.missionId,
            stepId: event.stepId || null,
            type: type as MissionHandoff['type'],
            summary: String(data.summary || ''),
            payload: (data.payload as Record<string, unknown>) || {},
            createdAt: event.ts,
          })
        }
        break
      }
      case 'approval-required': {
        const approval = data.approval as MissionApproval | undefined
        if (approval?.id) {
          upsertApproval(approval)
        }

        if (mission.value) {
          mission.value = {
            ...mission.value,
            status: 'awaiting_approval',
            updatedAt: event.ts,
          }
        }
        break
      }
      case 'approval-resolved': {
        const approvalId = typeof data.approvalId === 'string' ? data.approvalId : null
        if (approvalId) {
          const idx = approvals.value.findIndex((item) => item.id === approvalId)
          if (idx >= 0) {
            approvals.value[idx] = {
              ...approvals.value[idx],
              status: (data.status as MissionApproval['status']) || approvals.value[idx].status,
              resolvedAt: event.ts,
            }
          }
        }
        break
      }
      case 'step-complete': {
        updateStepStatus(event.stepId, {
          status: 'completed',
          completedAt: event.ts,
          errorMessage: null,
        })
        if (mission.value) {
          mission.value = {
            ...mission.value,
            status: 'running',
            updatedAt: event.ts,
          }
        }

        const stage = typeof data.stage === 'string' ? (data.stage as MissionStage) : null
        if (stage) {
          void refreshDownstreamSurface(stage)
        }
        break
      }
      case 'mission-complete': {
        if (mission.value) {
          mission.value = {
            ...mission.value,
            status: 'completed',
            lastError: null,
            updatedAt: event.ts,
          }
        }
        break
      }
      case 'mission-error': {
        const stage = typeof data.stage === 'string' ? (data.stage as MissionStage) : null
        const message = typeof data.message === 'string' ? data.message : 'Mission blocked'

        if (event.stepId) {
          updateStepStatus(event.stepId, {
            status: 'blocked',
            errorMessage: message,
          })
        } else if (stage) {
          const related = steps.value.find((item) => item.stage === stage)
          if (related) {
            updateStepStatus(related.id, {
              status: 'blocked',
              errorMessage: message,
            })
          }
        }

        if (mission.value) {
          mission.value = {
            ...mission.value,
            status: 'blocked',
            currentStage: stage ?? mission.value.currentStage,
            lastError: message,
            updatedAt: event.ts,
          }
        }
        break
      }
    }
  }

  function applyIncomingEvent(event: MissionEventEnvelope<unknown>): void {
    if (typeof event.seq === 'number' && event.seq > 0) {
      if (event.seq <= lastEventSeq.value) return
      lastEventSeq.value = event.seq
    }

    applyMissionEvent(event)
    recordEvent(event)
  }

  function stopStreaming(): void {
    streamToken += 1
    streamAbortController?.abort()
    streamAbortController = null
    isStreaming.value = false
  }

  async function streamActiveMission(): Promise<void> {
    if (!activeMissionId.value) return

    const token = ++streamToken
    streamAbortController?.abort()
    streamAbortController = new AbortController()
    isStreaming.value = true
    error.value = null

    while (token === streamToken && activeMissionId.value) {
      try {
        await streamMission(activeMissionId.value, {
          afterSeq: lastEventSeq.value,
          signal: streamAbortController.signal,
          onEvent: (event) => {
            if (token !== streamToken) return
            applyIncomingEvent(event)
          },
          onError: (message) => {
            if (token !== streamToken) return
            error.value = message
          },
        })
      } catch (err) {
        if (token !== streamToken) break
        if (streamAbortController.signal.aborted) break
        error.value = err instanceof Error ? err.message : 'Mission stream failed'
      }

      if (token !== streamToken) break
      if (streamAbortController.signal.aborted) break

      const status = mission.value?.status
      if (status === 'completed' || status === 'cancelled') {
        break
      }

      await wait(1000)
    }

    if (token === streamToken) {
      isStreaming.value = false
    }
  }

  function maybeResumeMission(): void {
    if (!mission.value) return
    if (mission.value.status === 'cancelled' || mission.value.status === 'completed') return

    if (!isStreaming.value) {
      void streamActiveMission()
    }
  }

  async function openMission(missionId: string): Promise<void> {
    await hydrateMission(missionId)
    maybeResumeMission()
  }

  async function startMission(goal: string, mode: MissionMode = 'suggest_approve'): Promise<string> {
    error.value = null
    const { missionId } = await startMissionRequest({ goal, mode })
    events.value = []
    lastEventSeq.value = 0
    await openMission(missionId)
    return missionId
  }

  async function resolveApproval(
    approvalId: string,
    decision: 'approved' | 'rejected',
    note?: string
  ): Promise<void> {
    if (!activeMissionId.value) return

    if (decision === 'approved') {
      await approveMissionApproval(activeMissionId.value, approvalId, { note })
    } else {
      await rejectMissionApproval(activeMissionId.value, approvalId, { note })
    }

    await hydrateMission(activeMissionId.value)
    maybeResumeMission()
  }

  async function resumeMission(): Promise<boolean> {
    if (!activeMissionId.value) return false

    isResuming.value = true
    error.value = null
    try {
      const result = await resumeMissionRequest(activeMissionId.value)
      await hydrateMission(activeMissionId.value)
      maybeResumeMission()
      return Boolean(result.accepted)
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to resume mission'
      return false
    } finally {
      isResuming.value = false
    }
  }

  async function refreshDownstreamSurface(stage: MissionStage): Promise<void> {
    if (stage === 'course_draft') {
      const { useCourseStore } = await import('@/stores/course')
      const courseStore = useCourseStore()
      await courseStore.fetchCourses()
      if (courseStore.activeCourse?.id) {
        await courseStore.fetchCourse(courseStore.activeCourse.id)
      }
      return
    }

    if (stage === 'daily_plan') {
      const { useSecretaryStore } = await import('@/stores/secretary')
      const secretaryStore = useSecretaryStore()
      if (secretaryStore.isInitialized) {
        await secretaryStore.refreshMemoryFiles()
      }
      return
    }

    if (stage === 'note_pack') {
      const { useEditorStore } = await import('@/stores/editor')
      await useEditorStore().loadDocuments()
    }
  }

  function clearCurrentMission(): void {
    stopStreaming()
    mission.value = null
    steps.value = []
    handoffs.value = []
    approvals.value = []
    events.value = []
    error.value = null
    lastEventSeq.value = 0
  }

  return {
    mission,
    steps,
    orderedSteps,
    handoffs,
    approvals,
    events,
    activeMissionId,
    isLoading,
    isStreaming,
    isResuming,
    error,
    pendingApprovals,
    missionProgress,
    completedSteps,
    healthSnapshot,
    lastEventSeq,
    hydrateMission,
    openMission,
    maybeResumeMission,
    streamActiveMission,
    startMission,
    resumeMission,
    resolveApproval,
    clearCurrentMission,
  }
})
