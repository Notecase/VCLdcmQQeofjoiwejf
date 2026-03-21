export const WORKFLOW_KEYS = [
  'goal_mission',
  'make_note_from_task',
  'research_topic_from_task',
  'make_course_from_plan',
  'materialize_morning_plan',
  'evening_reflection',
  'weekly_review',
] as const

export type WorkflowKey = (typeof WORKFLOW_KEYS)[number]

export const TRIGGER_SOURCES = ['user', 'heartbeat', 'mcp', 'openclaw'] as const

export type TriggerSource = (typeof TRIGGER_SOURCES)[number]
