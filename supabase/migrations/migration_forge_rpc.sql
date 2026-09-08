-- ============================================================
-- Forja e Transmutação VALIDADAS NO SERVIDOR (SECURITY DEFINER)
-- Rode manualmente no Supabase SQL Editor.
--
-- Proteção contra adulteração via console do navegador:
--  - o usuário NÃO escolhe o resultado (chance rolada no servidor);
--  - o custo/chance/transmuteConfig são lidos da LOJA (store_items),
--    que o aluno não pode alterar (só admin); adulterar o próprio
--    user_items.data não muda custo/chance;
--  - moedas deduzidas com checagem de saldo + registro em coin_logs.
--
-- OBS: ainda é possível ao aluno setar forgeLevel diretamente em
-- user_items via UPDATE (RLS FOR ALL atual). Para fechar 100%,
-- migrar as demais escritas de user_items (equipar/usar/vender)
-- para RPCs e restringir UPDATE na tabela — refatoração maior.
-- ============================================================

-- Custo da forja (mesma regra do frontend):
--   custo(n) = round((valorAtual/2) * (1 + n*0.10))
--   valorAtual(+0) = buyPrice ; valorAtual(n) = buyPrice + soma(custos 1..n)
CREATE OR REPLACE FUNCTION public.forge_cost_for_level(p_level int, p_buy numeric)
RETURNS int
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_prev numeric;
  v_cost numeric;
  v_j int;
BEGIN
  v_prev := GREATEST(0, COALESCE(p_buy, 0));
  FOR v_j IN 1..GREATEST(1, LEAST(9, COALESCE(p_level, 1))) LOOP
    v_cost := round((v_prev / 2) * (1 + v_j * 0.10));
    IF v_j = p_level THEN
      RETURN v_cost::int;
    END IF;
    v_prev := v_prev + v_cost;
  END LOOP;
  RETURN round((v_prev / 2) * (1 + COALESCE(p_level, 1) * 0.10))::int;
END;
$$;

