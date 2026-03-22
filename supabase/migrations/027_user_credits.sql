-- =============================================
-- Migration 027: User Credits & Billing
-- Adds credit balance tracking and transaction ledger
-- =============================================

-- =============================================
-- SECTION 1: User Credits Balance
-- =============================================

CREATE TABLE IF NOT EXISTS user_credits (
  user_id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance_cents    NUMERIC(12,4) NOT NULL DEFAULT 0,
  lifetime_granted NUMERIC(12,4) NOT NULL DEFAULT 0,
  lifetime_used    NUMERIC(12,4) NOT NULL DEFAULT 0,
  plan_type        TEXT DEFAULT 'none',
  plan_expires_at  TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_credits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_user_credits" ON user_credits;
CREATE POLICY "own_user_credits" ON user_credits
  FOR SELECT USING (auth.uid() = user_id);

-- =============================================
-- SECTION 2: Credit Transactions (Audit Ledger)
-- =============================================

CREATE TABLE IF NOT EXISTS credit_transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type            TEXT NOT NULL CHECK (type IN ('grant','deduction','refund','expiry')),
  amount_cents    NUMERIC(12,4) NOT NULL,
  balance_after   NUMERIC(12,4) NOT NULL,
  description     TEXT,
  ai_usage_id     UUID REFERENCES ai_usage(id),
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_date
  ON credit_transactions(user_id, created_at DESC);

ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_credit_transactions" ON credit_transactions;
CREATE POLICY "own_credit_transactions" ON credit_transactions
  FOR SELECT USING (auth.uid() = user_id);

-- =============================================
-- SECTION 3: Atomic Credit Deduction
-- Uses FOR UPDATE row lock to prevent concurrent overdraft
-- =============================================

CREATE OR REPLACE FUNCTION deduct_credits(
  p_user_id UUID,
  p_amount NUMERIC,
  p_description TEXT DEFAULT 'AI usage',
  p_ai_usage_id UUID DEFAULT NULL
)
RETURNS TABLE (success BOOLEAN, new_balance NUMERIC) AS $$
DECLARE
  v_balance NUMERIC;
  v_new_balance NUMERIC;
BEGIN
  -- Lock the row for this user
  SELECT uc.balance_cents INTO v_balance
  FROM user_credits uc
  WHERE uc.user_id = p_user_id
  FOR UPDATE;

  -- No row = no credits
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC;
    RETURN;
  END IF;

  -- Check sufficient balance (allow slight overdraft on current request)
  IF v_balance <= 0 THEN
    RETURN QUERY SELECT FALSE, v_balance;
    RETURN;
  END IF;

  v_new_balance := v_balance - p_amount;

  -- Update balance
  UPDATE user_credits
  SET balance_cents = v_new_balance,
      lifetime_used = lifetime_used + p_amount,
      updated_at = NOW()
  WHERE user_credits.user_id = p_user_id;

  -- Record transaction
  INSERT INTO credit_transactions (user_id, type, amount_cents, balance_after, description, ai_usage_id)
  VALUES (p_user_id, 'deduction', -p_amount, v_new_balance, p_description, p_ai_usage_id);

  RETURN QUERY SELECT TRUE, v_new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- SECTION 4: Grant Credits (Admin)
-- Upserts user_credits row and records transaction
-- =============================================

CREATE OR REPLACE FUNCTION grant_credits(
  p_user_id UUID,
  p_amount NUMERIC,
  p_description TEXT DEFAULT 'Credit grant',
  p_plan_type TEXT DEFAULT NULL
)
RETURNS NUMERIC AS $$
DECLARE
  v_new_balance NUMERIC;
BEGIN
  INSERT INTO user_credits (user_id, balance_cents, lifetime_granted, plan_type)
  VALUES (p_user_id, p_amount, p_amount, COALESCE(p_plan_type, 'trial'))
  ON CONFLICT (user_id) DO UPDATE
  SET balance_cents = user_credits.balance_cents + p_amount,
      lifetime_granted = user_credits.lifetime_granted + p_amount,
      plan_type = COALESCE(p_plan_type, user_credits.plan_type),
      updated_at = NOW()
  RETURNING balance_cents INTO v_new_balance;

  -- Record transaction
  INSERT INTO credit_transactions (user_id, type, amount_cents, balance_after, description)
  VALUES (p_user_id, 'grant', p_amount, v_new_balance, p_description);

  RETURN v_new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- SECTION 5: Permissions
-- =============================================

GRANT EXECUTE ON FUNCTION deduct_credits TO service_role;
GRANT EXECUTE ON FUNCTION grant_credits TO service_role;

-- =============================================
-- SECTION 6: Comments
-- =============================================

COMMENT ON TABLE user_credits IS 'Per-user credit balance for AI usage billing';
COMMENT ON TABLE credit_transactions IS 'Append-only audit ledger for credit changes';
COMMENT ON FUNCTION deduct_credits IS 'Atomically deduct credits with row-level locking';
COMMENT ON FUNCTION grant_credits IS 'Grant credits to a user (admin operation)';
