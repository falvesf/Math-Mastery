-- ============================================================
-- MIGRAÇÃO: RLS das tabelas do RANCHO/PETS
-- Garante que o app consiga LER e GRAVAR pets/ranches/ranch_items.
-- Se o RLS estiver ligado sem policy, o INSERT de equipamentos do rancho
-- falha silenciosamente (o item era consumido e nada era instalado).
-- ============================================================

ALTER TABLE IF EXISTS pets         DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS ranches      DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS ranch_items  DISABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE pets, ranches, ranch_items TO anon, authenticated, service_role;
