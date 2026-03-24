-- Phase 2a: Autonomous inbox execution
-- Adds execution_result column, expands status CHECK, and adds activity feed index

-- 1. Add execution_result column
ALTER TABLE inbox_proposals ADD COLUMN IF NOT EXISTS execution_result JSONB DEFAULT NULL;

-- 2. Drop old status CHECK constraint and add expanded one
ALTER TABLE inbox_proposals DROP CONSTRAINT IF EXISTS inbox_proposals_status_check;
ALTER TABLE inbox_proposals ADD CONSTRAINT inbox_proposals_status_check
  CHECK (status IN ('pending', 'executing', 'awaiting_clarification', 'approved', 'rejected', 'applied', 'failed'));

-- 3. Activity feed index
CREATE INDEX IF NOT EXISTS idx_proposals_activity_feed
  ON inbox_proposals(user_id, created_at DESC)
  WHERE status IN ('applied', 'failed');
