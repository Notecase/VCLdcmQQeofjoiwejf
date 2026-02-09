import { describe, expect, it } from 'vitest'
import type { CourseOutlineModule, CourseOutlineLesson } from '@inkdown/shared/types'
import { parseOutlineJSON } from './tools'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isUUID(value: string): boolean {
  return UUID_REGEX.test(value)
}

describe('parseOutlineJSON', () => {
  it('normalizes non-UUID and duplicate module/lesson IDs and falls back invalid order fields', () => {
    const outline = parseOutlineJSON(JSON.stringify({
      title: 'Test Course',
      topic: 'Testing',
      description: 'Course description',
      difficulty: 'beginner',
      estimatedHours: 5,
      prerequisites: [],
      learningObjectives: ['Understand tests'],
      modules: [
        {
          id: 'mod-1',
          title: 'Module 1',
          description: 'First module',
          order: 'not-a-number',
          lessons: [
            {
              id: 'les-1-1',
              title: 'Lesson 1',
              type: 'lecture',
              estimatedMinutes: 20,
              keyTopics: ['A'],
              learningObjectives: ['B'],
              order: 'bad-order',
            },
            {
              id: 'les-1-1',
              title: 'Lesson 2',
              type: 'practice',
              estimatedMinutes: 15,
              keyTopics: ['C'],
              learningObjectives: ['D'],
              order: 2,
            },
          ],
        },
        {
          id: 'mod-1',
          title: 'Module 2',
          description: 'Second module',
          order: 2,
          lessons: [
            {
              id: 'les-2-1',
              title: 'Lesson 3',
              type: 'quiz',
              estimatedMinutes: 10,
              keyTopics: ['E'],
              learningObjectives: ['F'],
              order: 1,
            },
          ],
        },
      ],
    }))

    const moduleIds = outline.modules.map((m: CourseOutlineModule) => m.id)
    const lessonIds = outline.modules.flatMap((m: CourseOutlineModule) => m.lessons.map((l: CourseOutlineLesson) => l.id))

    expect(moduleIds.every(isUUID)).toBe(true)
    expect(lessonIds.every(isUUID)).toBe(true)
    expect(new Set(moduleIds).size).toBe(moduleIds.length)
    expect(new Set(lessonIds).size).toBe(lessonIds.length)

    expect(outline.modules[0].order).toBe(1)
    expect(outline.modules[0].lessons[0].order).toBe(1)
  })

  it('preserves valid UUID IDs and numeric order values', () => {
    const moduleId = 'a7c5b3f9-6d13-4f70-97fb-6c85252ddce2'
    const lessonId = '4da80b01-cd64-4f18-bdbe-bf268b7b2a20'

    const outline = parseOutlineJSON(JSON.stringify({
      title: 'UUID Course',
      topic: 'Identifiers',
      description: 'Course description',
      difficulty: 'intermediate',
      estimatedHours: 3,
      prerequisites: [],
      learningObjectives: ['Understand IDs'],
      modules: [
        {
          id: moduleId,
          title: 'Module 1',
          description: 'First module',
          order: 3,
          lessons: [
            {
              id: lessonId,
              title: 'Lesson 1',
              type: 'lecture',
              estimatedMinutes: 20,
              keyTopics: [],
              learningObjectives: [],
              order: 4,
            },
          ],
        },
      ],
    }))

    expect(outline.modules[0].id).toBe(moduleId)
    expect(outline.modules[0].lessons[0].id).toBe(lessonId)
    expect(outline.modules[0].order).toBe(3)
    expect(outline.modules[0].lessons[0].order).toBe(4)
  })
})
