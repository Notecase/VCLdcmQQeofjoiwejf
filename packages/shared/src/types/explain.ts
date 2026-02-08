export interface ExplainLessonContext {
  courseTitle: string
  moduleTitle: string
  lessonTitle: string
  lessonType: 'lecture' | 'video' | 'slides' | 'practice' | 'quiz'
  markdown: string
  keyTerms?: { term: string, definition: string }[]
  keyPoints?: string[]
  transcript?: string
}

export interface ExplainInput {
  message: string
  lessonContext: ExplainLessonContext
  highlightedText?: string
  conversationHistory?: Array<{ role: 'user' | 'assistant', content: string }>
}

export type ExplainStreamEvent =
  | { event: 'text', data: string }
  | { event: 'thinking', data: string }
  | { event: 'done', data?: string }
  | { event: 'error', data: string }
