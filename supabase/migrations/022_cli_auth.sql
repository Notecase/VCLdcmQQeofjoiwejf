-- CLI Device Auth Sessions (RFC 8628 Device Authorization Grant)
-- Stores in-flight device auth requests. Rows are consumed after first successful
-- poll and cleaned up on each /start call.

CREATE TABLE cli_auth_sessions (
  device_code       TEXT PRIMARY KEY,
  user_code         TEXT NOT NULL UNIQUE,
  -- status: pending | approved | consumed | denied
  status            TEXT NOT NULL DEFAULT 'pending',
  client_name       TEXT,
  scopes            TEXT[],
  user_id           UUID REFERENCES auth.users,
  access_token      TEXT,
  refresh_token     TEXT,
  token_expires_at  TIMESTAMPTZ,      -- when the stored access_token expires
  expires_at        TIMESTAMPTZ NOT NULL,  -- device code TTL (10 min)
  last_polled_at    TIMESTAMPTZ,
  poll_count        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- Used by poll endpoint and cleanup query
CREATE INDEX idx_cli_auth_sessions_expires ON cli_auth_sessions(expires_at);

-- No RLS policies = service role only (public cannot read/write)
ALTER TABLE cli_auth_sessions ENABLE ROW LEVEL SECURITY;
