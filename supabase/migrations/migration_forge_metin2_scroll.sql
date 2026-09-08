-- ============================================================
-- FORJA: Regra Metin 2 para o Pergaminho do Ferreiro
-- ------------------------------------------------------------
-- 1. Remove overload antigo de 2 parâmetros para evitar erro PGRST203
-- 2. Se a forja falhar COM pergaminho:
--    - Protege da destruição
--    - Consome 1 pergaminho
--    - Regride 1 nível (-1), limitado ao mínimo +0 (se for +0, não perde nível)
-- 3. Se falhar SEM pergaminho:
--    - O item é DESTRUÍDO nas chamas (deletado de user_items)
-- ============================================================

DROP FUNCTION IF EXISTS public.forge_item(uuid, boolean);

CREATE OR REPLACE FUNCTION public.forge_item(
  p_item_id uuid,
  p_use_scroll boolean,
  p_scroll_doc_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_item user_items%ROWTYPE;
  v_store_price numeric;
  v_cfg jsonb;
  v_level int;
  v_next int;
  v_buy numeric;
  v_cost int;
  v_chance numeric;
  v_success boolean;
  v_coins numeric;
  v_staff boolean;
  v_mats uuid[];
  v_i int;
  v_defaults int[] := ARRAY[90,80,70,60,50,40,30,20,10];
  v_scroll_bonus numeric := 0;
  v_scroll_id uuid := NULL;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'não autenticado');
  END IF;

  -- Staff (superadmin/admin/teacher) tem saldo infinito: não valida nem deduz moedas
  SELECT EXISTS (
    SELECT 1 FROM users WHERE id = v_uid AND role IN ('superadmin', 'admin', 'teacher')
  ) INTO v_staff;

  SELECT * INTO v_item FROM user_items WHERE id = p_item_id AND student_id = v_uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'item não encontrado');
  END IF;

  IF COALESCE(v_item.data->>'itemType', '') <> 'equippable' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'item não é equipável');
  END IF;

  v_level := COALESCE((v_item.data->>'forgeLevel')::int, 0);
  IF v_level >= 9 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'item já está no nível máximo (+9)');
  END IF;
  v_next := v_level + 1;

  -- Config autoritativa vem da LOJA (o aluno não pode adulterar custo/chance)
  SELECT price, data->'forgeConfig' INTO v_store_price, v_cfg
  FROM store_items WHERE id = v_item.item_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'item não encontrado na loja');
  END IF;
  v_cfg := COALESCE(v_cfg, '{}'::jsonb);

  -- Preço de compra: preço atual da loja (fallback p/ dados do item)
  v_buy := COALESCE(
    NULLIF(v_store_price, 0),
    NULLIF(v_item.data->>'cost', '')::numeric,
    NULLIF(v_item.data->>'price', '')::numeric,
    100
  );

  -- Custo (override do painel admin se existir, senão cálculo padrão)
  IF v_cfg->'coinsCostPerLevel' ? v_next::text THEN
    v_cost := (v_cfg->'coinsCostPerLevel'->>v_next::text)::int;
  ELSE
    v_cost := public.forge_cost_for_level(v_next, v_buy);
  END IF;

  -- Chance base (override do painel ou padrão decrescente)
  IF v_cfg->'successChancePerLevel' ? v_next::text THEN
    v_chance := (v_cfg->'successChancePerLevel'->>v_next::text)::numeric;
  ELSE
    v_chance := v_defaults[v_next];
  END IF;

  -- Bônus do Pergaminho do Ferreiro (se ativado pelo jogador)
  IF p_use_scroll THEN
    -- 1. Tenta achar o scroll especificado
    IF p_scroll_doc_id IS NOT NULL THEN
      SELECT COALESCE(
        (ui.data->>'scrollChanceBonus')::numeric,
        (si.data->>'scrollChanceBonus')::numeric,
        30
      ), ui.id INTO v_scroll_bonus, v_scroll_id
      FROM user_items ui
      LEFT JOIN store_items si ON si.id = ui.item_id
      WHERE ui.id = p_scroll_doc_id AND ui.student_id = v_uid
        AND (COALESCE((ui.data->>'quantity')::int, 1)) >= 1;
    END IF;

    -- 2. Fallback para o primeiro scroll que encontrar no inventário
    IF v_scroll_id IS NULL THEN
      SELECT COALESCE(
        (ui.data->>'scrollChanceBonus')::numeric,
        (si.data->>'scrollChanceBonus')::numeric,
        30
      ), ui.id INTO v_scroll_bonus, v_scroll_id
      FROM user_items ui
      LEFT JOIN store_items si ON si.id = ui.item_id
      WHERE ui.student_id = v_uid 
        AND (ui.data->>'gameEffect' = 'blacksmith_scroll' OR si.data->>'gameEffect' = 'blacksmith_scroll')
        AND (COALESCE((ui.data->>'quantity')::int, 1)) >= 1
      LIMIT 1;
    END IF;

    IF v_scroll_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'sem pergaminho do ferreiro');
    END IF;

    -- Soma o bônus (%) à chance base (limitado a 100%)
    v_chance := LEAST(100::numeric, v_chance + v_scroll_bonus);
  END IF;

  -- Saldo de moedas (staff: saldo infinito, não valida nem deduz)
  SELECT COALESCE(coins, 0) INTO v_coins FROM users WHERE id = v_uid;
  IF NOT v_staff THEN
    IF v_coins < v_cost THEN
      RETURN jsonb_build_object('ok', false, 'error', 'moedas insuficientes', 'cost', v_cost, 'coins', v_coins);
    END IF;

    -- Deduz moedas + registro
    UPDATE users SET coins = coins - v_cost WHERE id = v_uid;
    INSERT INTO coin_logs (student_id, amount, reason, justification, tenant_id)
    VALUES (v_uid, -v_cost, 'Forja', 'item ' || v_item.item_id::text, v_item.tenant_id);
  END IF;
  v_coins := v_coins - (CASE WHEN v_staff THEN 0 ELSE v_cost END);

  -- Materiais exigidos (materialsPerLevel do nível alvo)
  SELECT ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_cfg->'materialsPerLevel'->v_next::text, '[]'::jsonb))::uuid)
  INTO v_mats;
  IF array_length(v_mats, 1) > 0 THEN
    FOR v_i IN 1..array_length(v_mats, 1) LOOP
      IF NOT EXISTS (
        SELECT 1 FROM user_items
        WHERE student_id = v_uid AND item_id = v_mats[v_i]
          AND (COALESCE((data->>'quantity')::int, 1)) >= 1
      ) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'materiais insuficientes');
      END IF;
    END LOOP;
  END IF;

  -- Consome materiais (sucesso E falha consomem)
  IF array_length(v_mats, 1) > 0 THEN
    FOR v_i IN 1..array_length(v_mats, 1) LOOP
      PERFORM public.consume_one_user_item(v_uid, v_mats[v_i]);
    END LOOP;
  END IF;

  -- Rola a chance NO SERVIDOR
  v_success := (random() * 100) <= v_chance;

  IF v_success THEN
    IF p_use_scroll THEN
      PERFORM public.consume_one_scroll(v_uid, v_scroll_id);
    END IF;
    UPDATE user_items
    SET data = jsonb_set(v_item.data, '{forgeLevel}', to_jsonb(v_next))
    WHERE id = p_item_id;
    RETURN jsonb_build_object('ok', true, 'success', true, 'level', v_next, 'coins', v_coins, 'message', 'sucesso');
  ELSE
    IF p_use_scroll THEN
      PERFORM public.consume_one_scroll(v_uid, v_scroll_id);
      -- Regra Metin 2: se falhar com pergaminho, regride 1 nível (se maior que 0)
      IF v_level > 0 THEN
        v_level := v_level - 1;
        UPDATE user_items
        SET data = jsonb_set(v_item.data, '{forgeLevel}', to_jsonb(v_level))
        WHERE id = p_item_id;
      END IF;
      RETURN jsonb_build_object('ok', true, 'success', false, 'coins', v_coins, 'protected', true, 'level', v_level, 'message', 'falha protegida');
    ELSE
      DELETE FROM user_items WHERE id = p_item_id;
      RETURN jsonb_build_object('ok', true, 'success', false, 'coins', v_coins, 'destroyed', true, 'message', 'item destruído');
    END IF;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.forge_item(uuid, boolean, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.forge_item(uuid, boolean, uuid) TO authenticated;
