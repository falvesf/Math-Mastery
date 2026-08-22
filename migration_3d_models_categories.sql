-- ============================================================
-- MIGRAÇÃO: Categorias para Moldes 3D
-- Separa os moldes em: skins (monstros/pets), baús de recompensa e moedas.
-- Adiciona colunas na tabela 3d_models:
--   category    -> 'skin' (padrão) | 'chest' | 'coin'
--   rarity      -> raridade associada ao baú (common/uncommon/rare/epic/legendary)
--   open_url    -> URL do frame/estado aberto (baús e moedas em PNG)
--   slot_count  -> quantidade de slots/recompensas do baú
--   is_active   -> marca a moeda ativa usada nas batalhas
-- ============================================================

ALTER TABLE "3d_models" ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'skin';
ALTER TABLE "3d_models" ADD COLUMN IF NOT EXISTS rarity TEXT;
ALTER TABLE "3d_models" ADD COLUMN IF NOT EXISTS open_url TEXT;
ALTER TABLE "3d_models" ADD COLUMN IF NOT EXISTS slot_count INTEGER DEFAULT 4;
ALTER TABLE "3d_models" ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT false;

-- Verificação
SELECT id, name, url, category, rarity, open_url, slot_count, is_active FROM "3d_models" LIMIT 10;