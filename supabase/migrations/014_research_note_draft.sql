-- ============================================================
-- RESEARCH NOTE DRAFT STATE — supabase/migrations/014_research_note_draft.sql
-- ============================================================

ALTER TABLE research_thread_state
  ADD COLUMN IF NOT EXISTS note_draft JSONB;
