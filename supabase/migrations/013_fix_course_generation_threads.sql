-- ============================================================
-- FIX: course_generation_threads schema to match API expectations
-- The original schema (011_courses.sql) had different column names
-- and missing columns that the API route inserts.
-- ============================================================

-- Rename mismatched columns
ALTER TABLE course_generation_threads RENAME COLUMN current_stage TO stage;
ALTER TABLE course_generation_threads RENAME COLUMN thinking_trace TO thinking_output;
ALTER TABLE course_generation_threads RENAME COLUMN error_message TO error;

-- Add missing columns needed by the orchestrator
ALTER TABLE course_generation_threads ADD COLUMN IF NOT EXISTS topic TEXT;
ALTER TABLE course_generation_threads ADD COLUMN IF NOT EXISTS difficulty TEXT;
ALTER TABLE course_generation_threads ADD COLUMN IF NOT EXISTS settings JSONB;
ALTER TABLE course_generation_threads ADD COLUMN IF NOT EXISTS focus_areas JSONB;
ALTER TABLE course_generation_threads ADD COLUMN IF NOT EXISTS progress NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE course_generation_threads ADD COLUMN IF NOT EXISTS rag_index JSONB;
ALTER TABLE course_generation_threads ADD COLUMN IF NOT EXISTS research_report TEXT;

-- Make thread_id nullable (API uses `id` as primary key, doesn't set thread_id separately)
ALTER TABLE course_generation_threads ALTER COLUMN thread_id DROP NOT NULL;
ALTER TABLE course_generation_threads ALTER COLUMN thread_id SET DEFAULT '';

-- Drop the unique constraint that requires thread_id (conflicts with nullable thread_id)
ALTER TABLE course_generation_threads DROP CONSTRAINT IF EXISTS course_generation_threads_user_id_thread_id_key;
