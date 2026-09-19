-- Separa o bioma 3D da imagem 2D da arena de batalha.
-- Antes: battle_bg_url guardava OU uma imagem OU 'voxel:<bioma>' (um anulava o outro).
-- Agora: battle_bg_url = somente a imagem 2D; battle_biome = bioma do 3D ('plains'|'nether'|'desert'|'snow'|'end').

ALTER TABLE public.quests ADD COLUMN IF NOT EXISTS battle_biome text DEFAULT 'plains';

-- Backfill: quem tinha 'voxel:<bioma>' em battle_bg_url passa o bioma para a nova coluna
-- e limpa a URL (que só deve conter imagens agora).
UPDATE public.quests
SET battle_biome = regexp_replace(battle_bg_url, '^voxel:', '')
WHERE battle_bg_url LIKE 'voxel:%';

UPDATE public.quests
SET battle_bg_url = NULL
WHERE battle_bg_url LIKE 'voxel:%';

-- Garante que registros sem bioma fiquem com o padrão.
UPDATE public.quests
SET battle_biome = 'plains'
WHERE battle_biome IS NULL;

NOTIFY pgrst, 'reload schema';
