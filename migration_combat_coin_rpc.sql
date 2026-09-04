-- ============================================================
-- Coleta de moedas de combate e recompensas de espectador (PvP)
-- VALIDADAS NO SERVIDOR (SECURITY DEFINER → funciona sem RLS).
-- ============================================================

-- Coleta de moeda em batalha: teto por moeda + limite de velocidade.
CREATE OR REPLACE FUNCTION collect_combat_coin(
  p_student_id uuid,
  p_value numeric
) RETURNS jsonb AS $$
DECLARE
  v_user users%ROWTYPE;
  v_new numeric;
BEGIN
  SELECT * INTO v_user FROM users WHERE id = p_student_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'aluno não encontrado');
  END IF;

  IF p_value IS NULL OR p_value <= 0 OR p_value > 50 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'valor inválido', 'max', 50);
  END IF;

  -- Anti-spam: no máximo ~5 coletas por segundo (cliques legítimos de moedas caídas).
  IF EXISTS (
    SELECT 1 FROM coin_logs
    WHERE student_id = p_student_id
      AND reason LIKE 'Coleta de moeda%'
      AND created_at > now() - interval '200 milliseconds'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'muito rápido');
  END IF;

  v_new := COALESCE(v_user.coins, 0) + p_value;
  UPDATE users SET coins = v_new WHERE id = p_student_id;

  INSERT INTO coin_logs (student_id, amount, reason, justification, tenant_id)
  VALUES (p_student_id, p_value, 'Coleta de moeda em batalha', '', v_user.tenant_id);

  RETURN jsonb_build_object('ok', true, 'coins', v_new);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recompensa de espectador (PvP): teto + limite de frequência.
CREATE OR REPLACE FUNCTION award_spectate_coins(
  p_student_id uuid,
  p_coins numeric,
  p_reason text
) RETURNS jsonb AS $$
DECLARE
  v_user users%ROWTYPE;
  v_new numeric;
BEGIN
  SELECT * INTO v_user FROM users WHERE id = p_student_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'aluno não encontrado');
  END IF;

  IF p_coins IS NULL OR p_coins <= 0 OR p_coins > 500 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'valor inválido', 'max', 500);
  END IF;

  -- Anti-spam: recompensa de espectador no máximo 1 vez a cada 30s.
  IF EXISTS (
    SELECT 1 FROM coin_logs
    WHERE student_id = p_student_id
      AND reason LIKE '%espectador%'
      AND created_at > now() - interval '30 seconds'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'aguarde antes de recompensar');
  END IF;

  v_new := COALESCE(v_user.coins, 0) + p_coins;
  UPDATE users SET coins = v_new WHERE id = p_student_id;

  INSERT INTO coin_logs (student_id, amount, reason, justification, tenant_id)
  VALUES (p_student_id, p_coins, COALESCE(p_reason, 'Recompensa de espectador'), '', v_user.tenant_id);

  RETURN jsonb_build_object('ok', true, 'coins', v_new);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION collect_combat_coin(uuid, numeric) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION award_spectate_coins(uuid, numeric, text) TO anon, authenticated;