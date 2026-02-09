-- ============================================================
-- EDITOR DEEP MEMORY + THREAD STATE EXTENSIONS
-- ============================================================

ALTER TABLE editor_thread_state
  ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_note_id UUID,
  ADD COLUMN IF NOT EXISTS rolling_summary TEXT NOT NULL DEFAULT '';

ALTER TABLE editor_memories
  ADD COLUMN IF NOT EXISTS scope_type TEXT NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS scope_id TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS source_thread_id UUID REFERENCES editor_threads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS importance DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'editor_memories_scope_type_check'
  ) THEN
    ALTER TABLE editor_memories
      ADD CONSTRAINT editor_memories_scope_type_check
      CHECK (scope_type IN ('note', 'workspace', 'user'));
  END IF;
END $$;

UPDATE editor_memories
SET scope_id = COALESCE(NULLIF(scope_id, ''), user_id::text)
WHERE scope_type = 'user';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'editor_memories_user_id_key_key'
  ) THEN
    ALTER TABLE editor_memories DROP CONSTRAINT editor_memories_user_id_key_key;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'editor_memories_user_scope_key_unique'
  ) THEN
    ALTER TABLE editor_memories
      ADD CONSTRAINT editor_memories_user_scope_key_unique
      UNIQUE (user_id, scope_type, scope_id, key);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_editor_thread_state_last_message
  ON editor_thread_state(last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_editor_memories_scope
  ON editor_memories(user_id, scope_type, scope_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_editor_memories_last_used
  ON editor_memories(user_id, last_used_at DESC);
