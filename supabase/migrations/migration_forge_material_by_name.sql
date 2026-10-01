-- ============================================================
-- MIGRAÇÃO: FORJA — casar MATERIAIS por id OU por NOME
--
-- Problema: o catálogo (store_items) é compartilhado entre escolas, então o
-- MESMO material (ex.: "Carvão") existe como VÁRIAS linhas com ids diferentes.
-- A forja exigia o material por `item_id`, e o id configurado não batia com o
-- id do item que o jogador tem na mochila → mostrava "FALTA" mesmo tendo.
--
-- Solução: a verificação e o consumo aceitam o material por `item_id`
-- (match direto) OU pelo nome normalizado (itemTitle/data.title/name).
-- ============================================================

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
  v_mat_title text;
  v_mat_row uuid;
  v_mat_q int;
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

    v_chance := LEAST(100::numeric, v_chance + v_scroll_bonus);
  END IF;

  -- Saldo de moedas (staff: saldo infinito, não valida nem deduz)
  SELECT COALESCE(coins, 0) INTO v_coins FROM users WHERE id = v_uid;
  IF NOT v_staff THEN
    IF v_coins < v_cost THEN
      RETURN jsonb_build_object('ok', false, 'error', 'moedas insuficientes', 'cost', v_cost, 'coins', v_coins);
    END IF;

    UPDATE users SET coins = coins - v_cost WHERE id = v_uid;
    INSERT INTO coin_logs (student_id, amount, reason, justification, tenant_id)
    VALUES (v_uid, -v_cost, 'Forja', 'item ' || v_item.item_id::text, v_item.tenant_id);
  END IF;
  v_coins := v_coins - (CASE WHEN v_staff THEN 0 ELSE v_cost END);

  -- Materiais exigidos (materialsPerLevel do nível alvo)
  SELECT ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_cfg->'materialsPerLevel'->v_next::text, '[]'::jsonb))::uuid)
  INTO v_mats;

  -- Verifica: aceita o material por item_id OU pelo NOME normalizado.
  IF array_length(v_mats, 1) > 0 THEN
    FOR v_i IN 1..array_length(v_mats, 1) LOOP
      SELECT COALESCE(si.name, si.data->>'title', si.data->>'itemTitle', '')
        INTO v_mat_title
      FROM store_items si WHERE si.id = v_mats[v_i];

      IF NOT EXISTS (
        SELECT 1 FROM user_items ui
        LEFT JOIN store_items si2 ON si2.id = ui.item_id
        WHERE ui.student_id = v_uid
          AND (COALESCE((ui.data->>'quantity')::int, 1)) >= 1
          AND (
            ui.item_id = v_mats[v_i]
            OR (length(trim(COALESCE(v_mat_title, ''))) > 0
                AND lower(trim(COALESCE(ui.data->>'itemTitle', si2.name, si2.data->>'title', '')))
                    = lower(trim(v_mat_title)))
          )
      ) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'materiais insuficientes');
      END IF;
    END LOOP;
  END IF;

  -- Consome materiais (sucesso E falha consomem), casando por id OU nome.
  IF array_length(v_mats, 1) > 0 THEN
    FOR v_i IN 1..array_length(v_mats, 1) LOOP
      SELECT COALESCE(si.name, si.data->>'title', si.data->>'itemTitle', '')
        INTO v_mat_title
      FROM store_items si WHERE si.id = v_mats[v_i];

      v_mat_row := NULL;
      SELECT ui.id INTO v_mat_row
      FROM user_items ui
      LEFT JOIN store_items si2 ON si2.id = ui.item_id
      WHERE ui.student_id = v_uid
        AND (COALESCE((ui.data->>'quantity')::int, 1)) >= 1
        AND (
          ui.item_id = v_mats[v_i]
          OR (length(trim(COALESCE(v_mat_title, ''))) > 0
              AND lower(trim(COALESCE(ui.data->>'itemTitle', si2.name, si2.data->>'title', '')))
                  = lower(trim(v_mat_title)))
        )
      ORDER BY (ui.item_id = v_mats[v_i]) DESC
      LIMIT 1;

      IF v_mat_row IS NOT NULL THEN
        SELECT COALESCE((data->>'quantity')::int, 1) INTO v_mat_q FROM user_items WHERE id = v_mat_row;
        IF v_mat_q <= 1 THEN
          DELETE FROM user_items WHERE id = v_mat_row;
        ELSE
          UPDATE user_items SET data = jsonb_set(data, '{quantity}', to_jsonb(v_mat_q - 1)) WHERE id = v_mat_row;
        END IF;
      END IF;
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

