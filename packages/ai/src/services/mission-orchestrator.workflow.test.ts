import { describe, expect, it } from 'vitest'
import { createMissionStepsForWorkflow } from './mission-orchestrator'

describe('createMissionStepsForWorkflow', () => {
  it('keeps task note workflows focused on editor execution', () => {
    expect(createMissionStepsForWorkflow('make_note_from_task').map((step) => step.stage)).toEqual([
      'note_pack',
    ])
  })

  it('preserves the full mission pipeline for goal missions', () => {
    expect(createMissionStepsForWorkflow('goal_mission').map((step) => step.stage)).toEqual([
      'research',
      'course_draft',
      'daily_plan',
      'note_pack',
    ])
  })
})
