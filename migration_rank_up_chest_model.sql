-- ============================================================
-- MIGRAÇÃO: Baú Visual de Patente (Arte dos Moldes 3D → Baús de Recompensa)
-- Adiciona a coluna rankUpChestModelId (text) na tabela custom_ranks
-- Execute no SQL Editor do Supabase
-- ============================================================

ALTER TABLE custom_ranks ADD COLUMN IF NOT EXISTS rankUpChestModelId text;

-- Verificação
SELECT id, name, rankUpChestItems, rankUpChestModelId FROM custom_ranks LIMIT 5;