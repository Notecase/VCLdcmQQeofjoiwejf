import { authFetch, authFetchSSE } from '@/utils/api'
import type {
  MissionEventEnvelope,
  MissionMode,
  ResumeMissionResponse,
  MissionStateResponse,
  ResolveMissionApprovalRequest,
  StartMissionResponse,
  TriggerSource,
  WorkflowKey,
} from '@inkdown/shared/types'

const API_BASE = '/api/missions'
export const LAST_MISSION_STORAGE_KEY = 'mission_hub:last_mission_id'

export async function startMission(input: {
  goal: string
  mode?: MissionMode
  constraints?: Record<string, unknown>
  workflowKey?: WorkflowKey
  triggerSource?: TriggerSource
}): Promise<StartMissionResponse> {
  const response = await authFetch(`${API_BASE}/start`, {
    method: 'POST',
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.message || `Failed to start mission (${response.status})`)
  }

  return response.json()
}

export async function getMissionState(missionId: string): Promise<MissionStateResponse> {
  const response = await authFetch(`${API_BASE}/${missionId}/state`)

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.message || `Failed to fetch mission state (${response.status})`)
  }

  return response.json()
}

async function resolveApproval(
  missionId: string,
  approvalId: string,
  action: 'approve' | 'reject',
  payload: ResolveMissionApprovalRequest
): Promise<void> {
  const response = await authFetch(`${API_BASE}/${missionId}/approvals/${approvalId}/${action}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.message || `Failed to ${action} approval (${response.status})`)
  }
}

export function approveMissionApproval(
  missionId: string,
  approvalId: string,
  payload: ResolveMissionApprovalRequest = {}
): Promise<void> {
  return resolveApproval(missionId, approvalId, 'approve', payload)
}

export function rejectMissionApproval(
  missionId: string,
  approvalId: string,
  payload: ResolveMissionApprovalRequest = {}
): Promise<void> {
  return resolveApproval(missionId, approvalId, 'reject', payload)
}

export async function resumeMission(missionId: string): Promise<ResumeMissionResponse> {
  const response = await authFetch(`${API_BASE}/${missionId}/resume`, {
    method: 'POST',
  })

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.message || `Failed to resume mission (${response.status})`)
  }

  return response.json()
}

export async function streamMission(
  missionId: string,
  callbacks: {
    afterSeq?: number
    signal?: AbortSignal
    onEvent?: (event: MissionEventEnvelope<unknown>) => void
    onError?: (message: string) => void
    onDone?: () => void
  }
): Promise<void> {
  const afterSeq = callbacks.afterSeq ?? 0
  const query = afterSeq > 0 ? `?afterSeq=${afterSeq}` : ''

  const response = await authFetchSSE(`${API_BASE}/${missionId}/stream${query}`, {
    signal: callbacks.signal,
  })

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.message || `Failed to connect mission stream (${response.status})`)
  }

  const { parseSSEStream } = await import('@/utils/sse-parser')

  await parseSSEStream(response, {
    signal: callbacks.signal,
    onEvent: (sseEvent) => {
      const parsed = sseEvent.data as MissionEventEnvelope<unknown>
      const resolvedType = sseEvent.event || parsed.type
      if (resolvedType === 'heartbeat') return

      const parsedId = sseEvent.id ? Number.parseInt(sseEvent.id, 10) : NaN
      const resolvedSeq =
        Number.isFinite(parsedId) && parsedId > 0
          ? parsedId
          : typeof parsed.seq === 'number'
            ? parsed.seq
            : 0

      const event: MissionEventEnvelope<unknown> = {
        ...parsed,
        type: resolvedType,
        seq: resolvedSeq,
      }

      callbacks.onEvent?.(event)
    },
    onError: (error) => {
      callbacks.onError?.(error.message)
    },
    onDone: () => {
      callbacks.onDone?.()
    },
  })
}

export function readLastMissionId(): string | null {
  try {
    return localStorage.getItem(LAST_MISSION_STORAGE_KEY)
  } catch {
    return null
  }
}

export function writeLastMissionId(missionId: string): void {
  try {
    localStorage.setItem(LAST_MISSION_STORAGE_KEY, missionId)
  } catch {
    // Ignore localStorage write failures.
  }
}
