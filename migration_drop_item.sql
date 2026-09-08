-- ============================================================
-- Descarte de itens VALIDADO NO SERVIDOR (SECURITY DEFINER).
-- Rode manualmente no Supabase SQL Editor.
--
-- HISTÓRICO: a coluna user_items.student_id tem FOREIGN KEY para
-- users(id) → não dá para usar 'dropped' (texto) nem um UUID sentinela
-- sem criar um usuário fake. Além disso, a política RLS
--   FOR ALL USING (student_id = auth.uid())
-- herda o USING como WITH CHECK → mudar student_id é rejeitado.
--
-- SOLUÇÃO: o item NÃO troca de dono. Marca-se data.isDropped = true
-- (e droppedBy). O student_id permanece o do usuário (FK e RLS ok), e
-- os filtros da mochila/loja/bazar ignoram itens com isDropped. Assim o
-- item "sai" da mochila sem violar FK/RLS.
--
-- Esta RPC roda como definidor (SECURITY DEFINER) e:
--  - só permite descartar item do PRÓPRIO usuário;
--  - p_destroy = true  → DELETE permanente;
--  - p_destroy = false → marca isDropped (fica "fora" da mochila);
--  - valida tenant (item pertence à escola do usuário).
-- ============================================================

CREATE OR REPLACE FUNCTION public.drop_user_item(p_uid uuid, p_doc_id uuid, p_destroy boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item record;
  v_owns_tenant boolean;
BEGIN
  IF p_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'não autenticado');
  END IF;

  SELECT * INTO v_item FROM user_items WHERE id = p_doc_id AND student_id = p_uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'item não encontrado ou não pertence ao usuário');
  END IF;

  -- Segurança por TENANT: item só pode ser descartado se for da escola do usuário
  IF v_item.tenant_id IS NOT NULL AND v_item.tenant_id <> '00000000-0000-0000-0000-000000000001' THEN
    SELECT EXISTS (
      SELECT 1 FROM tenant_users WHERE user_id = p_uid AND tenant_id = v_item.tenant_id
    ) INTO v_owns_tenant;
    IF NOT v_owns_tenant THEN
      RETURN jsonb_build_object('ok', false, 'error', 'item não pertence à sua escola');
    END IF;
  END IF;

  IF COALESCE(p_destroy, false) THEN
    DELETE FROM user_items WHERE id = p_doc_id;
  ELSE
    -- Não muda student_id (FK/RLS) — apenas marca como descartado
    UPDATE user_items
    SET data = jsonb_set(
      jsonb_set(COALESCE(data, '{}'::jsonb), '{isDropped}', 'true'::jsonb),
      '{droppedBy}',
      to_jsonb(p_uid::text)
    )
    WHERE id = p_doc_id;
  END IF;

  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.drop_user_item(uuid, uuid, boolean) TO authenticated;