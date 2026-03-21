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

  const reader = response.body?.getReader()
  if (!reader) throw new Error('Mission stream has no response body')

  const decoder = new TextDecoder()
  let buffer = ''
  let currentEventType: string | null = null
  let currentEventId: string | null = null
  let dataLines: string[] = []

  function resetPendingEvent() {
    currentEventType = null
    currentEventId = null
    dataLines = []
  }

  function flushPendingEvent() {
    if (dataLines.length === 0) {
      resetPendingEvent()
      return
    }

    const rawData = dataLines.join('\n').trim()
    if (!rawData || rawData === '[DONE]') {
      resetPendingEvent()
      return
    }

    try {
      const parsed = JSON.parse(rawData) as MissionEventEnvelope<unknown>
      const resolvedType = currentEventType || parsed.type
      if (resolvedType === 'heartbeat') {
        resetPendingEvent()
        return
      }

      const parsedId = currentEventId ? Number.parseInt(currentEventId, 10) : NaN
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
    } catch (error) {
      callbacks.onError?.(
        error instanceof Error ? error.message : 'Failed to parse mission stream event'
      )
    } finally {
      resetPendingEvent()
    }
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.trim()) {
          flushPendingEvent()
          continue
        }

        if (line.startsWith(':')) continue
        if (line.startsWith('event:')) {
          currentEventType = line.slice(6).trim() || null
          continue
        }
        if (line.startsWith('id:')) {
          currentEventId = line.slice(3).trim() || null
          continue
        }
        if (!line.startsWith('data:')) {
          continue
        }

        dataLines.push(line.slice(5))
      }
    }

    if (buffer.trim()) {
      dataLines.push(buffer)
      flushPendingEvent()
    }
  } finally {
    reader.releaseLock()
    callbacks.onDone?.()
  }
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
