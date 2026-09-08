-- Migration: Adicionar coluna chest_claimed à tabela quest_attempts
-- Controla se o baú de recompensa já foi resgatado pelo aluno

ALTER TABLE quest_attempts ADD COLUMN IF NOT EXISTS chest_claimed BOOLEAN DEFAULT FALSE;
