-- ============================================================
-- Corrige a permissão de EDIÇÃO de itens da loja (store_items).
-- Rode manualmente no Supabase SQL Editor.
--
-- PROBLEMA: o front concede edição de itens (items: FULL) para
--   admin, coordinator e teacher (e funções customizadas), mas a RLS
--   "admin_manage_tenant_store_items" só permitia role = 'admin'.
--   Resultado: o UPDATE batia em 0 linhas SEM erro → o app mostrava
--   "salvo com sucesso" mas o valor (ex.: preço) não mudava.
--
-- SOLUÇÃO: permitir que qualquer STAFF do tenant (role <> 'student'),
-- além do superadmin, gerencie os itens da loja da sua escola.
-- Inclui WITH CHECK explícito (o mesmo do USING).
-- ============================================================

DROP POLICY IF EXISTS "admin_manage_tenant_store_items" ON store_items;

CREATE POLICY "staff_manage_tenant_store_items" ON store_items
  FOR ALL
  USING (
    is_superadmin()
    OR tenant_id IN (
      SELECT tenant_id FROM tenant_users
      WHERE user_id = auth.uid() AND role <> 'student'
    )
  )
  WITH CHECK (
    is_superadmin()
    OR tenant_id IN (
      SELECT tenant_id FROM tenant_users
      WHERE user_id = auth.uid() AND role <> 'student'
    )
  );