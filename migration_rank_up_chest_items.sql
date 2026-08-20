-- ============================================================
-- MIGRAÇÃO: Itens do Baú de Patente por Patente
-- Adiciona a coluna rankUpChestItems (jsonb) na tabela custom_ranks
-- ============================================================

ALTER TABLE custom_ranks ADD COLUMN IF NOT EXISTS rankUpChestItems jsonb DEFAULT '[]'::jsonb;

-- Verificação
SELECT id, name, rankUpChestItems FROM custom_ranks LIMIT 5;
