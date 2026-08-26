-- ============================================================
-- MIGRAÇÃO: TRANSFORMAÇÃO MANUAL DO BAÚ DE RECOMPENSA
-- Cada baú pode ter um enquadramento próprio definido no preview
-- interativo (Moldes 3D > Baús de Recompensa), aplicado de forma
-- idêntica na premiação das missões (WYSIWYG).
-- Colunas:
--   chest_scale           -> tamanho do container na premiação (0.5..3)
--   chest_zoom            -> zoom do modelo dentro do container (0.1..5)
--   chest_offset_x        -> deslocamento horizontal (estado FECHADO)
--   chest_offset_y        -> deslocamento vertical (estado FECHADO)
--   chest_rot_y           -> rotação do modelo (graus, 0 = de frente)
--   chest_open_offset_x   -> deslocamento horizontal (estado ABERTO)
--   chest_open_offset_y   -> deslocamento vertical (estado ABERTO)
--   chest_swap_sides      -> inverter lados (fechado/aberto) no arquivo
--   chest_audio_url       -> som personalizado ao abrir o baú
--   chest_audio_rate      -> velocidade de reprodução (0.25..3)
--   chest_audio_start     -> corte no INÍCIO (segundos)
--   chest_audio_duration  -> duração total (segundos; 0 = até o fim)
-- ============================================================

ALTER TABLE "3d_models" ADD COLUMN IF NOT EXISTS chest_scale REAL DEFAULT 1;
ALTER TABLE "3d_models" ADD COLUMN IF NOT EXISTS chest_zoom REAL DEFAULT 1;
ALTER TABLE "3d_models" ADD COLUMN IF NOT EXISTS chest_offset_x REAL DEFAULT 0;
ALTER TABLE "3d_models" ADD COLUMN IF NOT EXISTS chest_offset_y REAL DEFAULT 0;
ALTER TABLE "3d_models" ADD COLUMN IF NOT EXISTS chest_rot_y REAL DEFAULT 0;
ALTER TABLE "3d_models" ADD COLUMN IF NOT EXISTS chest_open_offset_x REAL DEFAULT 0;
ALTER TABLE "3d_models" ADD COLUMN IF NOT EXISTS chest_open_offset_y REAL DEFAULT 0;
ALTER TABLE "3d_models" ADD COLUMN IF NOT EXISTS chest_swap_sides BOOLEAN DEFAULT FALSE;
ALTER TABLE "3d_models" ADD COLUMN IF NOT EXISTS chest_audio_url TEXT;
ALTER TABLE "3d_models" ADD COLUMN IF NOT EXISTS chest_audio_rate REAL DEFAULT 1;
ALTER TABLE "3d_models" ADD COLUMN IF NOT EXISTS chest_audio_start REAL DEFAULT 0;
ALTER TABLE "3d_models" ADD COLUMN IF NOT EXISTS chest_audio_duration REAL DEFAULT 0;

-- Verificação
SELECT id, name, category, chest_audio_url, chest_audio_rate, chest_audio_start, chest_audio_duration
FROM "3d_models" LIMIT 10;