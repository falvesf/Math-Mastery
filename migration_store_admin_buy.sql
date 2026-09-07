-- ============================================================
-- Compra de itens OCULTOS da loja (transmutáveis / Material) SÓ
-- para staff, validada NO SERVIDOR (SECURITY DEFINER).
-- Rode manualmente no Supabase SQL Editor.
--
-- Proteção:
--  - auth.uid() vem do JWT do usuário autenticado (não é passado
--    pelo cliente, então o aluno NÃO consegue se passar por outro);
--  - apenas superadmin/admin/teacher têm permissão;
--  - só itens marcados como transmutados (isTransmuted) OU
--    materiais (type 'other') podem ser comprados por aqui;
--  - a compra é grátis (staff tem saldo infinito, como na loja).
-- ============================================================

CREATE OR REPLACE FUNCTION public.buy_hidden_store_item(p_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_staff boolean;
  v_item record;
  v_data jsonb;
  v_tenant uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'não autenticado');
  END IF;

  -- Apenas staff (superadmin/admin/teacher) pode comprar itens ocultos
  SELECT EXISTS (
    SELECT 1 FROM users WHERE id = v_uid AND role IN ('superadmin', 'admin', 'teacher')
  ) INTO v_staff;
  IF NOT v_staff THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permissão negada: apenas administradores/professores');
  END IF;

  SELECT id, price, data, tenant_id INTO v_item
  FROM store_items WHERE id = p_item_id AND active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'item não encontrado na loja');
  END IF;

  v_data := COALESCE(v_item.data, '{}'::jsonb);
  v_tenant := v_item.tenant_id;

  -- Item oculto: transmutado OU material (type 'other')
  IF NOT (COALESCE((v_data->>'isTransmuted')::boolean, false) OR (v_data->>'type') = 'other') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'item não é oculto (transmutável/material)');
  END IF;

  INSERT INTO user_items (student_id, item_id, equipped, data, tenant_id)
  VALUES (
    v_uid,
    p_item_id,
    false,
    jsonb_build_object(
      'itemTitle', COALESCE(v_data->>'title', 'Item'),
      'itemDescription', COALESCE(v_data->>'description', ''),
      'itemType', COALESCE(v_data->>'type', 'other'),
      'itemImageUrl', COALESCE(v_data->>'imageUrl', ''),
      'gameEffect', COALESCE(v_data->>'gameEffect', 'none'),
      'usableInQuest', COALESCE((v_data->>'usableInQuest')::boolean, false),
      'battleSoundUrl', COALESCE(v_data->>'battleSoundUrl', ''),
      'quantity', 1,
      'giftedBy', NULL,
      'avatarPart', v_data->>'avatarPart',
      'itemCategory', COALESCE(v_data->>'itemCategory', 'none'),
      'baseAttributeType', COALESCE(v_data->>'baseAttributeType', 'none'),
      'baseAttributeValue', COALESCE((v_data->>'baseAttributeValue')::numeric, 0),
      'forgeLevel', 0,
      'gameModelUrl', COALESCE(v_data->>'gameModelUrl', ''),
      'modelTextureUrl', COALESCE(v_data->>'modelTextureUrl', ''),
      'minecraftHeadValue', COALESCE(v_data->>'minecraftHeadValue', ''),
      'modelTransforms', v_data->'modelTransforms',
      'adds', COALESCE(v_data->'adds', '[]'::jsonb),
      'minSalePrice', COALESCE((v_data->>'minSalePrice')::int, 0),
      'rarity', COALESCE(v_data->>'rarity', 'common'),
      'unlockedSkinId', COALESCE(v_data->>'unlockedSkinId', ''),
      'buffDurationDays', COALESCE((v_data->>'buffDurationDays')::int, 7),
      'backColor', COALESCE(v_data->>'backColor', ''),
      'damageEffect', COALESCE(v_data->>'damageEffect', 'none'),
      'forgeConfig', v_data->'forgeConfig'
    ),
    v_tenant
  );

  RETURN jsonb_build_object('ok', true, 'itemId', p_item_id);
END;
$$;

-- Expõe a RPC via PostgREST para usuários autenticados
GRANT EXECUTE ON FUNCTION public.buy_hidden_store_item(uuid) TO authenticated;