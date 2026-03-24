-- Smart Agentic Inbox: add action_type, payload, preview_text to inbox_proposals
-- These columns support per-message AI classification with rich action proposals.

ALTER TABLE inbox_proposals
  ADD COLUMN action_type TEXT,
  ADD COLUMN payload JSONB DEFAULT '{}',
  ADD COLUMN preview_text TEXT;

-- Index for filtering pending proposals by action type
CREATE INDEX idx_proposals_action_type
  ON inbox_proposals(user_id, action_type) WHERE status = 'pending';
