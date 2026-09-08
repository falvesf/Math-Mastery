-- ============================================================
-- FIX: Economia por Escola não salva
-- Causa: system_collections ainda tem RLS habilitado,
-- bloqueando INSERT/UPDATE pela chave anônima (401).
-- As demais tabelas já tiveram RLS desabilitado.
-- ============================================================

-- 1. Desabilitar RLS em system_collections
ALTER TABLE system_collections DISABLE ROW LEVEL SECURITY;

-- 2. Remover TODAS as políticas RLS de system_collections
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'system_collections') LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON system_collections';
  END LOOP;
END $$;

-- 3. Garantir a constraint única para o upsert de economia
-- (coluna tenant_id + collection_name + doc_id)
ALTER TABLE system_collections DROP CONSTRAINT IF EXISTS uniq_settings_doc_tenant;
ALTER TABLE system_collections ADD CONSTRAINT uniq_settings_doc_tenant UNIQUE (collection_name, doc_id, tenant_id);

-- 4. Garantir a economia padrão da escola padrão
INSERT INTO system_collections (collection_name, doc_id, tenant_id, data)
VALUES ('settings', 'economy', '00000000-0000-0000-0000-000000000001',
  '{"currencyType":"coins","coinsDropInCombat":false,"coinsLostInCombat":false,"coinsCanBuyItems":true,"coinToXPRatio":10,"rankUpChestEnabled":false,"rankUpChestItems":[]}'::jsonb)
ON CONFLICT (collection_name, doc_id, tenant_id) DO NOTHING;

-- 5. Verificação
SELECT tenant_id, count(*) AS registros
FROM system_collections
WHERE collection_name = 'settings' AND doc_id = 'economy'
GROUP BY tenant_id;