-- ============================================================
-- TRANSMUTAÇÃO: mesma correção (materiais por item_id OU nome)
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
  v_mat_title text;
  v_mat_row uuid;
  v_mat_q int;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'não autenticado');
  END IF;

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

  SELECT ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_cfg->'materials', '[]'::jsonb))::uuid)
  INTO v_mats;

  SELECT COALESCE(coins, 0) INTO v_coins FROM users WHERE id = v_uid;
  IF NOT v_staff THEN
    IF v_coins < v_coins_cost THEN
      RETURN jsonb_build_object('ok', false, 'error', 'moedas insuficientes', 'cost', v_coins_cost, 'coins', v_coins);
    END IF;

    UPDATE users SET coins = coins - v_coins_cost WHERE id = v_uid;
    INSERT INTO coin_logs (student_id, amount, reason, justification, tenant_id)
    VALUES (v_uid, -v_coins_cost, 'Transmutação', 'item ' || v_item.item_id::text, v_item.tenant_id);
  END IF;
  v_coins := v_coins - (CASE WHEN v_staff THEN 0 ELSE v_coins_cost END);

  -- Materiais presentes? (por item_id OU nome normalizado)
  IF array_length(v_mats, 1) > 0 THEN
    FOR v_i IN 1..array_length(v_mats, 1) LOOP
      SELECT COALESCE(si.name, si.data->>'title', si.data->>'itemTitle', '')
        INTO v_mat_title
      FROM store_items si WHERE si.id = v_mats[v_i];

      IF NOT EXISTS (
        SELECT 1 FROM user_items ui
        LEFT JOIN store_items si2 ON si2.id = ui.item_id
        WHERE ui.student_id = v_uid
          AND (COALESCE((ui.data->>'quantity')::int, 1)) >= 1
          AND (
            ui.item_id = v_mats[v_i]
            OR (length(trim(COALESCE(v_mat_title, ''))) > 0
                AND lower(trim(COALESCE(ui.data->>'itemTitle', si2.name, si2.data->>'title', '')))
                    = lower(trim(v_mat_title)))
          )
      ) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'materiais insuficientes');
      END IF;
    END LOOP;
  END IF;

  -- Consome materiais (por item_id OU nome)
  IF array_length(v_mats, 1) > 0 THEN
    FOR v_i IN 1..array_length(v_mats, 1) LOOP
      SELECT COALESCE(si.name, si.data->>'title', si.data->>'itemTitle', '')
        INTO v_mat_title
      FROM store_items si WHERE si.id = v_mats[v_i];

      v_mat_row := NULL;
      SELECT ui.id INTO v_mat_row
      FROM user_items ui
      LEFT JOIN store_items si2 ON si2.id = ui.item_id
      WHERE ui.student_id = v_uid
        AND (COALESCE((ui.data->>'quantity')::int, 1)) >= 1
        AND (
          ui.item_id = v_mats[v_i]
          OR (length(trim(COALESCE(v_mat_title, ''))) > 0
              AND lower(trim(COALESCE(ui.data->>'itemTitle', si2.name, si2.data->>'title', '')))
                  = lower(trim(v_mat_title)))
        )
      ORDER BY (ui.item_id = v_mats[v_i]) DESC
      LIMIT 1;

      IF v_mat_row IS NOT NULL THEN
        SELECT COALESCE((data->>'quantity')::int, 1) INTO v_mat_q FROM user_items WHERE id = v_mat_row;
        IF v_mat_q <= 1 THEN
          DELETE FROM user_items WHERE id = v_mat_row;
        ELSE
          UPDATE user_items SET data = jsonb_set(data, '{quantity}', to_jsonb(v_mat_q - 1)) WHERE id = v_mat_row;
        END IF;
      END IF;
    END LOOP;
  END IF;

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

    RETURN jsonb_build_object('ok', true, 'success', true, 'coins', v_coins, 'newTitle', v_result_store_data->>'title', 'message', 'sucesso');
  ELSE
    UPDATE user_items
    SET data = jsonb_set(v_item.data, '{forgeLevel}', to_jsonb(8))
    WHERE id = p_item_id;
    RETURN jsonb_build_object('ok', true, 'success', false, 'coins', v_coins, 'message', 'falha');
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.transmute_item(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transmute_item(uuid) TO authenticated;

