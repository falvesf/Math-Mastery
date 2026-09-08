-- ============================================================
-- Descarte de itens VALIDADO NO SERVIDOR (SECURITY DEFINER).
-- Rode manualmente no Supabase SQL Editor.
--
-- Por que precisa: a política RLS de user_items tem
--   FOR ALL USING (student_id = auth.uid())
-- que, sem WITH CHECK, HERDA o USING como WITH CHECK → qualquer
-- UPDATE/INSERT com student_id <> auth.uid() (ex.: 'dropped') é
-- REJEITADO. O descarte "sem destruir" movia o item para o bucket
-- 'dropped' via UPDATE e falhava em silêncio — o item ficava na mochila.
--
-- Esta RPC roda como definidor (SECURITY DEFINER), ignora o RLS e:
--  - só permite descartar item do PRÓPRIO usuário;
--  - p_destroy = true  → DELETE permanente;
--  - p_destroy = false → move para student_id = 'dropped' (outros
--    jogadores podem encontrar), gravando droppedBy.
-- ============================================================

CREATE OR REPLACE FUNCTION public.drop_user_item(p_uid uuid, p_doc_id uuid, p_destroy boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item record;
BEGIN
  IF p_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'não autenticado');
  END IF;

  SELECT * INTO v_item FROM user_items WHERE id = p_doc_id AND student_id = p_uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'item não encontrado ou não pertence ao usuário');
  END IF;

  IF COALESCE(p_destroy, false) THEN
    DELETE FROM user_items WHERE id = p_doc_id;
  ELSE
    UPDATE user_items
    SET student_id = 'dropped',
        equipped = false,
        data = jsonb_set(
          COALESCE(data, '{}'::jsonb),
          '{droppedBy}',
          to_jsonb(p_uid::text)
        )
    WHERE id = p_doc_id;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.drop_user_item(uuid, uuid, boolean) TO authenticated;