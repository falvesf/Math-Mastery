-- ============================================================
-- MIGRAÇÃO: PERMISSÕES da tabela item_transforms (Debug 3D)
-- Corrige o erro 403 Forbidden ao salvar a posição 3D do item
-- (POST .../item_transforms?on_conflict=item_key).
-- Se o RLS estiver ligado sem policy, o INSERT/UPDATE é negado.
-- ============================================================

ALTER TABLE IF EXISTS item_transforms DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE item_transforms TO anon, authenticated, service_role;
