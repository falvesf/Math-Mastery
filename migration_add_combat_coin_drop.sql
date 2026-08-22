-- ============================================================
-- MIGRAÇÃO: ADICIONAR COLUNA combatCoinDrop NA TABELA quests
-- O código envia combatCoinDrop (moedas em combate) no save, mas a
-- coluna não existe na tabela -> o upsert falha silenciosamente e
-- NADA da missão é salvo. Rodar UMA VEZ no Supabase SQL Editor.
-- ============================================================

ALTER TABLE quests ADD COLUMN IF NOT EXISTS combatCoinDrop JSONB;

-- Verificação
SELECT column_name FROM information_schema.columns WHERE table_name = 'quests' AND column_name = 'combatCoinDrop';