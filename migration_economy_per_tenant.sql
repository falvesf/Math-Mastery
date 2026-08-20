-- ============================================================
-- MIGRAÇÃO: Economia por Escola + Limpeza de Duplicatas
-- ============================================================

-- 1. Remover duplicatas de economia (manter 1 por escola/tenant)
DELETE FROM system_collections a
USING system_collections b
WHERE a.collection_name = 'settings'
  AND a.doc_id = 'economy'
  AND a.ctid < b.ctid
  AND a.tenant_id IS NOT DISTINCT FROM b.tenant_id;

-- 2. Garantir colunas nas tabelas
ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_class_name TEXT;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE custom_ranks ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE custom_ranks ADD COLUMN IF NOT EXISTS is_global BOOLEAN DEFAULT false;
ALTER TABLE "3d_models" ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE "3d_models" ADD COLUMN IF NOT EXISTS is_global BOOLEAN DEFAULT false;
ALTER TABLE preset_skins ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE preset_skins ADD COLUMN IF NOT EXISTS is_global BOOLEAN DEFAULT false;

-- 3. Associar registros existentes à escola padrão
UPDATE classes SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE custom_ranks SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE "3d_models" SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE preset_skins SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;

-- 4. Marcar como globais os existentes
UPDATE store_items SET is_global = true WHERE is_global IS NULL;
UPDATE custom_ranks SET is_global = true WHERE is_global IS NULL;
UPDATE "3d_models" SET is_global = true WHERE is_global IS NULL;
UPDATE preset_skins SET is_global = true WHERE is_global IS NULL;

-- 5. Adicionar constraint única para upsert de economia
ALTER TABLE system_collections DROP CONSTRAINT IF EXISTS uniq_settings_doc_tenant;
ALTER TABLE system_collections ADD CONSTRAINT uniq_settings_doc_tenant UNIQUE (collection_name, doc_id, tenant_id);

-- 6. Garantir economia da escola padrão (upsert com ON CONFLICT)
INSERT INTO system_collections (collection_name, doc_id, tenant_id, data)
VALUES ('settings', 'economy', '00000000-0000-0000-0000-000000000001', 
  '{"currencyType":"coins","coinsDropInCombat":false,"coinsLostInCombat":false,"coinsCanBuyItems":true,"coinToXPRatio":10,"rankUpChestEnabled":false,"rankUpChestItems":[]}'::jsonb)
ON CONFLICT (collection_name, doc_id, tenant_id) DO NOTHING;

-- 7. Verificar economia por escola
SELECT tenant_id, count(*) AS registros 
FROM system_collections 
WHERE collection_name = 'settings' AND doc_id = 'economy'
GROUP BY tenant_id;