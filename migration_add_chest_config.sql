-- Migration: Adicionar coluna chestConfig à tabela quests
-- Permite salvar configurações do baú de recompensa da missão

ALTER TABLE quests ADD COLUMN IF NOT EXISTS chestConfig JSONB;
