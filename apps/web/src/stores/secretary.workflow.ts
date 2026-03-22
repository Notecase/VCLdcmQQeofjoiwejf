import type {
  MissionHandoff,
  MissionStateResponse,
  TaskArtifactKind,
  TaskArtifactLink,
  WorkflowKey,
} from '@inkdown/shared/types'

function artifactDescriptor(workflowKey: WorkflowKey): {
  kind: TaskArtifactKind
  pendingLabel: string
  readyLabel: string
} {
  switch (workflowKey) {
    case 'make_note_from_task':
      return { kind: 'note', pendingLabel: 'Creating note', readyLabel: 'Note ready' }
    case 'research_topic_from_task':
      return { kind: 'research', pendingLabel: 'Researching topic', readyLabel: 'Research ready' }
    case 'make_course_from_plan':
      return { kind: 'course', pendingLabel: 'Creating course', readyLabel: 'Course outline ready' }
    default:
      return { kind: 'mission', pendingLabel: 'Running mission', readyLabel: 'Mission ready' }
  }
}

export function buildTaskWorkflowGoal(
  workflowKey: WorkflowKey,
  taskTitle: string,
  planName?: string
): string {
  switch (workflowKey) {
    case 'make_note_from_task':
      return `Create a focused study note for "${taskTitle}"${planName ? ` from ${planName}` : ''}.`
    case 'research_topic_from_task':
      return `Research "${taskTitle}" deeply${planName ? ` for ${planName}` : ''} and summarize the key takeaways.`
    default:
      return `Advance the task "${taskTitle}"${planName ? ` for ${planName}` : ''}.`
  }
}

export function buildPlanWorkflowGoal(
  workflowKey: WorkflowKey,
  planName: string,
  currentTopic?: string
): string {
  switch (workflowKey) {
    case 'make_course_from_plan':
      return `Turn the active plan "${planName}"${currentTopic ? ` on ${currentTopic}` : ''} into a structured course outline.`
    case 'research_topic_from_task':
      return `Research the active plan "${planName}"${currentTopic ? ` focused on ${currentTopic}` : ''} and capture the highest-value insights.`
    case 'make_note_from_task':
      return `Create a note for the active plan "${planName}"${currentTopic ? ` focused on ${currentTopic}` : ''}.`
    default:
      return `Advance the active plan "${planName}"${currentTopic ? ` focused on ${currentTopic}` : ''}.`
  }
}

export function buildPendingWorkflowArtifact(
  workflowKey: WorkflowKey,
  missionId: string
): TaskArtifactLink {
  const descriptor = artifactDescriptor(workflowKey)
  return {
    id: `${workflowKey}:${missionId}`,
    kind: descriptor.kind,
    status: 'pending',
    label: descriptor.pendingLabel,
    missionId,
    createdByAgent: 'secretary',
    createdAt: new Date().toISOString(),
  }
}

function latestHandoffByType(
  handoffs: MissionHandoff[],
  type: MissionHandoff['type']
): MissionHandoff | null {
  const matches = handoffs.filter((handoff) => handoff.type === type)
  return matches.length > 0 ? matches[matches.length - 1] : null
}

export function resolveWorkflowArtifactFromMission(
  state: MissionStateResponse,
  workflowKey: WorkflowKey
): TaskArtifactLink | null {
  const descriptor = artifactDescriptor(workflowKey)
  const missionId = state.mission.id

  if (state.mission.status === 'blocked' || state.mission.status === 'error') {
    return {
      id: `${workflowKey}:${missionId}`,
      kind: descriptor.kind,
      status: 'blocked',
      label: 'Needs review',
      missionId,
      createdByAgent: 'mission-orchestrator',
      createdAt: state.mission.updatedAt,
    }
  }

  if (state.mission.status !== 'completed') {
    return null
  }

  if (workflowKey === 'make_note_from_task') {
    const handoff = latestHandoffByType(state.handoffs, 'note_draft_set')
    const noteIds = Array.isArray(
      (handoff?.payload as { noteIds?: unknown[] } | undefined)?.noteIds
    )
      ? (((handoff?.payload as { noteIds?: string[] })?.noteIds || []).filter(
          (item) => typeof item === 'string'
        ) as string[])
      : []
    const noteId = noteIds[0]
    if (!noteId) return null

    return {
      id: `${workflowKey}:${missionId}`,
      kind: 'note',
      status: 'ready',
      label: descriptor.readyLabel,
      targetId: noteId,
      href: `/editor?noteId=${noteId}`,
      missionId,
      createdByAgent: 'editor',
      createdAt: handoff?.createdAt || state.mission.updatedAt,
    }
  }

  if (workflowKey === 'make_course_from_plan') {
    const handoff = latestHandoffByType(state.handoffs, 'course_outline')
    const courseId = (handoff?.payload as { courseId?: string } | undefined)?.courseId
    return {
      id: `${workflowKey}:${missionId}`,
      kind: 'course',
      status: 'ready',
      label: descriptor.readyLabel,
      targetId: courseId,
      href: courseId ? `/courses/${courseId}` : undefined,
      missionId,
      createdByAgent: 'course',
      createdAt: handoff?.createdAt || state.mission.updatedAt,
    }
  }

  if (workflowKey === 'research_topic_from_task') {
    const handoff = latestHandoffByType(state.handoffs, 'research_brief')
    return {
      id: `${workflowKey}:${missionId}`,
      kind: 'research',
      status: 'ready',
      label: descriptor.readyLabel,
      missionId,
      createdByAgent: 'research',
      createdAt: handoff?.createdAt || state.mission.updatedAt,
    }
  }

  return {
    id: `${workflowKey}:${missionId}`,
    kind: descriptor.kind,
    status: 'ready',
    label: descriptor.readyLabel,
    missionId,
    createdByAgent: 'mission-orchestrator',
    createdAt: state.mission.updatedAt,
  }
}
