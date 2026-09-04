-- ============================================================
-- Recompensa de missão VALIDADA NO SERVIDOR (anti-fraude via console)
-- Aplica XP/moedas de uma missão de forma atômica, com tetos e
-- anti-spam. Roda como o DONO (SECURITY DEFINER), então funciona
-- mesmo com RLS desabilitado. O cliente envia apenas o contexto;
-- o valor é conferido/limitado aqui.
-- ============================================================

CREATE OR REPLACE FUNCTION apply_quest_reward(
  p_student_id uuid,
  p_quest_id text,
  p_earned_xp numeric,
  p_earned_coins numeric,
  p_reason text
) RETURNS jsonb AS $$
DECLARE
  v_user users%ROWTYPE;
  v_quest quests%ROWTYPE;
  v_max_xp numeric;
  v_max_coins numeric;
  v_new_xp numeric;
  v_new_coins numeric;
BEGIN
  SELECT * INTO v_user FROM users WHERE id = p_student_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'aluno não encontrado');
  END IF;

  SELECT * INTO v_quest FROM quests WHERE id = p_quest_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missão não encontrada');
  END IF;

  -- Teto de XP: nº de perguntas * 500 (margem generosa p/ multiplicadores de atributos).
  v_max_xp := GREATEST(1, COALESCE(jsonb_array_length(v_quest.questions::jsonb), 0)) * 500;
  -- Teto de moedas: XP * 10 + 10000 (cobre baú e multiplicadores).
  v_max_coins := v_max_xp * 10 + 10000;

  IF p_earned_xp IS NULL OR p_earned_xp < 0 OR p_earned_xp > v_max_xp THEN
    RETURN jsonb_build_object('ok', false, 'error', 'XP fora do limite', 'max_xp', v_max_xp, 'recebido', p_earned_xp);
  END IF;
  IF p_earned_coins IS NULL OR p_earned_coins < 0 OR p_earned_coins > v_max_coins THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Moedas fora do limite', 'max_coins', v_max_coins, 'recebido', p_earned_coins);
  END IF;

  -- Anti-spam: no máximo 1 recompensa por aluno a cada 5s (bloqueia loop/console).
  IF EXISTS (
    SELECT 1 FROM xp_logs
    WHERE student_id = p_student_id
      AND created_at > now() - interval '5 seconds'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'aguarde antes de recompensar novamente');
  END IF;

  v_new_xp := COALESCE(v_user.xp, 0) + p_earned_xp;
  v_new_coins := COALESCE(v_user.coins, 0) + p_earned_coins;

  UPDATE users SET xp = v_new_xp, coins = v_new_coins WHERE id = p_student_id;

  INSERT INTO xp_logs (student_id, amount, reason, tenant_id)
  VALUES (p_student_id, p_earned_xp, COALESCE(p_reason, 'Recompensa de missão') || ' [missão ' || p_quest_id || ']', v_user.tenant_id);

  IF p_earned_coins > 0 THEN
    INSERT INTO coin_logs (student_id, amount, reason, justification, tenant_id)
    VALUES (p_student_id, p_earned_coins, 'Recompensa de missão [missão ' || p_quest_id || ']', COALESCE(p_reason, ''), v_user.tenant_id);
  END IF;

  RETURN jsonb_build_object('ok', true, 'xp', v_new_xp, 'coins', v_new_coins);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Permite que o app (anon/authenticated) chame a função.
GRANT EXECUTE ON FUNCTION apply_quest_reward(uuid, text, numeric, numeric, text) TO anon, authenticated;