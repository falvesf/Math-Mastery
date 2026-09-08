-- ============================================================
-- Descarte de itens VALIDADO NO SERVIDOR (SECURITY DEFINER).
-- Rode manualmente no Supabase SQL Editor.
--
-- Por que precisa: a política RLS de user_items tem
--   FOR ALL USING (student_id = auth.uid())
-- que, sem WITH CHECK, HERDA o USING como WITH CHECK → qualquer
-- UPDATE/INSERT com student_id <> auth.uid() é REJEITADO.
-- Além disso, a coluna student_id é UUID → 'dropped' (texto) não
-- converte. Usamos um UUID SENTINELA para o bucket de itens
-- descartados:
--   00000000-0000-0000-0000-000000000000
--
-- Esta RPC roda como definidor (SECURITY DEFINER), ignora o RLS e:
--  - só permite descartar item do PRÓPRIO usuário;
--  - p_destroy = true  → DELETE permanente;
--  - p_destroy = false → move para student_id = sentinela (outros
--    jogadores podem encontrar), gravando droppedBy.
--  - captura exceções e devolve a mensagem real.
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

  -- Segurança por TENANT: o item só pode ser descartado se pertencer à escola do
  -- usuário (ou ao tenant padrão). O tenant_id NÃO é alterado no descarte — o
  -- bucket sentinela é apenas o "dono" do item, então as escolas ficam isoladas.
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
    UPDATE user_items
    SET student_id = '00000000-0000-0000-0000-000000000000',
        equipped = false,
        data = jsonb_set(
          COALESCE(data, '{}'::jsonb),
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