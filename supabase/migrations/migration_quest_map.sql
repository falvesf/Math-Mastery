-- Migration: Adicionar coluna map_config à tabela quests
-- Permite associar um cenário (mapa explorável) à missão ou gerar mapa procedural.
-- Formato: { mode: 'none' | 'scenario' | 'procedural', scenarioId?: string, monsters?: string[], bossId?: string }

ALTER TABLE quests ADD COLUMN IF NOT EXISTS map_config JSONB DEFAULT '{}'::jsonb;