-- Consome 1 unidade de um user_items por item_id (usado p/ materiais)
CREATE OR REPLACE FUNCTION public.consume_one_user_item(p_uid uuid, p_item_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_data jsonb;
  v_qty int;
BEGIN
  SELECT id, data INTO v_id, v_data
  FROM user_items
  WHERE student_id = p_uid AND item_id = p_item_id
    AND (COALESCE((data->>'quantity')::int, 1)) >= 1
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  v_qty := COALESCE((v_data->>'quantity')::int, 1);
  IF v_qty > 1 THEN
    UPDATE user_items
    SET data = jsonb_set(data, '{quantity}', to_jsonb(v_qty - 1))
    WHERE id = v_id;
  ELSE
    DELETE FROM user_items WHERE id = v_id;
  END IF;
  RETURN true;
END;
$$;

-- Consome 1 Pergaminho do Ferreiro (gameEffect = 'blacksmith_scroll')
CREATE OR REPLACE FUNCTION public.consume_one_scroll(p_uid uuid, p_scroll_doc_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_data jsonb;
  v_qty int;
BEGIN
  IF p_scroll_doc_id IS NOT NULL THEN
    SELECT id, data INTO v_id, v_data
    FROM user_items
    WHERE id = p_scroll_doc_id AND student_id = p_uid
      AND (COALESCE((data->>'quantity')::int, 1)) >= 1;
  END IF;

  IF v_id IS NULL THEN
    SELECT id, data INTO v_id, v_data
    FROM user_items
    WHERE student_id = p_uid AND data->>'gameEffect' = 'blacksmith_scroll'
      AND (COALESCE((data->>'quantity')::int, 1)) >= 1
    LIMIT 1;
  END IF;

  IF NOT FOUND OR v_id IS NULL THEN RETURN; END IF;
  v_qty := COALESCE((v_data->>'quantity')::int, 1);
  IF v_qty > 1 THEN
    UPDATE user_items SET data = jsonb_set(data, '{quantity}', to_jsonb(v_qty - 1)) WHERE id = v_id;
  ELSE
    DELETE FROM user_items WHERE id = v_id;
  END IF;
END;
$$;

-- ============================================================
-- FORJA: valida tudo no servidor e rola a chance.
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

-- ============================================================
-- TRANSMUTAÇÃO: valida tudo no servidor e rola a chance.
-- ============================================================
CREATE OR REPLACE FUNCTION public.transmute_item(p_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_item user_items%ROWTYPE;
  v_cfg jsonb;
  v_result_id uuid;
  v_mats uuid[];
  v_coins_cost int;
  v_chance numeric;
  v_coins numeric;
  v_staff boolean;
  v_success boolean;
  v_i int;
  v_result_store_id uuid;
  v_result_store_data jsonb;
  v_new_data jsonb;
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

  IF COALESCE((v_item.data->>'forgeLevel')::int, 0) <> 9 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'item precisa estar no +9');
  END IF;

  -- Config autoritativa vem da LOJA
  SELECT data->'transmuteConfig' INTO v_cfg
  FROM store_items WHERE id = v_item.item_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'item não encontrado na loja');
  END IF;
  v_cfg := COALESCE(v_cfg, '{}'::jsonb);

  v_result_id := (v_cfg->>'resultItemId')::uuid;
  IF v_result_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'item não possui configuração de transmutação');
  END IF;
  v_coins_cost := COALESCE((v_cfg->>'coinsCost')::int, 0);
  v_chance := COALESCE((v_cfg->>'successChance')::numeric, 25);

  -- Materiais exigidos (array de ids de store_items)
  SELECT ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_cfg->'materials', '[]'::jsonb))::uuid)
  INTO v_mats;

  -- Saldo de moedas (staff: saldo infinito, não valida nem deduz)
  SELECT COALESCE(coins, 0) INTO v_coins FROM users WHERE id = v_uid;
  IF NOT v_staff THEN
    IF v_coins < v_coins_cost THEN
      RETURN jsonb_build_object('ok', false, 'error', 'moedas insuficientes', 'cost', v_coins_cost, 'coins', v_coins);
    END IF;

    -- Deduz moedas + registro
    UPDATE users SET coins = coins - v_coins_cost WHERE id = v_uid;
    INSERT INTO coin_logs (student_id, amount, reason, justification, tenant_id)
    VALUES (v_uid, -v_coins_cost, 'Transmutação', 'item ' || v_item.item_id::text, v_item.tenant_id);
  END IF;
  v_coins := v_coins - (CASE WHEN v_staff THEN 0 ELSE v_coins_cost END);

  -- Todos os materiais presentes?
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
    SELECT id, data INTO v_result_store_id, v_result_store_data
    FROM store_items WHERE id = v_result_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'item de resultado não encontrado');
    END IF;

    v_new_data := v_item.data || jsonb_build_object(
      'itemId', v_result_store_id::text,
      'itemTitle', v_result_store_data->>'title',
      'itemImageUrl', COALESCE(v_result_store_data->>'imageUrl', ''),
      'gameEffect', COALESCE(v_result_store_data->>'gameEffect', 'none'),
      'gameModelUrl', COALESCE(v_result_store_data->>'gameModelUrl', ''),
      'modelTextureUrl', COALESCE(v_result_store_data->>'modelTextureUrl', ''),
      'minecraftHeadValue', COALESCE(v_result_store_data->>'minecraftHeadValue', ''),
      'avatarPart', COALESCE(v_result_store_data->>'avatarPart', ''),
      'itemCategory', COALESCE(v_result_store_data->>'itemCategory', 'none'),
      'baseAttributeType', COALESCE(v_result_store_data->>'baseAttributeType', 'none'),
      'baseAttributeValue', COALESCE((v_result_store_data->>'baseAttributeValue')::numeric, 0),
      'modelTransforms', COALESCE(v_result_store_data->'modelTransforms', 'null'::jsonb),
      'forgeLevel', 0,
      'isForgeable', COALESCE(v_result_store_data->'isForgeable', false),
      'forgeConfig', COALESCE(v_result_store_data->'forgeConfig', '{}'::jsonb),
      'isTransmutable', COALESCE(v_result_store_data->'isTransmutable', false),
      'isTransmuted', COALESCE(v_result_store_data->'isTransmuted', false),
      'transmuteConfig', COALESCE(v_result_store_data->'transmuteConfig', '{}'::jsonb),
      'adds', '[]'::jsonb
    );

    UPDATE user_items
    SET item_id = v_result_store_id, data = v_new_data
    WHERE id = p_item_id;

    RETURN jsonb_build_object(
      'ok', true, 'success', true,
      'coins', v_coins,
      'newTitle', v_result_store_data->>'title',
      'message', 'sucesso'
    );
  ELSE
    UPDATE user_items
    SET data = jsonb_set(v_item.data, '{forgeLevel}', to_jsonb(8))
    WHERE id = p_item_id;
    RETURN jsonb_build_object('ok', true, 'success', false, 'coins', v_coins, 'message', 'falha');
  END IF;
END;
$$;

-- Permissões: somente usuários autenticados executam
REVOKE EXECUTE ON FUNCTION public.forge_cost_for_level(int, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.consume_one_user_item(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.consume_one_scroll(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.forge_item(uuid, boolean, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.transmute_item(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.forge_cost_for_level(int, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_one_user_item(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_one_scroll(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.forge_item(uuid, boolean, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transmute_item(uuid) TO authenticated;