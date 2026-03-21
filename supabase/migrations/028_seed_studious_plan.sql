-- =============================================
-- Migration 028: Seed Studious Plan for Power User
-- Grants 1200 cents ($12) credit allowance with 30-day expiry
-- =============================================

DO $$
DECLARE v_user_id UUID;
BEGIN
  SELECT id INTO v_user_id FROM auth.users
  WHERE email = 'quangchuyentoan2005@gmail.com';

  IF v_user_id IS NOT NULL THEN
    -- Grant credits and set plan type via existing function
    PERFORM grant_credits(v_user_id, 1200, 'Studious Plan activation', 'studious');

    -- Set 30-day expiry
    UPDATE user_credits
    SET plan_expires_at = NOW() + INTERVAL '30 days'
    WHERE user_id = v_user_id;
  END IF;
END $$;
