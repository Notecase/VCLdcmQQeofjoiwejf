-- Phase 2a: Autonomous inbox execution
-- Adds execution_result column and activity feed index

ALTER TABLE inbox_proposals ADD COLUMN execution_result JSONB DEFAULT NULL;

CREATE INDEX idx_proposals_activity_feed
  ON inbox_proposals(user_id, created_at DESC)
  WHERE status IN ('applied', 'failed');
