-- Separa o bioma 3D da imagem 2D da arena de batalha.
-- Antes: um único campo (battleBgUrl / battle_bg_url) guardava OU a imagem OU 'voxel:<bioma>'.
-- Agora: esse campo = imagem 2D; "battleBiome" = bioma 3D; "arena3D" = liga/desliga o 3D.
--
-- OBS: a tabela `quests` real usa colunas camelCase entre aspas (ex.: "battleBgUrl").
-- Este script detecta dinamicamente qual nome de coluna existe e funciona nos dois casos.

DO $$
DECLARE
  v_img_col  text;
  v_3d_col   text;
  v_biome_col text;
BEGIN
  -- 1) Descobre o nome da coluna de imagem/URL de fundo
  SELECT column_name INTO v_img_col
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'quests'
    AND column_name IN ('battleBgUrl', 'battle_bg_url')
  ORDER BY (column_name = 'battleBgUrl') DESC
  LIMIT 1;

  IF v_img_col IS NULL THEN
    v_img_col := 'battleBgUrl';
    EXECUTE format('ALTER TABLE public.quests ADD COLUMN IF NOT EXISTS %I text', v_img_col);
  END IF;

  -- 2) Cria as novas colunas (camelCase, coerentes com a tabela)
  EXECUTE 'ALTER TABLE public.quests ADD COLUMN IF NOT EXISTS "arena3D" boolean DEFAULT false';
  EXECUTE 'ALTER TABLE public.quests ADD COLUMN IF NOT EXISTS "battleBiome" text DEFAULT ''plains''';

  -- 3) Backfill: quem tinha ''voxel:<bioma>'' recebe o bioma em "battleBiome",
  --    liga "arena3D" e limpa a imagem (que só deve conter URLs agora).
  EXECUTE format('UPDATE public.quests SET "battleBiome" = regexp_replace(%I, ''^voxel:'', ''''), "arena3D" = true WHERE %I LIKE ''voxel:%%''', v_img_col, v_img_col);
  EXECUTE format('UPDATE public.quests SET %I = NULL WHERE %I LIKE ''voxel:%%''', v_img_col, v_img_col);

  -- 4) Padrões para registros nulos
  UPDATE public.quests SET "battleBiome" = 'plains' WHERE "battleBiome" IS NULL;
  UPDATE public.quests SET "arena3D" = false WHERE "arena3D" IS NULL;

  RAISE NOTICE 'OK: coluna de imagem = %, arena3D + battleBiome prontas', v_img_col;
END $$;

-- Diagnóstico: confirma os nomes das colunas de arena
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'quests'
  AND (column_name ILIKE '%battle%' OR column_name ILIKE '%arena%')
ORDER BY column_name;

NOTIFY pgrst, 'reload schema';
