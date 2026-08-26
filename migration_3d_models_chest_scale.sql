-- ============================================================
-- MIGRAÇÃO: ESCALA DO BAÚ DE RECOMPENSA (tamanho na premiação)
-- Adiciona chest_scale na tabela 3d_models.
-- Cada baú (glb ou png) pode ter um tamanho próprio, definido no
-- painel com preview ao vivo, para renderizar bem no final da missão.
-- ============================================================

ALTER TABLE "3d_models" ADD COLUMN IF NOT EXISTS chest_scale REAL DEFAULT 1;

-- Verificação
SELECT id, name, category, chest_scale FROM "3d_models" LIMIT 10;