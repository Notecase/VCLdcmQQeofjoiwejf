-- =============================================
-- Migration 034: Invite Codes
-- Email-locked invite codes for early access users
-- =============================================

-- =============================================
-- SECTION 1: Invite Codes Table
-- =============================================

CREATE TABLE IF NOT EXISTS invite_codes (
  code            TEXT PRIMARY KEY,
  email           TEXT NOT NULL,
  plan_type       TEXT NOT NULL DEFAULT 'studious',
  credits_cents   NUMERIC(12,4) NOT NULL DEFAULT 1200,
  duration_days   INTEGER NOT NULL DEFAULT 30,
  redeemed        BOOLEAN NOT NULL DEFAULT FALSE,
  redeemed_by     UUID REFERENCES auth.users(id),
  redeemed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Admin-only: no RLS read for regular users
ALTER TABLE invite_codes ENABLE ROW LEVEL SECURITY;

-- =============================================
-- SECTION 2: Redeem Invite Code RPC
-- Validates code + email match, grants credits, sets expiry
-- =============================================

CREATE OR REPLACE FUNCTION redeem_invite_code(
  p_code TEXT
)
RETURNS TABLE (success BOOLEAN, message TEXT, new_balance NUMERIC) AS $$
DECLARE
  v_invite   invite_codes%ROWTYPE;
  v_email    TEXT;
  v_user_id  UUID;
  v_balance  NUMERIC;
BEGIN
  -- Get caller info
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Not authenticated'::TEXT, 0::NUMERIC;
    RETURN;
  END IF;

  -- Get caller email
  SELECT au.email INTO v_email
  FROM auth.users au WHERE au.id = v_user_id;

  -- Lock the invite code row
  SELECT * INTO v_invite
  FROM invite_codes ic
  WHERE ic.code = p_code
  FOR UPDATE;

  -- Code not found
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Invalid invite code'::TEXT, 0::NUMERIC;
    RETURN;
  END IF;

  -- Already redeemed
  IF v_invite.redeemed THEN
    RETURN QUERY SELECT FALSE, 'This code has already been used'::TEXT, 0::NUMERIC;
    RETURN;
  END IF;

  -- Email mismatch
  IF LOWER(v_invite.email) != LOWER(v_email) THEN
    RETURN QUERY SELECT FALSE, 'This code is not assigned to your account'::TEXT, 0::NUMERIC;
    RETURN;
  END IF;

  -- Grant credits (uses existing grant_credits function)
  v_balance := grant_credits(
    v_user_id,
    v_invite.credits_cents,
    'Invite code: ' || p_code,
    v_invite.plan_type
  );

  -- Set plan expiry
  UPDATE user_credits
  SET plan_expires_at = NOW() + (v_invite.duration_days || ' days')::INTERVAL
  WHERE user_credits.user_id = v_user_id;

  -- Mark code as redeemed
  UPDATE invite_codes
  SET redeemed = TRUE,
      redeemed_by = v_user_id,
      redeemed_at = NOW()
  WHERE invite_codes.code = p_code;

  RETURN QUERY SELECT TRUE, 'Credits activated successfully!'::TEXT, v_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- SECTION 3: Permissions
-- =============================================

-- Authenticated users can call redeem (validation is inside the function)
GRANT EXECUTE ON FUNCTION redeem_invite_code TO authenticated;

-- =============================================
-- SECTION 4: Comments
-- =============================================

COMMENT ON TABLE invite_codes IS 'Email-locked invite codes for early access distribution';
COMMENT ON FUNCTION redeem_invite_code IS 'Validates and redeems an invite code for the calling user';
