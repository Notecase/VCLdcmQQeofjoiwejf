import { describe, expect, it } from 'vitest'
import type { MissionStateResponse } from '@inkdown/shared/types'
import {
  buildPendingWorkflowArtifact,
  buildTaskWorkflowGoal,
  resolveWorkflowArtifactFromMission,
} from './secretary.workflow'

function buildMissionState(
  workflowKey: 'make_note_from_task' | 'research_topic_from_task' | 'make_course_from_plan',
  handoff: MissionStateResponse['handoffs'][number]
): MissionStateResponse {
  return {
    mission: {
      id: 'mission-1',
      userId: 'user-1',
      goal: 'placeholder',
      mode: 'suggest_approve',
      status: 'completed',
      currentStage: 'note_pack',
      constraints: { workflowKey, triggerSource: 'user' },
      workflowKey,
      triggerSource: 'user',
      createdAt: '2026-03-13T09:00:00.000Z',
      updatedAt: '2026-03-13T09:10:00.000Z',
    },
    steps: [],
    handoffs: [handoff],
    approvals: [],
    lastEventSeq: 4,
  }
}

describe('secretary workflow helpers', () => {
  it('builds task-specific goals for note creation', () => {
    expect(
      buildTaskWorkflowGoal(
        'make_note_from_task',
        'Study Bellman equations',
        'Reinforcement Learning'
      )
    ).toContain('Study Bellman equations')
  })

  it('creates pending artifacts with focused Secretary labels', () => {
    const artifact = buildPendingWorkflowArtifact('make_note_from_task', 'mission-1')

    expect(artifact.kind).toBe('note')
    expect(artifact.status).toBe('pending')
    expect(artifact.label).toBe('Creating note')
    expect(artifact.missionId).toBe('mission-1')
  })

  it('resolves note missions into deep-linkable note artifacts', () => {
    const artifact = resolveWorkflowArtifactFromMission(
      buildMissionState('make_note_from_task', {
        id: 'handoff-1',
        missionId: 'mission-1',
        stepId: 'step-1',
        type: 'note_draft_set',
        summary: 'Draft ready',
        payload: {
          noteIds: ['note-123'],
          notes: [{ noteId: 'note-123', title: 'Bellman Equations' }],
        },
        createdAt: '2026-03-13T09:10:00.000Z',
      }),
      'make_note_from_task'
    )

    expect(artifact).not.toBeNull()
    expect(artifact?.status).toBe('ready')
    expect(artifact?.targetId).toBe('note-123')
    expect(artifact?.href).toBe('/editor?noteId=note-123')
  })

  it('resolves course missions into course deep links', () => {
    const artifact = resolveWorkflowArtifactFromMission(
      buildMissionState('make_course_from_plan', {
        id: 'handoff-2',
        missionId: 'mission-1',
        stepId: 'step-1',
        type: 'course_outline',
        summary: 'Course ready',
        payload: {
          courseId: 'course-55',
          title: 'RL Mission Track',
        },
        createdAt: '2026-03-13T09:10:00.000Z',
      }),
      'make_course_from_plan'
    )

    expect(artifact).not.toBeNull()
    expect(artifact?.kind).toBe('course')
    expect(artifact?.href).toBe('/courses/course-55')
  })
})
