-- ============================================================
-- COURSE TABLES — supabase/migrations/011_courses.sql
-- ============================================================

-- Courses (top-level)
CREATE TABLE IF NOT EXISTS courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  topic TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  difficulty TEXT NOT NULL DEFAULT 'intermediate'
    CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  estimated_hours NUMERIC NOT NULL DEFAULT 0,
  prerequisites JSONB NOT NULL DEFAULT '[]',
  learning_objectives JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'generating'
    CHECK (status IN ('generating', 'ready', 'archived')),
  progress NUMERIC NOT NULL DEFAULT 0,
  settings JSONB NOT NULL DEFAULT '{}',
  research_report TEXT,
  thinking_trace TEXT,
  generated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Course Modules
CREATE TABLE IF NOT EXISTS course_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  "order" INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('locked', 'available', 'in_progress', 'completed')),
  progress NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lessons
CREATE TABLE IF NOT EXISTS course_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES course_modules(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('lecture', 'video', 'slides', 'practice', 'quiz')),
  duration TEXT NOT NULL DEFAULT '15 min',
  "order" INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('locked', 'available', 'in_progress', 'completed')),
  content JSONB NOT NULL DEFAULT '{}',
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Quiz Attempts
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES course_lessons(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  answers JSONB NOT NULL DEFAULT '{}',
  score NUMERIC NOT NULL DEFAULT 0,
  passed BOOLEAN NOT NULL DEFAULT false,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Course Progress (per user per course)
CREATE TABLE IF NOT EXISTS course_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  completed_lessons JSONB NOT NULL DEFAULT '[]',
  quiz_scores JSONB NOT NULL DEFAULT '{}',
  total_progress NUMERIC NOT NULL DEFAULT 0,
  last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(course_id, user_id)
);

-- Course Generation Threads (for LangGraph state continuity)
CREATE TABLE IF NOT EXISTS course_generation_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'awaiting_approval', 'generating_content', 'complete', 'error', 'cancelled')),
  current_stage TEXT NOT NULL DEFAULT 'research',
  outline JSONB,
  research_report TEXT,
  thinking_trace TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, thread_id)
);

-- Row Level Security
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_generation_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own courses"
  ON courses FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can read their course modules"
  ON course_modules FOR ALL
  USING (course_id IN (SELECT id FROM courses WHERE user_id = auth.uid()));
CREATE POLICY "Users can read their course lessons"
  ON course_lessons FOR ALL
  USING (module_id IN (SELECT id FROM course_modules WHERE course_id IN (SELECT id FROM courses WHERE user_id = auth.uid())));
CREATE POLICY "Users can manage their quiz attempts"
  ON quiz_attempts FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their course progress"
  ON course_progress FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their generation threads"
  ON course_generation_threads FOR ALL USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_courses_user ON courses(user_id);
CREATE INDEX idx_courses_status ON courses(user_id, status);
CREATE INDEX idx_course_modules_course ON course_modules(course_id);
CREATE INDEX idx_course_lessons_module ON course_lessons(module_id);
CREATE INDEX idx_quiz_attempts_lesson ON quiz_attempts(lesson_id, user_id);
CREATE INDEX idx_course_progress_user ON course_progress(user_id);
CREATE INDEX idx_course_gen_threads_user ON course_generation_threads(user_id);
