-- ============================================================
-- MIGRAÇÃO: Cenário & Animais para Moldes 3D
-- Adiciona as categorias 'scenery' (árvores, arbustos, flores, pedras,
-- água, chão) e 'animal' (bichinhos com som e falas em balão).
-- Colunas novas em "3d_models":
--   category      -> 'skin' | 'chest' | 'coin' | 'door' | 'scenery' | 'animal'
--   kind          -> subtipo do cenário: tree | bush | flower | rock | water | floor
--   sound_url     -> som (animais e, se quiser, cenário)
--   lines         -> falas do balão, separadas por ';'
--   render_scale  -> escala do modelo no mapa (1 = padrão)
--   render_height -> altura em blocos (água/chão; 1 = um bloco cheio)
-- ============================================================

ALTER TABLE "3d_models" ADD COLUMN IF NOT EXISTS kind TEXT;
ALTER TABLE "3d_models" ADD COLUMN IF NOT EXISTS sound_url TEXT;
ALTER TABLE "3d_models" ADD COLUMN IF NOT EXISTS lines TEXT;
ALTER TABLE "3d_models" ADD COLUMN IF NOT EXISTS render_scale NUMERIC DEFAULT 1;
ALTER TABLE "3d_models" ADD COLUMN IF NOT EXISTS render_height NUMERIC DEFAULT 1;

-- Verificação
SELECT id, name, url, category, kind, sound_url, render_scale, render_height FROM "3d_models" LIMIT 20;
